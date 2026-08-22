import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { notFound } from '../lib/errors.js'
import { requireAuth } from '../middleware/auth.js'
import { requireCapability } from '../lib/permissions.js'
import { validate } from '../middleware/validate.js'
import { createMerchantDto } from '../types/dto.js'
import { sMerchant } from '../lib/serialize.js'
import { param } from '../lib/params.js'
import { audit } from '../services/audit.js'

export const merchantsRouter = Router()
merchantsRouter.use(requireAuth)

/** GET /merchants — with photo counts. */
merchantsRouter.get('/', async (req, res) => {
  const rows = await prisma.merchants.findMany({
    where: { organization_id: req.auth!.organizationId },
    include: { _count: { select: { photos: { where: { deleted_at: null } } } } },
    orderBy: { name: 'asc' },
  })
  res.json({ items: rows.map((m) => ({ ...sMerchant(m), photoCount: m._count.photos })) })
})

/** POST /merchants */
merchantsRouter.post('/', requireCapability('merchants.manage'), validate(createMerchantDto), async (req, res) => {
  const merchant = await prisma.merchants.create({
    data: { organization_id: req.auth!.organizationId, name: req.body.name, location: req.body.location, ig_handle: req.body.igHandle, bio: req.body.bio },
  })
  audit(req, 'merchant.create', 'merchant', merchant.id, { name: merchant.name })
  res.status(201).json(sMerchant(merchant))
})

/** PATCH /merchants/:id */
merchantsRouter.patch('/:id', requireCapability('merchants.manage'), validate(createMerchantDto.partial()), async (req, res) => {
  const { count } = await prisma.merchants.updateMany({
    where: { id: param(req, 'id'), organization_id: req.auth!.organizationId },
    data: { name: req.body.name, location: req.body.location, ig_handle: req.body.igHandle, bio: req.body.bio },
  })
  if (!count) throw notFound('Merchant')
  res.json(sMerchant(await prisma.merchants.findUnique({ where: { id: param(req, 'id') } })))
})

/** DELETE /merchants/:id — photos keep existing but lose the link. */
merchantsRouter.delete('/:id', requireCapability('merchants.manage'), async (req, res) => {
  const { count } = await prisma.merchants.deleteMany({
    where: { id: param(req, 'id'), organization_id: req.auth!.organizationId },
  })
  if (!count) throw notFound('Merchant')
  audit(req, 'merchant.delete', 'merchant', param(req, 'id'))
  res.status(204).end()
})
