import { create } from 'zustand'
import {
  comments as seedComments,
  currentUser,
  photos as seedPhotos,
  projects as seedProjects,
  tasks as seedTasks,
} from '../mocks/data'
import type { CommentModel, Photo, Project, Task } from '../types'

/** Phase 1: in-memory store seeded from mocks. Phase 2 replaces the seed +
 *  mutations with TanStack Query against the real API; component code keeps
 *  the same shape. */

const threadCount = (cs: CommentModel[], pred: (c: CommentModel) => boolean) =>
  cs.filter(pred).reduce((n, c) => n + 1 + (c.replies?.length ?? 0), 0)

export interface NewTaskInput {
  title: string
  description?: string
  status: Task['status']
  priority: Task['priority']
  dueAt?: string
  projectId?: string
}

interface DataState {
  projects: Project[]
  tasks: Task[]
  photos: Photo[]
  comments: CommentModel[]
  addProject: (input: { name: string; description?: string }) => Project
  addTask: (input: NewTaskInput) => Task
  updateTask: (id: string, patch: Partial<Task>) => void
  addPhotos: (files: File[], projectId?: string) => Photo[]
  addComment: (target: { taskId?: string; photoId?: string }, body: string) => void
}

export const useData = create<DataState>((set) => ({
  projects: seedProjects,
  // keep displayed comment counts honest: derive them from the seeded threads
  tasks: seedTasks.map((t) => ({ ...t, commentCount: threadCount(seedComments, (c) => c.taskId === t.id) })),
  photos: seedPhotos.map((p) => ({ ...p, commentCount: threadCount(seedComments, (c) => c.photoId === p.id) })),
  comments: seedComments,

  addProject: (input) => {
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
  },

  addTask: (input) => {
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
  },

  updateTask: (id, patch) =>
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
    })),

  addPhotos: (files, projectId) => {
    const added: Photo[] = files.map((file, i) => {
      const url = URL.createObjectURL(file)
      return {
        id: `ph${Date.now()}-${i}`,
        projectId,
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
    return added
  },

  addComment: ({ taskId, photoId }, body) => {
    const comment: CommentModel = {
      id: `c${Date.now()}`,
      taskId,
      photoId,
      author: currentUser,
      body,
      createdAt: new Date().toISOString(),
    }
    set((s) => ({
      comments: [...s.comments, comment],
      tasks: taskId ? s.tasks.map((t) => (t.id === taskId ? { ...t, commentCount: t.commentCount + 1 } : t)) : s.tasks,
      photos: photoId ? s.photos.map((p) => (p.id === photoId ? { ...p, commentCount: p.commentCount + 1 } : p)) : s.photos,
    }))
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
