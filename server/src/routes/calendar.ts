import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { config } from '../lib/config.js'
import { badRequest } from '../lib/errors.js'
import { requireAuth, verifyAccessToken } from '../middleware/auth.js'
import { authUrl, exchangeCode } from '../services/gcal.js'
import { audit } from '../services/audit.js'

export const calendarRouter = Router()

const notConfigured = () =>
  badRequest('Google Calendar is not configured on this server (set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)')

/** GET /calendar/status */
calendarRouter.get('/status', requireAuth, async (req, res) => {
  if (!config.google.configured) return res.json({ configured: false, connected: false })
  const conn = await prisma.gcal_connections.findUnique({ where: { user_id: req.auth!.userId } })
  const pending = conn
    ? await prisma.gcal_sync_queue.count({ where: { user_id: req.auth!.userId, status: { in: ['queued', 'error'] } } })
    : 0
  res.json({
    configured: true,
    connected: Boolean(conn),
    googleEmail: conn?.google_email,
    lastSyncedAt: conn?.last_synced_at ?? undefined,
    pendingSyncs: pending,
  })
})

/** GET /calendar/connect — returns the Google consent URL; the JWT rides in `state`. */
calendarRouter.get('/connect', requireAuth, (req, res) => {
  if (!config.google.configured) throw notConfigured()
  const token = (req.headers.authorization ?? '').slice(7)
  res.json({ url: authUrl(token) })
})

/** GET /calendar/callback — Google redirects here with ?code & ?state (our JWT). */
calendarRouter.get('/callback', async (req, res) => {
  if (!config.google.configured) throw notConfigured()
  const code = String(req.query.code ?? '')
  const state = String(req.query.state ?? '')
  if (!code || !state) throw badRequest('Missing code or state')
  const auth = verifyAccessToken(state)

  const tokens = await exchangeCode(code)
  // pull the Google account email out of the id_token payload
  let googleEmail = 'unknown'
  if (tokens.id_token) {
    try {
      const payload = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString())
      googleEmail = payload.email ?? googleEmail
    } catch { /* keep 'unknown' */ }
  }

  await prisma.gcal_connections.upsert({
    where: { user_id: auth.userId },
    create: {
      user_id: auth.userId,
      google_email: googleEmail,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires: new Date(Date.now() + tokens.expires_in * 1000),
    },
    update: {
      google_email: googleEmail,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires: new Date(Date.now() + tokens.expires_in * 1000),
    },
  })
  res.redirect(`${config.corsOrigin}/settings?calendar=connected`)
})

/** POST /calendar/sync — manually enqueue all open dated tasks. */
calendarRouter.post('/sync', requireAuth, async (req, res) => {
  if (!config.google.configured) throw notConfigured()
  const conn = await prisma.gcal_connections.findUnique({ where: { user_id: req.auth!.userId } })
  if (!conn) throw badRequest('Connect Google Calendar first')
  const tasks = await prisma.tasks.findMany({
    where: {
      organization_id: req.auth!.organizationId,
      due_at: { not: null },
      status: { notIn: ['completed', 'cancelled'] },
      task_assignees: { some: { user_id: req.auth!.userId } },
    },
    select: { id: true },
  })
  await prisma.gcal_sync_queue.createMany({
    data: tasks.map((t) => ({ task_id: t.id, user_id: req.auth!.userId, operation: 'update' as const })),
  })
  await prisma.gcal_connections.update({ where: { user_id: req.auth!.userId }, data: { last_synced_at: new Date() } })
  audit(req, 'calendar.sync', 'user', req.auth!.userId, { queued: tasks.length })
  res.json({ queued: tasks.length })
})

/** DELETE /calendar/connection */
calendarRouter.delete('/connection', requireAuth, async (req, res) => {
  await prisma.gcal_connections.deleteMany({ where: { user_id: req.auth!.userId } })
  audit(req, 'calendar.disconnect', 'user', req.auth!.userId)
  res.status(204).end()
})
