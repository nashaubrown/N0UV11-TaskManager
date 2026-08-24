import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { badRequest, notFound } from '../lib/errors.js'
import { param } from '../lib/params.js'
import { requireAuth } from '../middleware/auth.js'
import { requireCapability } from '../lib/permissions.js'
import { validate } from '../middleware/validate.js'
import { publicUrlFor } from '../services/storage.js'
import { audit } from '../services/audit.js'

/* Free-form photo boards: named 3xN grids with the same cell semantics as
 * the merchant feed builder (sparse positions, drop-to-replace, swap). */

export const boardsRouter = Router()
boardsRouter.use(requireAuth)

async function loadBoard(orgId: string, id: string) {
  const b = await prisma.photo_boards.findFirst({ where: { id, organization_id: orgId } })
  if (!b) throw notFound('Board')
  return b
}

async function boardItems(boardId: string) {
  const rows = await prisma.photo_board_items.findMany({
    where: { board_id: boardId },
    include: { photos: true },
    orderBy: { position: 'asc' },
  })
  return rows
    .filter((r) => !r.photos.deleted_at)
    .map((r) => ({
      photoId: r.photo_id,
      position: r.position,
      title: r.photos.title ?? undefined,
      url: publicUrlFor(r.photos.s3_key),
      thumbUrl: publicUrlFor(r.photos.thumb_s3_key ?? r.photos.s3_key),
    }))
}

/** GET /boards — all boards with their items. */
boardsRouter.get('/', async (req, res) => {
  const boards = await prisma.photo_boards.findMany({
    where: { organization_id: req.auth!.organizationId },
    orderBy: { created_at: 'asc' },
  })
  res.json({
    items: await Promise.all(boards.map(async (b) => ({ id: b.id, name: b.name, items: await boardItems(b.id) }))),
  })
})

/** POST /boards */
boardsRouter.post('/', requireCapability('feed.manage'), validate(z.object({ name: z.string().min(1).max(200) })), async (req, res) => {
  const board = await prisma.photo_boards.create({
    data: { organization_id: req.auth!.organizationId, name: req.body.name, created_by: req.auth!.userId },
  })
  audit(req, 'board.create', 'photo_board', board.id, { name: board.name })
  res.status(201).json({ id: board.id, name: board.name, items: [] })
})

/** DELETE /boards/:id */
boardsRouter.delete('/:id', requireCapability('feed.manage'), async (req, res) => {
  await loadBoard(req.auth!.organizationId, param(req, 'id'))
  await prisma.photo_boards.delete({ where: { id: param(req, 'id') } })
  audit(req, 'board.delete', 'photo_board', param(req, 'id'))
  res.status(204).end()
})

/** POST /boards/:id/items — place a photo in an exact cell (replaces occupant). */
boardsRouter.post('/:id/items', requireCapability('feed.manage'), validate(z.object({
  photoId: z.string().uuid(),
  position: z.number().int().min(0).max(2000),
})), async (req, res) => {
  const board = await loadBoard(req.auth!.organizationId, param(req, 'id'))
  const photo = await prisma.photos.findFirst({
    where: { id: req.body.photoId, organization_id: req.auth!.organizationId, deleted_at: null },
  })
  if (!photo) throw notFound('Photo')
  await prisma.$transaction([
    prisma.photo_board_items.deleteMany({
      where: { board_id: board.id, position: req.body.position, NOT: { photo_id: photo.id } },
    }),
    prisma.photo_board_items.upsert({
      where: { board_id_photo_id: { board_id: board.id, photo_id: photo.id } },
      create: { board_id: board.id, photo_id: photo.id, position: req.body.position },
      update: { position: req.body.position },
    }),
  ])
  res.status(201).json({ items: await boardItems(board.id) })
})

/** PATCH /boards/:id/items — swap two occupied cells. */
boardsRouter.patch('/:id/items', requireCapability('feed.manage'), validate(z.object({
  swap: z.tuple([z.string().uuid(), z.string().uuid()]),
})), async (req, res) => {
  const board = await loadBoard(req.auth!.organizationId, param(req, 'id'))
  const [aId, bId] = req.body.swap
  const [a, b] = await Promise.all([
    prisma.photo_board_items.findUnique({ where: { board_id_photo_id: { board_id: board.id, photo_id: aId } } }),
    prisma.photo_board_items.findUnique({ where: { board_id_photo_id: { board_id: board.id, photo_id: bId } } }),
  ])
  if (!a || !b) throw badRequest('Both photos must be on the board')
  await prisma.$transaction([
    prisma.photo_board_items.update({ where: { board_id_photo_id: { board_id: board.id, photo_id: aId } }, data: { position: b.position } }),
    prisma.photo_board_items.update({ where: { board_id_photo_id: { board_id: board.id, photo_id: bId } }, data: { position: a.position } }),
  ])
  res.json({ items: await boardItems(board.id) })
})

/** DELETE /boards/:id/items/:photoId */
boardsRouter.delete('/:id/items/:photoId', requireCapability('feed.manage'), async (req, res) => {
  const board = await loadBoard(req.auth!.organizationId, param(req, 'id'))
  await prisma.photo_board_items.deleteMany({ where: { board_id: board.id, photo_id: param(req, 'photoId') } })
  res.json({ items: await boardItems(board.id) })
})
