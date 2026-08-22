import { useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { Button } from '../components/common/Button'
import { Input } from '../components/common/Input'
import { Modal } from '../components/common/Modal'
import { Tabs } from '../components/common/Tabs'
import { TaskList } from '../components/task/TaskList'
import { TaskForm, type TaskFormValues } from '../components/task/TaskForm'
import { tasks as seed } from '../mocks/data'
import type { Task, TaskStatus } from '../types'

type Filter = 'all' | TaskStatus

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>(seed)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Task | null>(null)
  const [creating, setCreating] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tasks.filter((t) =>
      (filter === 'all' || t.status === filter) &&
      (!q || t.title.toLowerCase().includes(q)),
    )
  }, [tasks, filter, query])

  const counts = (s: Filter) => (s === 'all' ? tasks.length : tasks.filter((t) => t.status === s).length)

  const upsert = (values: TaskFormValues) => {
    if (editing) {
      setTasks((ts) => ts.map((t) => (t.id === editing.id ? { ...t, ...values } : t)))
      setEditing(null)
    } else {
      setTasks((ts) => [{
        id: `t${Date.now()}`, ...values, assignees: [], labels: [],
        subtaskCount: 0, subtaskDoneCount: 0, commentCount: 0,
        createdAt: new Date().toISOString(),
      }, ...ts])
      setCreating(false)
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-display font-bold text-2xl text-ink">Tasks</h1>
        <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New task</Button>
      </div>

      <Input
        icon={<Search />}
        placeholder="Search tasks…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search tasks"
      />

      <Tabs<Filter>
        value={filter}
        onChange={setFilter}
        items={[
          { value: 'all', label: 'All', count: counts('all') },
          { value: 'todo', label: 'To do', count: counts('todo') },
          { value: 'in_progress', label: 'In progress', count: counts('in_progress') },
          { value: 'in_review', label: 'In review', count: counts('in_review') },
          { value: 'completed', label: 'Done', count: counts('completed') },
        ]}
      />

      <TaskList tasks={filtered} onSelect={setEditing} />

      <Modal
        open={creating || editing !== null}
        onClose={() => { setCreating(false); setEditing(null) }}
        title={editing ? 'Edit task' : 'New task'}
        size="lg"
      >
        <TaskForm
          key={editing?.id ?? 'new'}
          initial={editing ?? undefined}
          onSubmit={upsert}
          onCancel={() => { setCreating(false); setEditing(null) }}
        />
      </Modal>
    </div>
  )
}
