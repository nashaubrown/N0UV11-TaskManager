import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../lib/prisma.js'
import { config } from '../lib/config.js'
import { localGet } from './storage.js'
import { broadcast } from '../ws/hub.js'

/* Claude Vision auto-tagging. Inert unless ANTHROPIC_API_KEY is set.
 * Photos are processed asynchronously after registration: extract tags,
 * classification, OCR text, a description, and quality issues; tags land
 * as source='ai', ai_status='suggested' for human review. */

export const aiConfigured = Boolean(process.env.ANTHROPIC_API_KEY)
const MODEL = process.env.AI_MODEL ?? 'claude-opus-5'

const client = aiConfigured ? new Anthropic() : null

interface AiAnalysis {
  tags: { tag: string; confidence: number }[]
  classification: 'product' | 'location' | 'person' | 'food' | 'interior' | 'document' | 'other'
  description: string
  ocrText: string | null
  qualityIssues: { issue: 'blur' | 'lighting' | 'framing' | 'noise'; severity: 'low' | 'medium' | 'high'; note: string }[]
}

const PROMPT = `You are the photo librarian for a commercial photography studio that shoots for merchants (cafés, resorts, retail, spas).

Analyze the photo and respond with ONLY a JSON object (no markdown fences, no prose) in exactly this shape:
{
  "tags": [{"tag": "espresso machine", "confidence": 0.95}],
  "classification": "product" | "location" | "person" | "food" | "interior" | "document" | "other",
  "description": "one factual sentence describing the photo",
  "ocrText": "any legible text in the image, or null",
  "qualityIssues": [{"issue": "blur" | "lighting" | "framing" | "noise", "severity": "low" | "medium" | "high", "note": "short note"}]
}

Rules: 5-10 lowercase tags a photographer would search by (subjects, setting, mood, notable objects); confidence 0-1; qualityIssues empty if the photo is technically sound.`

async function loadImage(s3Key: string, contentType: string): Promise<{ data: string; mediaType: string }> {
  let bytes: Buffer
  if (config.storage.driver === 'local') {
    bytes = await localGet(s3Key)
  } else {
    const base = config.storage.s3.publicBaseUrl ||
      `https://${config.storage.s3.bucket}.s3.${config.storage.s3.region}.amazonaws.com`
    const res = await fetch(`${base.replace(/\/$/, '')}/${s3Key}`)
    if (!res.ok) throw new Error(`Fetch image failed: ${res.status}`)
    bytes = Buffer.from(await res.arrayBuffer())
  }
  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  return {
    data: bytes.toString('base64'),
    mediaType: allowed.includes(contentType) ? contentType : 'image/jpeg',
  }
}

function parseAnalysis(text: string): AiAnalysis {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
  const parsed = JSON.parse(cleaned) as AiAnalysis
  if (!Array.isArray(parsed.tags)) throw new Error('AI response missing tags')
  return parsed
}

export async function processPhoto(photoId: string): Promise<void> {
  if (!client) throw new Error('AI is not configured (set ANTHROPIC_API_KEY)')
  const photo = await prisma.photos.findUnique({ where: { id: photoId } })
  if (!photo || photo.deleted_at) return

  const image = await loadImage(photo.s3_key, photo.content_type)
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: image.mediaType as 'image/jpeg', data: image.data } },
        { type: 'text', text: PROMPT },
      ],
    }],
  })

  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') throw new Error(`No text in AI response (stop: ${response.stop_reason})`)
  const analysis = parseAnalysis(textBlock.text)

  await prisma.$transaction(async (tx) => {
    await tx.photo_ai_metadata.upsert({
      where: { photo_id: photo.id },
      create: {
        photo_id: photo.id,
        objects: analysis.tags as never,
        ocr_text: analysis.ocrText,
        classification: analysis.classification,
        quality_issues: analysis.qualityIssues as never,
        raw_response: { description: analysis.description } as never,
        model: MODEL,
      },
      update: {
        objects: analysis.tags as never,
        ocr_text: analysis.ocrText,
        classification: analysis.classification,
        quality_issues: analysis.qualityIssues as never,
        raw_response: { description: analysis.description } as never,
        model: MODEL,
        processed_at: new Date(),
      },
    })
    for (const t of analysis.tags.slice(0, 12)) {
      await tx.photo_tags.upsert({
        where: { photo_id_tag_source: { photo_id: photo.id, tag: t.tag.toLowerCase(), source: 'ai' } },
        create: {
          photo_id: photo.id,
          tag: t.tag.toLowerCase(),
          source: 'ai',
          ai_status: 'suggested',
          confidence: Math.max(0, Math.min(1, t.confidence)),
        },
        update: { confidence: Math.max(0, Math.min(1, t.confidence)) },
      })
    }
    if (analysis.description && !photo.description) {
      await tx.photos.update({ where: { id: photo.id }, data: { description: analysis.description } })
    }
  })
}

/* In-process queue: bounded concurrency, retries left to manual re-trigger. */
const queue: string[] = []
let active = 0
const MAX_CONCURRENT = 2

async function drain(orgIdByPhoto: Map<string, string>) {
  while (active < MAX_CONCURRENT && queue.length) {
    const photoId = queue.shift()!
    active++
    void processPhoto(photoId)
      .then(async () => {
        const orgId = orgIdByPhoto.get(photoId)
        orgIdByPhoto.delete(photoId)
        if (orgId) {
          // let clients refresh the photo with its new suggested tags
          const fresh = await prisma.photos.findUnique({ where: { id: photoId } })
          if (fresh) broadcast(orgId, 'photo.updated', { id: photoId, aiProcessed: true })
        }
      })
      .catch((e) => console.error(`AI processing failed for ${photoId}:`, e.message ?? e))
      .finally(() => {
        active--
        drain(orgIdByPhoto)
      })
  }
}

const pendingOrgs = new Map<string, string>()

export function enqueueAiProcessing(photoId: string, organizationId: string) {
  if (!aiConfigured) return
  pendingOrgs.set(photoId, organizationId)
  queue.push(photoId)
  void drain(pendingOrgs)
}
