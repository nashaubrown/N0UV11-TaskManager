import { Router } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { notFound } from '../lib/errors.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { requireCapability } from '../lib/permissions.js'
import { validate } from '../middleware/validate.js'
import { addTagDto, createCommentDto, registerPhotoDto, updatePhotoDto } from '../types/dto.js'
import { sComment, sPhoto } from '../lib/serialize.js'
import { pageParams, paged } from '../lib/pagination.js'
import { param } from '../lib/params.js'
import { publicUrlFor } from '../services/storage.js'
import { audit } from '../services/audit.js'
import { broadcast } from '../ws/hub.js'
import { aiConfigured, enqueueAiProcessing } from '../services/ai.js'
import { enqueueDriveBackup } from '../services/driveBackup.js'
import { badRequest } from '../lib/errors.js'

export const photosRouter = Router()
photosRouter.use(requireAuth)

const photoInclude = {
  users: true,
  photo_tags: true,
  photo_ai_metadata: true,
  approval_requests: { orderBy: { created_at: 'desc' as const }, take: 1 },
  _count: { select: { comments: true, photo_versions: true } },
} satisfies Prisma.photosInclude

const serialize = (p: unknown) => sPhoto(p, publicUrlFor)

async function loadPhoto(orgId: string, id: string) {
  const p = await prisma.photos.findFirst({
    where: { id, organization_id: orgId, deleted_at: null },
    include: photoInclude,
  })
  if (!p) throw notFound('Photo')
  return p
}

