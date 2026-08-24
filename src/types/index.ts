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

export type OrgRole = 'owner' | 'admin' | 'manager' | 'member' | 'viewer'

export const CAPABILITIES = [
  'tasks.manage', 'photos.upload', 'photos.delete', 'approvals.decide',
  'calendar.manage', 'deals.manage', 'merchants.manage', 'portal.share',
  'team.manage', 'feed.manage', 'export.reports',
] as const

export type Capability = (typeof CAPABILITIES)[number]

export const CAPABILITY_META: Record<Capability, string> = {
  'tasks.manage': 'Manage tasks',
  'photos.upload': 'Upload & tag photos',
  'photos.delete': 'Delete photos',
  'approvals.decide': 'Decide approvals',
  'calendar.manage': 'Manage shoots & calendar',
  'deals.manage': 'Manage deals & contacts',
  'merchants.manage': 'Manage merchants',
  'portal.share': 'Share client portals',
  'team.manage': 'Manage the team',
  'feed.manage': 'Plan Instagram feeds',
  'export.reports': 'Export CSV & reports',
}

const MEMBER_BASE: Capability[] = [
  'tasks.manage', 'photos.upload', 'photos.delete', 'approvals.decide',
  'calendar.manage', 'deals.manage', 'feed.manage', 'portal.share', 'export.reports',
]

export const ROLE_CAPABILITIES: Record<OrgRole, readonly Capability[]> = {
  viewer: [],
  member: MEMBER_BASE,
  manager: [...MEMBER_BASE, 'merchants.manage'],
  admin: [...MEMBER_BASE, 'merchants.manage', 'team.manage'],
  owner: [...CAPABILITIES],
}

export interface Member extends User {
  role: OrgRole
  joinedAt?: string
  capabilities?: Capability[]
  overrides?: { capability: Capability; allowed: boolean }[]
}

export const ROLE_META: Record<OrgRole, { label: string; description: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'error' | 'brand' }> = {
  owner: { label: 'Owner', tone: 'brand', description: 'Everything, including billing and ownership transfer.' },
  admin: { label: 'Admin', tone: 'error', description: 'Manage team, roles, and the audit log, plus everything below.' },
  manager: { label: 'Manager', tone: 'warning', description: 'Delete projects and merchants, plus everything below.' },
  member: { label: 'Member', tone: 'info', description: 'Create and edit tasks, photos, shoots, deals, and comments.' },
  viewer: { label: 'Viewer', tone: 'neutral', description: 'Read-only access to everything.' },
}

export interface Merchant {
  id: string
  name: string
  location?: string
  igHandle?: string
  bio?: string
  logoUrl?: string
}

export interface FeedItem {
  photoId: string
  position: number
  caption?: string
  scheduledAt?: string
  title?: string
  url: string
  thumbUrl: string
}

/** The merchant's real (connected) Instagram account, for the feed preview. */
export interface FeedLive {
  username?: string
  followers?: number
  following?: number
  mediaCount?: number
  avatarUrl?: string
  bio?: string
  name?: string
  website?: string
  lastSyncedAt?: string
  posts: { id: string; thumbUrl: string; permalink?: string; postedAt?: string; mediaType?: string; tagged?: boolean }[]
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

export interface TaskList {
  id: string
  merchantId?: string
  name: string
  position: number
  fields: { id: string; name: string }[]
  taskCount: number
}

export interface ChecklistItem {
  id: string
  label: string
  done: boolean
}

export interface Task {
  id: string
  projectId?: string
  listId?: string
  parentTaskId?: string
  title: string
  description?: string
  status: TaskStatus
  priority: TaskPriority
  startsAt?: string
  dueAt?: string
  completedAt?: string
  estimateMinutes?: number
  assignees: User[]
  labels: TaskLabel[]
  fieldValues?: { fieldId: string; value: string }[]
  checklist?: ChecklistItem[]
  attachmentIds?: string[]
  trackedSeconds?: number
  runningEntry?: { userId: string; startedAt: string }
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

export interface AiQualityIssue {
  issue: 'blur' | 'lighting' | 'framing' | 'noise'
  severity: 'low' | 'medium' | 'high'
  note?: string
}

export interface PhotoAi {
  classification?: string
  description?: string
  ocrText?: string
  qualityIssues?: AiQualityIssue[]
  processedAt?: string
}

export interface Photo {
  id: string
  ai?: PhotoAi
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
  annotation?: string
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

export type ShootStatus = 'planning' | 'confirmed' | 'completed' | 'cancelled'
/** Display status adds the derived states: Ongoing (confirmed, window running)
 *  and wrap-up (confirmed, window passed). */
export type ShootDisplayStatus = ShootStatus | 'ongoing' | 'wrap_up'

export interface Shoot {
  id: string
  projectId?: string
  merchantId?: string
  title: string
  description?: string
  location?: string
  startsAt: string
  endsAt: string
  status: ShootStatus
  crew: User[]
  gcalSynced?: boolean
  createdAt: string
}

export const SHOOT_STATUS_META: Record<ShootDisplayStatus, { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'error' | 'brand' }> = {
  planning: { label: 'Planning', tone: 'neutral' },
  confirmed: { label: 'Confirmed', tone: 'info' },
  ongoing: { label: 'Ongoing', tone: 'brand' },
  wrap_up: { label: 'Awaiting wrap-up', tone: 'warning' },
  completed: { label: 'Completed', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
}

/** Ongoing and the wrap-up nudge are derived from the clock, never stored. */
export function shootDisplayStatus(shoot: Shoot, now = new Date()): ShootDisplayStatus {
  if (shoot.status !== 'confirmed') return shoot.status
  if (now >= new Date(shoot.startsAt) && now <= new Date(shoot.endsAt)) return 'ongoing'
  if (now > new Date(shoot.endsAt)) return 'wrap_up'
  return 'confirmed'
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

export const DEAL_STAGE_META: Record<DealStage, { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'error' | 'brand' }> = {
  lead: { label: 'Lead', tone: 'neutral' },
  qualified: { label: 'Qualified', tone: 'info' },
  proposal: { label: 'Proposal', tone: 'brand' },
  negotiation: { label: 'Negotiation', tone: 'warning' },
  closed_won: { label: 'Won', tone: 'success' },
  closed_lost: { label: 'Lost', tone: 'neutral' },
}

export const DEAL_STAGES: DealStage[] = ['lead', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost']
