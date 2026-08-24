import { create } from 'zustand'
import {
  approvals as seedApprovals,
  users as seedUsers,
  shoots as seedShoots,
  contacts as seedContacts,
  deals as seedDeals,
  comments as seedComments,
  currentUser,
  merchants as seedMerchants,
  photos as seedPhotos,
  projects as seedProjects,
  tasks as seedTasks,
} from '../mocks/data'
import type { ApprovalRequest, Capability, CommentModel, Contact, Deal, DealStage, Member, Merchant, OrgRole, Photo, Project, Shoot, Task, TaskList } from '../types'
import { ROLE_CAPABILITIES } from '../types'
import { api, absoluteUrl, DEMO, putBytes } from '../services/api'
import { enqueueUpload, flushQueue } from '../services/offlineQueue'

/** App data store. Two modes behind one interface:
 *  - demo (artifact preview / VITE_DEMO=1): in-memory, seeded from mocks
 *  - api: hydrates from the NOUVII API, mutates through it, and applies
 *    WebSocket events so every open client stays in sync. */

const threadCount = (cs: CommentModel[], pred: (c: CommentModel) => boolean) =>
  cs.filter(pred).reduce((n, c) => n + 1 + (c.replies?.length ?? 0), 0)

const mapPhoto = (p: Photo): Photo => ({ ...p, url: absoluteUrl(p.url), thumbUrl: absoluteUrl(p.thumbUrl) })

export interface CapabilityOverrides {
  grant: Capability[]
  revoke: Capability[]
}

/** Role baseline ± overrides, mirroring the server's effectiveCapabilities. */
export const effectiveCapabilities = (role: OrgRole, overrides?: { capability: Capability; allowed: boolean }[]): Capability[] => {
  const caps = new Set<Capability>(ROLE_CAPABILITIES[role])
  if (role !== 'owner') for (const o of overrides ?? []) (o.allowed ? caps.add(o.capability) : caps.delete(o.capability))
  return [...caps]
}

export interface NewShootInput {
  title: string
  description?: string
  location?: string
  startsAt: string
  endsAt: string
  status: Shoot['status']
  projectId?: string
  merchantId?: string
  crewIds?: string[]
}

export interface NewTaskInput {
  title: string
  assigneeIds?: string[]
  description?: string
  status: Task['status']
  priority: Task['priority']
  startsAt?: string
  dueAt?: string
  projectId?: string
  listId?: string
  parentTaskId?: string
  estimateMinutes?: number
}

export type TaskPatch = Omit<Partial<Task> & Partial<NewTaskInput>, 'startsAt' | 'dueAt' | 'estimateMinutes'> & {
  startsAt?: string | null
  dueAt?: string | null
  estimateMinutes?: number | null
  fieldValues?: { fieldId: string; value: string }[]
}

interface Paged<T> { items: T[] }

