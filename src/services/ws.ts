import { DEMO, apiOrigin, getAccessToken } from './api'
import { useData } from '../store/data'

/** Real-time link: applies org-scoped server events to the data store.
 *  Reconnects with backoff; a no-op in demo builds. */

let socket: WebSocket | null = null
let attempts = 0
let closedByUs = false

export function connectRealtime() {
  if (DEMO || socket) return
  const token = getAccessToken()
  if (!token) return
  closedByUs = false
  const origin = apiOrigin.replace(/^http/, 'ws')
  socket = new WebSocket(`${origin}/ws?token=${encodeURIComponent(token)}`)
  socket.onopen = () => { attempts = 0 }
  socket.onmessage = (e) => {
    try {
      const { type, payload } = JSON.parse(e.data)
      useData.getState().applyEvent(type, payload)
    } catch { /* malformed frame — ignore */ }
  }
  socket.onclose = () => {
    socket = null
    if (closedByUs) return
    const wait = Math.min(30_000, 1000 * 2 ** attempts++)
    setTimeout(connectRealtime, wait)
  }
}

export function disconnectRealtime() {
  closedByUs = true
  socket?.close()
  socket = null
}
