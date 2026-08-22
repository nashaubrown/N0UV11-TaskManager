import { ClipboardList } from 'lucide-react'
import type { Task } from '../../types'
import { TaskCard } from './TaskCard'
import { EmptyState } from '../common/EmptyState'

export function TaskList({ tasks, onSelect }: { tasks: Task[]; onSelect?: (t: Task) => void }) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={<ClipboardList />}
        title="No tasks here"
        description="Tasks matching this filter will appear as cards."
      />
    )
  }
  return (
    <div className="grid gap-3">
      {tasks.map((t) => (
        <TaskCard key={t.id} task={t} onClick={onSelect} />
      ))}
    </div>
  )
}
