import { useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  addMonths, differenceInCalendarDays, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth,
  startOfMonth, startOfWeek,
} from 'date-fns'
import {
  CalendarDays, ChartNoAxesGantt, ChevronDown, ChevronLeft, ChevronRight, Columns3, Flag, FolderOpen,
  Inbox, ListTodo, MoreHorizontal, Plus, SlidersHorizontal, Store,
} from 'lucide-react'
import clsx from 'clsx'
import { Avatar } from '../components/common/Avatar'
import { Badge } from '../components/common/Badge'
import { Button } from '../components/common/Button'
import { EmptyState } from '../components/common/EmptyState'
import { TaskPanel } from '../components/task/TaskPanel'
import { useData } from '../store/data'
import { TASK_PRIORITY_META, TASK_STATUS_META, type Shoot, type Task, type TaskList, type TaskStatus } from '../types'

/* ClickUp-style workspace: merchant folders → lists → tasks, with List /
 * Board / Calendar / Gantt views and a docked task panel. */

type View = 'list' | 'board' | 'calendar' | 'gantt'
const STATUS_ORDER: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'completed', 'cancelled']
const PRIORITY_COLOR: Record<Task['priority'], string> = {
  urgent: 'text-error', high: 'text-warning', medium: 'text-info', low: 'text-ink-faint',
}

const dueLabel = (iso?: string) => (iso ? format(new Date(iso), 'MMM d') : '')

/** Virtual list for tasks that aren't filed into any list yet. */
const UNFILED: TaskList = { id: 'unfiled', name: 'Unfiled tasks', position: 0, fields: [], taskCount: 0 }

