import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { config } from '../lib/config.js'

/** Storage abstraction.
 *  - driver 's3': presigned PUT direct to S3, public URLs via CloudFront.
 *  - driver 'local': dev fallback — PUT to this API, files on disk. Same
 *    client contract either way: presign() → PUT bytes → register photo. */

export interface Presigned {
  key: string
  uploadUrl: string
  method: 'PUT'
  headers: Record<string, string>
  publicUrl: string
}

const s3 = config.storage.driver === 's3'
  ? new S3Client({ region: config.storage.s3.region })
  : null

const keyFor = (fileName: string) => {
  const ext = path.extname(fileName).toLowerCase().slice(0, 10) || '.jpg'
  const stamp = new Date().toISOString().slice(0, 10)
  return `photos/${stamp}/${randomBytes(12).toString('hex')}${ext}`
}

export async function presignUpload(fileName: string, contentType: string): Promise<Presigned> {
  const key = keyFor(fileName)
  if (s3) {
    const cmd = new PutObjectCommand({ Bucket: config.storage.s3.bucket, Key: key, ContentType: contentType })
    const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: 900 })
    return { key, uploadUrl, method: 'PUT', headers: { 'content-type': contentType }, publicUrl: publicUrlFor(key) }
  }
  return {
    key,
    uploadUrl: `/api/uploads/local/${encodeURIComponent(key)}`,
    method: 'PUT',
    headers: { 'content-type': contentType },
    publicUrl: publicUrlFor(key),
  }
}

export function publicUrlFor(key: string): string {
  if (config.storage.driver === 's3') {
    const base = config.storage.s3.publicBaseUrl ||
      `https://${config.storage.s3.bucket}.s3.${config.storage.s3.region}.amazonaws.com`
    return `${base.replace(/\/$/, '')}/${key}`
  }
  return `/api/uploads/local/${encodeURIComponent(key)}`
}

/* ---- local driver disk ops ---- */

const safePath = (key: string) => {
  const p = path.normalize(key)
  if (p.startsWith('..') || path.isAbsolute(p)) throw new Error('bad key')
  return path.join(config.storage.localDir, p)
}

export async function localPut(key: string, bytes: Buffer) {
  const target = safePath(key)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, bytes)
}

export const localGet = (key: string) => readFile(safePath(key))
