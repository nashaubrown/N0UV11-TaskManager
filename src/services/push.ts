import { api, DEMO } from './api'

/* Browser-side Web Push: subscribe/unsubscribe via the service worker. */

function base64ToUint8(base64: string): Uint8Array {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export async function pushSupported(): Promise<boolean> {
  if (DEMO || !('serviceWorker' in navigator) || !('PushManager' in window)) return false
  try {
    const { configured } = await api<{ configured: boolean }>('GET', '/push/config')
    return configured
  } catch {
    return false
  }
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

export async function enablePush(): Promise<boolean> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false
  const { publicKey } = await api<{ publicKey: string }>('GET', '/push/config')
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64ToUint8(publicKey) as BufferSource,
  })
  const json = sub.toJSON()
  await api('POST', '/push/subscribe', { endpoint: sub.endpoint, keys: json.keys })
  return true
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  await api('DELETE', '/push/subscribe', { endpoint: sub.endpoint }).catch(() => {})
  await sub.unsubscribe()
}
