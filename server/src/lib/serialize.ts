/* Row → API shape mappers (camelCase, matches web/src/types). Prisma models
 * are snake_case because the SQL schema is the source of truth. */

type UserRow = { id: string; email: string; full_name: string; avatar_url: string | null }

export const sUser = (u: UserRow) => ({
  id: u.id, email: u.email, fullName: u.full_name, avatarUrl: u.avatar_url ?? undefined,
})

export const sProject = (p: any, stats?: { taskCount: number; completedTaskCount: number; photoCount: number }) => ({
  id: p.id,
  name: p.name,
  description: p.description ?? undefined,
  archived: p.archived,
  createdAt: p.created_at,
  ...(stats ?? { taskCount: 0, completedTaskCount: 0, photoCount: 0 }),
})

export const sTask = (t: any) => ({
  id: t.id,
  projectId: t.project_id ?? undefined,
  listId: t.list_id ?? undefined,
  parentTaskId: t.parent_task_id ?? undefined,
  title: t.title,
  description: t.description ?? undefined,
  status: t.status,
  priority: t.priority,
  startsAt: t.starts_at ?? undefined,
  dueAt: t.due_at ?? undefined,
  completedAt: t.completed_at ?? undefined,
  estimateMinutes: t.estimate_minutes ?? undefined,
  fieldValues: (t.task_field_values ?? []).map((v: any) => ({ fieldId: v.field_id, value: v.value ?? '' })),
  checklist: (t.task_checklist_items ?? [])
    .sort((a: any, b: any) => a.position - b.position)
    .map((c: any) => ({ id: c.id, label: c.label, done: c.done })),
  attachmentIds: (t.task_attachments ?? []).map((a: any) => a.photo_id),
  trackedSeconds: (t.task_time_entries ?? []).reduce((s: number, e: any) => s + (e.seconds ?? 0), 0),
  runningEntry: (() => {
    const open = (t.task_time_entries ?? []).find((e: any) => !e.ended_at)
    return open ? { userId: open.user_id, startedAt: open.started_at } : undefined
  })(),
  assignees: (t.task_assignees ?? []).map((a: any) => sUser(a.users)),
  labels: (t.task_label_links ?? []).map((l: any) => ({ id: l.task_labels.id, name: l.task_labels.name, color: l.task_labels.color })),
  subtaskCount: t._count?.other_tasks ?? 0,
  subtaskDoneCount: t.subtaskDoneCount ?? 0,
  commentCount: t._count?.comments ?? 0,
  createdAt: t.created_at,
})

export const sPhoto = (p: any, urlFor: (key: string) => string) => ({
  id: p.id,
  projectId: p.project_id ?? undefined,
  merchantId: p.merchant_id ?? undefined,
  uploadedBy: p.users ? sUser(p.users) : undefined,
  status: p.status,
  title: p.title ?? undefined,
  description: p.description ?? undefined,
  url: urlFor(p.s3_key),
  thumbUrl: urlFor(p.thumb_s3_key ?? p.s3_key),
  contentType: p.content_type,
  sizeBytes: Number(p.size_bytes),
  widthPx: p.width_px ?? undefined,
  heightPx: p.height_px ?? undefined,
  capturedAt: p.captured_at ?? undefined,
  deviceModel: p.device_model ?? undefined,
  tags: (p.photo_tags ?? []).map((t: any) => ({
    id: t.id, tag: t.tag, source: t.source, aiStatus: t.ai_status ?? undefined,
    confidence: t.confidence ?? undefined,
  })),
  approvalStatus: p.approval_requests?.[0]?.status ?? undefined,
  ai: p.photo_ai_metadata
    ? {
        classification: p.photo_ai_metadata.classification ?? undefined,
        description: (p.photo_ai_metadata.raw_response as { description?: string } | null)?.description,
        ocrText: p.photo_ai_metadata.ocr_text ?? undefined,
        qualityIssues: p.photo_ai_metadata.quality_issues ?? [],
        processedAt: p.photo_ai_metadata.processed_at,
      }
    : undefined,
  commentCount: p._count?.comments ?? 0,
  versionCount: p._count?.photo_versions ?? 1,
  createdAt: p.created_at,
})

export const sComment = (c: any): any => ({
  id: c.id,
  photoId: c.photo_id ?? undefined,
  taskId: c.task_id ?? undefined,
  parentId: c.parent_id ?? undefined,
  author: c.users ? sUser(c.users) : undefined,
  guestName: c.guest_name ?? undefined,
  body: c.body,
  annotation: c.annotation ?? undefined,
  pinX: c.pin_x ?? undefined,
  pinY: c.pin_y ?? undefined,
  resolvedAt: c.resolved_at ?? undefined,
  createdAt: c.created_at,
  replies: (c.other_comments ?? []).map(sComment),
})

export const sMerchant = (m: any) => ({
  id: m.id,
  name: m.name,
  location: m.location ?? undefined,
  igHandle: m.ig_handle ?? undefined,
  bio: m.bio ?? undefined,
  logoUrl: m.logo_url ?? undefined,
})

export const sContact = (c: any) => ({
  id: c.id, fullName: c.full_name, email: c.email ?? undefined,
  phone: c.phone ?? undefined, company: c.company ?? undefined,
})

export const sDeal = (d: any) => ({
  id: d.id,
  name: d.name,
  stage: d.stage,
  valueCents: d.value_cents === null ? undefined : Number(d.value_cents),
  currency: d.currency,
  contact: d.contacts ? sContact(d.contacts) : undefined,
  owner: d.users ? sUser(d.users) : undefined,
  expectedClose: d.expected_close ?? undefined,
  taskCount: d._count?.deal_tasks ?? 0,
  photoCount: d._count?.deal_photos ?? 0,
})

export const sApproval = (a: any) => ({
  id: a.id,
  photoId: a.photo_id,
  status: a.status,
  currentStep: a.current_step,
  requestedBy: a.users ? sUser(a.users) : undefined,
  createdAt: a.created_at,
  resolvedAt: a.resolved_at ?? undefined,
  steps: (a.steps ?? []).map((s: any) => ({
    stepNo: s.stepNo,
    name: s.name,
    approver: s.approver ? sUser(s.approver) : undefined,
    decidedAction: s.decidedAction,
    decidedAt: s.decidedAt,
    feedback: s.feedback,
  })),
})

export const sShoot = (sh: any) => ({
  id: sh.id,
  projectId: sh.project_id ?? undefined,
  merchantId: sh.merchant_id ?? undefined,
  title: sh.title,
  description: sh.description ?? undefined,
  location: sh.location ?? undefined,
  startsAt: sh.starts_at,
  endsAt: sh.ends_at,
  status: sh.status,
  crew: (sh.shoot_crew ?? []).map((c: any) => sUser(c.users)),
  gcalSynced: Boolean(sh.gcal_synced_at),
  createdAt: sh.created_at,
})
