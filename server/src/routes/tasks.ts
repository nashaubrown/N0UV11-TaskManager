import { Router } from 'express'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { notFound } from '../lib/errors.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { requireCapability } from '../lib/permissions.js'
import { validate } from '../middleware/validate.js'
import { bulkStatusDto, createTaskDto, updateTaskDto } from '../types/dto.js'
import { sTask, sComment, sShoot } from '../lib/serialize.js'
import { pageParams, paged } from '../lib/pagination.js'
import { param } from '../lib/params.js'
import { audit } from '../services/audit.js'
import { broadcast } from '../ws/hub.js'
import { deleteCalendarEvent, enqueueCalendarSync, syncShootToCalendars } from '../services/gcal.js'
import { pushToUsers } from '../services/push.js'
import { createCommentDto } from '../types/dto.js'

export const tasksRouter = Router()
tasksRouter.use(requireAuth)

export const taskInclude = {
  task_assignees: { include: { users: true } },
  task_label_links: { include: { task_labels: true } },
  task_field_values: true,
  task_checklist_items: true,
  task_attachments: true,
  task_time_entries: true,
  task_dependencies_task_dependencies_task_idTotasks: true,
  _count: { select: { comments: true, other_tasks: true } },
} satisfies Prisma.tasksInclude

async function loadTask(orgId: string, id: string) {
  const t = await prisma.tasks.findFirst({ where: { id, organization_id: orgId }, include: taskInclude })
  if (!t) throw notFound('Task')
  return t
}

/** A "📸" task steers its shoot too: date and status edits push back to the
 *  photoshoot (titles stay one-way, shoot → task), then Google re-syncs. */
async function pushShootFromTask(taskId: string, orgId: string, actorId: string) {
  try {
    const shoot = await prisma.photoshoots.findFirst({ where: { linked_task_id: taskId, organization_id: orgId } })
    if (!shoot) return
    const task = await prisma.tasks.findUnique({ where: { id: taskId } })
    if (!task) return
    const data: { starts_at?: Date; ends_at?: Date; status?: never } = {}
    if (task.starts_at && task.due_at && task.due_at > task.starts_at &&
        (Number(task.starts_at) !== Number(shoot.starts_at) || Number(task.due_at) !== Number(shoot.ends_at))) {
      data.starts_at = task.starts_at
      data.ends_at = task.due_at
    }
    const status =
      task.status === 'completed' ? 'completed'
      : task.status === 'cancelled' ? 'cancelled'
      : shoot.status === 'completed' || shoot.status === 'cancelled' ? 'confirmed'
      : shoot.status
    if (status !== shoot.status) data.status = status as never
    if (!Object.keys(data).length) return
    const updated = await prisma.photoshoots.update({
      where: { id: shoot.id },
      data,
      include: { shoot_crew: { include: { users: true } } },
    })
    broadcast(orgId, 'shoot.updated', sShoot(updated))
    void syncShootToCalendars(shoot.id, actorId)
  } catch (e) {
    console.error('task → shoot sync failed', e)
  }
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
    list_id: req.query.listId ? String(req.query.listId) : undefined,
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
tasksRouter.post('/', requireCapability('tasks.manage'), validate(createTaskDto), async (req, res) => {
  const b = req.body
  const task = await prisma.tasks.create({
    data: {
      organization_id: req.auth!.organizationId,
      project_id: b.projectId,
      list_id: b.listId,
      parent_task_id: b.parentTaskId,
      title: b.title,
      description: b.description,
      status: b.status,
      priority: b.priority,
      starts_at: b.startsAt ? new Date(b.startsAt) : undefined,
      due_at: b.dueAt ? new Date(b.dueAt) : undefined,
      estimate_minutes: b.estimateMinutes,
      created_by: req.auth!.userId,
      task_assignees: { create: b.assigneeIds.map((user_id: string) => ({ user_id })) },
    },
    include: taskInclude,
  })
  const out = sTask(task)
  audit(req, 'task.create', 'task', task.id, { title: task.title })
  broadcast(req.auth!.organizationId, 'task.created', out)
  pushToUsers(
    b.assigneeIds.filter((id: string) => id !== req.auth!.userId),
    { title: 'New task assigned', body: task.title, url: '/tasks', tag: `task-${task.id}` },
  )
  enqueueCalendarSync(task.id, req.auth!.userId, 'create')
  res.status(201).json(out)
})

/** POST /tasks/bulk-status */
tasksRouter.post('/bulk-status', requireCapability('tasks.manage'), validate(bulkStatusDto), async (req, res) => {
  const { taskIds, status } = req.body
  const { count } = await prisma.tasks.updateMany({
    where: { id: { in: taskIds }, organization_id: req.auth!.organizationId },
    data: { status, completed_at: status === 'completed' ? new Date() : null },
  })
  audit(req, 'task.bulk_status', 'task', undefined, { count, status })
  broadcast(req.auth!.organizationId, 'task.updated', { taskIds, status })
  res.json({ updated: count })
})

/** GET /tasks/labels — the workspace's shared tag set. */
tasksRouter.get('/labels', async (req, res) => {
  const rows = await prisma.task_labels.findMany({
    where: { organization_id: req.auth!.organizationId },
    orderBy: { name: 'asc' },
  })
  res.json({ items: rows.map((l) => ({ id: l.id, name: l.name, color: l.color })) })
})

/** POST /tasks/labels — create (or return) a tag by name. */
tasksRouter.post('/labels', requireCapability('tasks.manage'), validate(z.object({
  name: z.string().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
})), async (req, res) => {
  const label = await prisma.task_labels.upsert({
    where: { organization_id_name: { organization_id: req.auth!.organizationId, name: req.body.name } },
    create: { organization_id: req.auth!.organizationId, name: req.body.name, color: req.body.color },
    update: {},
  })
  audit(req, 'label.create', 'task', label.id, { name: label.name })
  res.status(201).json({ id: label.id, name: label.name, color: label.color })
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
tasksRouter.patch('/:id', requireCapability('tasks.manage'), validate(updateTaskDto), async (req, res) => {
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
      list_id: b.listId,
      starts_at: b.startsAt === undefined ? undefined : b.startsAt ? new Date(b.startsAt) : null,
      due_at: b.dueAt === undefined ? undefined : b.dueAt ? new Date(b.dueAt) : null,
      estimate_minutes: b.estimateMinutes === undefined ? undefined : b.estimateMinutes,
      completed_at: b.status === 'completed' ? new Date() : b.status ? null : undefined,
      ...(b.assigneeIds
        ? { task_assignees: { deleteMany: {}, create: b.assigneeIds.map((user_id: string) => ({ user_id })) } }
        : {}),
      ...(b.labelIds
        ? { task_label_links: { deleteMany: {}, create: b.labelIds.map((label_id: string) => ({ label_id })) } }
        : {}),
      ...(b.fieldValues
        ? {
            task_field_values: {
              deleteMany: {},
              create: b.fieldValues
                .filter((v: { value: string }) => v.value !== '')
                .map((v: { fieldId: string; value: string }) => ({ field_id: v.fieldId, value: v.value })),
            },
          }
        : {}),
    },
    include: taskInclude,
  })
  const out = sTask(task)
  audit(req, 'task.update', 'task', task.id, b)
  broadcast(req.auth!.organizationId, 'task.updated', out)
  enqueueCalendarSync(task.id, req.auth!.userId, 'update')
  if (b.startsAt !== undefined || b.dueAt !== undefined || b.status) {
    void pushShootFromTask(task.id, req.auth!.organizationId, req.auth!.userId)
  }
  res.json(out)
})

