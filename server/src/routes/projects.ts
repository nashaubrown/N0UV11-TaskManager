import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { notFound } from '../lib/errors.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { createProjectDto, updateProjectDto } from '../types/dto.js'
import { sProject } from '../lib/serialize.js'
import { pageParams, paged } from '../lib/pagination.js'
import { param } from '../lib/params.js'
import { audit } from '../services/audit.js'

export const projectsRouter = Router()
projectsRouter.use(requireAuth)

async function withStats(orgId: string, projects: any[]) {
  const ids = projects.map((p) => p.id)
  const [taskGroups, doneGroups, photoGroups] = await Promise.all([
    prisma.tasks.groupBy({ by: ['project_id'], where: { organization_id: orgId, project_id: { in: ids } }, _count: true }),
    prisma.tasks.groupBy({ by: ['project_id'], where: { organization_id: orgId, project_id: { in: ids }, status: 'completed' }, _count: true }),
    prisma.photos.groupBy({ by: ['project_id'], where: { organization_id: orgId, project_id: { in: ids }, deleted_at: null }, _count: true }),
  ])
  const find = (groups: any[], id: string) => groups.find((g) => g.project_id === id)?._count ?? 0
  return projects.map((p) => sProject(p, {
    taskCount: find(taskGroups, p.id),
    completedTaskCount: find(doneGroups, p.id),
    photoCount: find(photoGroups, p.id),
  }))
}

/** GET /projects?archived=false */
projectsRouter.get('/', async (req, res) => {
  const page = pageParams(req)
  const where = {
    organization_id: req.auth!.organizationId,
    archived: req.query.archived === 'true' ? true : req.query.archived === 'all' ? undefined : false,
  }
  const [rows, total] = await Promise.all([
    prisma.projects.findMany({ where, orderBy: { created_at: 'desc' }, take: page.limit, skip: page.offset }),
    prisma.projects.count({ where }),
  ])
  res.json(paged(await withStats(req.auth!.organizationId, rows), total, page))
})

/** POST /projects */
projectsRouter.post('/', requireRole('member'), validate(createProjectDto), async (req, res) => {
  const project = await prisma.projects.create({
    data: {
      organization_id: req.auth!.organizationId,
      name: req.body.name,
      description: req.body.description,
      created_by: req.auth!.userId,
    },
  })
  audit(req, 'project.create', 'project', project.id, { name: project.name })
  res.status(201).json(sProject(project))
})

/** GET /projects/:id */
projectsRouter.get('/:id', async (req, res) => {
  const project = await prisma.projects.findFirst({
    where: { id: param(req, 'id'), organization_id: req.auth!.organizationId },
  })
  if (!project) throw notFound('Project')
  res.json((await withStats(req.auth!.organizationId, [project]))[0])
})

/** PATCH /projects/:id */
projectsRouter.patch('/:id', requireRole('member'), validate(updateProjectDto), async (req, res) => {
  const { count } = await prisma.projects.updateMany({
    where: { id: param(req, 'id'), organization_id: req.auth!.organizationId },
    data: { name: req.body.name, description: req.body.description, archived: req.body.archived },
  })
  if (!count) throw notFound('Project')
  const project = await prisma.projects.findUnique({ where: { id: param(req, 'id') } })
  audit(req, 'project.update', 'project', param(req, 'id'), req.body)
  res.json((await withStats(req.auth!.organizationId, [project]))[0])
})

/** DELETE /projects/:id */
projectsRouter.delete('/:id', requireRole('manager'), async (req, res) => {
  const { count } = await prisma.projects.deleteMany({
    where: { id: param(req, 'id'), organization_id: req.auth!.organizationId },
  })
  if (!count) throw notFound('Project')
  audit(req, 'project.delete', 'project', param(req, 'id'))
  res.status(204).end()
})
