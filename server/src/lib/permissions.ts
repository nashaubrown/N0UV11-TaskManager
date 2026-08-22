import type { NextFunction, Request, Response } from 'express'
import { prisma } from './prisma.js'
import { forbidden, unauthorized } from './errors.js'

/* Capability-based access control: each role grants a baseline set, and
 * per-user overrides grant or revoke individual capabilities on top.
 * The owner always has everything. */

export const CAPABILITIES = [
  'tasks.manage',      // create/edit/delete tasks and comment
  'photos.upload',     // upload/register photos, tag, request approvals
  'photos.delete',     // soft-delete photos
  'approvals.decide',  // approve / reject / request changes
  'calendar.manage',   // create/edit/delete photoshoots
  'deals.manage',      // deals + contacts
  'merchants.manage',  // create/edit/delete merchants
  'portal.share',      // create/revoke client share links
  'team.manage',       // invite/remove members, change access, view audit
  'feed.manage',       // Instagram feed planning
  'export.reports',    // CSV and report exports
] as const

export type Capability = (typeof CAPABILITIES)[number]

const MEMBER_BASE: Capability[] = [
  'tasks.manage', 'photos.upload', 'photos.delete', 'approvals.decide',
  'calendar.manage', 'deals.manage', 'feed.manage', 'portal.share', 'export.reports',
]

export const ROLE_GRANTS: Record<string, ReadonlySet<Capability>> = {
  viewer: new Set(),
  member: new Set(MEMBER_BASE),
  manager: new Set([...MEMBER_BASE, 'merchants.manage']),
  admin: new Set([...MEMBER_BASE, 'merchants.manage', 'team.manage']),
  owner: new Set(CAPABILITIES),
}

/** Effective capabilities for a member = role baseline ± overrides. */
export async function effectiveCapabilities(
  organizationId: string,
  userId: string,
  role: string,
): Promise<Set<Capability>> {
  const caps = new Set(ROLE_GRANTS[role] ?? [])
  if (role === 'owner') return caps // owner is not overridable
  const overrides = await prisma.member_permission_overrides.findMany({
    where: { organization_id: organizationId, user_id: userId },
  })
  for (const o of overrides) {
    if (o.allowed) caps.add(o.capability as Capability)
    else caps.delete(o.capability as Capability)
  }
  return caps
}

/** Route guard. Computes (and caches per-request) the caller's capabilities. */
export function requireCapability(cap: Capability) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) throw unauthorized()
    const cached = (req as Request & { caps?: Set<Capability> }).caps
    const caps = cached ?? (await effectiveCapabilities(req.auth.organizationId, req.auth.userId, req.auth.role))
    ;(req as Request & { caps?: Set<Capability> }).caps = caps
    if (!caps.has(cap)) {
      throw forbidden(`You don't have the '${cap}' permission — ask an admin to grant it`)
    }
    next()
  }
}