/** DELETE /tasks/:id */
tasksRouter.delete('/:id', requireCapability('tasks.manage'), async (req, res) => {
  await loadTask(req.auth!.organizationId, param(req, 'id'))
  deleteCalendarEvent(param(req, 'id'), req.auth!.userId)
  await prisma.tasks.delete({ where: { id: param(req, 'id') } })
  audit(req, 'task.delete', 'task', param(req, 'id'))
  broadcast(req.auth!.organizationId, 'task.deleted', { id: param(req, 'id') })
  res.status(204).end()
})

/** Re-serialize and broadcast a task after a sub-resource write. */
async function touched(orgId: string, taskId: string) {
  const t = await prisma.tasks.findFirst({ where: { id: taskId, organization_id: orgId }, include: taskInclude })
  if (!t) throw notFound('Task')
  const out = sTask(t)
  broadcast(orgId, 'task.updated', out)
  return out
}

/** POST /tasks/:id/checklist */
tasksRouter.post('/:id/checklist', requireCapability('tasks.manage'), validate(z.object({ label: z.string().min(1).max(500) })), async (req, res) => {
  const t = await loadTask(req.auth!.organizationId, param(req, 'id'))
  const max = await prisma.task_checklist_items.aggregate({ where: { task_id: t.id }, _max: { position: true } })
  await prisma.task_checklist_items.create({
    data: { task_id: t.id, label: req.body.label, position: (max._max.position ?? -1) + 1 },
  })
  res.status(201).json(await touched(req.auth!.organizationId, t.id))
})

/** PATCH /tasks/:id/checklist/:itemId */
tasksRouter.patch('/:id/checklist/:itemId', requireCapability('tasks.manage'), validate(z.object({
  label: z.string().min(1).max(500).optional(),
  done: z.boolean().optional(),
})), async (req, res) => {
  const t = await loadTask(req.auth!.organizationId, param(req, 'id'))
  const { count } = await prisma.task_checklist_items.updateMany({
    where: { id: param(req, 'itemId'), task_id: t.id },
    data: { label: req.body.label, done: req.body.done },
  })
  if (!count) throw notFound('Checklist item')
  res.json(await touched(req.auth!.organizationId, t.id))
})

