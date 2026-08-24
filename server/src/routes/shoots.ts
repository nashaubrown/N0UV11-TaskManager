import { Router } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { notFound } from '../lib/errors.js'
import { requireAuth } from '../middleware/auth.js'
import { requireCapability } from '../lib/permissions.js'
import { validate } from '../middleware/validate.js'
import { createShootDto, updateShootDto } from '../types/dto.js'
import { sShoot } from '../lib/serialize.js'
import { pageParams, paged } from '../lib/pagination.js'
import { param } from '../lib/params.js'
import { audit } from '../services/audit.js'
import { broadcast } from '../ws/hub.js'
import { deleteShootEvents, syncShootToCalendars } from '../services/gcal.js'
import { taskInclude } from './tasks.js'
import { sTask } from '../lib/serialize.js'

/** Keep the shoot's auto "📸" task in its list in sync: created when the
 *  shoot has a list, follows title/dates/status, removed when unlinked. */
async function syncLinkedTask(shootId: string, orgId: string, userId: string) {
  try {
    const shoot = await prisma.photoshoots.findUnique({ where: { id: shootId } })
    if (!shoot) return
    if (!shoot.list_id) {
      if (shoot.linked_task_id) {
        const oldId = shoot.linked_task_id
        await prisma.photoshoots.update({ where: { id: shoot.id }, data: { linked_task_id: null } })
        await prisma.tasks.delete({ where: { id: oldId } }).catch(() => {})
        broadcast(orgId, 'task.deleted', { id: oldId })
      }
      return
    }
    const status = shoot.status === 'completed' ? 'completed' : shoot.status === 'cancelled' ? 'cancelled' : 'todo'
    const data = {
      title: `📸 ${shoot.title}`,
      list_id: shoot.list_id,
      starts_at: shoot.starts_at,
      due_at: shoot.ends_at,
      status: status as never,
      completed_at: status === 'completed' ? new Date() : null,
    }
    if (shoot.linked_task_id) {
      const existing = await prisma.tasks.findUnique({ where: { id: shoot.linked_task_id } })
      if (existing) {
        const task = await prisma.tasks.update({ where: { id: existing.id }, data, include: taskInclude })
        broadcast(orgId, 'task.updated', sTask(task))
        return
      }
    }
    const task = await prisma.tasks.create({
      data: { organization_id: orgId, created_by: userId, ...data },
      include: taskInclude,
    })
    await prisma.photoshoots.update({ where: { id: shoot.id }, data: { linked_task_id: task.id } })
    broadcast(orgId, 'task.created', sTask(task))
  } catch (e) {
    console.error('shoot linked-task sync failed', e)
  }
}

export const shootsRouter = Router()
shootsRouter.use(requireAuth)

const shootInclude = {
  shoot_crew: { include: { users: true } },
} satisfies Prisma.photoshootsInclude

async function loadShoot(orgId: string, id: string) {
  const sh = await prisma.photoshoots.findFirst({
    where: { id, organization_id: orgId },
    include: shootInclude,
  })
  if (!sh) throw notFound('Photoshoot')
  return sh
}

/** GET /shoots?from=&to=&status=&merchantId=&projectId= — ordered by start time. */
shootsRouter.get('/', async (req, res) => {
  const page = pageParams(req, 100, 500)
  const where: Prisma.photoshootsWhereInput = {
    organization_id: req.auth!.organizationId,
    status: req.query.status ? (String(req.query.status) as never) : undefined,
    merchant_id: req.query.merchantId ? String(req.query.merchantId) : undefined,
    project_id: req.query.projectId ? String(req.query.projectId) : undefined,
    ...(req.query.from ? { ends_at: { gte: new Date(String(req.query.from)) } } : {}),
    ...(req.query.to ? { starts_at: { lte: new Date(String(req.query.to)) } } : {}),
  }
  const [rows, total] = await Promise.all([
    prisma.photoshoots.findMany({ where, include: shootInclude, orderBy: { starts_at: 'asc' }, take: page.limit, skip: page.offset }),
    prisma.photoshoots.count({ where }),
  ])
  res.json(paged(rows.map(sShoot), total, page))
})

