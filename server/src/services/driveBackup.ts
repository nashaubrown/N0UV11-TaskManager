import { createSign } from 'node:crypto'
import { prisma } from '../lib/prisma.js'
import { config } from '../lib/config.js'
import { localGet } from './storage.js'

/* Google Drive backup mirror: every registered photo is copied into a Drive
 * folder the studio owns. Secondary storage only — the app never reads from
 * Drive. Inert unless GDRIVE_SERVICE_ACCOUNT_JSON + GDRIVE_FOLDER_ID are set.
 *
 * Setup: create a Google Cloud service account with the Drive API enabled,
 * download its JSON key, share the target Drive folder with the service
 * account's email (Editor), then set:
 *   GDRIVE_SERVICE_ACCOUNT_JSON = the JSON key, as one line
 *   GDRIVE_FOLDER_ID            = the folder id from its Drive URL */

const b64url = (s: Buffer | string) => Buffer.from(s).toString('base64url')

let cachedToken: { token: string; expires: number } | null = null

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.token
  const key = JSON.parse(config.gdrive.serviceAccountJson) as { client_email: string; private_key: string }
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/drive.file',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${claims}`)
  const jwt = `${header}.${claims}.${signer.sign(key.private_key, 'base64url')}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  if (!res.ok) throw new Error(`Drive token exchange failed: ${res.status}`)
  const data = (await res.json()) as { access_token: string; expires_in: number }
  cachedToken = { token: data.access_token, expires: Date.now() + data.expires_in * 1000 }
  return cachedToken.token
}

async function photoBytes(s3Key: string): Promise<Buffer> {
  if (config.storage.driver === 'local') return localGet(s3Key)
  const base = config.storage.s3.publicBaseUrl ||
    `https://${config.storage.s3.bucket}.s3.${config.storage.s3.region}.amazonaws.com`
  const res = await fetch(`${base.replace(/\/$/, '')}/${s3Key}`)
  if (!res.ok) throw new Error(`Fetch for backup failed: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

async function mirrorPhoto(photoId: string): Promise<void> {
  const photo = await prisma.photos.findUnique({ where: { id: photoId } })
  if (!photo || photo.gdrive_file_id) return
  const bytes = await photoBytes(photo.s3_key)
  const token = await accessToken()
  const boundary = 'nouvii-backup'
  const meta = JSON.stringify({
    name: `${photo.title ?? photo.id}${photo.s3_key.slice(photo.s3_key.lastIndexOf('.'))}`,
    parents: [config.gdrive.folderId],
  })
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\ncontent-type: ${photo.content_type}\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${boundary}--`),
  ])
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': `multipart/related; boundary=${boundary}` },
    body,
  })
  if (!res.ok) throw new Error(`Drive upload failed: ${res.status} ${await res.text()}`)
  const file = (await res.json()) as { id: string }
  await prisma.photos.update({ where: { id: photoId }, data: { gdrive_file_id: file.id } })
}

const queue: string[] = []
let active = false

async function drain() {
  if (active) return
  active = true
  while (queue.length) {
    const id = queue.shift()!
    try {
      await mirrorPhoto(id)
    } catch (e) {
      console.error(`Drive backup failed for ${id}:`, e instanceof Error ? e.message : e)
    }
  }
  active = false
}

export function enqueueDriveBackup(photoId: string) {
  if (!config.gdrive.configured) return
  queue.push(photoId)
  void drain()
}
