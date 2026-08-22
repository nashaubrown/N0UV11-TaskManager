/* Dev seed: an org, four users (password: nouvii123), merchants, projects,
 * tasks, and comments — mirrors the Phase 1 mock data. */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000)

async function main() {
  const password_hash = await bcrypt.hash('nouvii123', 11)

  const org = await prisma.organizations.create({
    data: { name: 'NOUVII Studio', slug: `nouvii-${Date.now().toString(36)}` },
  })

  const people = [
    { email: 'nashaubrown@gmail.com', full_name: 'Nashau Brown', role: 'owner' },
    { email: 'aisha@nouvii.app', full_name: 'Aisha Rasheed', role: 'manager' },
    { email: 'ibrahim@nouvii.app', full_name: 'Ibrahim Waheed', role: 'member' },
    { email: 'mariyam@nouvii.app', full_name: 'Mariyam Saeed', role: 'member' },
  ] as const

  const users = []
  for (const p of people) {
    const user = await prisma.users.upsert({
      where: { email: p.email },
      create: { email: p.email, full_name: p.full_name, password_hash },
      update: {},
    })
    await prisma.organization_members.create({
      data: { organization_id: org.id, user_id: user.id, role: p.role },
    })
    users.push(user)
  }

  const merchantRows = [
    { name: 'Café Aroma', location: 'Hulhumalé' },
    { name: 'Island Resort Group', location: 'Baa Atoll' },
    { name: 'Novelty Traders', location: 'Malé' },
    { name: 'Seaside Spa & Wellness', location: 'Malé' },
  ]
  const merchants = []
  for (const m of merchantRows) {
    merchants.push(await prisma.merchants.create({ data: { organization_id: org.id, ...m } }))
  }

  const projectRows = [
    { name: 'Café Aroma Launch', description: 'Product + interior shoot for the new Hulhumalé branch' },
    { name: 'Island Resort Rebrand', description: 'Full photo library refresh across 3 properties' },
    { name: 'Q3 Merchant Onboarding', description: 'Storefront documentation for 12 new merchants' },
  ]
  const projects = []
  for (const p of projectRows) {
    projects.push(await prisma.projects.create({
      data: { organization_id: org.id, created_by: users[0].id, ...p },
    }))
  }

  const t1 = await prisma.tasks.create({
    data: {
      organization_id: org.id, project_id: projects[0].id, created_by: users[0].id,
      title: 'Shoot espresso bar hero images', status: 'in_progress', priority: 'high', due_at: day(1),
      task_assignees: { create: [{ user_id: users[1].id }, { user_id: users[2].id }] },
    },
  })
  const t2 = await prisma.tasks.create({
    data: {
      organization_id: org.id, project_id: projects[0].id, created_by: users[0].id,
      title: 'Client review — round 1 selects', status: 'in_review', priority: 'urgent', due_at: day(0),
      task_assignees: { create: [{ user_id: users[0].id }] },
    },
  })
  await prisma.tasks.create({
    data: {
      organization_id: org.id, project_id: projects[1].id, created_by: users[1].id,
      title: 'Retouch beach villa exteriors', status: 'todo', priority: 'medium', due_at: day(3),
      task_assignees: { create: [{ user_id: users[3].id }] },
    },
  })
  await prisma.tasks.create({
    data: {
      organization_id: org.id, project_id: projects[2].id, created_by: users[2].id,
      title: 'Upload storefront batch — Malé north', status: 'completed', priority: 'medium',
      completed_at: day(-1), due_at: day(-1),
      task_assignees: { create: [{ user_id: users[2].id }] },
    },
  })

  await prisma.comments.create({
    data: { task_id: t1.id, author_id: users[1].id, body: 'Client confirmed access from 7am — natural light window is 7:30–9:00.' },
  })
  const c = await prisma.comments.create({
    data: { task_id: t2.id, author_id: users[0].id, body: 'Round 1 selects are in the shared folder — 24 images, need to cut to 12.' },
  })
  await prisma.comments.create({
    data: { task_id: t2.id, parent_id: c.id, author_id: users[1].id, body: 'My picks are starred.' },
  })

  console.log(`Seeded org ${org.id}`)
  console.log('Login: nashaubrown@gmail.com / nouvii123')
}

main().finally(() => prisma.$disconnect())