/** POST /shoots */
shootsRouter.post('/', requireCapability('calendar.manage'), validate(createShootDto), async (req, res) => {
  const b = req.body
  const shoot = await prisma.photoshoots.create({
    data: {
      organization_id: req.auth!.organizationId,
      project_id: b.projectId,
      merchant_id: b.merchantId,
      title: b.title,
      description: b.description,
      location: b.location,
      starts_at: new Date(b.startsAt),
      ends_at: new Date(b.endsAt),
      status: b.status,
      list_id: b.listId,
      created_by: req.auth!.userId,
      shoot_crew: { create: b.crewIds.map((user_id: string) => ({ user_id })) },
    },
    include: shootInclude,
  })
  const out = sShoot(shoot)
  audit(req, 'shoot.create', 'photoshoot', shoot.id, { title: shoot.title, status: shoot.status })
  broadcast(req.auth!.organizationId, 'shoot.created', out)
  void syncShootToCalendars(shoot.id, req.auth!.userId)
  void syncLinkedTask(shoot.id, req.auth!.organizationId, req.auth!.userId)
  res.status(201).json(out)
})

/** GET /shoots/:id */
shootsRouter.get('/:id', async (req, res) => {
  res.json(sShoot(await loadShoot(req.auth!.organizationId, param(req, 'id'))))
})

/** PATCH /shoots/:id — status moves and edits both land here. */
shootsRouter.patch('/:id', requireCapability('calendar.manage'), validate(updateShootDto), async (req, res) => {
  const existing = await loadShoot(req.auth!.organizationId, param(req, 'id'))
  const b = req.body
  const shoot = await prisma.photoshoots.update({
    where: { id: existing.id },
    data: {
      title: b.title,
      description: b.description,
      location: b.location,
      starts_at: b.startsAt ? new Date(b.startsAt) : undefined,
      ends_at: b.endsAt ? new Date(b.endsAt) : undefined,
      status: b.status,
      project_id: b.projectId,
      merchant_id: b.merchantId,
      list_id: b.listId === undefined ? undefined : b.listId,
      ...(b.crewIds
        ? { shoot_crew: { deleteMany: {}, create: b.crewIds.map((user_id: string) => ({ user_id })) } }
        : {}),
    },
    include: shootInclude,
  })
  const out = sShoot(shoot)
  if (b.status && b.status !== existing.status) {
    audit(req, `shoot.${b.status}`, 'photoshoot', shoot.id, { from: existing.status })
  } else {
    audit(req, 'shoot.update', 'photoshoot', shoot.id, b)
  }
  broadcast(req.auth!.organizationId, 'shoot.updated', out)
  void syncShootToCalendars(shoot.id, req.auth!.userId)
  void syncLinkedTask(shoot.id, req.auth!.organizationId, req.auth!.userId)
  res.json(out)
})

/** DELETE /shoots/:id */
shootsRouter.delete('/:id', requireCapability('calendar.manage'), async (req, res) => {
  const doomed = await loadShoot(req.auth!.organizationId, param(req, 'id'))
  await deleteShootEvents(param(req, 'id'))
  if (doomed.linked_task_id) {
    await prisma.tasks.delete({ where: { id: doomed.linked_task_id } }).catch(() => {})
    broadcast(req.auth!.organizationId, 'task.deleted', { id: doomed.linked_task_id })
  }
  await prisma.photoshoots.delete({ where: { id: param(req, 'id') } })
  audit(req, 'shoot.delete', 'photoshoot', param(req, 'id'))
  broadcast(req.auth!.organizationId, 'shoot.deleted', { id: param(req, 'id') })
  res.status(204).end()
})
