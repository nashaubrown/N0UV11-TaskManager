import type { Request } from 'express'
import { prisma } from '../lib/prisma.js'

/** Append to the audit log. Fire-and-forget: an audit failure never fails the request. */
export function audit(
  req: Request,
  action: string,
  entityType: string,
  entityId?: string,
  detail: object = {},
) {
  const auth = req.auth
  prisma.audit_log
    .create({
      data: {
        organization_id: auth?.organizationId,
        actor_id: auth?.userId,
        action,
        entity_type: entityType,
        entity_id: entityId,
        detail: detail as never,
        ip_address: req.ip,
      },
    })
    .catch((e) => console.error('audit write failed', e))
}
