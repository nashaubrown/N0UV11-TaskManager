import { Router } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { notFound } from '../lib/errors.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { bulkStatusDto, createTaskDto, updateTaskDto } from '../types/dto.js'
import { sTask, sComment } from '../lib/serialize.js'
import { pageParams, paged } from '../lib/pagination.js'
import { param } from '../lib/params.js'
import { audit } from '../services/audit.js'
import { broadcast } from '../ws/hub.js'
import { deleteCalendarEvent, enqueueCalendarSync } from '../services/gcal.js'
import { createCommentDto } from '../types/dto.js'

export const tasksRouter = Router()
tasksRouter.use(requireAuth)

const taskInclude = {
  task_assignees: { include: { users: true } },
  task_label_links: { include: { task_labels: true } },
  _count: { select: { comments: true, other_tasks: true } },
} satisfies Prisma.tasksInclude

async function loadTask(orgId: string, id: string) {
  const t = await prisma.tasks.findFirst({ where: { id, organization_id: orgId }, include: taskInclude })
  if (!t) throw notFound('Task')
  return t
}

/** GET /tasks?status=&priority=&projectId=&assigneeId=&q=&dueBefore=&sort= */
tasksRouter.get('/', async (req, res) => {
  const page = pageParams(req)
  const q = String(req.query.q ?? '').trim()
  const where: Prisma.tasksWhereInput = {
    organization_id: req.auth!.organizationId,
    parent_task_id: req.query.includeSubtasks === 'true' ? undefined : null,
    status: req.query.status ? (String(req.query.status) as never) : undefined,
    priority: req.query.priority ? (String(req.query.priority) as never) : undefined,
    project_id: req.query.projectId ? String(req.query.projectId) : undefined,
    due_at: req.query.dueBefore ? { lte: new Date(String(req.query.dueBefore)) } : undefined,
    task_assignees: req.query.assigneeId ? { some: { user_id: String(req.query.assigneeId) } } : undefined,
    title: q ? { contains: q, mode: 'insensitive' } : undefined,
  }
  const orderBy: Prisma.tasksOrderByWithRelationInput =
    req.query.sort === 'due' ? { due_at: { sort: 'asc', nulls: 'last' } } : { created_at: 'desc' }
  const [rows, total] = await Promise.all([
    prisma.tasks.findMany({ where, include: taskInclude, orderBy, take: page.limit, skip: page.offset }),
    prisma.tasks.count({ where }),
  ])
  res.json(paged(rows.map(sTask), total, page))
})

/** POST /tasks */
tasksRouter.post('/', requireRole('member'), validate(createTaskDto), async (req, res) => {
  const b = req.body
  const task = await prisma.tasks.create({
    data: {
      organization_id: req.auth!.organizationId,
      project_id: b.projectId,
      parent_task_id: b.parentTaskId,
      title: b.title,
      description: b.description,
      status: b.status,
      priority: b.priority,
      due_at: b.dueAt ? new Date(b.dueAt) : undefined,
      created_by: req.auth!.userId,
      task_assignees: { create: b.assigneeIds.map((user_id: string) => ({ user_id })) },
    },
    include: taskInclude,
  })
  const out = sTask(task)
  audit(req, 'task.create', 'task', task.id, { title: task.title })
  broadcast(req.auth!.organizationId, 'task.created', out)
  enqueueCalendarSync(task.id, req.auth!.userId, 'create')
  res.status(201).json(out)
})

/** POST /tasks/bulk-status */
tasksRouter.post('/bulk-status', requireRole('member'), validate(bulkStatusDto), async (req, res) => {
  const { taskIds, status } = req.body
  const { count } = await prisma.tasks.updateMany({
    where: { id: { in: taskIds }, organization_id: req.auth!.organizationId },
    data: { status, completed_at: status === 'completed' ? new Date() : null },
  })
  audit(req, 'task.bulk_status', 'task', undefined, { count, status })
  broadcast(req.auth!.organizationId, 'task.updated', { taskIds, status })
  res.json({ updated: count })
})

/** GET /tasks/:id — includes sub-tasks */
tasksRouter.get('/:id', async (req, res) => {
  const t = await loadTask(req.auth!.organizationId, param(req, 'id'))
  const subtasks = await prisma.tasks.findMany({
    where: { parent_task_id: t.id },
    include: taskInclude,
    orderBy: { position: 'asc' },
  })
  res.json({ ...sTask(t), subtasks: subtasks.map(sTask) })
})

/** PATCH /tasks/:id */
tasksRouter.patch('/:id', requireRole('member'), validate(updateTaskDto), async (req, res) => {
  await loadTask(req.auth!.organizationId, param(req, 'id'))
  const b = req.body
  const task = await prisma.tasks.update({
    where: { id: param(req, 'id') },
    data: {
      title: b.title,
      description: b.description,
      status: b.status,
      priority: b.priority,
      project_id: b.projectId,
      due_at: b.dueAt === undefined ? undefined : b.dueAt ? new Date(b.dueAt) : null,
      completed_at: b.status === 'completed' ? new Date() : b.status ? null : undefined,
      ...(b.assigneeIds
        ? { task_assignees: { deleteMany: {}, create: b.assigneeIds.map((user_id: string) => ({ user_id })) } }
        : {}),
    },
    include: taskInclude,
  })
  const out = sTask(task)
  audit(req, 'task.update', 'task', task.id, b)
  broadcast(req.auth!.organizationId, 'task.updated', out)
  enqueueCalendarSync(task.id, req.auth!.userId, 'update')
  res.json(out)
})

/** DELETE /tasks/:id */
tasksRouter.delete('/:id', requireRole('member'), async (req, res) => {
  await loadTask(req.auth!.organizationId, param(req, 'id'))
  deleteCalendarEvent(param(req, 'id'), req.auth!.userId)
  await prisma.tasks.delete({ where: { id: param(req, 'id') } })
  audit(req, 'task.delete', 'task', param(req, 'id'))
  broadcast(req.auth!.organizationId, 'task.deleted', { id: param(req, 'id') })
  res.status(204).end()
})

/** GET /tasks/:id/comments */
tasksRouter.get('/:id/comments', async (req, res) => {
  await loadTask(req.auth!.organizationId, param(req, 'id'))
  const rows = await prisma.comments.findMany({
    where: { task_id: param(req, 'id'), parent_id: null },
    include: { users: true, other_comments: { include: { users: true }, orderBy: { created_at: 'asc' } } },
    orderBy: { created_at: 'asc' },
  })
  res.json({ items: rows.map(sComment) })
})

/** POST /tasks/:id/comments */
tasksRouter.post('/:id/comments', requireRole('member'), validate(createCommentDto), async (req, res) => {
  await loadTask(req.auth!.organizationId, param(req, 'id'))
  const comment = await prisma.comments.create({
    data: { task_id: param(req, 'id'), parent_id: req.body.parentId, author_id: req.auth!.userId, body: req.body.body },
    include: { users: true },
  })
  const out = sComment(comment)
  audit(req, 'comment.create', 'task', param(req, 'id'))
  broadcast(req.auth!.organizationId, 'comment.created', out)
  res.status(201).json(out)
})
