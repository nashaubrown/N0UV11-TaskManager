import type { Photo, Project, Task, User, CommentModel, ApprovalRequest } from '../types'

export const users: User[] = [
  { id: 'u1', email: 'nashaubrown@gmail.com', fullName: 'Nashau Brown', role: 'owner' },
  { id: 'u2', email: 'aisha@nouvii.app', fullName: 'Aisha Rasheed', role: 'manager' },
  { id: 'u3', email: 'ibrahim@nouvii.app', fullName: 'Ibrahim Waheed', role: 'member' },
  { id: 'u4', email: 'mariyam@nouvii.app', fullName: 'Mariyam Saeed', role: 'member' },
]

export const currentUser = users[0]

export const projects: Project[] = [
  { id: 'p1', name: 'Café Aroma Launch', description: 'Product + interior shoot for the new Hulhumalé branch', archived: false, createdAt: '2026-08-01T09:00:00Z', taskCount: 14, photoCount: 86, completedTaskCount: 9 },
  { id: 'p2', name: 'Island Resort Rebrand', description: 'Full photo library refresh across 3 properties', archived: false, createdAt: '2026-07-12T09:00:00Z', taskCount: 22, photoCount: 240, completedTaskCount: 6 },
  { id: 'p3', name: 'Q3 Merchant Onboarding', description: 'Storefront documentation for 12 new merchants', archived: false, createdAt: '2026-06-20T09:00:00Z', taskCount: 31, photoCount: 118, completedTaskCount: 25 },
]

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString()

export const tasks: Task[] = [
  { id: 't1', projectId: 'p1', title: 'Shoot espresso bar hero images', status: 'in_progress', priority: 'high', dueAt: day(1), assignees: [users[1], users[2]], labels: [{ id: 'l1', name: 'Shoot', color: '#FF6B5B' }], subtaskCount: 3, subtaskDoneCount: 1, commentCount: 4, createdAt: day(-6) },
  { id: 't2', projectId: 'p1', title: 'Client review — round 1 selects', status: 'in_review', priority: 'urgent', dueAt: day(0), assignees: [users[0]], labels: [{ id: 'l2', name: 'Approval', color: '#8F5400' }], subtaskCount: 0, subtaskDoneCount: 0, commentCount: 9, createdAt: day(-4) },
  { id: 't3', projectId: 'p2', title: 'Retouch beach villa exteriors', status: 'todo', priority: 'medium', dueAt: day(3), assignees: [users[3]], labels: [{ id: 'l3', name: 'Retouch', color: '#0066D6' }], subtaskCount: 6, subtaskDoneCount: 0, commentCount: 1, createdAt: day(-3) },
  { id: 't4', projectId: 'p2', title: 'Draft shot list for spa suite', status: 'todo', priority: 'low', dueAt: day(6), assignees: [users[1]], labels: [], subtaskCount: 0, subtaskDoneCount: 0, commentCount: 0, createdAt: day(-2) },
  { id: 't5', projectId: 'p3', title: 'Upload storefront batch — Malé north', status: 'completed', priority: 'medium', completedAt: day(-1), assignees: [users[2]], labels: [{ id: 'l4', name: 'Upload', color: '#127035' }], subtaskCount: 0, subtaskDoneCount: 0, commentCount: 2, createdAt: day(-8), dueAt: day(-1) },
  { id: 't6', projectId: 'p3', title: 'Tag & classify merchant photos', status: 'in_progress', priority: 'high', dueAt: day(2), assignees: [users[3], users[0]], labels: [{ id: 'l5', name: 'AI review', color: '#C41E3A' }], subtaskCount: 12, subtaskDoneCount: 7, commentCount: 3, createdAt: day(-5) },
  { id: 't7', projectId: 'p1', title: 'Order prints for café wall', status: 'cancelled', priority: 'low', assignees: [], labels: [], subtaskCount: 0, subtaskDoneCount: 0, commentCount: 0, createdAt: day(-10) },
  { id: 't8', projectId: 'p2', title: 'Sync final selects to client portal', status: 'todo', priority: 'urgent', dueAt: day(1), assignees: [users[0], users[1], users[2], users[3]], labels: [{ id: 'l2', name: 'Approval', color: '#8F5400' }], subtaskCount: 2, subtaskDoneCount: 0, commentCount: 0, createdAt: day(-1) },
]

/* Photos use picsum seeds so the gallery renders offline-agnostic placeholders. */
const pic = (seed: string, _w = 800, _h = 600) => `/demo/${seed}.svg`