interface DataState {
  hydrated: boolean
  pendingUploads: number
  loadError?: string
  merchants: Merchant[]
  projects: Project[]
  tasks: Task[]
  photos: Photo[]
  comments: CommentModel[]
  approvals: ApprovalRequest[]
  shoots: Shoot[]
  deals: Deal[]
  contacts: Contact[]
  members: Member[]
  lists: TaskList[]
  hydrate: () => Promise<void>
  addProject: (input: { name: string; description?: string }) => Promise<Project>
  addTask: (input: NewTaskInput) => Promise<Task>
  updateTask: (id: string, patch: TaskPatch) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  addList: (input: { name: string; merchantId?: string }) => Promise<TaskList>
  renameList: (id: string, name: string) => Promise<void>
  deleteList: (id: string) => Promise<void>
  addListField: (listId: string, name: string) => Promise<void>
  deleteListField: (listId: string, fieldId: string) => Promise<void>
  taskChecklist: (taskId: string, op: { add?: string; toggle?: string; remove?: string }) => Promise<void>
  taskAttachment: (taskId: string, op: { add?: string; remove?: string }) => Promise<void>
  taskTimer: (taskId: string, action: 'start' | 'stop') => Promise<void>
  taskDependency: (taskId: string, op: { add?: string; remove?: string }) => Promise<void>
  addPhotos: (files: File[], opts?: { projectId?: string; merchantId?: string }) => Promise<void>
  addComment: (target: { taskId?: string; photoId?: string }, body: string) => Promise<void>
  addShoot: (input: NewShootInput) => Promise<Shoot>
  updateShoot: (id: string, patch: Partial<NewShootInput>) => Promise<void>
  deleteShoot: (id: string) => Promise<void>
  setAiTagStatus: (photoId: string, tagId: string, status: 'accepted' | 'rejected') => Promise<void>
  addDeal: (input: { name: string; stage: DealStage; valueCents?: number; currency: string; contactId?: string }) => Promise<void>
  updateDeal: (id: string, patch: { stage?: DealStage; name?: string; valueCents?: number }) => Promise<void>
  addContact: (input: { fullName: string; email?: string; phone?: string; company?: string }) => Promise<Contact>
  addMerchant: (input: { name: string; location?: string; igHandle?: string; bio?: string }) => Promise<void>
  updateMerchant: (id: string, patch: { name?: string; location?: string; igHandle?: string; bio?: string }) => Promise<void>
  inviteMember: (input: { fullName: string; email: string; role: Exclude<OrgRole, 'owner'>; overrides?: CapabilityOverrides }) => Promise<{ tempPassword?: string }>
  setMemberRole: (userId: string, role: Exclude<OrgRole, 'owner'>) => Promise<void>
  setMemberAccess: (userId: string, patch: { role?: Exclude<OrgRole, 'owner'>; overrides?: CapabilityOverrides }) => Promise<void>
  removeMember: (userId: string) => Promise<void>
  loadComments: (target: { taskId?: string; photoId?: string }) => Promise<void>
  flushOfflineUploads: () => Promise<void>
  uploadOne: (file: Blob, fileName: string, contentType: string, opts?: { projectId?: string; merchantId?: string }) => Promise<void>
  applyEvent: (type: string, payload: unknown) => void
}

