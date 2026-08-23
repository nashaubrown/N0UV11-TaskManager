import { prisma } from '../lib/prisma.js'
import { config } from '../lib/config.js'

/** Google Calendar integration.
 *  - OAuth2 code flow (connect/callback/disconnect)
 *  - Transactional outbox: task writes enqueue gcal_sync_queue rows; a
 *    background worker pushes them to Google with retry + backoff.
 *  Fully inert unless GOOGLE_CLIENT_ID/SECRET are configured. */

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token'
const GCAL_API = 'https://www.googleapis.com/calendar/v3'

export function authUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: config.google.redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar.events openid email',
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return `${GOOGLE_AUTH}?${p}`
}

export async function exchangeCode(code: string) {
  const res = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: config.google.redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status}`)
  return res.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number; id_token?: string }>
}

async function freshAccessToken(userId: string): Promise<{ token: string; calendarId: string } | null> {
  const conn = await prisma.gcal_connections.findUnique({ where: { user_id: userId } })
  if (!conn) return null
  if (conn.token_expires > new Date(Date.now() + 60_000)) {
    return { token: conn.access_token, calendarId: conn.calendar_id }
  }
  const res = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: conn.refresh_token,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`Google token refresh failed: ${res.status}`)
  const data = (await res.json()) as { access_token: string; expires_in: number }
  await prisma.gcal_connections.update({
    where: { user_id: userId },
    data: { access_token: data.access_token, token_expires: new Date(Date.now() + data.expires_in * 1000) },
  })
  return { token: data.access_token, calendarId: conn.calendar_id }
}

/** Remove the linked Google event when a task is deleted. Called before the
 *  row disappears (queue rows cascade with the task, so this can't be queued). */
export function deleteCalendarEvent(taskId: string, userId: string) {
  if (!config.google.configured) return
  prisma.tasks
    .findUnique({ where: { id: taskId } })
    .then(async (task) => {
      if (!task?.gcal_event_id) return
      const creds = await freshAccessToken(userId)
      if (!creds) return
      await fetch(
        `${GCAL_API}/calendars/${encodeURIComponent(creds.calendarId)}/events/${task.gcal_event_id}`,
        { method: 'DELETE', headers: { authorization: `Bearer ${creds.token}` } },
      )
    })
    .catch((e) => console.error('gcal event delete failed', e))
}

/** Enqueue sync ops for everyone a shoot concerns: the tagged crew (or the
 *  creator when no crew is set), plus anyone who currently holds an event
 *  and needs it removed (crew removal, status revert). Only users with a
 *  connected Google account are queued. */
export async function syncShootToCalendars(shootId: string, actorId: string): Promise<void> {
  if (!config.google.configured) return
  try {
    const shoot = await prisma.photoshoots.findUnique({
      where: { id: shootId },
      include: { shoot_crew: true },
    })
    if (!shoot) return
    const recipients = new Set<string>(shoot.shoot_crew.map((c) => c.user_id))
    if (recipients.size === 0 && shoot.created_by) recipients.add(shoot.created_by)
    if (recipients.size === 0) recipients.add(actorId)
    // users holding a stale event (removed from crew) need a cleanup pass
    const holders = await prisma.shoot_gcal_events.findMany({ where: { shoot_id: shootId } })
    for (const h of holders) recipients.add(h.user_id)
    const connected = await prisma.gcal_connections.findMany({ where: { user_id: { in: [...recipients] } } })
    for (const conn of connected) {
      await prisma.gcal_sync_queue.create({ data: { shoot_id: shootId, user_id: conn.user_id, operation: 'update' } })
    }
  } catch (e) {
    console.error('gcal shoot enqueue failed', e)
  }
}

/** Remove every crew member's Google event for a shoot. Awaited before the
 *  shoot row is deleted (event rows cascade away with it). */
export async function deleteShootEvents(shootId: string): Promise<void> {
  if (!config.google.configured) return
  try {
    const rows = await prisma.shoot_gcal_events.findMany({ where: { shoot_id: shootId } })
    for (const row of rows) {
      const creds = await freshAccessToken(row.user_id).catch(() => null)
      if (!creds) continue
      await fetch(
        `${GCAL_API}/calendars/${encodeURIComponent(creds.calendarId)}/events/${row.event_id}`,
        { method: 'DELETE', headers: { authorization: `Bearer ${creds.token}` } },
      ).catch(() => {})
    }
  } catch (e) {
    console.error('gcal shoot event delete failed', e)
  }
}

/** Push one (shoot, user) pair to Google. Policy: Confirmed and Completed
 *  shoots put an event in each crew member's calendar (creator's when no
 *  crew is tagged); Planning/Cancelled — or being dropped from the crew —
 *  removes it. */
async function pushShoot(op: { shoot_id: string | null; user_id: string }) {
  if (!op.shoot_id) return
  const creds = await freshAccessToken(op.user_id)
  if (!creds) return
  const shoot = await prisma.photoshoots.findUnique({
    where: { id: op.shoot_id },
    include: { merchants: true, shoot_crew: true },
  })
  if (!shoot) return
  const headers = { authorization: `Bearer ${creds.token}`, 'content-type': 'application/json' }
  const base = `${GCAL_API}/calendars/${encodeURIComponent(creds.calendarId)}/events`
  const eventRow = await prisma.shoot_gcal_events.findUnique({
    where: { shoot_id_user_id: { shoot_id: shoot.id, user_id: op.user_id } },
  })

  const crewIds = shoot.shoot_crew.map((c) => c.user_id)
  const isRecipient = crewIds.includes(op.user_id) || (crewIds.length === 0 && shoot.created_by === op.user_id)
  const wantsEvent = isRecipient && (shoot.status === 'confirmed' || shoot.status === 'completed')

  if (!wantsEvent) {
    if (eventRow) {
      await fetch(`${base}/${eventRow.event_id}`, { method: 'DELETE', headers }).catch(() => {})
      await prisma.shoot_gcal_events.delete({
        where: { shoot_id_user_id: { shoot_id: shoot.id, user_id: op.user_id } },
      })
    }
    return
  }

  const event = {
    summary: `📸 ${shoot.title}${shoot.merchants ? ` — ${shoot.merchants.name}` : ''}`,
    description: shoot.description ?? undefined,
    location: shoot.location ?? undefined,
    start: { dateTime: shoot.starts_at.toISOString() },
    end: { dateTime: shoot.ends_at.toISOString() },
    status: 'confirmed',
  }
  let res = eventRow
    ? await fetch(`${base}/${eventRow.event_id}`, { method: 'PATCH', headers, body: JSON.stringify(event) })
    : await fetch(base, { method: 'POST', headers, body: JSON.stringify(event) })
  if (eventRow && res.status === 404) {
    // the user deleted the event by hand — recreate it
    res = await fetch(base, { method: 'POST', headers, body: JSON.stringify(event) })
  }
  if (!res.ok) throw new Error(`Google Calendar shoot write failed: ${res.status} ${await res.text()}`)
  const saved = (await res.json()) as { id: string }
  await prisma.shoot_gcal_events.upsert({
    where: { shoot_id_user_id: { shoot_id: shoot.id, user_id: op.user_id } },
    create: { shoot_id: shoot.id, user_id: op.user_id, event_id: saved.id },
    update: { event_id: saved.id, synced_at: new Date() },
  })
  await prisma.photoshoots.update({
    where: { id: shoot.id },
    data: { gcal_synced_at: new Date() },
  })
}

/** Enqueue a sync op for a task write. No-op when the actor has no connection. */
export function enqueueCalendarSync(taskId: string, userId: string, operation: 'create' | 'update') {
  if (!config.google.configured) return
  prisma.gcal_connections
    .findUnique({ where: { user_id: userId } })
    .then((conn) => conn && prisma.gcal_sync_queue.create({ data: { task_id: taskId, user_id: userId, operation } }))
    .catch((e) => console.error('gcal enqueue failed', e))
}

async function pushTask(op: { task_id: string | null; user_id: string; operation: string }) {
  if (!op.task_id) return
  const creds = await freshAccessToken(op.user_id)
  if (!creds) return // connection removed since enqueue
  const task = await prisma.tasks.findUnique({ where: { id: op.task_id } })
  const headers = { authorization: `Bearer ${creds.token}`, 'content-type': 'application/json' }
  const base = `${GCAL_API}/calendars/${encodeURIComponent(creds.calendarId)}/events`

  if (!task) return // deleted since enqueue; deletion is handled synchronously

  if (!task.due_at) return // only tasks with due dates become events

  const event = {
    summary: task.title,
    description: task.description ?? undefined,
    start: { dateTime: task.due_at.toISOString() },
    end: { dateTime: new Date(task.due_at.getTime() + 30 * 60_000).toISOString() },
  }
  const res = task.gcal_event_id
    ? await fetch(`${base}/${task.gcal_event_id}`, { method: 'PATCH', headers, body: JSON.stringify(event) })
    : await fetch(base, { method: 'POST', headers, body: JSON.stringify(event) })
  if (!res.ok) throw new Error(`Google Calendar write failed: ${res.status} ${await res.text()}`)
  const created = (await res.json()) as { id: string }
  await prisma.tasks.update({
    where: { id: task.id },
    data: { gcal_event_id: created.id, gcal_synced_at: new Date() },
  })
}

const MAX_ATTEMPTS = 5

/** Background worker: drains the queue every 15s with exponential backoff. */
export function startSyncWorker() {
  if (!config.google.configured) return
  setInterval(async () => {
    const jobs = await prisma.gcal_sync_queue.findMany({
      where: { status: { in: ['queued', 'error'] }, attempts: { lt: MAX_ATTEMPTS } },
      orderBy: { created_at: 'asc' },
      take: 10,
    })
    for (const job of jobs) {
      // backoff: retry n waits 2^n minutes
      const wait = job.attempts === 0 ? 0 : 2 ** job.attempts * 60_000
      if (job.processed_at && Date.now() - job.processed_at.getTime() < wait) continue
      await prisma.gcal_sync_queue.update({ where: { id: job.id }, data: { status: 'in_flight' } })
      try {
        if (job.shoot_id) await pushShoot(job)
        else await pushTask(job)
        await prisma.gcal_sync_queue.update({
          where: { id: job.id },
          data: { status: 'done', processed_at: new Date() },
        })
      } catch (e) {
        await prisma.gcal_sync_queue.update({
          where: { id: job.id },
          data: {
            status: 'error',
            attempts: { increment: 1 },
            last_error: String(e).slice(0, 1000),
            processed_at: new Date(),
          },
        })
      }
    }
  }, 15_000).unref()
}