export const photos: Photo[] = [
  { id: 'ph1', projectId: 'p1', uploadedBy: users[1], status: 'ready', title: 'Espresso pour, morning light', url: pic('nv1', 1200, 900), thumbUrl: pic('nv1', 480, 360), contentType: 'image/jpeg', sizeBytes: 2_412_000, widthPx: 4032, heightPx: 3024, capturedAt: '2026-08-18T07:42:00Z', deviceModel: 'iPhone 15 Pro', tags: [{ id: 'g1', tag: 'coffee', source: 'ai', aiStatus: 'accepted', confidence: 0.97 }, { id: 'g2', tag: 'interior', source: 'user' }], approvalStatus: 'approved', commentCount: 3, versionCount: 2, createdAt: '2026-08-18T08:00:00Z' },
  { id: 'ph2', projectId: 'p1', uploadedBy: users[2], status: 'ready', title: 'Counter detail', url: pic('nv2', 1200, 800), thumbUrl: pic('nv2', 480, 320), contentType: 'image/jpeg', sizeBytes: 1_907_000, widthPx: 3600, heightPx: 2400, capturedAt: '2026-08-18T08:10:00Z', deviceModel: 'Sony A7 IV', tags: [{ id: 'g3', tag: 'product', source: 'ai', aiStatus: 'suggested', confidence: 0.81 }], approvalStatus: 'in_review', commentCount: 5, versionCount: 1, createdAt: '2026-08-18T09:00:00Z' },
  { id: 'ph3', projectId: 'p2', uploadedBy: users[3], status: 'ready', title: 'Villa deck at dusk', url: pic('nv3', 1200, 900), thumbUrl: pic('nv3', 480, 360), contentType: 'image/jpeg', sizeBytes: 3_120_000, widthPx: 6000, heightPx: 4000, capturedAt: '2026-08-15T18:20:00Z', deviceModel: 'Canon R5', tags: [{ id: 'g4', tag: 'exterior', source: 'user' }, { id: 'g5', tag: 'sunset', source: 'ai', aiStatus: 'accepted', confidence: 0.93 }], approvalStatus: 'changes_requested', commentCount: 8, versionCount: 3, createdAt: '2026-08-15T19:00:00Z' },
  { id: 'ph4', projectId: 'p2', uploadedBy: users[1], status: 'ready', title: 'Spa suite bath', url: pic('nv4', 900, 1200), thumbUrl: pic('nv4', 360, 480), contentType: 'image/jpeg', sizeBytes: 2_010_000, widthPx: 3024, heightPx: 4032, capturedAt: '2026-08-14T10:05:00Z', tags: [], approvalStatus: 'pending', commentCount: 0, versionCount: 1, createdAt: '2026-08-14T11:00:00Z' },
  { id: 'ph5', projectId: 'p3', uploadedBy: users[2], status: 'ready', title: 'Storefront — Novelty Traders', url: pic('nv5', 1200, 800), thumbUrl: pic('nv5', 480, 320), contentType: 'image/jpeg', sizeBytes: 1_411_000, widthPx: 4000, heightPx: 2664, capturedAt: '2026-08-12T14:30:00Z', deviceModel: 'Pixel 9', tags: [{ id: 'g6', tag: 'storefront', source: 'ai', aiStatus: 'accepted', confidence: 0.99 }, { id: 'g7', tag: 'signage', source: 'ai', aiStatus: 'suggested', confidence: 0.74 }], approvalStatus: 'approved', commentCount: 1, versionCount: 1, createdAt: '2026-08-12T15:00:00Z' },
  { id: 'ph6', projectId: 'p3', uploadedBy: users[3], status: 'processing', url: pic('nv6', 1200, 900), thumbUrl: pic('nv6', 480, 360), contentType: 'image/jpeg', sizeBytes: 2_950_000, tags: [], commentCount: 0, versionCount: 1, createdAt: day(0) },
  { id: 'ph7', projectId: 'p1', uploadedBy: users[1], status: 'ready', title: 'Latte art series 04', url: pic('nv7', 1200, 1200), thumbUrl: pic('nv7', 480, 480), contentType: 'image/jpeg', sizeBytes: 1_820_000, widthPx: 3000, heightPx: 3000, capturedAt: '2026-08-18T09:15:00Z', deviceModel: 'iPhone 15 Pro', tags: [{ id: 'g8', tag: 'latte-art', source: 'ai', aiStatus: 'accepted', confidence: 0.95 }], approvalStatus: 'rejected', commentCount: 2, versionCount: 1, createdAt: '2026-08-18T10:00:00Z' },
  { id: 'ph8', projectId: 'p2', uploadedBy: users[0], status: 'ready', title: 'Overwater walkway', url: pic('nv8', 1200, 675), thumbUrl: pic('nv8', 480, 270), contentType: 'image/jpeg', sizeBytes: 2_240_000, widthPx: 5472, heightPx: 3078, capturedAt: '2026-08-13T16:45:00Z', deviceModel: 'DJI Mavic 3', tags: [{ id: 'g9', tag: 'aerial', source: 'user' }], approvalStatus: 'in_review', commentCount: 4, versionCount: 2, createdAt: '2026-08-13T17:30:00Z' },
]

export const comments: CommentModel[] = [
  { id: 'c1', photoId: 'ph3', author: users[0], body: 'Horizon needs straightening — about 1° off.', pinX: 0.72, pinY: 0.31, createdAt: day(-2), replies: [
    { id: 'c2', photoId: 'ph3', parentId: 'c1', author: users[3], body: 'Fixed in v3, re-uploading tonight.', createdAt: day(-1) },
  ]},
  { id: 'c3', photoId: 'ph3', guestName: 'Resort Marketing (client)', body: 'Love the mood here. Can we get a warmer grade option?', createdAt: day(-1) },
]

export const approvals: ApprovalRequest[] = [
  { id: 'a1', photoId: 'ph2', status: 'in_review', currentStep: 2, requestedBy: users[2], createdAt: day(-2), steps: [
    { stepNo: 1, name: 'Internal QC', approver: users[1], decidedAction: 'approve', decidedAt: day(-1) },
    { stepNo: 2, name: 'Client review', approver: undefined },
    { stepNo: 3, name: 'Final sign-off', approver: users[0] },
  ]},
]

/* Dashboard: tasks completed per day, trailing 14 days (single series). */
export const completionTrend = [
  { date: day(-13), count: 2 }, { date: day(-12), count: 4 }, { date: day(-11), count: 3 },
  { date: day(-10), count: 6 }, { date: day(-9), count: 5 }, { date: day(-8), count: 2 },
  { date: day(-7), count: 7 }, { date: day(-6), count: 6 }, { date: day(-5), count: 9 },
  { date: day(-4), count: 4 }, { date: day(-3), count: 8 }, { date: day(-2), count: 10 },
  { date: day(-1), count: 7 }, { date: day(0), count: 5 },
]
