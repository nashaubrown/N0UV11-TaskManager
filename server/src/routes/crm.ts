import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { notFound } from '../lib/errors.js'
import { requireAuth } from '../middleware/auth.js'
import { requireCapability } from '../lib/permissions.js'
import { validate } from '../middleware/validate.js'
import { createContactDto, createDealDto, updateDealDto } from '../types/dto.js'
import { sContact, sDeal } from '../lib/serialize.js'
import { pageParams, paged } from '../lib/pagination.js'
import { param } from '../lib/params.js'
import { audit } from '../services/audit.js'

export const contactsRouter = Router()
contactsRouter.use(requireAuth)

/** GET /contacts?q= */
contactsRouter.get('/', async (req, res) => {
  const page = pageParams(req)
  const q = String(req.query.q ?? '').trim()
  const where = {
    organization_id: req.auth!.organizationId,
    ...(q ? { OR: [
      { full_name: { contains: q, mode: 'insensitive' as const } },
      { company: { contains: q, mode: 'insensitive' as const } },
    ] } : {}),
  }
  const [rows, total] = await Promise.all([
    prisma.contacts.findMany({ where, orderBy: { full_name: 'asc' }, take: page.limit, skip: page.offset }),
    prisma.contacts.count({ where }),
  ])
  res.json(paged(rows.map(sContact), total, page))
})

/** POST /contacts */
contactsRouter.post('/', requireCapability('deals.manage'), validate(createContactDto), async (req, res) => {
  const contact = await prisma.contacts.create({
    data: {
      organization_id: req.auth!.organizationId,
      full_name: req.body.fullName,
      email: req.body.email,
      phone: req.body.phone,
      company: req.body.company,
      notes: req.body.notes,
    },
  })
  audit(req, 'contact.create', 'contact', contact.id)
  res.status(201).json(sContact(contact))
})

export const dealsRouter = Router()
dealsRouter.use(requireAuth)

const dealInclude = {
  contacts: true,
  users: true,
  _count: { select: { deal_photos: true, deal_tasks: true } },
} as const

/** GET /deals?stage= */
dealsRouter.get('/', async (req, res) => {
  const page = pageParams(req)
  const where = {
    organization_id: req.auth!.organizationId,
    stage: req.query.stage ? (String(req.query.stage) as never) : undefined,
  }
  const [rows, total] = await Promise.all([
    prisma.deals.findMany({ where, include: dealInclude, orderBy: { created_at: 'desc' }, take: page.limit, skip: page.offset }),
    prisma.deals.count({ where }),
  ])
  res.json(paged(rows.map(sDeal), total, page))
})

/** POST /deals */
dealsRouter.post('/', requireCapability('deals.manage'), validate(createDealDto), async (req, res) => {
  const b = req.body
  const deal = await prisma.deals.create({
    data: {
      organization_id: req.auth!.organizationId,
      name: b.name,
      stage: b.stage,
      value_cents: b.valueCents,
      currency: b.currency,
      contact_id: b.contactId,
      owner_id: req.auth!.userId,
      expected_close: b.expectedClose ? new Date(b.expectedClose) : undefined,
    },
    include: dealInclude,
  })
  audit(req, 'deal.create', 'deal', deal.id, { name: deal.name })
  res.status(201).json(sDeal(deal))
})

/** PATCH /deals/:id */
dealsRouter.patch('/:id', requireCapability('deals.manage'), validate(updateDealDto), async (req, res) => {
  const existing = await prisma.deals.findFirst({
    where: { id: param(req, 'id'), organization_id: req.auth!.organizationId },
  })
  if (!existing) throw notFound('Deal')
  const b = req.body
  const deal = await prisma.deals.update({
    where: { id: existing.id },
    data: {
      name: b.name,
      stage: b.stage,
      value_cents: b.valueCents,
      currency: b.currency,
      contact_id: b.contactId,
      expected_close: b.expectedClose ? new Date(b.expectedClose) : undefined,
    },
    include: dealInclude,
  })
  audit(req, 'deal.update', 'deal', deal.id, b)
  res.json(sDeal(deal))
})

/** POST /deals/:id/photos/:photoId + tasks link/unlink */
dealsRouter.post('/:id/photos/:photoId', requireCapability('deals.manage'), async (req, res) => {
  await prisma.deal_photos.upsert({
    where: { deal_id_photo_id: { deal_id: param(req, 'id'), photo_id: param(req, 'photoId') } },
    create: { deal_id: param(req, 'id'), photo_id: param(req, 'photoId') },
    update: {},
  })
  res.status(201).json({ ok: true })
})

dealsRouter.post('/:id/tasks/:taskId', requireCapability('deals.manage'), async (req, res) => {
  await prisma.deal_tasks.upsert({
    where: { deal_id_task_id: { deal_id: param(req, 'id'), task_id: param(req, 'taskId') } },
    create: { deal_id: param(req, 'id'), task_id: param(req, 'taskId') },
    update: {},
  })
  res.status(201).json({ ok: true })
})
