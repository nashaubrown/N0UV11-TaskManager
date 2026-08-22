import { useMemo, useState } from 'react'
import { Download, Plus, Search } from 'lucide-react'
import { Button } from '../components/common/Button'
import { Input } from '../components/common/Input'
import { Modal } from '../components/common/Modal'
import { Tabs } from '../components/common/Tabs'
import { TaskList } from '../components/task/TaskList'
import { TaskForm, type TaskFormValues } from '../components/task/TaskForm'
import { TaskDetail } from '../components/task/TaskDetail'
import { useData } from '../store/data'
import type { TaskStatus } from '../types'

type Filter = 'all' | TaskStatus

export default function Tasks() {
  const { tasks, addTask } = useData()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tasks.filter((t) =>
      (filter === 'all' || t.status === filter) &&
      (!q || t.title.toLowerCase().includes(q)),
    )
  }, [tasks, filter, query])

  const counts = (s: Filter) => (s === 'all' ? tasks.length : tasks.filter((t) => t.status === s).length)

  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const rows = [
      ['Title', 'Status', 'Priority', 'Due', 'Assignees', 'Comments', 'Created'],
      ...filtered.map((t) => [
        t.title, t.status, t.priority,
        t.dueAt ? new Date(t.dueAt).toLocaleDateString() : '',
        t.assignees.map((a) => a.fullName).join('; '),
        t.commentCount,
        new Date(t.createdAt).toLocaleDateString(),
      ]),
    ]
    const csv = rows.map((r) => r.map(esc).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `nouvii-tasks-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const create = (values: TaskFormValues) => {
    addTask(values)
    setCreating(false)
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-display font-bold text-2xl text-ink">Tasks</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" icon={<Download className="size-4" />} onClick={exportCsv}>
            Export CSV
          </Button>
          <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New task</Button>
        </div>
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

      <TaskList tasks={filtered} onSelect={(t) => setOpenTaskId(t.id)} />

      <TaskDetail taskId={openTaskId} onClose={() => setOpenTaskId(null)} />

      <Modal open={creating} onClose={() => setCreating(false)} title="New task" size="lg">
        <TaskForm onSubmit={create} onCancel={() => setCreating(false)} />
      </Modal>
    </div>
  )
}
