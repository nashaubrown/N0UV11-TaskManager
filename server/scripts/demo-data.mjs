/* Demo content: generates 12 branded photos and fills the workspace —
 * photos across merchants/projects with approval states, comments, and a
 * feed plan for Café Aroma. Idempotent: skips if demo photos exist.
 * Run: npm run db:demo  (server does NOT need to be running) */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { makeImage, DEMO_SHOTS } from './demo-images.mjs'

const prisma = new PrismaClient()
const uploadsDir = process.env.STORAGE_LOCAL_DIR ?? './uploads'
const day = (n) => new Date(Date.now() + n * 86_400_000)

async function main() {
  const existing = await prisma.photos.count({ where: { s3_key: { startsWith: 'photos/demo/' } } })
  if (existing > 0) {
    console.log(`Demo photos already present (${existing}) — nothing to do.`)
    return
  }

  const org = await prisma.organizations.findFirst({ orderBy: { created_at: 'asc' } })
  if (!org) throw new Error('No organization found — run npm run db:seed first.')
  const owner = await prisma.organization_members.findFirst({
    where: { organization_id: org.id, role: 'owner' }, include: { users_organization_members_user_idTousers: true },
  })
  const user = owner.users_organization_members_user_idTousers
  const merchants = await prisma.merchants.findMany({ where: { organization_id: org.id } })
  const projects = await prisma.projects.findMany({ where: { organization_id: org.id } })
  const byName = (n) => merchants.find((m) => m.name === n)
  const project = (i) => projects[i % Math.max(projects.length, 1)]

  // profile polish for the feed previews
  const profiles = {
    'Café Aroma': { ig_handle: 'cafearoma.mv', bio: 'Specialty coffee in Hulhumalé ☕\nOpen 7am–11pm' },
    'Island Resort Group': { ig_handle: 'islandresorts.mv', bio: 'Three islands. One standard. 🌴' },
    'Novelty Traders': { ig_handle: 'noveltytraders', bio: 'Everything your home is missing — Malé north.' },
    'Seaside Spa & Wellness': { ig_handle: 'seasidespa.mv', bio: 'Slow down. You are on island time. 🌊' },
  }
  for (const [name, data] of Object.entries(profiles)) {
    const m = byName(name)
    if (m && !m.ig_handle) await prisma.merchants.update({ where: { id: m.id }, data })
  }

  mkdirSync(path.join(uploadsDir, 'photos/demo'), { recursive: true })

  // states spread across the library so filters/portal/feed all have content
  const STATES = ['approved', 'approved', 'approved', 'approved', 'approved', 'approved',
                  'in_review', 'in_review', 'pending', 'changes_requested', 'rejected', 'approved']

  const created = []
  for (let i = 0; i < DEMO_SHOTS.length; i++) {
    const shot = DEMO_SHOTS[i]
    const key = `photos/demo/${shot.key}.png`
    const png = makeImage(shot.spec)
    writeFileSync(path.join(uploadsDir, key), png)
    const merchant = byName(shot.merchant)
    const photo = await prisma.photos.create({
      data: {
        organization_id: org.id,
        project_id: project(i)?.id,
        merchant_id: merchant?.id,
        uploaded_by: user.id,
        status: 'ready',
        title: shot.title,
        s3_key: key,
        content_type: 'image/png',
        size_bytes: png.length,
        width_px: 720,
        height_px: 900,
        created_at: day(-(12 - i) / 2),
        photo_tags: { create: shot.tags.map((tag) => ({ tag, source: 'user', created_by: user.id })) },
        photo_versions: { create: { version_no: 1, s3_key: key, size_bytes: png.length, created_by: user.id } },
      },
    })
    created.push({ photo, state: STATES[i], merchant })

    const state = STATES[i]
    if (state !== 'pending') {
      const wf = await prisma.approval_workflows.create({
        data: {
          organization_id: org.id,
          name: `Review · ${shot.title}`,
          created_by: user.id,
          approval_workflow_steps: { create: [{ step_no: 1, name: 'Client review' }] },
        },
      })
      const request = await prisma.approval_requests.create({
        data: {
          photo_id: photo.id,
          workflow_id: wf.id,
          status: state === 'in_review' ? 'in_review' : state,
          requested_by: user.id,
          resolved_at: ['approved', 'rejected'].includes(state) ? day(-1) : null,
        },
      })
      if (['approved', 'rejected', 'changes_requested'].includes(state)) {
        await prisma.approval_decisions.create({
          data: {
            request_id: request.id,
            step_no: 1,
            action: state === 'approved' ? 'approve' : state === 'rejected' ? 'reject' : 'request_changes',
            guest_name: 'Ahmed Naseem (client)',
            feedback: state === 'changes_requested' ? 'Can we get a brighter version of this one?' :
                      state === 'rejected' ? 'Too dark for the campaign.' : null,
          },
        })
      }
    }
  }

  // a few comments so threads feel alive
  const commentOn = (idx, body, pin) =>
    prisma.comments.create({
      data: { photo_id: created[idx].photo.id, author_id: user.id, body, pin_x: pin?.[0], pin_y: pin?.[1] },
    })
  await commentOn(0, 'This is the hero shot — lead the campaign with it.')
  await commentOn(3, 'Rosetta came out clean. Client will love this.', [0.5, 0.42])
  await commentOn(9, 'Steam room version coming in the next batch.')

  // feed plans: Café Aroma + Island Resort get populated grids
  for (const name of ['Café Aroma', 'Island Resort Group']) {
    const m = byName(name)
    if (!m) continue
    const approved = created.filter((c) => c.merchant?.id === m.id && c.state === 'approved')
    for (let i = 0; i < approved.length; i++) {
      await prisma.feed_plan_items.create({
        data: {
          merchant_id: m.id,
          photo_id: approved[i].photo.id,
          position: i,
          added_by: user.id,
          caption: i === 0 ? `New week, new light. ✨\n\n#maldives #${(profiles[name]?.ig_handle ?? '').replace(/\W/g, '')}` : null,
        },
      })
    }
  }

  console.log(`Created ${created.length} demo photos across ${merchants.length} merchants`)
  console.log('Approved 7 · in review 2 · pending 1 · changes requested 1 · rejected 1')
  console.log('Feed plans filled for Café Aroma and Island Resort Group')
}

main()
  .catch((e) => { console.error(e.message); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
