import { useMemo, useState } from 'react'
import { addDays, format, startOfDay } from 'date-fns'
import { ChevronDown, Download, Flag, Plus, Search } from 'lucide-react'
import clsx from 'clsx'
import { Avatar } from '../components/common/Avatar'
import { Badge } from '../components/common/Badge'
import { Button } from '../components/common/Button'
import { EmptyState } from '../components/common/EmptyState'
import { Input, Select } from '../components/common/Input'
import { Modal } from '../components/common/Modal'
import { Tabs } from '../components/common/Tabs'
import { TaskForm, type TaskFormValues } from '../components/task/TaskForm'
import { TaskPanel } from '../components/task/TaskPanel'
import { useData } from '../store/data'
import { useAuth } from '../store/auth'
import { TASK_PRIORITY_META, TASK_STATUS_META, type Task, type TaskStatus } from '../types'

/* Global workspace view: every task across every merchant list (plus unfiled
 * ones), with the same rows and docked ClickUp-style panel as Projects. */

type Filter = 'all' | TaskStatus
const STATUS_ORDER: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'completed', 'cancelled']
const PRIORITY_COLOR: Record<Task['priority'], string> = {
  urgent: 'text-error', high: 'text-warning', medium: 'text-info', low: 'text-ink-faint',
}

