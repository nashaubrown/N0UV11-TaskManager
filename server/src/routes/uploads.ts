import { Router, raw } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { requireCapability } from '../lib/permissions.js'
import { validate } from '../middleware/validate.js'
import { presignDto } from '../types/dto.js'
import { localGet, localPut, presignUpload } from '../services/storage.js'
import { badRequest, notFound } from '../lib/errors.js'
import { param } from '../lib/params.js'
import { config } from '../lib/config.js'

export const uploadsRouter = Router()

/** POST /uploads/presign — returns {key, uploadUrl, headers, publicUrl}.
 *  Client PUTs the bytes to uploadUrl, then registers via POST /photos. */
uploadsRouter.post('/presign', requireAuth, requireCapability('photos.upload'), validate(presignDto), async (req, res) => {
  res.json(await presignUpload(req.body.fileName, req.body.contentType))
})

/* Local-driver endpoints (dev only; S3 handles these in production). */
uploadsRouter.put('/local/:key', requireAuth, raw({ type: 'image/*', limit: '50mb' }), async (req, res) => {
  if (config.storage.driver !== 'local') throw badRequest('Local uploads are disabled')
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw badRequest('Empty body or wrong content-type')
  await localPut(decodeURIComponent(param(req, 'key')), req.body)
  res.status(201).json({ ok: true })
})

uploadsRouter.get('/local/:key', async (req, res) => {
  if (config.storage.driver !== 'local') throw badRequest('Local uploads are disabled')
  try {
    const bytes = await localGet(decodeURIComponent(param(req, 'key')))
    res.setHeader('cache-control', 'public, max-age=31536000, immutable')
    res.send(bytes)
  } catch {
    throw notFound('File')
  }
})