export const useData = create<DataState>((set, get) => ({
  hydrated: false,
  pendingUploads: 0,
  merchants: [],
  projects: [],
  tasks: [],
  photos: [],
  comments: [],
  approvals: [],
  shoots: [],
  deals: [],
  contacts: [],
  members: [],
  lists: [],

  hydrate: async () => {
    if (get().hydrated) return
    if (DEMO) {
      // demo workspace: a couple of monthly lists per merchant, tasks spread across them
      const demoLists: TaskList[] = seedMerchants.slice(0, 3).flatMap((m, mi) =>
        ['July 2026', 'August 2026'].map((name, li) => ({
          id: `list-${mi}-${li}`,
          merchantId: m.id,
          name,
          position: li,
          fields: li === 0 ? [{ id: `f-${mi}-client`, name: 'Deliverable' }] : [],
          taskCount: 0,
        })),
      )
      set({
        hydrated: true,
        lists: demoLists,
        merchants: seedMerchants,
        projects: seedProjects,
        tasks: seedTasks.map((t, i) => ({
          ...t,
          listId: demoLists[i % demoLists.length]?.id,
          commentCount: threadCount(seedComments, (c) => c.taskId === t.id),
        })),
        photos: seedPhotos.map((p) => ({ ...p, commentCount: threadCount(seedComments, (c) => c.photoId === p.id) })),
        comments: seedComments,
        approvals: seedApprovals,
        shoots: seedShoots,
        deals: seedDeals,
        contacts: seedContacts,
        members: seedUsers.map((u, i) => ({ ...u, role: (['owner', 'manager', 'member', 'member'] as const)[i] ?? 'member' })),
      })
      return
    }
    try {
      const [projects, tasks, photos, merchants, approvals, shoots, deals, contacts, members, lists] = await Promise.all([
        api<Paged<Project>>('GET', '/projects?limit=100'),
        api<Paged<Task>>('GET', '/tasks?limit=200'),
        api<Paged<Photo>>('GET', '/photos?limit=100'),
        api<Paged<Merchant>>('GET', '/merchants'),
        api<Paged<ApprovalRequest>>('GET', '/approvals?limit=100'),
        api<Paged<Shoot>>('GET', '/shoots?limit=500'),
        api<Paged<Deal>>('GET', '/deals?limit=100'),
        api<Paged<Contact>>('GET', '/contacts?limit=100'),
        api<Paged<Member>>('GET', '/org/members'),
        api<Paged<TaskList>>('GET', '/lists'),
      ])
      set({
        hydrated: true,
        loadError: undefined,
        projects: projects.items,
        tasks: tasks.items,
        lists: lists.items,
        photos: photos.items.map(mapPhoto),
        merchants: merchants.items,
        approvals: approvals.items,
        shoots: shoots.items,
        deals: deals.items,
        contacts: contacts.items,
        members: members.items,
      })
    } catch (e) {
      set({ loadError: e instanceof Error ? e.message : 'Failed to load data' })
    }
  },

  addProject: async (input) => {
    if (DEMO) {
      const project: Project = {
        id: `p${Date.now()}`,
        name: input.name,
        description: input.description,
        archived: false,
        createdAt: new Date().toISOString(),
        taskCount: 0,
        photoCount: 0,
        completedTaskCount: 0,
      }
      set((s) => ({ projects: [project, ...s.projects] }))
      return project
    }
    const project = await api<Project>('POST', '/projects', input)
    set((s) => ({ projects: [project, ...s.projects] }))
    return project
  },

  addTask: async (input) => {
    if (DEMO) {
      const picked = get().members.filter((m) => input.assigneeIds?.includes(m.id))
      const task: Task = {
        id: `t${Date.now()}`,
        ...input,
        assignees: picked.length ? picked : [currentUser],
        labels: [],
        subtaskCount: 0,
        subtaskDoneCount: 0,
        commentCount: 0,
        createdAt: new Date().toISOString(),
      }
      set((s) => ({ tasks: [task, ...s.tasks] }))
      return task
    }
    const task = await api<Task>('POST', '/tasks', input)
    set((s) => ({ tasks: s.tasks.some((t) => t.id === task.id) ? s.tasks : [task, ...s.tasks] }))
    return task
  },

  updateTask: async (id, patch) => {
    if (DEMO) {
      const picked = patch.assigneeIds ? get().members.filter((m) => patch.assigneeIds!.includes(m.id)) : undefined
      // demo store keeps Task-shaped fields — nulls mean "cleared"
      const demoPatch = Object.fromEntries(
        Object.entries(patch).map(([k, v]) => [k, v === null ? undefined : v]),
      ) as Partial<Task>
      set((s) => ({
        tasks: s.tasks.map((t) =>
          t.id === id
            ? {
                ...t,
                ...demoPatch,
                ...(picked ? { assignees: picked } : {}),
                completedAt:
                  patch.status === 'completed' && t.status !== 'completed'
                    ? new Date().toISOString()
                    : patch.status && patch.status !== 'completed'
                      ? undefined
                      : t.completedAt,
              }
            : t,
        ),
      }))
      return
    }
    const task = await api<Task>('PATCH', `/tasks/${id}`, patch)
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? task : t)) }))
  },

  deleteTask: async (id) => {
    if (!DEMO) await api('DELETE', `/tasks/${id}`)
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }))
  },

  addList: async (input) => {
    if (DEMO) {
      const list: TaskList = { id: `list${Date.now()}`, merchantId: input.merchantId, name: input.name, position: 0, fields: [], taskCount: 0 }
      set((s) => ({ lists: [...s.lists, list] }))
      return list
    }
    const list = await api<TaskList>('POST', '/lists', input)
    set((s) => (s.lists.some((l) => l.id === list.id) ? s : { lists: [...s.lists, list] }))
    return list
  },

  renameList: async (id, name) => {
    if (!DEMO) await api('PATCH', `/lists/${id}`, { name })
    set((s) => ({ lists: s.lists.map((l) => (l.id === id ? { ...l, name } : l)) }))
  },

  deleteList: async (id) => {
    if (!DEMO) await api('DELETE', `/lists/${id}`)
    set((s) => ({
      lists: s.lists.filter((l) => l.id !== id),
      tasks: s.tasks.map((t) => (t.listId === id ? { ...t, listId: undefined } : t)),
    }))
  },

  addListField: async (listId, name) => {
    if (DEMO) {
      set((s) => ({
        lists: s.lists.map((l) => (l.id === listId ? { ...l, fields: [...l.fields, { id: `f${Date.now()}`, name }] } : l)),
      }))
      return
    }
    const list = await api<TaskList>('POST', `/lists/${listId}/fields`, { name })
    set((s) => ({ lists: s.lists.map((l) => (l.id === listId ? list : l)) }))
  },

  deleteListField: async (listId, fieldId) => {
    if (DEMO) {
      set((s) => ({
        lists: s.lists.map((l) => (l.id === listId ? { ...l, fields: l.fields.filter((f) => f.id !== fieldId) } : l)),
      }))
      return
    }
    const list = await api<TaskList>('DELETE', `/lists/${listId}/fields/${fieldId}`)
    set((s) => ({ lists: s.lists.map((l) => (l.id === listId ? list : l)) }))
  },

  taskChecklist: async (taskId, op) => {
    if (DEMO) {
      set((s) => ({
        tasks: s.tasks.map((t) => {
          if (t.id !== taskId) return t
          let checklist = t.checklist ?? []
          if (op.add) checklist = [...checklist, { id: `c${Date.now()}`, label: op.add, done: false }]
          if (op.toggle) checklist = checklist.map((c) => (c.id === op.toggle ? { ...c, done: !c.done } : c))
          if (op.remove) checklist = checklist.filter((c) => c.id !== op.remove)
          return { ...t, checklist }
        }),
      }))
      return
    }
    let task: Task
    if (op.add) task = await api<Task>('POST', `/tasks/${taskId}/checklist`, { label: op.add })
    else if (op.toggle) {
      const done = get().tasks.find((t) => t.id === taskId)?.checklist?.find((c) => c.id === op.toggle)?.done
      task = await api<Task>('PATCH', `/tasks/${taskId}/checklist/${op.toggle}`, { done: !done })
    } else if (op.remove) task = await api<Task>('DELETE', `/tasks/${taskId}/checklist/${op.remove}`)
    else return
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === taskId ? task : t)) }))
  },

  taskAttachment: async (taskId, op) => {
    if (DEMO) {
      set((s) => ({
        tasks: s.tasks.map((t) => {
          if (t.id !== taskId) return t
          let ids = t.attachmentIds ?? []
          if (op.add && !ids.includes(op.add)) ids = [...ids, op.add]
          if (op.remove) ids = ids.filter((x) => x !== op.remove)
          return { ...t, attachmentIds: ids }
        }),
      }))
      return
    }
    const task = op.add
      ? await api<Task>('POST', `/tasks/${taskId}/attachments`, { photoId: op.add })
      : await api<Task>('DELETE', `/tasks/${taskId}/attachments/${op.remove}`)
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === taskId ? task : t)) }))
  },

  taskTimer: async (taskId, action) => {
    if (DEMO) {
      set((s) => ({
        tasks: s.tasks.map((t) => {
          if (t.id !== taskId) return t
          if (action === 'start') return { ...t, runningEntry: { userId: currentUser.id, startedAt: new Date().toISOString() } }
          const ran = t.runningEntry ? Math.round((Date.now() - new Date(t.runningEntry.startedAt).getTime()) / 1000) : 0
          return { ...t, runningEntry: undefined, trackedSeconds: (t.trackedSeconds ?? 0) + ran }
        }),
      }))
      return
    }
    const task = await api<Task>('POST', `/tasks/${taskId}/time/${action}`)
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === taskId ? task : t)) }))
  },

  taskDependency: async (taskId, op) => {
    if (DEMO) {
      set((s) => ({
        tasks: s.tasks.map((t) => {
          if (t.id !== taskId) return t
          let ids = t.dependsOnIds ?? []
          if (op.add && !ids.includes(op.add)) ids = [...ids, op.add]
          if (op.remove) ids = ids.filter((x) => x !== op.remove)
          return { ...t, dependsOnIds: ids }
        }),
      }))
      return
    }
    const task = op.add
      ? await api<Task>('POST', `/tasks/${taskId}/dependencies`, { dependsOnTaskId: op.add })
      : await api<Task>('DELETE', `/tasks/${taskId}/dependencies/${op.remove}`)
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === taskId ? task : t)) }))
  },

  addPhotos: async (files, opts) => {
    if (DEMO) {
      const added: Photo[] = files.map((file, i) => {
        const url = URL.createObjectURL(file)
        return {
          id: `ph${Date.now()}-${i}`,
          projectId: opts?.projectId,
          merchantId: opts?.merchantId,
          uploadedBy: currentUser,
          status: 'ready',
          title: file.name.replace(/\.[^.]+$/, ''),
          url,
          thumbUrl: url,
          contentType: file.type || 'image/jpeg',
          sizeBytes: file.size,
          tags: [],
          approvalStatus: 'pending',
          commentCount: 0,
          versionCount: 1,
          createdAt: new Date().toISOString(),
        }
      })
      set((s) => ({ photos: [...added, ...s.photos] }))
      return
    }
    // real flow: presign → PUT bytes → register; photos appear as each lands.
    // Network failures queue the file in IndexedDB for retry when back online.
    for (const file of files) {
      try {
        await get().uploadOne(file, file.name, file.type || 'image/jpeg', opts)
      } catch (e) {
        const offline = !navigator.onLine || (e instanceof Error && e.message.startsWith('Cannot reach'))
        if (!offline) throw e
        await enqueueUpload({
          file,
          fileName: file.name,
          contentType: file.type || 'image/jpeg',
          projectId: opts?.projectId,
          merchantId: opts?.merchantId,
        })
        set((s) => ({ pendingUploads: s.pendingUploads + 1 }))
      }
    }
  },

  /** One presign → PUT → register cycle. Internal, also used by the flusher. */
  uploadOne: async (file: Blob, fileName: string, contentType: string, opts?: { projectId?: string; merchantId?: string }) => {
    const presign = await api<{ key: string; uploadUrl: string; headers: Record<string, string> }>(
      'POST', '/uploads/presign',
      { fileName, contentType, sizeBytes: file.size },
    )
    await putBytes(presign.uploadUrl, file as File, presign.headers)
    const photo = await api<Photo>('POST', '/photos', {
      s3Key: presign.key,
      title: fileName.replace(/\.[^.]+$/, ''),
      contentType,
      sizeBytes: file.size,
      projectId: opts?.projectId,
      merchantId: opts?.merchantId,
    })
    set((s) => ({ photos: s.photos.some((p) => p.id === photo.id) ? s.photos : [mapPhoto(photo), ...s.photos] }))
  },

  flushOfflineUploads: async () => {
    if (DEMO) return
    const done = await flushQueue((item) =>
      get().uploadOne(item.file, item.fileName, item.contentType, { projectId: item.projectId, merchantId: item.merchantId }),
    )
    if (done > 0) set((s) => ({ pendingUploads: Math.max(0, s.pendingUploads - done) }))
  },

  addComment: async ({ taskId, photoId }, body) => {
    const bump = (s: DataState, delta = 1) => ({
      tasks: taskId ? s.tasks.map((t) => (t.id === taskId ? { ...t, commentCount: t.commentCount + delta } : t)) : s.tasks,
      photos: photoId ? s.photos.map((p) => (p.id === photoId ? { ...p, commentCount: p.commentCount + delta } : p)) : s.photos,
    })
    if (DEMO) {
      const comment: CommentModel = {
        id: `c${Date.now()}`,
        taskId, photoId,
        author: currentUser,
        body,
        createdAt: new Date().toISOString(),
      }
      set((s) => ({ comments: [...s.comments, comment], ...bump(s) }))
      return
    }
    const path = taskId ? `/tasks/${taskId}/comments` : `/photos/${photoId}/comments`
    const comment = await api<CommentModel>('POST', path, { body })
    set((s) => (s.comments.some((c) => c.id === comment.id) ? s : { comments: [...s.comments, comment], ...bump(s) }))
  },

  loadComments: async ({ taskId, photoId }) => {
    if (DEMO) return
    const path = taskId ? `/tasks/${taskId}/comments` : `/photos/${photoId}/comments`
    const { items } = await api<Paged<CommentModel>>('GET', path)
    set((s) => ({
      comments: [
        ...s.comments.filter((c) => (taskId ? c.taskId !== taskId : c.photoId !== photoId)),
        ...items,
      ],
    }))
  },

  addShoot: async (input) => {
    if (DEMO) {
      const { crewIds, ...rest } = input
      const crew = get().members.filter((m) => crewIds?.includes(m.id))
      const shoot: Shoot = {
        id: `sh${Date.now()}`,
        ...rest,
        crew: crew.length ? crew : [currentUser],
        createdAt: new Date().toISOString(),
      }
      set((s) => ({ shoots: [...s.shoots, shoot] }))
      return shoot
    }
    const shoot = await api<Shoot>('POST', '/shoots', input)
    set((s) => (s.shoots.some((x) => x.id === shoot.id) ? s : { shoots: [...s.shoots, shoot] }))
    return shoot
  },

  updateShoot: async (id, patch) => {
    if (DEMO) {
      const { crewIds, ...rest } = patch
      const crew = crewIds ? get().members.filter((m) => crewIds.includes(m.id)) : undefined
      set((s) => ({ shoots: s.shoots.map((x) => (x.id === id ? { ...x, ...rest, ...(crew ? { crew } : {}) } : x)) }))
      return
    }
    const shoot = await api<Shoot>('PATCH', `/shoots/${id}`, patch)
    set((s) => ({ shoots: s.shoots.map((x) => (x.id === id ? shoot : x)) }))
  },

  deleteShoot: async (id) => {
    if (!DEMO) await api('DELETE', `/shoots/${id}`)
    set((s) => ({ shoots: s.shoots.filter((x) => x.id !== id) }))
  },

  setAiTagStatus: async (photoId, tagId, status) => {
    if (DEMO) {
      set((s) => ({
        photos: s.photos.map((p) =>
          p.id === photoId
            ? { ...p, tags: p.tags.map((t) => (t.id === tagId ? { ...t, aiStatus: status } : t)) }
            : p,
        ),
      }))
      return
    }
    const photo = await api<Photo>('PATCH', `/photos/${photoId}/tags/${tagId}`, { aiStatus: status })
    set((s) => ({ photos: s.photos.map((p) => (p.id === photoId ? mapPhoto(photo) : p)) }))
  },

  addDeal: async (input) => {
    if (DEMO) {
      const deal: Deal = {
        id: `d${Date.now()}`,
        name: input.name,
        stage: input.stage,
        valueCents: input.valueCents,
        currency: input.currency,
        contact: input.contactId ? get().contacts.find((c) => c.id === input.contactId) : undefined,
        taskCount: 0,
        photoCount: 0,
      }
      set((s) => ({ deals: [deal, ...s.deals] }))
      return
    }
    const deal = await api<Deal>('POST', '/deals', input)
    set((s) => ({ deals: [deal, ...s.deals] }))
  },

  updateDeal: async (id, patch) => {
    if (DEMO) {
      set((s) => ({ deals: s.deals.map((d) => (d.id === id ? { ...d, ...patch } : d)) }))
      return
    }
    const deal = await api<Deal>('PATCH', `/deals/${id}`, patch)
    set((s) => ({ deals: s.deals.map((d) => (d.id === id ? deal : d)) }))
  },

  addContact: async (input) => {
    if (DEMO) {
      const contact: Contact = { id: `ct${Date.now()}`, ...input }
      set((s) => ({ contacts: [...s.contacts, contact] }))
      return contact
    }
    const contact = await api<Contact>('POST', '/contacts', input)
    set((s) => ({ contacts: [...s.contacts, contact] }))
    return contact
  },

  addMerchant: async (input) => {
    if (DEMO) {
      set((s) => ({ merchants: [...s.merchants, { id: `m${Date.now()}`, ...input }] }))
      return
    }
    const merchant = await api<Merchant>('POST', '/merchants', input)
    set((s) => ({ merchants: [...s.merchants, merchant] }))
  },

  updateMerchant: async (id, patch) => {
    if (DEMO) {
      set((s) => ({ merchants: s.merchants.map((m) => (m.id === id ? { ...m, ...patch } : m)) }))
      return
    }
    const merchant = await api<Merchant>('PATCH', `/merchants/${id}`, patch)
    set((s) => ({ merchants: s.merchants.map((m) => (m.id === id ? merchant : m)) }))
  },

  inviteMember: async (input) => {
    const toOverrideRows = (o?: CapabilityOverrides) => [
      ...(o?.grant ?? []).map((capability) => ({ capability, allowed: true })),
      ...(o?.revoke ?? []).map((capability) => ({ capability, allowed: false })),
    ]
    if (DEMO) {
      const overrides = toOverrideRows(input.overrides)
      const member: Member = {
        id: `u${Date.now()}`, email: input.email, fullName: input.fullName, role: input.role,
        overrides, capabilities: effectiveCapabilities(input.role, overrides),
      }
      set((s) => ({ members: [...s.members, member] }))
      return { tempPassword: 'demo-only-password' }
    }
    const created = await api<Member & { tempPassword: string }>('POST', '/org/members', input)
    set((s) => ({ members: [...s.members, created] }))
    return { tempPassword: created.tempPassword }
  },

  setMemberRole: async (userId, role) => {
    await get().setMemberAccess(userId, { role })
  },

  setMemberAccess: async (userId, patch) => {
    if (DEMO) {
      set((s) => ({
        members: s.members.map((m) => {
          if (m.id !== userId) return m
          const role = patch.role ?? (m.role as Exclude<OrgRole, 'owner'>)
          const overrides = patch.overrides
            ? [
                ...patch.overrides.grant.map((capability) => ({ capability, allowed: true })),
                ...patch.overrides.revoke.map((capability) => ({ capability, allowed: false })),
              ]
            : m.overrides
          return { ...m, role, overrides, capabilities: effectiveCapabilities(role, overrides) }
        }),
      }))
      return
    }
    const updated = await api<Pick<Member, 'role' | 'capabilities' | 'overrides'>>('PATCH', `/org/members/${userId}`, patch)
    set((s) => ({
      members: s.members.map((m) =>
        m.id === userId ? { ...m, role: updated.role, capabilities: updated.capabilities, overrides: updated.overrides } : m,
      ),
    }))
  },

  removeMember: async (userId) => {
    if (!DEMO) await api('DELETE', `/org/members/${userId}`)
    set((s) => ({ members: s.members.filter((m) => m.id !== userId) }))
  },

  /** WebSocket events from other clients (and echoes of our own, deduped). */
  applyEvent: (type, payload) => {
    const p = payload as any
    switch (type) {
      case 'task.created':
        set((s) => (s.tasks.some((t) => t.id === p.id) ? s : { tasks: [p, ...s.tasks] }))
        break
      case 'list.created':
        set((s) => (s.lists.some((l) => l.id === p.id) ? s : { lists: [...s.lists, p] }))
        break
      case 'list.updated':
        set((s) => ({ lists: s.lists.map((l) => (l.id === p.id ? p : l)) }))
        break
      case 'list.deleted':
        set((s) => ({ lists: s.lists.filter((l) => l.id !== p.id) }))
        break
      case 'task.updated':
        if (Array.isArray(p.taskIds)) {
          set((s) => ({ tasks: s.tasks.map((t) => (p.taskIds.includes(t.id) ? { ...t, status: p.status } : t)) }))
        } else {
          set((s) => ({ tasks: s.tasks.map((t) => (t.id === p.id ? p : t)) }))
        }
        break
      case 'task.deleted':
        set((s) => ({ tasks: s.tasks.filter((t) => t.id !== p.id) }))
        break
      case 'photo.created':
        set((s) => (s.photos.some((x) => x.id === p.id) ? s : { photos: [mapPhoto(p), ...s.photos] }))
        break
      case 'photo.updated':
        set((s) => ({ photos: s.photos.map((x) => (x.id === p.id ? mapPhoto(p) : x)) }))
        break
      case 'photo.deleted':
        set((s) => ({ photos: s.photos.filter((x) => x.id !== p.id) }))
        break
      case 'comment.created':
        set((s) => {
          if (s.comments.some((c) => c.id === p.id)) return s
          return {
            comments: [...s.comments, p],
            tasks: p.taskId ? s.tasks.map((t) => (t.id === p.taskId ? { ...t, commentCount: t.commentCount + 1 } : t)) : s.tasks,
            photos: p.photoId ? s.photos.map((x) => (x.id === p.photoId ? { ...x, commentCount: x.commentCount + 1 } : x)) : s.photos,
          }
        })
        break
      case 'shoot.created':
        set((s) => (s.shoots.some((x) => x.id === p.id) ? s : { shoots: [...s.shoots, p] }))
        break
      case 'shoot.updated':
        set((s) => ({ shoots: s.shoots.map((x) => (x.id === p.id ? p : x)) }))
        break
      case 'shoot.deleted':
        set((s) => ({ shoots: s.shoots.filter((x) => x.id !== p.id) }))
        break
      case 'approval.updated':
        set((s) => ({
          approvals: s.approvals.some((a) => a.id === p.id)
            ? s.approvals.map((a) => (a.id === p.id ? p : a))
            : [p, ...s.approvals],
          photos: s.photos.map((x) => (x.id === p.photoId ? { ...x, approvalStatus: p.status } : x)),
        }))
        break
    }
  },
}))

/** Live per-project stats derived from the store (mock counts on the seed
 *  projects are ignored in favor of what's actually loaded). */
export function projectStats(projectId: string, tasks: Task[], photos: Photo[]) {
  const pt = tasks.filter((t) => t.projectId === projectId)
  return {
    taskCount: pt.length,
    completedTaskCount: pt.filter((t) => t.status === 'completed').length,
    photoCount: photos.filter((p) => p.projectId === projectId).length,
  }
}
