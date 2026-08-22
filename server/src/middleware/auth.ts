import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '../lib/config.js'
import { prisma } from '../lib/prisma.js'
import { forbidden, unauthorized } from '../lib/errors.js'

export interface AuthContext {
  userId: string
  organizationId: string
  role: 'owner' | 'admin' | 'manager' | 'member' | 'viewer'
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { auth?: AuthContext }
  }
}

export interface AccessTokenPayload { sub: string; org: string; role: AuthContext['role'] }

export const signAccessToken = (p: AccessTokenPayload) =>
  jwt.sign({ org: p.org, role: p.role }, config.jwt.secret, { subject: p.sub, expiresIn: config.jwt.accessTtlSec })

export function verifyAccessToken(token: string): AuthContext {
  const decoded = jwt.verify(token, config.jwt.secret) as jwt.JwtPayload
  if (!decoded.sub || !decoded.org) throw unauthorized('Invalid token')
  return { userId: decoded.sub, organizationId: decoded.org as string, role: decoded.role as AuthContext['role'] }
}

/** Bearer-token guard. Attaches req.auth. */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) throw unauthorized()
  try {
    req.auth = verifyAccessToken(header.slice(7))
  } catch {
    throw unauthorized('Invalid or expired token')
  }
  next()
}

const ROLE_RANK = { viewer: 0, member: 1, manager: 2, admin: 3, owner: 4 } as const

/** Role gate: requireRole('manager') admits manager, admin, owner. */
export const requireRole = (min: AuthContext['role']) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) throw unauthorized()
    if (ROLE_RANK[req.auth.role] < ROLE_RANK[min]) throw forbidden(`Requires ${min} role or above`)
    next()
  }

/** Re-check membership against the DB (role changes take effect without re-login). */
export async function loadMembership(req: Request) {
  if (!req.auth) throw unauthorized()
  const m = await prisma.organization_members.findUnique({
    where: { organization_id_user_id: { organization_id: req.auth.organizationId, user_id: req.auth.userId } },
  })
  if (!m) throw forbidden('Not a member of this organization')
  req.auth.role = m.role as AuthContext['role']
  return req.auth
}
