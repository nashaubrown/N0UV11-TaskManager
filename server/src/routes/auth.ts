import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'node:crypto'
import rateLimit from 'express-rate-limit'
import { prisma } from '../lib/prisma.js'
import { config } from '../lib/config.js'
import { badRequest, unauthorized } from '../lib/errors.js'
import { requireAuth, signAccessToken } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { loginDto, refreshDto, signupDto } from '../types/dto.js'
import { audit } from '../services/audit.js'
import { effectiveCapabilities } from '../lib/permissions.js'

export const authRouter = Router()

const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: Number(process.env.AUTH_RATE_LIMIT ?? 20),
  standardHeaders: true,
  legacyHeaders: false,
})

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex')

async function issueTokens(userId: string, organizationId: string, role: string) {
  const accessToken = signAccessToken({ sub: userId, org: organizationId, role: role as never })
  const refreshToken = randomBytes(48).toString('base64url')
  await prisma.refresh_tokens.create({
    data: {
      user_id: userId,
      token_hash: hashToken(refreshToken),
      expires_at: new Date(Date.now() + config.jwt.refreshTtlSec * 1000),
    },
  })
  return { accessToken, refreshToken, expiresInSec: config.jwt.accessTtlSec }
}

const publicUser = (u: { id: string; email: string; full_name: string; avatar_url: string | null }) => ({
  id: u.id, email: u.email, fullName: u.full_name, avatarUrl: u.avatar_url ?? undefined,
})

/** POST /auth/signup — creates user + organization, returns tokens. */
authRouter.post('/signup', authLimiter, validate(signupDto), async (req, res) => {
  const { email, password, fullName, organizationName } = req.body
  const existing = await prisma.users.findUnique({ where: { email } })
  if (existing) throw badRequest('An account with this email already exists')

  const slugBase = organizationName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'org'
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.users.create({
      data: { email, full_name: fullName, password_hash: await bcrypt.hash(password, 11) },
    })
    const org = await tx.organizations.create({
      data: { name: organizationName, slug: `${slugBase}-${randomBytes(3).toString('hex')}` },
    })
    await tx.organization_members.create({
      data: { organization_id: org.id, user_id: user.id, role: 'owner' },
    })
    return { user, org }
  })

  const tokens = await issueTokens(result.user.id, result.org.id, 'owner')
  audit(req, 'auth.signup', 'user', result.user.id, { email })
  res.status(201).json({
    user: publicUser(result.user),
    organization: { id: result.org.id, name: result.org.name, slug: result.org.slug },
    role: 'owner',
    ...tokens,
  })
})

/** POST /auth/login */
authRouter.post('/login', authLimiter, validate(loginDto), async (req, res) => {
  const { email, password } = req.body
  const user = await prisma.users.findUnique({
    where: { email },
    include: { organization_members_organization_members_user_idTousers: { include: { organizations: true } } },
  })
  if (!user?.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
    throw unauthorized('Incorrect email or password')
  }
  const membership = user.organization_members_organization_members_user_idTousers[0]
  if (!membership) throw unauthorized('Account has no organization')

  const tokens = await issueTokens(user.id, membership.organization_id, membership.role)
  res.json({
    user: publicUser(user),
    organization: { id: membership.organizations.id, name: membership.organizations.name, slug: membership.organizations.slug },
    role: membership.role,
    ...tokens,
  })
})

/** POST /auth/refresh — rotates the refresh token. */
authRouter.post('/refresh', validate(refreshDto), async (req, res) => {
  const stored = await prisma.refresh_tokens.findUnique({ where: { token_hash: hashToken(req.body.refreshToken) } })
  if (!stored || stored.revoked_at || stored.expires_at < new Date()) {
    throw unauthorized('Refresh token is invalid or expired')
  }
  const membership = await prisma.organization_members.findFirst({
    where: { user_id: stored.user_id },
    include: { organizations: true },
  })
  if (!membership) throw unauthorized('Account has no organization')

  await prisma.refresh_tokens.update({ where: { id: stored.id }, data: { revoked_at: new Date() } })
  const tokens = await issueTokens(stored.user_id, membership.organization_id, membership.role)
  res.json(tokens)
})

/** POST /auth/logout — revokes the presented refresh token. */
authRouter.post('/logout', validate(refreshDto), async (req, res) => {
  await prisma.refresh_tokens.updateMany({
    where: { token_hash: hashToken(req.body.refreshToken), revoked_at: null },
    data: { revoked_at: new Date() },
  })
  res.status(204).end()
})

/** GET /auth/me */
authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.users.findUnique({ where: { id: req.auth!.userId } })
  if (!user) throw unauthorized()
  const membership = await prisma.organization_members.findUnique({
    where: { organization_id_user_id: { organization_id: req.auth!.organizationId, user_id: user.id } },
  })
  const role = membership?.role ?? req.auth!.role
  res.json({
    user: publicUser(user),
    organizationId: req.auth!.organizationId,
    role,
    capabilities: [...(await effectiveCapabilities(req.auth!.organizationId, user.id, role))],
  })
})
