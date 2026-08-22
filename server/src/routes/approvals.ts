import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { badRequest, notFound } from '../lib/errors.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { createApprovalRequestDto, decisionDto } from '../types/dto.js'
import { sApproval, sUser } from '../lib/serialize.js'
import { pageParams, paged } from '../lib/pagination.js'
import { param } from '../lib/params.js'
import { audit } from '../services/audit.js'
import { broadcast } from '../ws/hub.js'

export const approvalsRouter = Router()
approvalsRouter.use(requireAuth)

/** Compose request + workflow steps + decisions into one API shape. */
async function assemble(requestId: string) {
  const r = await prisma.approval_requests.findUnique({
    where: { id: requestId },
    include: {
      users: true,
      approval_workflows: { include: { approval_workflow_steps: { include: { users: true }, orderBy: { step_no: 'asc' } } } },
      approval_decisions: { include: { users: true }, orderBy: { created_at: 'asc' } },
    },
  })
  if (!r) throw notFound('Approval request')
  const workflowSteps = r.approval_workflows?.approval_workflow_steps ?? []
  const steps = workflowSteps.map((ws) => {
    const decision = r.approval_decisions.find((d) => d.step_no === ws.step_no && d.action !== 'comment')
    return {
      stepNo: ws.step_no,
      name: ws.name,
      approver: ws.users ? sUser(ws.users) : undefined,
      decidedAction: decision?.action,
      decidedAt: decision?.created_at,
      feedback: decision?.feedback ?? undefined,
    }
  })
  return sApproval({ ...r, steps })
}

/** GET /approvals?status= */
approvalsRouter.get('/', async (req, res) => {
  const page = pageParams(req)
  const where = {
    status: req.query.status ? (String(req.query.status) as never) : undefined,
    photos: { organization_id: req.auth!.organizationId },
  }
  const [rows, total] = await Promise.all([
    prisma.approval_requests.findMany({ where, orderBy: { created_at: 'desc' }, take: page.limit, skip: page.offset }),
    prisma.approval_requests.count({ where }),
  ])
  res.json(paged(await Promise.all(rows.map((r) => assemble(r.id))), total, page))
})

/** POST /photos/:photoId/approvals — submit a photo for approval.
 *  Provide workflowId to reuse a template, or inline steps to create one. */
approvalsRouter.post('/photos/:photoId', requireRole('member'), validate(createApprovalRequestDto), async (req, res) => {
  const photo = await prisma.photos.findFirst({
    where: { id: param(req, 'photoId'), organization_id: req.auth!.organizationId, deleted_at: null },
  })
  if (!photo) throw notFound('Photo')

  let workflowId: string | undefined = req.body.workflowId
  if (!workflowId) {
    const steps = req.body.steps ?? [{ name: 'Review' }]
    const wf = await prisma.approval_workflows.create({
      data: {
        organization_id: req.auth!.organizationId,
        name: `Ad-hoc · ${photo.title ?? photo.id.slice(0, 8)}`,
        created_by: req.auth!.userId,
        approval_workflow_steps: {
          create: steps.map((s: { name: string; approverId?: string }, i: number) => ({
            step_no: i + 1,
            name: s.name,
            approver_id: s.approverId,
          })),
        },
      },
    })
    workflowId = wf.id
  }

  const request = await prisma.approval_requests.create({
    data: { photo_id: photo.id, workflow_id: workflowId, status: 'in_review', requested_by: req.auth!.userId },
  })
  const out = await assemble(request.id)
  audit(req, 'approval.request', 'photo', photo.id, { requestId: request.id })
  broadcast(req.auth!.organizationId, 'approval.updated', out)
  res.status(201).json(out)
})

/** GET /approvals/:id */
approvalsRouter.get('/:id', async (req, res) => {
  const r = await prisma.approval_requests.findFirst({
    where: { id: param(req, 'id'), photos: { organization_id: req.auth!.organizationId } },
  })
  if (!r) throw notFound('Approval request')
  res.json(await assemble(r.id))
})

/** POST /approvals/:id/decisions — approve / reject / request_changes / comment. */
approvalsRouter.post('/:id/decisions', requireRole('member'), validate(decisionDto), async (req, res) => {
  const r = await prisma.approval_requests.findFirst({
    where: { id: param(req, 'id'), photos: { organization_id: req.auth!.organizationId } },
    include: { approval_workflows: { include: { approval_workflow_steps: true } } },
  })
  if (!r) throw notFound('Approval request')
  if (['approved', 'rejected'].includes(r.status)) throw badRequest('This request is already resolved')

  const { action, feedback } = req.body
  await prisma.approval_decisions.create({
    data: { request_id: r.id, step_no: r.current_step, action, actor_id: req.auth!.userId, feedback },
  })

  const totalSteps = r.approval_workflows?.approval_workflow_steps.length ?? 1
  let status = r.status as string
  let currentStep = r.current_step
  let resolvedAt: Date | null = null
  if (action === 'approve') {
    if (r.current_step >= totalSteps) { status = 'approved'; resolvedAt = new Date() }
    else currentStep = r.current_step + 1
  } else if (action === 'reject') {
    status = 'rejected'; resolvedAt = new Date()
  } else if (action === 'request_changes') {
    status = 'changes_requested'
  }
  await prisma.approval_requests.update({
    where: { id: r.id },
    data: { status: status as never, current_step: currentStep, resolved_at: resolvedAt },
  })
  const out = await assemble(r.id)
  audit(req, `approval.${action}`, 'photo', r.photo_id, { requestId: r.id, step: r.current_step })
  broadcast(req.auth!.organizationId, 'approval.updated', out)
  res.status(201).json(out)
})
