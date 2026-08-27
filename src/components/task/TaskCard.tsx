import { CalendarDays, CheckSquare, MessageSquare } from 'lucide-react'
import clsx from 'clsx'
import { motion } from 'framer-motion'
import type { Task } from '../../types'
import { TASK_PRIORITY_META, TASK_STATUS_META } from '../../types'
import { Badge } from '../common/Badge'
import { AvatarGroup } from '../common/Avatar'
import { formatDue } from '../../utils/format'

export function TaskCard({ task, onClick }: { task: Task; onClick?: (task: Task) => void }) {
  const due = task.dueAt && task.status !== 'completed' && task.status !== 'cancelled'
    ? formatDue(task.dueAt)
    : null
  const status = TASK_STATUS_META[task.status]
  const priority = TASK_PRIORITY_META[task.priority]

  return (
    <motion.article
      layout
      whileHover={{ y: -2 }}
      onClick={() => onClick?.(task)}
      className={clsx(
        'bg-surface nv-glass nv-card-link border border-border rounded-(--nv-radius-lg) shadow-sm p-4 cursor-pointer',
        'transition-shadow hover:shadow-md',
        task.status === 'cancelled' && 'opacity-60',
      )}
    >
      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        <Badge tone={status.tone}>{status.label}</Badge>
        <Badge tone={priority.tone}>{priority.label}</Badge>
        {task.labels.map((l) => (
          <span key={l.id} className="inline-flex items-center gap-1 text-xs text-ink-muted">
            <span className="size-2 rounded-full" style={{ backgroundColor: l.color }} aria-hidden />
            {l.name}
          </span>
        ))}
      </div>

      <h4 className={clsx(
        'font-medium text-ink leading-snug',
        task.status === 'completed' && 'line-through text-ink-muted',
      )}>
        {task.title}
      </h4>

      <div className="flex items-center justify-between gap-3 mt-3">
        <div className="flex items-center gap-3 text-xs text-ink-muted min-w-0">
          {due && (
            <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap', due.overdue && 'text-error font-medium')}>
              <CalendarDays className="size-3.5" aria-hidden /> {due.label}
            </span>
          )}
          {task.subtaskCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <CheckSquare className="size-3.5" aria-hidden /> {task.subtaskDoneCount}/{task.subtaskCount}
            </span>
          )}
          {task.commentCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="size-3.5" aria-hidden /> {task.commentCount}
            </span>
          )}
        </div>
        {task.assignees.length > 0 && <AvatarGroup users={task.assignees} size="xs" />}
      </div>
    </motion.article>
  )
}
