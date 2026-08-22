import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'
import { prisma } from '../lib/prisma.js'
import { badRequest, forbidden, notFound } from '../lib/errors.js'
import { param } from '../lib/params.js'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { CAPABILITIES, effectiveCapabilities, requireCapability, type Capability } from '../lib/permissions.js'
import { validate } from '../middleware/validate.js'
import { inviteMemberDto } from '../types/dto.js'

const overridesDto = z.object({
  grant: z.array(z.enum(CAPABILITIES)).default([]),
  revoke: z.array(z.enum(CAPABILITIES)).default([]),
})

/** Replace a member's override set with grant/revoke lists. */
async function saveOverrides(orgId: string, userId: string, o: { grant: Capability[]; revoke: Capability[] }) {
  await prisma.$transaction([
    prisma.member_permission_overrides.deleteMany({ where: { organization_id: orgId, user_id: userId } }),
    prisma.member_permission_overrides.createMany({
      data: [
        ...o.grant.map((capability) => ({ organization_id: orgId, user_id: userId, capability, allowed: true })),
        ...o.revoke.map((capability) => ({ organization_id: orgId, user_id: userId, capability, allowed: false })),
      ],
    }),
  ])
}

const overrideRows = (o?: { grant: Capability[]; revoke: Capability[] }) => [
  ...(o?.grant ?? []).map((capability) => ({ capability, allowed: true })),
  ...(o?.revoke ?? []).map((capability) => ({ capability, allowed: false })),
]
import { sUser } from '../lib/serialize.js'
import { pageParams, paged } from '../lib/pagination.js'
import { audit } from '../services/audit.js'

export const orgRouter = Router()
orgRouter.use(requireAuth)

/** GET /org/members */
orgRouter.get('/members', async (req, res) => {
  const rows = await prisma.organization_members.findMany({
    where: { organization_id: req.auth!.organizationId },
    include: { users_organization_members_user_idTousers: true },
    orderBy: { joined_at: 'asc' },
  })
  const allOverrides = await prisma.member_permission_overrides.findMany({
    where: { organization_id: req.auth!.organizationId },
  })
  res.json({
    items: await Promise.all(rows.map(async (m) => ({
      ...sUser(m.users_organization_members_user_idTousers),
      role: m.role,
      joinedAt: m.joined_at,
      overrides: allOverrides
        .filter((o) => o.user_id === m.user_id)
        .map((o) => ({ capability: o.capability, allowed: o.allowed })),
      capabilities: [...(await effectiveCapabilities(req.auth!.organizationId, m.user_id, m.role))],
    }))),
  })
})

/** POST /org/members — dev-grade invite: creates the account and returns a
 *  one-time temporary password. Email delivery is a Phase 3+ concern. */
orgRouter.post('/members', requireCapability('team.manage'), validate(inviteMemberDto.extend({ overrides: overridesDto.optional() })), async (req, res) => {
  const { email, fullName, role, overrides } = req.body
  if (await prisma.users.findUnique({ where: { email } })) {
    throw badRequest('An account with this email already exists')
  }
  const tempPassword = randomBytes(9).toString('base64url')
  const user = await prisma.users.create({
    data: { email, full_name: fullName, password_hash: await bcrypt.hash(tempPassword, 11) },
  })
  await prisma.organization_members.create({
    data: {
      organization_id: req.auth!.organizationId,
      user_id: user.id,
      role,
      invited_by: req.auth!.userId,
    },
  })
  if (overrides) await saveOverrides(req.auth!.organizationId, user.id, overrides)
  audit(req, 'member.invite', 'user', user.id, { email, role, overrides })
  const capabilities = [...(await effectiveCapabilities(req.auth!.organizationId, user.id, role))]
  res.status(201).json({ ...sUser(user), role, tempPassword, capabilities, overrides: overrideRows(overrides) })
})

/** PATCH /org/members/:userId — change a member's role. Owner is immutable;
 *  only the owner can grant or revoke admin. */
orgRouter.patch('/members/:userId', requireCapability('team.manage'), validate(z.object({
  role: z.enum(['admin', 'manager', 'member', 'viewer']).optional(),
  overrides: overridesDto.optional(),
})), async (req, res) => {
  const userId = param(req, 'userId')
  const target = await prisma.organization_members.findUnique({
    where: { organization_id_user_id: { organization_id: req.auth!.organizationId, user_id: userId } },
  })
  if (!target) throw notFound('Member')
  if (target.role === 'owner') throw forbidden("The owner's access cannot be changed")
  if ((req.body.role === 'admin' || target.role === 'admin') && req.auth!.role !== 'owner') {
    throw forbidden('Only the owner can grant or revoke admin')
  }
  const role = req.body.role ?? target.role
  if (req.body.role && req.body.role !== target.role) {
    await prisma.organization_members.update({
      where: { organization_id_user_id: { organization_id: req.auth!.organizationId, user_id: userId } },
      data: { role: req.body.role },
    })
    audit(req, 'member.role_change', 'user', userId, { from: target.role, to: req.body.role })
  }
  if (req.body.overrides) {
    await saveOverrides(req.auth!.organizationId, userId, req.body.overrides)
    audit(req, 'member.access_change', 'user', userId, req.body.overrides)
  }
  const capabilities = [...(await effectiveCapabilities(req.auth!.organizationId, userId, role))]
  const savedOverrides = await prisma.member_permission_overrides.findMany({
    where: { organization_id: req.auth!.organizationId, user_id: userId },
  })
  res.json({
    userId, role, capabilities,
    overrides: savedOverrides.map((o) => ({ capability: o.capability, allowed: o.allowed })),
  })
})

/** DELETE /org/members/:userId — remove from the organization. */
orgRouter.delete('/members/:userId', requireCapability('team.manage'), async (req, res) => {
  const userId = param(req, 'userId')
  if (userId === req.auth!.userId) throw badRequest('You cannot remove yourself')
  const target = await prisma.organization_members.findUnique({
    where: { organization_id_user_id: { organization_id: req.auth!.organizationId, user_id: userId } },
  })
  if (!target) throw notFound('Member')
  if (target.role === 'owner') throw forbidden('The owner cannot be removed')
  await prisma.organization_members.delete({
    where: { organization_id_user_id: { organization_id: req.auth!.organizationId, user_id: userId } },
  })
  audit(req, 'member.remove', 'user', userId)
  res.status(204).end()
})

/** GET /org/audit — audit log, newest first. */
orgRouter.get('/audit', requireCapability('team.manage'), async (req, res) => {
  const page = pageParams(req, 50)
  const where = { organization_id: req.auth!.organizationId }
  const [rows, total] = await Promise.all([
    prisma.audit_log.findMany({
      where,
      include: { users: true },
      orderBy: { created_at: 'desc' },
      take: page.limit,
      skip: page.offset,
    }),
    prisma.audit_log.count({ where }),
  ])
  res.json(paged(rows.map((r) => ({
    id: String(r.id),
    actor: r.users ? sUser(r.users) : undefined,
    guestLabel: r.guest_label ?? undefined,
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id ?? undefined,
    detail: r.detail,
    createdAt: r.created_at,
  })), total, page))
})
