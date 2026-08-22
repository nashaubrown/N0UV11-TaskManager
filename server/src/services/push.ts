import webpush from 'web-push'
import { prisma } from '../lib/prisma.js'

/* Web Push notifications. Inert unless VAPID keys are configured:
 *   npx web-push generate-vapid-keys
 *   → VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT in .env */

const publicKey = process.env.VAPID_PUBLIC_KEY ?? ''
const privateKey = process.env.VAPID_PRIVATE_KEY ?? ''
const subject = process.env.VAPID_SUBJECT ?? 'mailto:admin@nouvii.app'

export const pushConfigured = Boolean(publicKey && privateKey)
export const vapidPublicKey = publicKey

if (pushConfigured) webpush.setVapidDetails(subject, publicKey, privateKey)

export interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
}

/** Send to every device a set of users has registered. Fire-and-forget;
 *  410/404 responses prune dead subscriptions. */
export function pushToUsers(userIds: string[], payload: PushPayload) {
  if (!pushConfigured || userIds.length === 0) return
  void (async () => {
    const subs = await prisma.push_subscriptions.findMany({ where: { user_id: { in: userIds } } })
    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify(payload),
          )
        } catch (e: unknown) {
          const status = (e as { statusCode?: number }).statusCode
          if (status === 404 || status === 410) {
            await prisma.push_subscriptions.delete({ where: { endpoint: sub.endpoint } }).catch(() => {})
          }
        }
      }),
    )
  })()
}
