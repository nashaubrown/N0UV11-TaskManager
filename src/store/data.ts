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
import type { ApprovalRequest, CommentModel, Contact, Deal, DealStage, Merchant, Photo, Project, Shoot, Task, User } from '../types'
import { api, absoluteUrl, DEMO, putBytes } from '../services/api'
import { enqueueUpload, flushQueue } from '../services/offlineQueue'

/** App data store. Two modes behind one interface:
 *  - demo (artifact preview / VITE_DEMO=1): in-memory, seeded from mocks
 *  - api: hydrates from the NOUVII API, mutates through it, and applies
 *    WebSocket events so every open client stays in sync. */

const threadCount = (cs: CommentModel[], pred: (c: CommentModel) => boolean) =>
  cs.filter(pred).reduce((n, c) => n + 1 + (c.replies?.length ?? 0), 0)

const mapPhoto = (p: Photo): Photo => ({ ...p, url: absoluteUrl(p.url), thumbUrl: absoluteUrl(p.thumbUrl) })

export interface NewShootInput {
  title: string
  description?: string
  location?: string
  startsAt: string
  endsAt: string
  status: Shoot['status']
  projectId?: string
  merchantId?: string
}

export interface NewTaskInput {
  title: string
  assigneeIds?: string[]
  description?: string
  status: Task['status']
  priority: Task['priority']
  dueAt?: string
  projectId?: string
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
  members: User[]
  hydrate: () => Promise<void>
  addProject: (input: { name: string; description?: string }) => Promise<Project>
  addTask: (input: NewTaskInput) => Promise<Task>
  updateTask: (id: string, patch: Partial<Task> & Partial<NewTaskInput>) => Promise<void>
  addPhotos: (files: File[], opts?: { projectId?: string; merchantId?: string }) => Promise<void>
  addComment: (target: { taskId?: string; photoId?: string }, body: string) => Promise<void>
  addShoot: (input: NewShootInput) => Promise<Shoot>
  updateShoot: (id: string, patch: Partial<NewShootInput>) => Promise<void>
  deleteShoot: (id: string) => Promise<void>
  setAiTagStatus: (photoId: string, tagId: string, status: 'accepted' | 'rejected') => Promise<void>
  addDeal: (input: { name: string; stage: DealStage; valueCents?: number; currency: string; contactId?: string }) => Promise<void>
  updateDeal: (id: string, patch: { stage?: DealStage; name?: string; valueCents?: number }) => Promise<void>
  addContact: (input: { fullName: string; email?: string; phone?: string; company?: string }) => Promise<Contact>
  addMerchant: (input: { name: string; location?: string }) => Promise<void>
  updateMerchant: (id: string, patch: { name?: string; location?: string }) => Promise<void>
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

  hydrate: async () => {
    if (get().hydrated) return
    if (DEMO) {
      set({
        hydrated: true,
        merchants: seedMerchants,
        projects: seedProjects,
        tasks: seedTasks.map((t) => ({ ...t, commentCount: threadCount(seedComments, (c) => c.taskId === t.id) })),
        photos: seedPhotos.map((p) => ({ ...p, commentCount: threadCount(seedComments, (c) => c.photoId === p.id) })),
        comments: seedComments,
        approvals: seedApprovals,
        shoots: seedShoots,
        deals: seedDeals,
        contacts: seedContacts,
        members: seedUsers,
      })
      return
    }
    try {
      const [projects, tasks, photos, merchants, approvals, shoots, deals, contacts, members] = await Promise.all([
        api<Paged<Project>>('GET', '/projects?limit=100'),
        api<Paged<Task>>('GET', '/tasks?limit=100'),
        api<Paged<Photo>>('GET', '/photos?limit=100'),
        api<Paged<Merchant>>('GET', '/merchants'),
        api<Paged<ApprovalRequest>>('GET', '/approvals?limit=100'),
        api<Paged<Shoot>>('GET', '/shoots?limit=500'),
        api<Paged<Deal>>('GET', '/deals?limit=100'),
        api<Paged<Contact>>('GET', '/contacts?limit=100'),
        api<Paged<User>>('GET', '/org/members'),
      ])
      set({
        hydrated: true,
        loadError: undefined,
        projects: projects.items,
        tasks: tasks.items,
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
      set((s) => ({
        tasks: s.tasks.map((t) =>
          t.id === id
            ? {
                ...t,
                ...patch,
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
      const shoot: Shoot = {
        id: `sh${Date.now()}`,
        ...input,
        crew: [currentUser],
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
      set((s) => ({ shoots: s.shoots.map((x) => (x.id === id ? { ...x, ...patch } : x)) }))
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

  /** WebSocket events from other clients (and echoes of our own, deduped). */
  applyEvent: (type, payload) => {
    const p = payload as any
    switch (type) {
      case 'task.created':
        set((s) => (s.tasks.some((t) => t.id === p.id) ? s : { tasks: [p, ...s.tasks] }))
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