export default function Workspace() {
  const { merchants, lists, tasks, shoots, addList, renameList, deleteList, addListField, deleteListField, addTask, updateTask } = useData()
  const [params, setParams] = useSearchParams()
  const listId = params.get('list') ?? ''
  const view = (params.get('view') as View) ?? 'list'
  const isUnfiled = listId === UNFILED.id
  const selected = isUnfiled ? UNFILED : lists.find((l) => l.id === listId)
  const merchant = merchants.find((m) => m.id === selected?.merchantId)

  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const [closedFolders, setClosedFolders] = useState<Set<string>>(new Set())
  const [newListFor, setNewListFor] = useState<string | null>(null)
  const [newListName, setNewListName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')
  const [fieldsOpen, setFieldsOpen] = useState(false)
  const [fieldDraft, setFieldDraft] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDeleteList, setConfirmDeleteList] = useState(false)

  const setParam = (key: string, value?: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const listTasks = useMemo(
    () => tasks.filter((t) => (isUnfiled ? !t.listId : t.listId === listId) && !t.parentTaskId),
    [tasks, listId, isUnfiled],
  )
  const listShoots = useMemo(
    () => (isUnfiled ? [] : shoots.filter((s) => s.listId === listId)),
    [shoots, listId, isUnfiled],
  )
  const countFor = (l: TaskList) => tasks.filter((t) => t.listId === l.id && !t.parentTaskId).length
  const unfiledCount = tasks.filter((t) => !t.listId && !t.parentTaskId).length

  const toggleFolder = (id: string) =>
    setClosedFolders((cur) => { const next = new Set(cur); next.has(id) ? next.delete(id) : next.add(id); return next })

  const createList = async (e: FormEvent, merchantId: string | undefined) => {
    e.preventDefault()
    if (!newListName.trim()) return
    const list = await addList({ name: newListName.trim(), merchantId })
    setNewListFor(null); setNewListName('')
    setParam('list', list.id)
  }

  const folders: { merchantId?: string; name: string; lists: TaskList[] }[] = [
    ...merchants.map((m) => ({ merchantId: m.id, name: m.name, lists: lists.filter((l) => l.merchantId === m.id) })),
    ...(lists.some((l) => !l.merchantId) ? [{ merchantId: undefined, name: 'Unfiled', lists: lists.filter((l) => !l.merchantId) }] : []),
  ]

  return (
    <div className="flex gap-0 h-[calc(100dvh-9.5rem)] min-h-[480px] -mx-1 rounded-(--nv-radius-lg) border border-border bg-surface overflow-hidden">
      {/* tree sidebar */}
      <nav className="w-60 shrink-0 border-r border-border overflow-y-auto py-2" aria-label="Workspace tree">
        <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">Workspace</p>
        {folders.map((f) => (
          <div key={f.merchantId ?? 'unfiled'}>
            <button
              onClick={() => toggleFolder(f.merchantId ?? 'unfiled')}
              className="w-full flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-2 text-left"
            >
              <ChevronDown className={clsx('size-3.5 text-ink-faint transition-transform', closedFolders.has(f.merchantId ?? 'unfiled') && '-rotate-90')} aria-hidden />
              {f.merchantId ? <Store className="size-3.5 text-ink-muted" aria-hidden /> : <FolderOpen className="size-3.5 text-ink-muted" aria-hidden />}
              <span className="truncate flex-1">{f.name}</span>
            </button>
            {!closedFolders.has(f.merchantId ?? 'unfiled') && (
              <div className="pb-1">
                {f.lists.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => setParam('list', l.id)}
                    className={clsx(
                      'w-full flex items-center gap-2 pl-9 pr-3 py-1.5 text-sm text-left',
                      l.id === listId ? 'bg-coral/10 text-ink font-medium border-r-2 border-(--nv-coral)' : 'text-ink-muted hover:bg-surface-2',
                    )}
                  >
                    <ListTodo className="size-3.5 shrink-0" aria-hidden />
                    <span className="truncate flex-1">{l.name}</span>
                    <span className="text-xs tabular-nums text-ink-faint">{countFor(l)}</span>
                  </button>
                ))}
                {newListFor === (f.merchantId ?? 'unfiled') ? (
                  <form onSubmit={(e) => void createList(e, f.merchantId)} className="pl-9 pr-3 py-1">
                    <input
                      autoFocus value={newListName} onChange={(e) => setNewListName(e.target.value)}
                      onBlur={() => { setNewListFor(null); setNewListName('') }}
                      placeholder="List name…" aria-label="New list name"
                      className="w-full h-7 rounded-(--nv-radius-sm) border border-border bg-surface text-ink px-2 text-sm focus:border-brand focus:outline-none"
                    />
                  </form>
                ) : (
                  <button onClick={() => { setNewListFor(f.merchantId ?? 'unfiled'); setNewListName('') }}
                          className="w-full flex items-center gap-2 pl-9 pr-3 py-1 text-xs text-ink-faint hover:text-ink">
                    <Plus className="size-3" aria-hidden /> Add list
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        <button
          onClick={() => setParam('list', UNFILED.id)}
          className={clsx(
            'w-full flex items-center gap-2 px-3 py-1.5 mt-1 text-sm text-left border-t border-border/60 pt-2.5',
            isUnfiled ? 'bg-coral/10 text-ink font-medium border-r-2 border-r-(--nv-coral)' : 'text-ink-muted hover:bg-surface-2',
          )}
        >
          <Inbox className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate flex-1">Unfiled tasks</span>
          <span className="text-xs tabular-nums text-ink-faint">{unfiledCount}</span>
        </button>
      </nav>

      {/* main */}
      <div className="flex-1 min-w-0 flex flex-col">
        {!selected ? (
          <div className="flex-1 grid place-items-center">
            <EmptyState title="Pick a list" description="Choose a list from a merchant folder — or create one — to see its tasks." />
          </div>
        ) : (
          <>
            {/* header: breadcrumb + views + toolbar */}
            <div className="border-b border-border px-4 pt-3">
              <div className="flex items-center gap-2 text-sm text-ink-muted">
                <span>{isUnfiled ? 'Workspace' : merchant?.name ?? 'Unfiled'}</span>
                <span>/</span>
                {renaming ? (
                  <form onSubmit={(e) => { e.preventDefault(); if (renameDraft.trim()) void renameList(selected.id, renameDraft.trim()); setRenaming(false) }}>
                    <input autoFocus value={renameDraft} onChange={(e) => setRenameDraft(e.target.value)}
                           onBlur={() => setRenaming(false)} aria-label="Rename list"
                           className="h-7 rounded-(--nv-radius-sm) border border-border bg-surface text-ink px-2 text-sm font-semibold focus:border-brand focus:outline-none" />
                  </form>
                ) : (
                  <span className="font-display font-semibold text-lg text-ink">{selected.name}</span>
                )}
                {!isUnfiled && <div className="relative">
                  <Button variant="ghost" size="sm" aria-label="List menu" icon={<MoreHorizontal className="size-4" />} onClick={() => setMenuOpen((o) => !o)} />
                  {menuOpen && (
                    <div className="absolute z-20 mt-1 w-40 rounded-(--nv-radius-md) border border-border bg-surface shadow-lg py-1 text-sm">
                      <button className="w-full text-left px-3 py-1.5 hover:bg-surface-2 text-ink"
                              onClick={() => { setRenaming(true); setRenameDraft(selected.name); setMenuOpen(false) }}>
                        Rename list
                      </button>
                      {confirmDeleteList ? (
                        <button className="w-full text-left px-3 py-1.5 text-error hover:bg-error-bg"
                                onClick={() => { void deleteList(selected.id); setParam('list', undefined); setMenuOpen(false); setConfirmDeleteList(false) }}>
                          Really delete?
                        </button>
                      ) : (
                        <button className="w-full text-left px-3 py-1.5 text-error hover:bg-error-bg" onClick={() => setConfirmDeleteList(true)}>
                          Delete list
                        </button>
                      )}
                    </div>
                  )}
                </div>}
                <span className="flex-1" />
                {!isUnfiled && <div className="relative">
                  <Button variant="ghost" size="sm" icon={<SlidersHorizontal className="size-4" />} onClick={() => setFieldsOpen((o) => !o)}>
                    Fields
                  </Button>
                  {fieldsOpen && (
                    <div className="absolute right-0 z-20 mt-1 w-64 rounded-(--nv-radius-md) border border-border bg-surface shadow-lg p-3 grid gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Custom fields</p>
                      {selected.fields.length === 0 && <p className="text-xs text-ink-muted">No fields yet — every task in this list will get the fields you add.</p>}
                      {selected.fields.map((f) => (
                        <div key={f.id} className="flex items-center gap-2 text-sm text-ink-2">
                          <span className="flex-1 truncate">{f.name}</span>
                          <button className="text-ink-faint hover:text-error text-xs" aria-label={`Delete field ${f.name}`}
                                  onClick={() => void deleteListField(selected.id, f.id)}>✕</button>
                        </div>
                      ))}
                      <form onSubmit={(e) => { e.preventDefault(); if (fieldDraft.trim()) { void addListField(selected.id, fieldDraft.trim()); setFieldDraft('') } }}
                            className="flex gap-1.5">
                        <input value={fieldDraft} onChange={(e) => setFieldDraft(e.target.value)} placeholder="e.g. Client"
                               aria-label="New field name"
                               className="h-8 flex-1 rounded-(--nv-radius-sm) border border-border bg-surface text-ink px-2 text-sm focus:border-brand focus:outline-none" />
                        <Button type="submit" size="sm" variant="secondary" disabled={!fieldDraft.trim()}>Add</Button>
                      </form>
                    </div>
                  )}
                </div>}
              </div>
              <div className="flex gap-1 mt-2" role="tablist" aria-label="Views">
                {([['list', ListTodo, 'List'], ['board', Columns3, 'Board'], ['calendar', CalendarDays, 'Calendar'], ['gantt', ChartNoAxesGantt, 'Gantt']] as const).map(([v, Icon, label]) => (
                  <button key={v} role="tab" aria-selected={view === v} onClick={() => setParam('view', v)}
                          className={clsx('inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                            view === v ? 'border-(--nv-coral) text-ink' : 'border-transparent text-ink-muted hover:text-ink')}>
                    <Icon className="size-4" aria-hidden /> {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-auto">
              {view === 'list' && <ListView tasks={listTasks} list={selected} onOpen={setOpenTaskId} onAdd={(title, status) => void addTask({ title, status, priority: 'medium', listId: isUnfiled ? undefined : selected.id })} />}
              {view === 'board' && <BoardView tasks={listTasks} onOpen={setOpenTaskId} onMove={(id, status) => void updateTask(id, { status })} />}
              {view === 'calendar' && <CalendarView tasks={listTasks} shoots={listShoots} onOpen={setOpenTaskId} onReschedule={(id, day) => {
                const t = listTasks.find((x) => x.id === id)
                const prev = t?.dueAt ? new Date(t.dueAt) : new Date()
                const next = new Date(day); next.setHours(prev.getHours(), prev.getMinutes())
                void updateTask(id, { dueAt: next.toISOString() })
              }} />}
              {view === 'gantt' && <GanttView tasks={listTasks} shoots={listShoots} onOpen={setOpenTaskId} />}
            </div>
          </>
        )}
      </div>

      <TaskPanel taskId={openTaskId} onClose={() => setOpenTaskId(null)} />
    </div>
  )
}

/* ---------- List view: collapsible status groups ---------- */

function ListView({ tasks, list, onOpen, onAdd }: {
  tasks: Task[]
  list: TaskList
  onOpen: (id: string) => void
  onAdd: (title: string, status: TaskStatus) => void
}) {
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const [addingIn, setAddingIn] = useState<TaskStatus | null>(null)
  const [draft, setDraft] = useState('')

  const groups = STATUS_ORDER.map((s) => ({ status: s, tasks: tasks.filter((t) => t.status === s) }))
    .filter((g) => g.tasks.length > 0 || g.status === 'todo' || g.status === 'in_progress')

  return (
    <div className="p-4 grid gap-4">
      {groups.map((g) => (
        <section key={g.status}>
          <button onClick={() => setClosed((c) => { const n = new Set(c); n.has(g.status) ? n.delete(g.status) : n.add(g.status); return n })}
                  className="flex items-center gap-2 mb-1">
            <ChevronDown className={clsx('size-3.5 text-ink-faint transition-transform', closed.has(g.status) && '-rotate-90')} aria-hidden />
            <Badge tone={TASK_STATUS_META[g.status].tone}>{TASK_STATUS_META[g.status].label.toUpperCase()}</Badge>
            <span className="text-xs text-ink-muted tabular-nums">{g.tasks.length}</span>
          </button>
          {!closed.has(g.status) && (
            <div className="border border-border rounded-(--nv-radius-md) divide-y divide-border overflow-hidden">
              <div className="grid grid-cols-[1fr_140px_90px_70px] gap-2 px-3 py-1.5 text-xs text-ink-muted bg-surface-2/60">
                <span>Name</span><span>Assignee</span><span>Due</span><span>Priority</span>
              </div>
              {g.tasks.map((t) => (
                <button key={t.id} onClick={() => onOpen(t.id)}
                        className="w-full grid grid-cols-[1fr_140px_90px_70px] gap-2 items-center px-3 py-2 text-left hover:bg-surface-2 transition-colors">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className={clsx('size-2.5 rounded-full shrink-0', t.status === 'completed' ? 'bg-success' : 'bg-ink-faint/40')} />
                    <span className={clsx('text-sm truncate', t.status === 'completed' ? 'text-ink-muted line-through' : 'text-ink')}>{t.title}</span>
                    {t.labels.map((l) => (
                      <span key={l.id} className="text-[10px] font-medium rounded-full px-1.5 py-px text-white shrink-0" style={{ backgroundColor: l.color }}>{l.name}</span>
                    ))}
                    {list.fields.length > 0 && t.fieldValues?.filter((v) => v.value).slice(0, 2).map((v) => (
                      <span key={v.fieldId} className="text-[10px] text-ink-muted bg-surface-2 rounded px-1.5 py-px shrink-0">{v.value}</span>
                    ))}
                  </span>
                  <span className="flex -space-x-1.5">{t.assignees.slice(0, 3).map((a) => <Avatar key={a.id} user={a} size="xs" />)}</span>
                  <span className="text-xs text-ink-muted tabular-nums">{dueLabel(t.dueAt)}</span>
                  <Flag className={clsx('size-3.5', PRIORITY_COLOR[t.priority])} aria-label={TASK_PRIORITY_META[t.priority].label} />
                </button>
              ))}
              {addingIn === g.status ? (
                <form className="px-3 py-1.5" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { onAdd(draft.trim(), g.status); setDraft('') } }}>
                  <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
                         onBlur={() => { setAddingIn(null); setDraft('') }}
                         placeholder="Task name — Enter to add" aria-label="New task name"
                         className="w-full h-8 rounded-(--nv-radius-sm) border border-border bg-surface text-ink px-2 text-sm focus:border-brand focus:outline-none" />
                </form>
              ) : (
                <button onClick={() => setAddingIn(g.status)} className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs text-ink-faint hover:text-ink">
                  <Plus className="size-3" aria-hidden /> Add Task
                </button>
              )}
            </div>
          )}
        </section>
      ))}
    </div>
  )
}

/* ---------- Board view ---------- */

function BoardView({ tasks, onOpen, onMove }: { tasks: Task[]; onOpen: (id: string) => void; onMove: (id: string, status: TaskStatus) => void }) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<TaskStatus | null>(null)
  return (
    <div className="flex gap-3 p-4 min-w-max">
      {STATUS_ORDER.filter((s) => s !== 'cancelled' || tasks.some((t) => t.status === 'cancelled')).map((s) => (
        <section key={s}
                 onDragOver={(e) => { e.preventDefault(); setOver(s) }}
                 onDrop={() => { if (dragId) onMove(dragId, s); setDragId(null); setOver(null) }}
                 className={clsx('w-64 shrink-0 rounded-(--nv-radius-md) bg-surface-2/60 p-2 grid gap-2 content-start min-h-40',
                   over === s && 'outline-2 outline-dashed outline-(--nv-coral)')}>
          <div className="flex items-center gap-2 px-1">
            <Badge tone={TASK_STATUS_META[s].tone}>{TASK_STATUS_META[s].label}</Badge>
            <span className="text-xs text-ink-muted tabular-nums">{tasks.filter((t) => t.status === s).length}</span>
          </div>
          {tasks.filter((t) => t.status === s).map((t) => (
            <button key={t.id} draggable
                    onDragStart={() => setDragId(t.id)} onDragEnd={() => { setDragId(null); setOver(null) }}
                    onClick={() => onOpen(t.id)}
                    className={clsx('rounded-(--nv-radius-md) border border-border bg-surface p-2.5 text-left grid gap-1.5 cursor-grab active:cursor-grabbing hover:border-brand/40',
                      dragId === t.id && 'opacity-50')}>
              <span className="text-sm text-ink">{t.title}</span>
              <span className="flex items-center gap-2">
                <span className="flex -space-x-1.5">{t.assignees.slice(0, 3).map((a) => <Avatar key={a.id} user={a} size="xs" />)}</span>
                {t.dueAt && <span className="text-xs text-ink-muted">{dueLabel(t.dueAt)}</span>}
                <Flag className={clsx('size-3 ml-auto', PRIORITY_COLOR[t.priority])} aria-hidden />
              </span>
            </button>
          ))}
        </section>
      ))}
    </div>
  )
}

/* ---------- Calendar view ---------- */

function CalendarView({ tasks, shoots = [], onOpen, onReschedule }: { tasks: Task[]; shoots?: Shoot[]; onOpen: (id: string) => void; onReschedule: (id: string, day: Date) => void }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [dragId, setDragId] = useState<string | null>(null)
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(month)), end: endOfWeek(endOfMonth(month)) })
  // the shoot chip already stands in for its synced "📸" task — don't show both
  const shootTitles = new Set(shoots.map((s) => `📸 ${s.title}`))
  const visible = tasks.filter((t) => !shootTitles.has(t.title))
  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-display font-semibold text-ink">{format(month, 'MMMM yyyy')}</h3>
        <span className="flex gap-1">
          <Button variant="ghost" size="sm" icon={<ChevronLeft className="size-4" />} aria-label="Previous month" onClick={() => setMonth((m) => addMonths(m, -1))} />
          <Button variant="ghost" size="sm" onClick={() => setMonth(startOfMonth(new Date()))}>Today</Button>
          <Button variant="ghost" size="sm" icon={<ChevronRight className="size-4" />} aria-label="Next month" onClick={() => setMonth((m) => addMonths(m, 1))} />
        </span>
      </div>
      <div className="grid grid-cols-7 text-center text-xs text-ink-muted font-medium mb-1">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <span key={d}>{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => (
          <div key={day.toISOString()}
               onDragOver={(e) => e.preventDefault()}
               onDrop={() => { if (dragId) onReschedule(dragId, day); setDragId(null) }}
               className={clsx('min-h-24 rounded-(--nv-radius-sm) border p-1 grid content-start gap-1',
                 isSameMonth(day, month) ? 'border-border bg-surface' : 'border-transparent bg-surface-2/40',
                 isSameDay(day, new Date()) && 'outline-2 outline-(--nv-coral)/40')}>
            <span className="text-[11px] tabular-nums text-ink-muted">{format(day, 'd')}</span>
            {shoots.filter((s) => isSameDay(new Date(s.startsAt), day)).map((s) => (
              <div key={s.id} title={`Photoshoot · ${s.title} — managed from the Calendar page`}
                   className={clsx('text-left text-[11px] rounded px-1.5 py-0.5 truncate border',
                     s.status === 'cancelled' ? 'bg-surface-2 text-ink-faint border-border line-through' : 'bg-info-bg text-info border-info/30')}>
                📸 {s.title}
              </div>
            ))}
            {visible.filter((t) => t.dueAt && isSameDay(new Date(t.dueAt), day)).map((t) => (
              <button key={t.id} draggable
                      onDragStart={() => setDragId(t.id)} onDragEnd={() => setDragId(null)}
                      onClick={() => onOpen(t.id)}
                      className={clsx('text-left text-[11px] rounded px-1.5 py-0.5 truncate border cursor-grab',
                        t.status === 'completed' ? 'bg-success-bg text-success border-success/30 line-through' : 'bg-coral/10 text-ink border-brand/30',
                        dragId === t.id && 'opacity-50')}>
                {t.title}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------- Gantt view ---------- */

function GanttView({ tasks, shoots = [], onOpen }: { tasks: Task[]; shoots?: Shoot[]; onOpen: (id: string) => void }) {
  const shootTitles = new Set(shoots.map((s) => `📸 ${s.title}`))
  const dated = tasks.filter((t) => (t.dueAt || t.startsAt) && !shootTitles.has(t.title))
  if (!dated.length && !shoots.length) {
    return <p className="p-8 text-sm text-ink-muted text-center">No dated tasks yet — give tasks a start or due date and they appear on the timeline.</p>
  }
  const DAY = 30
  const starts = [...dated.map((t) => new Date(t.startsAt ?? t.dueAt!)), ...shoots.map((s) => new Date(s.startsAt))]
  const ends = [...dated.map((t) => new Date(t.dueAt ?? t.startsAt!)), ...shoots.map((s) => new Date(s.endsAt))]
  const min = new Date(Math.min(...starts.map(Number)))
  min.setDate(min.getDate() - 2)
  const max = new Date(Math.max(...ends.map(Number)))
  max.setDate(max.getDate() + 3)
  const days = eachDayOfInterval({ start: min, end: max })
  const today = new Date()
  const todayX = differenceInCalendarDays(today, min)

  return (
    <div className="p-4 overflow-x-auto">
      <div className="min-w-max">
        <div className="grid" style={{ gridTemplateColumns: `220px ${days.length * DAY}px` }}>
          <span />
          <div className="relative h-6">
            {days.map((d, i) => (
              <span key={i} className="absolute top-0 text-[10px] text-ink-faint" style={{ left: i * DAY }}>
                {d.getDate() === 1 || i === 0 ? format(d, 'MMM d') : d.getDay() === 1 ? format(d, 'd') : ''}
              </span>
            ))}
          </div>
        </div>
        {shoots.map((sh) => {
          const s = new Date(sh.startsAt)
          const e = new Date(sh.endsAt)
          const x = Math.max(0, differenceInCalendarDays(s, min)) * DAY
          const w = Math.max(1, differenceInCalendarDays(e, s) + 1) * DAY - 6
          return (
            <div key={sh.id} className="grid items-center h-9" style={{ gridTemplateColumns: `220px ${days.length * DAY}px` }}>
              <span className="text-sm text-ink-2 truncate pr-3">📸 {sh.title}</span>
              <div className="relative h-6 border-t border-border/40">
                {todayX >= 0 && todayX < days.length && (
                  <span className="absolute top-0 bottom-0 w-px bg-error/60" style={{ left: todayX * DAY }} aria-hidden />
                )}
                <span
                  className={clsx('absolute top-0.5 h-5 rounded-full text-[10px] px-2 truncate',
                    sh.status === 'completed' ? 'bg-success text-white' : sh.status === 'cancelled' ? 'bg-surface-2 text-ink-faint line-through' : 'bg-info text-white')}
                  style={{ left: x, width: w }}
                  title={`Photoshoot · ${sh.title}: ${format(s, 'MMM d')} → ${format(e, 'MMM d')}`}
                >
                  {w > 70 ? sh.title : ''}
                </span>
              </div>
            </div>
          )
        })}
        {dated.map((t) => {
          const s = new Date(t.startsAt ?? t.dueAt!)
          const e = new Date(t.dueAt ?? t.startsAt!)
          const x = Math.max(0, differenceInCalendarDays(s, min)) * DAY
          const w = Math.max(1, differenceInCalendarDays(e, s) + 1) * DAY - 6
          return (
            <div key={t.id} className="grid items-center h-9" style={{ gridTemplateColumns: `220px ${days.length * DAY}px` }}>
              <button onClick={() => onOpen(t.id)} className="text-sm text-ink truncate text-left pr-3 hover:underline">{t.title}</button>
              <div className="relative h-6 border-t border-border/40">
                {todayX >= 0 && todayX < days.length && (
                  <span className="absolute top-0 bottom-0 w-px bg-error/60" style={{ left: todayX * DAY }} aria-hidden />
                )}
                <button
                  onClick={() => onOpen(t.id)}
                  className={clsx('absolute top-0.5 h-5 rounded-full text-[10px] text-white px-2 truncate text-left',
                    t.status === 'completed' ? 'bg-success' : 'nv-gradient')}
                  style={{ left: x, width: w }}
                  title={`${t.title}: ${format(s, 'MMM d')} → ${format(e, 'MMM d')}`}
                >
                  {w > 70 ? t.title : ''}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
