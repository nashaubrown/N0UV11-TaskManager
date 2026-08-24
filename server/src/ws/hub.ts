import type { Server } from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import { verifyAccessToken, type AuthContext } from '../middleware/auth.js'

/** Org-scoped broadcast hub. Clients connect to /ws?token=<access token>;
 *  every event carries {type, payload} and is fanned out to the sender's org. */

interface Client { socket: WebSocket; auth: AuthContext }

const clients = new Set<Client>()

export type EventType =
  | 'task.created' | 'task.updated' | 'task.deleted'
  | 'photo.created' | 'photo.updated' | 'photo.deleted'
  | 'comment.created'
  | 'approval.updated'
  | 'shoot.created' | 'shoot.updated' | 'shoot.deleted'
  | 'list.created' | 'list.updated' | 'list.deleted'
  | 'presence.changed'

export function broadcast(organizationId: string, type: EventType, payload: unknown) {
  const msg = JSON.stringify({ type, payload, at: new Date().toISOString() })
  for (const c of clients) {
    if (c.auth.organizationId === organizationId && c.socket.readyState === WebSocket.OPEN) {
      c.socket.send(msg)
    }
  }
}

function presence(organizationId: string) {
  const online = [...new Set(
    [...clients].filter((c) => c.auth.organizationId === organizationId).map((c) => c.auth.userId),
  )]
  broadcast(organizationId, 'presence.changed', { online })
}

export function attachWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' })
  wss.on('connection', (socket, req) => {
    let auth: AuthContext
    try {
      const url = new URL(req.url ?? '', 'http://localhost')
      auth = verifyAccessToken(url.searchParams.get('token') ?? '')
    } catch {
      socket.close(4401, 'unauthorized')
      return
    }
    const client: Client = { socket, auth }
    clients.add(client)
    presence(auth.organizationId)
    socket.on('close', () => {
      clients.delete(client)
      presence(auth.organizationId)
    })
    // heartbeat keeps proxies from closing idle connections
    const ping = setInterval(() => socket.readyState === WebSocket.OPEN && socket.ping(), 30_000)
    socket.on('close', () => clearInterval(ping))
  })
  return wss
}