/** GET /photos?projectId=&merchantId=&approvalStatus=&q= */
photosRouter.get('/', async (req, res) => {
  const page = pageParams(req)
  const q = String(req.query.q ?? '').trim()
  const where: Prisma.photosWhereInput = {
    organization_id: req.auth!.organizationId,
    deleted_at: null,
    project_id: req.query.projectId ? String(req.query.projectId) : undefined,
    merchant_id: req.query.merchantId === 'none' ? null : req.query.merchantId ? String(req.query.merchantId) : undefined,
    approval_requests: req.query.approvalStatus
      ? { some: { status: String(req.query.approvalStatus) as never } }
      : undefined,
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { photo_tags: { some: { tag: { contains: q, mode: 'insensitive' }, NOT: { ai_status: 'rejected' } } } },
            { merchants: { name: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  }
  const [rows, total] = await Promise.all([
    prisma.photos.findMany({ where, include: photoInclude, orderBy: { created_at: 'desc' }, take: page.limit, skip: page.offset }),
    prisma.photos.count({ where }),
  ])
  res.json(paged(rows.map(serialize), total, page))
})

/** POST /photos — register an uploaded object as a photo. */
photosRouter.post('/', requireCapability('photos.upload'), validate(registerPhotoDto), async (req, res) => {
  const b = req.body
  const photo = await prisma.photos.create({
    data: {
      organization_id: req.auth!.organizationId,
      project_id: b.projectId,
      merchant_id: b.merchantId,
      uploaded_by: req.auth!.userId,
      status: 'ready',
      title: b.title,
      s3_key: b.s3Key,
      content_type: b.contentType,
      size_bytes: b.sizeBytes,
      width_px: b.widthPx,
      height_px: b.heightPx,
      captured_at: b.capturedAt ? new Date(b.capturedAt) : undefined,
      device_model: b.deviceModel,
      photo_versions: { create: { version_no: 1, s3_key: b.s3Key, size_bytes: b.sizeBytes, created_by: req.auth!.userId } },
    },
    include: photoInclude,
  })
  const out = serialize(photo)
  audit(req, 'photo.create', 'photo', photo.id, { key: b.s3Key })
  broadcast(req.auth!.organizationId, 'photo.created', out)
  enqueueAiProcessing(photo.id, req.auth!.organizationId)
  enqueueDriveBackup(photo.id)
  res.status(201).json(out)
})

/** GET /photos/:id */
photosRouter.get('/:id', async (req, res) => {
  res.json(serialize(await loadPhoto(req.auth!.organizationId, param(req, 'id'))))
})

/** PATCH /photos/:id */
photosRouter.patch('/:id', requireCapability('photos.upload'), validate(updatePhotoDto), async (req, res) => {
  await loadPhoto(req.auth!.organizationId, param(req, 'id'))
  const photo = await prisma.photos.update({
    where: { id: param(req, 'id') },
    data: {
      title: req.body.title,
      description: req.body.description,
      project_id: req.body.projectId,
      merchant_id: req.body.merchantId,
    },
    include: photoInclude,
  })
  const out = serialize(photo)
  audit(req, 'photo.update', 'photo', photo.id, req.body)
  broadcast(req.auth!.organizationId, 'photo.updated', out)
  res.json(out)
})

/** DELETE /photos/:id — soft delete. */
photosRouter.delete('/:id', requireCapability('photos.delete'), async (req, res) => {
  await loadPhoto(req.auth!.organizationId, param(req, 'id'))
  await prisma.photos.update({ where: { id: param(req, 'id') }, data: { deleted_at: new Date() } })
  audit(req, 'photo.delete', 'photo', param(req, 'id'))
  broadcast(req.auth!.organizationId, 'photo.deleted', { id: param(req, 'id') })
  res.status(204).end()
})

/** POST /photos/:id/tags */
photosRouter.post('/:id/tags', requireCapability('photos.upload'), validate(addTagDto), async (req, res) => {
  await loadPhoto(req.auth!.organizationId, param(req, 'id'))
  const tag = await prisma.photo_tags.upsert({
    where: { photo_id_tag_source: { photo_id: param(req, 'id'), tag: req.body.tag, source: 'user' } },
    create: { photo_id: param(req, 'id'), tag: req.body.tag, source: 'user', created_by: req.auth!.userId },
    update: {},
  })
  audit(req, 'photo.tag', 'photo', param(req, 'id'), { tag: req.body.tag })
  res.status(201).json({ id: tag.id, tag: tag.tag, source: tag.source })
})

/** DELETE /photos/:id/tags/:tagId */
photosRouter.delete('/:id/tags/:tagId', requireCapability('photos.upload'), async (req, res) => {
  await loadPhoto(req.auth!.organizationId, param(req, 'id'))
  await prisma.photo_tags.deleteMany({ where: { id: param(req, 'tagId'), photo_id: param(req, 'id') } })
  res.status(204).end()
})

/** POST /photos/:id/ai — (re)queue Claude Vision analysis. */
photosRouter.post('/:id/ai', requireCapability('photos.upload'), async (req, res) => {
  if (!aiConfigured) throw badRequest('AI tagging is not configured on this server (set ANTHROPIC_API_KEY)')
  await loadPhoto(req.auth!.organizationId, param(req, 'id'))
  enqueueAiProcessing(param(req, 'id'), req.auth!.organizationId)
  audit(req, 'photo.ai_queue', 'photo', param(req, 'id'))
  res.status(202).json({ queued: true })
})

/** PATCH /photos/:id/tags/:tagId — accept or reject an AI suggestion. */
photosRouter.patch('/:id/tags/:tagId', requireCapability('photos.upload'), async (req, res) => {
  await loadPhoto(req.auth!.organizationId, param(req, 'id'))
  const status = req.body?.aiStatus
  if (status !== 'accepted' && status !== 'rejected') throw badRequest("aiStatus must be 'accepted' or 'rejected'")
  const { count } = await prisma.photo_tags.updateMany({
    where: { id: param(req, 'tagId'), photo_id: param(req, 'id'), source: 'ai' },
    data: { ai_status: status },
  })
  if (!count) throw notFound('AI tag')
  audit(req, `photo.tag_${status}`, 'photo', param(req, 'id'), { tagId: param(req, 'tagId') })
  const photo = await loadPhoto(req.auth!.organizationId, param(req, 'id'))
  const out = serialize(photo)
  broadcast(req.auth!.organizationId, 'photo.updated', out)
  res.json(out)
})

/** GET /photos/:id/comments */
photosRouter.get('/:id/comments', async (req, res) => {
  await loadPhoto(req.auth!.organizationId, param(req, 'id'))
  const rows = await prisma.comments.findMany({
    where: { photo_id: param(req, 'id'), parent_id: null },
    include: { users: true, other_comments: { include: { users: true }, orderBy: { created_at: 'asc' } } },
    orderBy: { created_at: 'asc' },
  })
  res.json({ items: rows.map(sComment) })
})

/** POST /photos/:id/comments — supports pin coordinates. */
photosRouter.post('/:id/comments', requireRole('member'), validate(createCommentDto), async (req, res) => {
  await loadPhoto(req.auth!.organizationId, param(req, 'id'))
  const comment = await prisma.comments.create({
    data: {
      photo_id: param(req, 'id'),
      parent_id: req.body.parentId,
      author_id: req.auth!.userId,
      body: req.body.body,
      pin_x: req.body.pinX,
      pin_y: req.body.pinY,
    },
    include: { users: true },
  })
  const out = sComment(comment)
  audit(req, 'comment.create', 'photo', param(req, 'id'))
  broadcast(req.auth!.organizationId, 'comment.created', out)
  res.status(201).json(out)
})
