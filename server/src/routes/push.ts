import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { pushConfigured, vapidPublicKey } from '../services/push.js'

export const pushRouter = Router()
pushRouter.use(requireAuth)

const subscribeDto = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
})

/** GET /push/config — public key for the browser's subscribe call. */
pushRouter.get('/config', (_req, res) => {
  res.json({ configured: pushConfigured, publicKey: pushConfigured ? vapidPublicKey : undefined })
})

/** POST /push/subscribe */
pushRouter.post('/subscribe', validate(subscribeDto), async (req, res) => {
  await prisma.push_subscriptions.upsert({
    where: { endpoint: req.body.endpoint },
    create: {
      endpoint: req.body.endpoint,
      user_id: req.auth!.userId,
      p256dh: req.body.keys.p256dh,
      auth: req.body.keys.auth,
    },
    update: { user_id: req.auth!.userId, p256dh: req.body.keys.p256dh, auth: req.body.keys.auth },
  })
  res.status(201).json({ ok: true })
})

/** DELETE /push/subscribe */
pushRouter.delete('/subscribe', validate(z.object({ endpoint: z.string() })), async (req, res) => {
  await prisma.push_subscriptions.deleteMany({
    where: { endpoint: req.body.endpoint, user_id: req.auth!.userId },
  })
  res.status(204).end()
})