/** DELETE /tasks/:id/checklist/:itemId */
tasksRouter.delete('/:id/checklist/:itemId', requireCapability('tasks.manage'), async (req, res) => {
  const t = await loadTask(req.auth!.organizationId, param(req, 'id'))
  await prisma.task_checklist_items.deleteMany({ where: { id: param(req, 'itemId'), task_id: t.id } })
  res.json(await touched(req.auth!.organizationId, t.id))
})

/** POST /tasks/:id/attachments — link a library photo to the task. */
tasksRouter.post('/:id/attachments', requireCapability('tasks.manage'), validate(z.object({ photoId: z.string().uuid() })), async (req, res) => {
  const t = await loadTask(req.auth!.organizationId, param(req, 'id'))
  const photo = await prisma.photos.findFirst({
    where: { id: req.body.photoId, organization_id: req.auth!.organizationId, deleted_at: null },
  })
  if (!photo) throw notFound('Photo')
  await prisma.task_attachments.upsert({
    where: { task_id_photo_id: { task_id: t.id, photo_id: photo.id } },
    create: { task_id: t.id, photo_id: photo.id },
    update: {},
  })
  res.status(201).json(await touched(req.auth!.organizationId, t.id))
})

/** DELETE /tasks/:id/attachments/:photoId */
tasksRouter.delete('/:id/attachments/:photoId', requireCapability('tasks.manage'), async (req, res) => {
  const t = await loadTask(req.auth!.organizationId, param(req, 'id'))
  await prisma.task_attachments.deleteMany({ where: { task_id: t.id, photo_id: param(req, 'photoId') } })
  res.json(await touched(req.auth!.organizationId, t.id))
})

/** POST /tasks/:id/dependencies — this task waits on another. */
tasksRouter.post('/:id/dependencies', requireCapability('tasks.manage'), validate(z.object({ dependsOnTaskId: z.string().uuid() })), async (req, res) => {
  const t = await loadTask(req.auth!.organizationId, param(req, 'id'))
  const other = await loadTask(req.auth!.organizationId, req.body.dependsOnTaskId)
  if (other.id === t.id) throw notFound('Task')
  await prisma.task_dependencies.upsert({
    where: { task_id_depends_on_task_id: { task_id: t.id, depends_on_task_id: other.id } },
    create: { task_id: t.id, depends_on_task_id: other.id },
    update: {},
  })
  res.status(201).json(await touched(req.auth!.organizationId, t.id))
})

/** DELETE /tasks/:id/dependencies/:depId */
tasksRouter.delete('/:id/dependencies/:depId', requireCapability('tasks.manage'), async (req, res) => {
  const t = await loadTask(req.auth!.organizationId, param(req, 'id'))
  await prisma.task_dependencies.deleteMany({ where: { task_id: t.id, depends_on_task_id: param(req, 'depId') } })
  res.json(await touched(req.auth!.organizationId, t.id))
})

/** POST /tasks/:id/time/start — one running timer per person: starting here
 *  stops any timer they have running elsewhere. */
tasksRouter.post('/:id/time/start', requireCapability('tasks.manage'), async (req, res) => {
  const t = await loadTask(req.auth!.organizationId, param(req, 'id'))
  const open = await prisma.task_time_entries.findMany({ where: { user_id: req.auth!.userId, ended_at: null } })
  for (const e of open) {
    await prisma.task_time_entries.update({
      where: { id: e.id },
      data: { ended_at: new Date(), seconds: Math.round((Date.now() - e.started_at.getTime()) / 1000) },
    })
    if (e.task_id !== t.id) void touched(req.auth!.organizationId, e.task_id).catch(() => {})
  }
  await prisma.task_time_entries.create({ data: { task_id: t.id, user_id: req.auth!.userId } })
  res.json(await touched(req.auth!.organizationId, t.id))
})

/** POST /tasks/:id/time/stop */
tasksRouter.post('/:id/time/stop', requireCapability('tasks.manage'), async (req, res) => {
  const t = await loadTask(req.auth!.organizationId, param(req, 'id'))
  const open = await prisma.task_time_entries.findMany({ where: { task_id: t.id, user_id: req.auth!.userId, ended_at: null } })
  for (const e of open) {
    await prisma.task_time_entries.update({
      where: { id: e.id },
      data: { ended_at: new Date(), seconds: Math.round((Date.now() - e.started_at.getTime()) / 1000) },
    })
  }
  res.json(await touched(req.auth!.organizationId, t.id))
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
  const task = await prisma.tasks.findUnique({
    where: { id: param(req, 'id') },
    include: { task_assignees: true },
  })
  pushToUsers(
    (task?.task_assignees ?? []).map((a) => a.user_id).filter((id) => id !== req.auth!.userId),
    { title: `Comment on: ${task?.title ?? 'a task'}`, body: req.body.body.slice(0, 120), url: '/tasks', tag: `task-${param(req, 'id')}` },
  )
  res.status(201).json(out)
})
