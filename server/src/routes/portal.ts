import { Router } from 'express'
import { createHash, randomBytes } from 'node:crypto'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { badRequest, forbidden, notFound } from '../lib/errors.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { param } from '../lib/params.js'
import { publicUrlFor } from '../services/storage.js'
import { audit } from '../services/audit.js'
import { broadcast } from '../ws/hub.js'
import { pushToUsers } from '../services/push.js'
import { feedItemsFor } from './feed.js'
import { sMerchant } from '../lib/serialize.js'

/* Client review portal.
 * - Team side (authed): create/list/revoke share links for a project.
 *   Tokens are random 256-bit values returned once; only a SHA-256 hash is
 *   stored. Links can expire and can scope what guests may do.
 * - Client side (public, rate-limited): view the project's photos, approve /
 *   reject / request changes, and comment — all recorded with the guest's
 *   name and audit-logged, broadcast live to the team. */

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex')

/* ---------- team side ---------- */

export const shareLinksRouter = Router()
shareLinksRouter.use(requireAuth)

const createLinkDto = z.object({
  projectId: z.string().uuid(),
  label: z.string().max(200).optional(),
  canComment: z.boolean().default(true),
  canApprove: z.boolean().default(true),
  expiresInDays: z.number().int().min(1).max(365).optional(),
})

shareLinksRouter.post('/', requireRole('member'), validate(createLinkDto), async (req, res) => {
  const project = await prisma.projects.findFirst({
    where: { id: req.body.projectId, organization_id: req.auth!.organizationId },
  })
  if (!project) throw notFound('Project')
  const token = randomBytes(32).toString('base64url')
  const link = await prisma.share_links.create({
    data: {
      organization_id: req.auth!.organizationId,
      project_id: project.id,
      token_hash: hashToken(token),
      label: req.body.label,
      can_comment: req.body.canComment,
      can_approve: req.body.canApprove,
      expires_at: req.body.expiresInDays
        ? new Date(Date.now() + req.body.expiresInDays * 86_400_000)
        : undefined,
      created_by: req.auth!.userId,
    },
  })
  audit(req, 'share_link.create', 'project', project.id, { linkId: link.id, label: req.body.label })
  // the raw token is shown exactly once — we only store its hash
  res.status(201).json({
    id: link.id,
    token,
    path: `/portal/${token}`,
    label: link.label ?? undefined,
    canComment: link.can_comment,
    canApprove: link.can_approve,
    expiresAt: link.expires_at ?? undefined,
  })
})

shareLinksRouter.get('/', async (req, res) => {
  const links = await prisma.share_links.findMany({
    where: {
      organization_id: req.auth!.organizationId,
      project_id: req.query.projectId ? String(req.query.projectId) : undefined,
    },
    orderBy: { created_at: 'desc' },
  })
  res.json({
    items: links.map((l) => ({
      id: l.id,
      projectId: l.project_id,
      label: l.label ?? undefined,
      canComment: l.can_comment,
      canApprove: l.can_approve,
      expiresAt: l.expires_at ?? undefined,
      revokedAt: l.revoked_at ?? undefined,
      createdAt: l.created_at,
    })),
  })
})

shareLinksRouter.delete('/:id', requireRole('member'), async (req, res) => {
  const { count } = await prisma.share_links.updateMany({
    where: { id: param(req, 'id'), organization_id: req.auth!.organizationId, revoked_at: null },
    data: { revoked_at: new Date() },
  })
  if (!count) throw notFound('Share link')
  audit(req, 'share_link.revoke', 'share_link', param(req, 'id'))
  res.status(204).end()
})

/* ---------- client side (public) ---------- */

export const portalRouter = Router()
portalRouter.use(rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false }))

async function resolveLink(token: string) {
  const link = await prisma.share_links.findUnique({
    where: { token_hash: hashToken(token) },
    include: { projects: true, organizations: true },
  })
  if (!link || link.revoked_at) throw notFound('This review link is no longer active')
  if (link.expires_at && link.expires_at < new Date()) throw notFound('This review link has expired')
  if (!link.project_id || !link.projects) throw notFound('Review link')
  return link
}

const guestDto = z.object({ guestName: z.string().min(1).max(120) })

