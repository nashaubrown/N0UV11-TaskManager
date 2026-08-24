import { z } from 'zod'

/* ---------- shared enums (mirror database-schema.sql) ---------- */
export const taskStatus = z.enum(['todo', 'in_progress', 'in_review', 'completed', 'cancelled'])
export const taskPriority = z.enum(['low', 'medium', 'high', 'urgent'])
export const approvalStatus = z.enum(['draft', 'pending', 'in_review', 'approved', 'rejected', 'changes_requested'])
export const approvalAction = z.enum(['approve', 'reject', 'request_changes', 'comment'])
export const dealStage = z.enum(['lead', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost'])
export const userRole = z.enum(['owner', 'admin', 'manager', 'member', 'viewer'])

/* ---------- auth ---------- */
export const signupDto = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(1).max(200),
  organizationName: z.string().min(1).max(200),
})
export const loginDto = z.object({ email: z.string().email(), password: z.string() })
export const refreshDto = z.object({ refreshToken: z.string() })

/* ---------- projects ---------- */
export const createProjectDto = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
})
export const updateProjectDto = createProjectDto.partial().extend({
  archived: z.boolean().optional(),
})

/* ---------- tasks ---------- */
export const createTaskDto = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(10_000).optional(),
  status: taskStatus.default('todo'),
  priority: taskPriority.default('medium'),
  startsAt: z.string().datetime({ offset: true }).optional(),
  dueAt: z.string().datetime({ offset: true }).optional(),
  projectId: z.string().uuid().optional(),
  listId: z.string().uuid().optional(),
  parentTaskId: z.string().uuid().optional(),
  assigneeIds: z.array(z.string().uuid()).max(20).default([]),
  estimateMinutes: z.number().int().min(0).max(100_000).optional(),
})
export const updateTaskDto = createTaskDto.partial().extend({
  startsAt: z.string().datetime({ offset: true }).nullable().optional(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  estimateMinutes: z.number().int().min(0).max(100_000).nullable().optional(),
  fieldValues: z.array(z.object({ fieldId: z.string().uuid(), value: z.string().max(2000) })).max(30).optional(),
})
export const bulkStatusDto = z.object({
  taskIds: z.array(z.string().uuid()).min(1).max(100),
  status: taskStatus,
})

/* ---------- photos ---------- */
export const presignDto = z.object({
  fileName: z.string().min(1).max(300),
  contentType: z.string().regex(/^image\//, 'Only image uploads are allowed'),
  sizeBytes: z.number().int().positive().max(50 * 1024 * 1024, 'Max upload size is 50 MB'),
})
export const registerPhotoDto = z.object({
  s3Key: z.string().min(1),
  title: z.string().max(300).optional(),
  contentType: z.string().regex(/^image\//),
  sizeBytes: z.number().int().positive(),
  widthPx: z.number().int().positive().optional(),
  heightPx: z.number().int().positive().optional(),
  capturedAt: z.string().datetime({ offset: true }).optional(),
  deviceModel: z.string().max(200).optional(),
  projectId: z.string().uuid().optional(),
  merchantId: z.string().uuid().optional(),
})
export const updatePhotoDto = z.object({
  title: z.string().max(300).optional(),
  description: z.string().max(5000).optional(),
  projectId: z.string().uuid().nullable().optional(),
  merchantId: z.string().uuid().nullable().optional(),
})
export const addTagDto = z.object({ tag: z.string().min(1).max(100) })

/* ---------- comments ---------- */
export const createCommentDto = z.object({
  body: z.string().min(1).max(10_000),
  parentId: z.string().uuid().optional(),
  pinX: z.number().min(0).max(1).optional(),
  pinY: z.number().min(0).max(1).optional(),
})

/* ---------- approvals ---------- */
export const createApprovalRequestDto = z.object({
  workflowId: z.string().uuid().optional(),
  steps: z.array(z.object({
    name: z.string().min(1).max(200),
    approverId: z.string().uuid().optional(),
  })).min(1).max(10).optional(),
})
export const decisionDto = z.object({
  action: approvalAction,
  feedback: z.string().max(5000).optional(),
})

/* ---------- merchants / CRM ---------- */
export const createMerchantDto = z.object({
  name: z.string().min(1).max(200),
  location: z.string().max(200).optional(),
  igHandle: z.string().max(60).regex(/^[a-z0-9._]*$/i, 'Handles use letters, numbers, dots, underscores').optional(),
  bio: z.string().max(400).optional(),
})
export const createContactDto = z.object({
  fullName: z.string().min(1).max(200),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  company: z.string().max(200).optional(),
  notes: z.string().max(5000).optional(),
})
export const createDealDto = z.object({
  name: z.string().min(1).max(200),
  stage: dealStage.default('lead'),
  valueCents: z.number().int().nonnegative().optional(),
  currency: z.string().length(3).default('USD'),
  contactId: z.string().uuid().optional(),
  expectedClose: z.string().date().optional(),
})
export const updateDealDto = createDealDto.partial()

/* ---------- photoshoots ---------- */
export const shootStatus = z.enum(['planning', 'confirmed', 'completed', 'cancelled'])
export const createShootDto = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
  location: z.string().max(300).optional(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  status: shootStatus.default('planning'),
  projectId: z.string().uuid().optional(),
  merchantId: z.string().uuid().optional(),
  crewIds: z.array(z.string().uuid()).max(20).default([]),
}).refine((v) => new Date(v.endsAt) > new Date(v.startsAt), {
  message: 'endsAt must be after startsAt',
  path: ['endsAt'],
})
export const updateShootDto = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(5000).optional(),
  location: z.string().max(300).optional(),
  startsAt: z.string().datetime({ offset: true }).optional(),
  endsAt: z.string().datetime({ offset: true }).optional(),
  status: shootStatus.optional(),
  projectId: z.string().uuid().nullable().optional(),
  merchantId: z.string().uuid().nullable().optional(),
  crewIds: z.array(z.string().uuid()).max(20).optional(),
})

/* ---------- members ---------- */
export const inviteMemberDto = z.object({
  email: z.string().email(),
  fullName: z.string().min(1).max(200),
  role: userRole.exclude(['owner']).default('member'),
})
