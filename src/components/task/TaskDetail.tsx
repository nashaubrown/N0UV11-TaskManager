import { useState } from 'react'
import { CalendarDays, Pencil } from 'lucide-react'
import { TASK_PRIORITY_META, TASK_STATUS_META } from '../../types'
import { Badge } from '../common/Badge'
import { Button } from '../common/Button'
import { Modal } from '../common/Modal'
import { AvatarGroup } from '../common/Avatar'
import { ProgressBar } from '../common/ProgressBar'
import { CommentThread } from '../common/CommentThread'
import { TaskForm, type TaskFormValues } from './TaskForm'
import { useData } from '../../store/data'
import { formatDue } from '../../utils/format'

/** Task modal: read view with comment thread, flips to the edit form. */
export function TaskDetail({ taskId, onClose }: { taskId: string | null; onClose: () => void }) {
  const { tasks, comments, projects, updateTask, addComment } = useData()
  const [editing, setEditing] = useState(false)

  const task = tasks.find((t) => t.id === taskId)
  const taskComments = comments.filter((c) => c.taskId === taskId)
  const project = task?.projectId ? projects.find((p) => p.id === task.projectId) : undefined

  const close = () => { setEditing(false); onClose() }
  const save = (values: TaskFormValues) => {
    if (task) updateTask(task.id, values)
    setEditing(false)
  }

  return (
    <Modal open={task !== undefined} onClose={close} size="lg" title={editing ? 'Edit task' : (task?.title ?? '')}>
      {task && (editing ? (
        <TaskForm initial={task} onSubmit={save} onCancel={() => setEditing(false)} />
      ) : (
        <div className="grid gap-5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge tone={TASK_STATUS_META[task.status].tone}>{TASK_STATUS_META[task.status].label}</Badge>
            <Badge tone={TASK_PRIORITY_META[task.priority].tone}>{TASK_PRIORITY_META[task.priority].label}</Badge>
            {task.labels.map((l) => (
              <span key={l.id} className="inline-flex items-center gap-1 text-xs text-ink-muted">
                <span className="size-2 rounded-full" style={{ backgroundColor: l.color }} aria-hidden />{l.name}
              </span>
            ))}
            <Button variant="secondary" size="sm" className="ml-auto" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(true)}>
              Edit
            </Button>
          </div>

          {task.description && <p className="text-sm text-ink-2">{task.description}</p>}

          <div className="flex items-center gap-4 flex-wrap text-sm text-ink-muted">
            {project && <span>In <span className="text-ink font-medium">{project.name}</span></span>}
            {task.dueAt && task.status !== 'completed' && task.status !== 'cancelled' && (() => {
              const due = formatDue(task.dueAt)
              return (
                <span className={`inline-flex items-center gap-1.5 ${due.overdue ? 'text-error font-medium' : ''}`}>
                  <CalendarDays className="size-4" aria-hidden /> {due.label}
                </span>
              )
            })()}
            {task.assignees.length > 0 && <AvatarGroup users={task.assignees} size="xs" />}
          </div>

          {task.subtaskCount > 0 && (
            <ProgressBar value={task.subtaskDoneCount} max={task.subtaskCount} label={`${task.subtaskDoneCount}/${task.subtaskCount} sub-tasks`} />
          )}

          <div className="border-t border-border pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-3">
              Comments{taskComments.length > 0 && ` · ${task.commentCount}`}
            </h3>
            <CommentThread comments={taskComments} onAdd={(body) => addComment({ taskId: task.id }, body)} />
          </div>
        </div>
      ))}
    </Modal>
  )
}
