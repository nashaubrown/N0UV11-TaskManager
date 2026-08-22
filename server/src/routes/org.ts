import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'
import { prisma } from '../lib/prisma.js'
import { badRequest } from '../lib/errors.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { inviteMemberDto } from '../types/dto.js'
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
  res.json({
    items: rows.map((m) => ({
      ...sUser(m.users_organization_members_user_idTousers),
      role: m.role,
      joinedAt: m.joined_at,
    })),
  })
})

/** POST /org/members — dev-grade invite: creates the account and returns a
 *  one-time temporary password. Email delivery is a Phase 3+ concern. */
orgRouter.post('/members', requireRole('admin'), validate(inviteMemberDto), async (req, res) => {
  const { email, fullName, role } = req.body
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
  audit(req, 'member.invite', 'user', user.id, { email, role })
  res.status(201).json({ ...sUser(user), role, tempPassword })
})

/** GET /org/audit — audit log, newest first. */
orgRouter.get('/audit', requireRole('admin'), async (req, res) => {
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
