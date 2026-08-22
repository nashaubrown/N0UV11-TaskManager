import { create } from 'zustand'
import {
  approvals as seedApprovals,
  comments as seedComments,
  currentUser,
  merchants as seedMerchants,
  photos as seedPhotos,
  projects as seedProjects,
  tasks as seedTasks,
} from '../mocks/data'
import type { ApprovalRequest, CommentModel, Merchant, Photo, Project, Task } from '../types'
import { api, absoluteUrl, DEMO, putBytes } from '../services/api'

/** App data store. Two modes behind one interface:
 *  - demo (artifact preview / VITE_DEMO=1): in-memory, seeded from mocks
 *  - api: hydrates from the NOUVII API, mutates through it, and applies
 *    WebSocket events so every open client stays in sync. */

const threadCount = (cs: CommentModel[], pred: (c: CommentModel) => boolean) =>
  cs.filter(pred).reduce((n, c) => n + 1 + (c.replies?.length ?? 0), 0)

const mapPhoto = (p: Photo): Photo => ({ ...p, url: absoluteUrl(p.url), thumbUrl: absoluteUrl(p.thumbUrl) })

export interface NewTaskInput {
  title: string
  description?: string
  status: Task['status']
  priority: Task['priority']
  dueAt?: string
  projectId?: string
}

interface Paged<T> { items: T[] }

interface DataState {
  hydrated: boolean
  loadError?: string
  merchants: Merchant[]
  projects: Project[]
  tasks: Task[]
  photos: Photo[]
  comments: CommentModel[]
  approvals: ApprovalRequest[]
  hydrate: () => Promise<void>
  addProject: (input: { name: string; description?: string }) => Promise<Project>
  addTask: (input: NewTaskInput) => Promise<Task>
  updateTask: (id: string, patch: Partial<Task> & Partial<NewTaskInput>) => Promise<void>
  addPhotos: (files: File[], opts?: { projectId?: string; merchantId?: string }) => Promise<void>
  addComment: (target: { taskId?: string; photoId?: string }, body: string) => Promise<void>
  loadComments: (target: { taskId?: string; photoId?: string }) => Promise<void>
  applyEvent: (type: string, payload: unknown) => void
}

export const useData = create<DataState>((set, get) => ({
  hydrated: false,
  merchants: [],
  projects: [],
  tasks: [],
  photos: [],
  comments: [],
  approvals: [],

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
      })
      return
    }
    try {
      const [projects, tasks, photos, merchants, approvals] = await Promise.all([
        api<Paged<Project>>('GET', '/projects?limit=100'),
        api<Paged<Task>>('GET', '/tasks?limit=100'),
        api<Paged<Photo>>('GET', '/photos?limit=100'),
        api<Paged<Merchant>>('GET', '/merchants'),
        api<Paged<ApprovalRequest>>('GET', '/approvals?limit=100'),
      ])
      set({
        hydrated: true,
        loadError: undefined,
        projects: projects.items,
        tasks: tasks.items,
        photos: photos.items.map(mapPhoto),
        merchants: merchants.items,
        approvals: approvals.items,
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
      const task: Task = {
        id: `t${Date.now()}`,
        ...input,
        assignees: [currentUser],
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
      set((s) => ({
        tasks: s.tasks.map((t) =>
          t.id === id
            ? {
                ...t,
                ...patch,
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
    // real flow: presign → PUT bytes → register; photos appear as each lands
    for (const file of files) {
      const presign = await api<{ key: string; uploadUrl: string; headers: Record<string, string> }>(
        'POST', '/uploads/presign',
        { fileName: file.name, contentType: file.type || 'image/jpeg', sizeBytes: file.size },
      )
      await putBytes(presign.uploadUrl, file, presign.headers)
      const photo = await api<Photo>('POST', '/photos', {
        s3Key: presign.key,
        title: file.name.replace(/\.[^.]+$/, ''),
        contentType: file.type || 'image/jpeg',
        sizeBytes: file.size,
        projectId: opts?.projectId,
        merchantId: opts?.merchantId,
      })
      set((s) => ({ photos: s.photos.some((p) => p.id === photo.id) ? s.photos : [mapPhoto(photo), ...s.photos] }))
    }
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
