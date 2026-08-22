import { Router } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { notFound } from '../lib/errors.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { createShootDto, updateShootDto } from '../types/dto.js'
import { sShoot } from '../lib/serialize.js'
import { pageParams, paged } from '../lib/pagination.js'
import { param } from '../lib/params.js'
import { audit } from '../services/audit.js'
import { broadcast } from '../ws/hub.js'
import { deleteShootEvent, enqueueShootSync } from '../services/gcal.js'

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
shootsRouter.post('/', requireRole('member'), validate(createShootDto), async (req, res) => {
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
      created_by: req.auth!.userId,
      shoot_crew: { create: b.crewIds.map((user_id: string) => ({ user_id })) },
    },
    include: shootInclude,
  })
  const out = sShoot(shoot)
  audit(req, 'shoot.create', 'photoshoot', shoot.id, { title: shoot.title, status: shoot.status })
  broadcast(req.auth!.organizationId, 'shoot.created', out)
  enqueueShootSync(shoot.id, req.auth!.userId)
  res.status(201).json(out)
})

/** GET /shoots/:id */
shootsRouter.get('/:id', async (req, res) => {
  res.json(sShoot(await loadShoot(req.auth!.organizationId, param(req, 'id'))))
})

/** PATCH /shoots/:id — status moves and edits both land here. */
shootsRouter.patch('/:id', requireRole('member'), validate(updateShootDto), async (req, res) => {
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
  enqueueShootSync(shoot.id, req.auth!.userId)
  res.json(out)
})

/** DELETE /shoots/:id */
shootsRouter.delete('/:id', requireRole('member'), async (req, res) => {
  await loadShoot(req.auth!.organizationId, param(req, 'id'))
  deleteShootEvent(param(req, 'id'), req.auth!.userId)
  await prisma.photoshoots.delete({ where: { id: param(req, 'id') } })
  audit(req, 'shoot.delete', 'photoshoot', param(req, 'id'))
  broadcast(req.auth!.organizationId, 'shoot.deleted', { id: param(req, 'id') })
  res.status(204).end()
})