/** GET /portal/:token — everything the client needs to review. */
portalRouter.get('/:token', async (req, res) => {
  const link = await resolveLink(param(req, 'token'))
  const photos = await prisma.photos.findMany({
    where: { project_id: link.project_id!, deleted_at: null, status: 'ready' },
    include: {
      approval_requests: { orderBy: { created_at: 'desc' }, take: 1 },
      comments: {
        where: { parent_id: null },
        include: { users: true, other_comments: { include: { users: true }, orderBy: { created_at: 'asc' } } },
        orderBy: { created_at: 'asc' },
      },
    },
    orderBy: { created_at: 'desc' },
  })
  // feed previews for merchants whose photos are in this project
  const merchantIds = [...new Set(photos.map((p) => p.merchant_id).filter(Boolean))] as string[]
  const feeds = []
  for (const mid of merchantIds) {
    const items = await feedItemsFor(mid)
    if (items.length) {
      const m = await prisma.merchants.findUnique({ where: { id: mid } })
      if (m) feeds.push({ merchant: sMerchant(m), items })
    }
  }

  res.json({
    feeds,
    organization: link.organizations.name,
    project: { name: link.projects!.name, description: link.projects!.description ?? undefined },
    label: link.label ?? undefined,
    canComment: link.can_comment,
    canApprove: link.can_approve,
    expiresAt: link.expires_at ?? undefined,
    photos: photos.map((p) => ({
      id: p.id,
      title: p.title ?? undefined,
      url: publicUrlFor(p.s3_key),
      thumbUrl: publicUrlFor(p.thumb_s3_key ?? p.s3_key),
      approvalStatus: p.approval_requests[0]?.status ?? 'pending',
      comments: p.comments.map((c) => ({
        id: c.id,
        author: c.users?.full_name ?? c.guest_name ?? 'Guest',
        isGuest: !c.users,
        body: c.body,
        createdAt: c.created_at,
        replies: c.other_comments.map((r) => ({
          id: r.id,
          author: r.users?.full_name ?? r.guest_name ?? 'Guest',
          isGuest: !r.users,
          body: r.body,
          createdAt: r.created_at,
        })),
      })),
    })),
  })
})

/** POST /portal/:token/photos/:photoId/decisions */
portalRouter.post(
  '/:token/photos/:photoId/decisions',
  validate(guestDto.extend({
    action: z.enum(['approve', 'reject', 'request_changes']),
    feedback: z.string().max(5000).optional(),
  })),
  async (req, res) => {
    const link = await resolveLink(param(req, 'token'))
    if (!link.can_approve) throw forbidden('This review link does not allow approvals')
    const photo = await prisma.photos.findFirst({
      where: { id: param(req, 'photoId'), project_id: link.project_id!, deleted_at: null },
    })
    if (!photo) throw notFound('Photo')

    const { action, guestName, feedback } = req.body
    let request = await prisma.approval_requests.findFirst({
      where: { photo_id: photo.id },
      orderBy: { created_at: 'desc' },
    })
    if (request && ['approved', 'rejected'].includes(request.status)) {
      throw badRequest('This photo has already been resolved')
    }
    if (!request) {
      const wf = await prisma.approval_workflows.create({
        data: {
          organization_id: link.organization_id,
          name: `Client review · ${link.label ?? 'portal'}`,
          approval_workflow_steps: { create: [{ step_no: 1, name: 'Client review' }] },
        },
      })
      request = await prisma.approval_requests.create({
        data: { photo_id: photo.id, workflow_id: wf.id, status: 'in_review' },
      })
    }

    await prisma.approval_decisions.create({
      data: { request_id: request.id, step_no: request.current_step, action, guest_name: guestName, feedback },
    })
    const status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'changes_requested'
    await prisma.approval_requests.update({
      where: { id: request.id },
      data: { status, resolved_at: status === 'changes_requested' ? null : new Date() },
    })

    prisma.audit_log.create({
      data: {
        organization_id: link.organization_id,
        guest_label: `${guestName} (via ${link.label ?? 'client portal'})`,
        action: `portal.${action}`,
        entity_type: 'photo',
        entity_id: photo.id,
        detail: { feedback } as never,
        ip_address: req.ip,
      },
    }).catch(() => {})

    broadcast(link.organization_id, 'approval.updated', { id: request.id, photoId: photo.id, status })
    if (photo.uploaded_by) {
      pushToUsers([photo.uploaded_by], {
        title: `Client ${status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'requested changes on'} a photo`,
        body: `${guestName}: ${feedback ?? photo.title ?? ''}`.slice(0, 120),
        url: '/photos',
        tag: `portal-${photo.id}`,
      })
    }
    res.status(201).json({ photoId: photo.id, approvalStatus: status })
  },
)

/** POST /portal/:token/photos/:photoId/comments */
portalRouter.post(
  '/:token/photos/:photoId/comments',
  validate(guestDto.extend({ body: z.string().min(1).max(10_000) })),
  async (req, res) => {
    const link = await resolveLink(param(req, 'token'))
    if (!link.can_comment) throw forbidden('This review link does not allow comments')
    const photo = await prisma.photos.findFirst({
      where: { id: param(req, 'photoId'), project_id: link.project_id!, deleted_at: null },
    })
    if (!photo) throw notFound('Photo')

    const comment = await prisma.comments.create({
      data: { photo_id: photo.id, guest_name: `${req.body.guestName} (client)`, body: req.body.body },
    })
    prisma.audit_log.create({
      data: {
        organization_id: link.organization_id,
        guest_label: `${req.body.guestName} (via ${link.label ?? 'client portal'})`,
        action: 'portal.comment',
        entity_type: 'photo',
        entity_id: photo.id,
        ip_address: req.ip,
      },
    }).catch(() => {})
    broadcast(link.organization_id, 'comment.created', {
      id: comment.id, photoId: photo.id, guestName: comment.guest_name, body: comment.body, createdAt: comment.created_at,
    })
    res.status(201).json({ id: comment.id, author: comment.guest_name, body: comment.body, createdAt: comment.created_at })
  },
)
