/* Domain types — mirror database-schema.sql enums & tables (camelCased). */

export type UserRole = 'owner' | 'admin' | 'manager' | 'member' | 'viewer'
export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'completed' | 'cancelled'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type PhotoStatus = 'processing' | 'ready' | 'failed'
export type ApprovalStatus =
  | 'draft' | 'pending' | 'in_review' | 'approved' | 'rejected' | 'changes_requested'
export type ApprovalAction = 'approve' | 'reject' | 'request_changes' | 'comment'
export type DealStage =
  | 'lead' | 'qualified' | 'proposal' | 'negotiation' | 'closed_won' | 'closed_lost'
export type AiTagStatus = 'suggested' | 'accepted' | 'rejected'

export interface User {
  id: string
  email: string
  fullName: string
  avatarUrl?: string
  role: UserRole
}

export interface Merchant {
  id: string
  name: string
  location?: string
}

export interface Project {
  id: string
  name: string
  description?: string
  coverPhotoId?: string
  archived: boolean
  createdAt: string
  taskCount: number
  photoCount: number
  completedTaskCount: number
}

export interface TaskLabel {
  id: string
  name: string
  color: string
}

export interface Task {
  id: string
  projectId?: string
  parentTaskId?: string
  title: string
  description?: string
  status: TaskStatus
  priority: TaskPriority
  dueAt?: string
  completedAt?: string
  assignees: User[]
  labels: TaskLabel[]
  subtaskCount: number
  subtaskDoneCount: number
  commentCount: number
  createdAt: string
}

export interface PhotoTag {
  id: string
  tag: string
  source: 'user' | 'ai'
  aiStatus?: AiTagStatus
  confidence?: number
}

export interface Photo {
  id: string
  projectId?: string
  merchantId?: string
  uploadedBy?: User
  status: PhotoStatus
  title?: string
  url: string
  thumbUrl: string
  contentType: string
  sizeBytes: number
  widthPx?: number
  heightPx?: number
  capturedAt?: string
  deviceModel?: string
  tags: PhotoTag[]
  approvalStatus?: ApprovalStatus
  commentCount: number
  versionCount: number
  createdAt: string
}

export interface CommentModel {
  id: string
  photoId?: string
  taskId?: string
  parentId?: string
  author?: User
  guestName?: string
  body: string
  pinX?: number
  pinY?: number
  resolvedAt?: string
  createdAt: string
  replies?: CommentModel[]
}

export interface ApprovalStep {
  stepNo: number
  name: string
  approver?: User
  decidedAction?: ApprovalAction
  decidedAt?: string
  feedback?: string
}

export interface ApprovalRequest {
  id: string
  photoId: string
  status: ApprovalStatus
  currentStep: number
  steps: ApprovalStep[]
  requestedBy?: User
  createdAt: string
}

export interface Contact {
  id: string
  fullName: string
  email?: string
  phone?: string
  company?: string
}

export interface Deal {
  id: string
  name: string
  stage: DealStage
  valueCents?: number
  currency: string
  contact?: Contact
  owner?: User
  expectedClose?: string
  taskCount: number
  photoCount: number
}

/* ---------- UI display maps (single source for labels/colors) ---------- */

export const TASK_STATUS_META: Record<TaskStatus, { label: string; tone: Tone }> = {
  todo: { label: 'To do', tone: 'neutral' },
  in_progress: { label: 'In progress', tone: 'info' },
  in_review: { label: 'In review', tone: 'warning' },
  completed: { label: 'Completed', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
}

export const TASK_PRIORITY_META: Record<TaskPriority, { label: string; tone: Tone }> = {
  low: { label: 'Low', tone: 'neutral' },
  medium: { label: 'Medium', tone: 'info' },
  high: { label: 'High', tone: 'warning' },
  urgent: { label: 'Urgent', tone: 'error' },
}

export const APPROVAL_STATUS_META: Record<ApprovalStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  pending: { label: 'Pending', tone: 'neutral' },
  in_review: { label: 'In review', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'error' },
  changes_requested: { label: 'Changes requested', tone: 'warning' },
}

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'error' | 'brand'