export default function Tasks() {
  const { tasks, lists, merchants, addTask } = useData()
  const { user } = useAuth()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [listFilter, setListFilter] = useState('')
  const [mineOnly, setMineOnly] = useState(false)
  const [dueSoon, setDueSoon] = useState(false)
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newListId, setNewListId] = useState('')
  const [closed, setClosed] = useState<Set<string>>(new Set())

  const listLabel = (t: Task) => {
    const l = lists.find((x) => x.id === t.listId)
    if (!l) return 'Unfiled'
    const m = merchants.find((mm) => mm.id === l.merchantId)
    return m ? `${m.name} / ${l.name}` : l.name
  }

  const listGroups = [
    ...merchants
      .map((m) => ({ label: m.name, lists: lists.filter((l) => l.merchantId === m.id) }))
      .filter((g) => g.lists.length > 0),
    ...(lists.some((l) => !l.merchantId) ? [{ label: 'Other lists', lists: lists.filter((l) => !l.merchantId) }] : []),
  ]

  const weekEnd = addDays(startOfDay(new Date()), 7)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tasks.filter((t) =>
      !t.parentTaskId &&
      (filter === 'all' || t.status === filter) &&
      (!q || t.title.toLowerCase().includes(q)) &&
      (!listFilter || (listFilter === 'unfiled' ? !t.listId : t.listId === listFilter)) &&
      (!mineOnly || t.assignees.some((a) => a.id === user?.id)) &&
      (!dueSoon || (t.dueAt ? new Date(t.dueAt) <= weekEnd && t.status !== 'completed' && t.status !== 'cancelled' : false)),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, filter, query, listFilter, mineOnly, dueSoon, user?.id])

  const roots = tasks.filter((t) => !t.parentTaskId)
  const counts = (s: Filter) => (s === 'all' ? roots.length : roots.filter((t) => t.status === s).length)

  const groups = STATUS_ORDER.map((s) => ({ status: s, tasks: filtered.filter((t) => t.status === s) }))
    .filter((g) => g.tasks.length > 0)

  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const rows = [
      ['Title', 'List', 'Status', 'Priority', 'Due', 'Assignees', 'Comments', 'Created'],
      ...filtered.map((t) => [
        t.title, listLabel(t), t.status, t.priority,
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

  const create = async (values: TaskFormValues) => {
    const task = await addTask({ ...values, listId: newListId || undefined })
    setCreating(false)
    setOpenTaskId(task.id)
  }

  const toggleGroup = (s: string) =>
    setClosed((c) => { const n = new Set(c); n.has(s) ? n.delete(s) : n.add(s); return n })

  return (
    <div className="flex gap-0 h-[calc(100dvh-9.5rem)] min-h-[480px] -mx-1 rounded-(--nv-radius-lg) border border-border bg-surface overflow-hidden">
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="border-b border-border px-4 pt-3 pb-0 grid gap-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h1 className="font-display font-bold text-2xl text-ink">Tasks</h1>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" icon={<Download className="size-4" />} onClick={exportCsv}>
                Export CSV
              </Button>
              <Button icon={<Plus className="size-4" />} onClick={() => { setNewListId(listFilter && listFilter !== 'unfiled' ? listFilter : ''); setCreating(true) }}>
                New task
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="w-64 max-w-full">
              <Input icon={<Search />} placeholder="Search tasks…" value={query}
                     onChange={(e) => setQuery(e.target.value)} aria-label="Search tasks" />
            </div>
            <Select value={listFilter} onChange={(e) => setListFilter(e.target.value)} aria-label="Filter by list">
              <option value="">All lists</option>
              <option value="unfiled">Unfiled</option>
              {listGroups.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </optgroup>
              ))}
            </Select>
            <button aria-pressed={mineOnly} onClick={() => setMineOnly((v) => !v)}
                    className={clsx('rounded-full border px-3 py-1.5 text-sm transition-colors',
                      mineOnly ? 'border-brand/50 bg-coral/10 text-ink font-medium' : 'border-border text-ink-muted hover:bg-surface-2')}>
              My tasks
            </button>
            <button aria-pressed={dueSoon} onClick={() => setDueSoon((v) => !v)}
                    className={clsx('rounded-full border px-3 py-1.5 text-sm transition-colors',
                      dueSoon ? 'border-brand/50 bg-coral/10 text-ink font-medium' : 'border-border text-ink-muted hover:bg-surface-2')}>
              Due this week
            </button>
          </div>

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
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-4 grid gap-4 content-start">
          {groups.length === 0 && (
            <EmptyState title="No tasks match" description="Change the filters — or create a task and file it into a list." />
          )}
          {groups.map((g) => (
            <section key={g.status}>
              <button onClick={() => toggleGroup(g.status)} className="flex items-center gap-2 mb-1">
                <ChevronDown className={clsx('size-3.5 text-ink-faint transition-transform', closed.has(g.status) && '-rotate-90')} aria-hidden />
                <Badge tone={TASK_STATUS_META[g.status].tone}>{TASK_STATUS_META[g.status].label.toUpperCase()}</Badge>
                <span className="text-xs text-ink-muted tabular-nums">{g.tasks.length}</span>
              </button>
              {!closed.has(g.status) && (
                <div className="border border-border rounded-(--nv-radius-md) divide-y divide-border overflow-hidden">
                  <div className="grid grid-cols-[1fr_170px_120px_90px_70px] gap-2 px-3 py-1.5 text-xs text-ink-muted bg-surface-2/60">
                    <span>Name</span><span>List</span><span>Assignee</span><span>Due</span><span>Priority</span>
                  </div>
                  {g.tasks.map((t) => (
                    <button key={t.id} onClick={() => setOpenTaskId(t.id)}
                            className="w-full grid grid-cols-[1fr_170px_120px_90px_70px] gap-2 items-center px-3 py-2 text-left hover:bg-surface-2 transition-colors">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className={clsx('size-2.5 rounded-full shrink-0', t.status === 'completed' ? 'bg-success' : 'bg-ink-faint/40')} />
                        <span className={clsx('text-sm truncate', t.status === 'completed' ? 'text-ink-muted line-through' : 'text-ink')}>{t.title}</span>
                        {t.labels.map((l) => (
                          <span key={l.id} className="text-[10px] font-medium rounded-full px-1.5 py-px text-white shrink-0" style={{ backgroundColor: l.color }}>{l.name}</span>
                        ))}
                      </span>
                      <span className="text-xs text-ink-muted truncate">{listLabel(t)}</span>
                      <span className="flex -space-x-1.5">{t.assignees.slice(0, 3).map((a) => <Avatar key={a.id} user={a} size="xs" />)}</span>
                      <span className="text-xs text-ink-muted tabular-nums">{t.dueAt ? format(new Date(t.dueAt), 'MMM d') : ''}</span>
                      <Flag className={clsx('size-3.5', PRIORITY_COLOR[t.priority])} aria-label={TASK_PRIORITY_META[t.priority].label} />
                    </button>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      </div>

      <TaskPanel taskId={openTaskId} onClose={() => setOpenTaskId(null)} />

      <Modal open={creating} onClose={() => setCreating(false)} title="New task" size="lg">
        <div className="grid gap-4">
          <Select label="List" value={newListId} onChange={(e) => setNewListId(e.target.value)}>
            <option value="">Unfiled</option>
            {listGroups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </optgroup>
            ))}
          </Select>
          <TaskForm onSubmit={(v) => void create(v)} onCancel={() => setCreating(false)} />
        </div>
      </Modal>
    </div>
  )
}
