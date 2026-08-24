import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { notFound } from '../lib/errors.js'
import { param } from '../lib/params.js'
import { requireAuth } from '../middleware/auth.js'
import { requireCapability } from '../lib/permissions.js'
import { validate } from '../middleware/validate.js'
import { audit } from '../services/audit.js'
import { broadcast } from '../ws/hub.js'

/* Task lists — the ClickUp-style workspace tree. A list is filed under a
 * merchant folder (or unfiled) and can define custom fields that every
 * task in it carries. */

export const listsRouter = Router()
listsRouter.use(requireAuth)

const listInclude = {
  list_fields: true,
  _count: { select: { tasks: true } },
} as const

const sList = (l: any) => ({
  id: l.id,
  merchantId: l.merchant_id ?? undefined,
  name: l.name,
  position: l.position,
  fields: [...(l.list_fields ?? [])]
    .sort((a: any, b: any) => a.position - b.position)
    .map((f: any) => ({ id: f.id, name: f.name })),
  taskCount: l._count?.tasks ?? 0,
})

async function loadList(orgId: string, id: string) {
  const l = await prisma.task_lists.findFirst({ where: { id, organization_id: orgId }, include: listInclude })
  if (!l) throw notFound('List')
  return l
}

/** GET /lists — the whole tree's data in one call. */
listsRouter.get('/', async (req, res) => {
  const rows = await prisma.task_lists.findMany({
    where: { organization_id: req.auth!.organizationId },
    include: listInclude,
    orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
  })
  res.json({ items: rows.map(sList) })
})

/** POST /lists */
listsRouter.post('/', requireCapability('tasks.manage'), validate(z.object({
  name: z.string().min(1).max(200),
  merchantId: z.string().uuid().optional(),
})), async (req, res) => {
  if (req.body.merchantId) {
    const m = await prisma.merchants.findFirst({
      where: { id: req.body.merchantId, organization_id: req.auth!.organizationId },
    })
    if (!m) throw notFound('Merchant')
  }
  const list = await prisma.task_lists.create({
    data: {
      organization_id: req.auth!.organizationId,
      merchant_id: req.body.merchantId,
      name: req.body.name,
      created_by: req.auth!.userId,
    },
    include: listInclude,
  })
  const out = sList(list)
  audit(req, 'list.create', 'task_list', list.id, { name: list.name })
  broadcast(req.auth!.organizationId, 'list.created', out)
  res.status(201).json(out)
})

/** PATCH /lists/:id */
listsRouter.patch('/:id', requireCapability('tasks.manage'), validate(z.object({
  name: z.string().min(1).max(200).optional(),
  merchantId: z.string().uuid().nullable().optional(),
})), async (req, res) => {
  await loadList(req.auth!.organizationId, param(req, 'id'))
  const list = await prisma.task_lists.update({
    where: { id: param(req, 'id') },
    data: {
      name: req.body.name,
      merchant_id: req.body.merchantId === undefined ? undefined : req.body.merchantId,
    },
    include: listInclude,
  })
  const out = sList(list)
  audit(req, 'list.update', 'task_list', list.id, req.body)
  broadcast(req.auth!.organizationId, 'list.updated', out)
  res.json(out)
})

/** DELETE /lists/:id — tasks keep existing (list_id becomes null). */
listsRouter.delete('/:id', requireCapability('tasks.manage'), async (req, res) => {
  await loadList(req.auth!.organizationId, param(req, 'id'))
  await prisma.task_lists.delete({ where: { id: param(req, 'id') } })
  audit(req, 'list.delete', 'task_list', param(req, 'id'))
  broadcast(req.auth!.organizationId, 'list.deleted', { id: param(req, 'id') })
  res.status(204).end()
})

/** POST /lists/:id/fields — define a custom field on the list. */
listsRouter.post('/:id/fields', requireCapability('tasks.manage'), validate(z.object({
  name: z.string().min(1).max(120),
})), async (req, res) => {
  const list = await loadList(req.auth!.organizationId, param(req, 'id'))
  const max = await prisma.list_fields.aggregate({ where: { list_id: list.id }, _max: { position: true } })
  await prisma.list_fields.create({
    data: { list_id: list.id, name: req.body.name, position: (max._max.position ?? -1) + 1 },
  })
  const out = sList(await loadList(req.auth!.organizationId, list.id))
  broadcast(req.auth!.organizationId, 'list.updated', out)
  res.status(201).json(out)
})

/** DELETE /lists/:id/fields/:fieldId — removes the field and its values. */
listsRouter.delete('/:id/fields/:fieldId', requireCapability('tasks.manage'), async (req, res) => {
  const list = await loadList(req.auth!.organizationId, param(req, 'id'))
  await prisma.list_fields.deleteMany({ where: { id: param(req, 'fieldId'), list_id: list.id } })
  const out = sList(await loadList(req.auth!.organizationId, list.id))
  broadcast(req.auth!.organizationId, 'list.updated', out)
  res.json(out)
})
