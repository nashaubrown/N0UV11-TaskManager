import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays, Check, ChevronDown, Clock, CloudDownload, Flag, GitBranch, ListChecks, ListTodo, ListTree, Paperclip,
  Pause, Play, Tag, Trash2, UserRound, X,
} from 'lucide-react'
import clsx from 'clsx'
import { Avatar } from '../common/Avatar'
import { Badge } from '../common/Badge'
import { Button } from '../common/Button'
import { CommentThread } from '../common/CommentThread'
import { Select } from '../common/Input'
import { api, DEMO } from '../../services/api'
import { driveConfig, importDrivePhotos, pickDrivePhotos } from '../../services/googleDrive'
import { useData } from '../../store/data'
import { useAuth } from '../../store/auth'
import { TASK_PRIORITY_META, TASK_STATUS_META, type Task, type TaskPriority, type TaskStatus } from '../../types'

/* Docked ClickUp-style task panel: label/value rows with "Empty"
 * placeholders, collapsible Fields, subtasks, dependencies, checklist,
 * attachments and comments. Everything saves as you go. */

const toLocal = (iso?: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export const fmtDuration = (secs: number) => {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  return h ? `${h}h ${m}m` : m ? `${m}m ${s}s` : `${s}s`
}

function Row({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[128px_1fr] items-center gap-2 min-h-9">
      <span className="inline-flex items-center gap-2 text-sm text-ink-muted">
        <Icon className="size-4" aria-hidden /> {label}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

const Empty = ({ onClick, label }: { onClick?: () => void; label?: string }) => (
  <button onClick={onClick} className="text-sm text-ink-faint hover:text-ink-muted text-left" disabled={!onClick}>
    {label ?? 'Empty'}
  </button>
)

function ActionRow({ icon: Icon, label, onClick }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-ink-2 hover:bg-surface-2 text-left border-t border-border first:border-t-0">
      <Icon className="size-4 text-ink-muted" aria-hidden /> {label}
    </button>
  )
}

export function TaskPanel({ taskId, onClose }: { taskId: string | null; onClose: () => void }) {
  const {
    tasks, lists, merchants, members, photos, comments, labels,
    addTask, addLabel, updateTask, deleteTask, taskChecklist, taskAttachment, taskTimer, taskDependency, addComment, loadComments,
    addImportedPhotos,
  } = useData()
  const { user } = useAuth()
  const task = tasks.find((t) => t.id === taskId)
  const list = lists.find((l) => l.id === task?.listId)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [fieldsOpen, setFieldsOpen] = useState(true)
  const [subtasks, setSubtasks] = useState<Task[]>([])
  const [subtaskDraft, setSubtaskDraft] = useState('')
  const [addingSubtask, setAddingSubtask] = useState(false)
  const [depPicking, setDepPicking] = useState(false)
  const [depQuery, setDepQuery] = useState('')
  const [tagsOpen, setTagsOpen] = useState(false)
  const [tagDraft, setTagDraft] = useState('')
  const [checkOpen, setCheckOpen] = useState(false)
  const [checkDraft, setCheckDraft] = useState('')
  const [picking, setPicking] = useState(false)
  const [pickQuery, setPickQuery] = useState('')
  const [driveBusy, setDriveBusy] = useState(false)
  const [driveGate, setDriveGate] = useState<'connect' | 'rescope' | null>(null)
  const [driveNote, setDriveNote] = useState<string>()
  const [assigneesOpen, setAssigneesOpen] = useState(false)
  const [estimateOpen, setEstimateOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [, tick] = useState(0)
  const fieldDrafts = useRef<Record<string, string>>({})

  useEffect(() => {
    if (!task || !taskId) return
    setTitle(task.title)
    setDescription(task.description ?? '')
    fieldDrafts.current = Object.fromEntries((task.fieldValues ?? []).map((v) => [v.fieldId, v.value]))
    setConfirmDelete(false); setAddingSubtask(false); setDepPicking(false); setCheckOpen(false); setPicking(false); setEstimateOpen(false)
    setDriveGate(null); setDriveNote(undefined); setTagsOpen(false); setTagDraft(''); setDepQuery('')
    void loadComments({ taskId })
    if (DEMO) setSubtasks(tasks.filter((t) => t.parentTaskId === taskId))
    else api<Task & { subtasks: Task[] }>('GET', `/tasks/${taskId}`).then((d) => setSubtasks(d.subtasks)).catch(() => setSubtasks([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId])

  useEffect(() => {
    if (!task?.runningEntry) return
    const id = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [task?.runningEntry])

  const taskComments = useMemo(() => comments.filter((c) => c.taskId === taskId && !c.parentId), [comments, taskId])
  const attachments = useMemo(
    () => (task?.attachmentIds ?? []).map((id) => photos.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => Boolean(p)),
    [task?.attachmentIds, photos],
  )
  const pickerPhotos = useMemo(() => {
    const q = pickQuery.trim().toLowerCase()
    return photos.filter((p) => p.status === 'ready' && (!q || (p.title ?? '').toLowerCase().includes(q))).slice(0, 60)
  }, [photos, pickQuery])
  const listLabelFor = (t: Task) => {
    const l = lists.find((x) => x.id === t.listId)
    if (!l) return 'Unfiled'
    const m = merchants.find((mm) => mm.id === l.merchantId)
    return m ? `${m.name} / ${l.name}` : l.name
  }
  /** Any root task in the workspace can be waited on — same list first. */
  const depOptions = useMemo(() => {
    const q = depQuery.trim().toLowerCase()
    return tasks
      .filter((t) =>
        t.id !== taskId && !t.parentTaskId && !(task?.dependsOnIds ?? []).includes(t.id) &&
        (!q || t.title.toLowerCase().includes(q)))
      .sort((a, b) => Number(b.listId === task?.listId) - Number(a.listId === task?.listId))
      .slice(0, 30)
  }, [tasks, task, taskId, depQuery])
  const dependsOn = useMemo(
    () => (task?.dependsOnIds ?? []).map((id) => tasks.find((t) => t.id === id)).filter((t): t is Task => Boolean(t)),
    [task?.dependsOnIds, tasks],
  )

  if (!task) return null

  const saveFields = () => {
    const values = (list?.fields ?? []).map((f) => ({ fieldId: f.id, value: fieldDrafts.current[f.id] ?? '' }))
    void updateTask(task.id, { fieldValues: values })
  }

  const runningSecs = task.runningEntry ? Math.round((Date.now() - new Date(task.runningEntry.startedAt).getTime()) / 1000) : 0
  const mine = task.runningEntry?.userId === user?.id

  const toggleAssignee = (id: string) => {
    const cur = task.assignees.map((a) => a.id)
    void updateTask(task.id, { assigneeIds: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] })
  }

  /** Pick photos in the Google Drive dialog, import them (filed under the
   *  task's merchant), then attach every imported photo to this task. */
  const attachFromDrive = async () => {
    setDriveNote(undefined); setDriveGate(null); setDriveBusy(true)
    try {
      const cfg = await driveConfig()
      if (!cfg.configured) return setDriveNote("Google isn't configured on this server yet.")
      if (!cfg.connected) return setDriveGate('connect')
      if (!cfg.hasDriveScope || !cfg.accessToken) return setDriveGate('rescope')
      const picks = await pickDrivePhotos(cfg)
      if (!picks.length) return
      const merchantId = lists.find((l) => l.id === task.listId)?.merchantId
      const d = await importDrivePhotos(picks, merchantId)
      addImportedPhotos(d.items)
      for (const p of d.items) await taskAttachment(task.id, { add: p.id })
      if (d.failed.length) setDriveNote(`${d.failed.length} file${d.failed.length === 1 ? '' : 's'} failed — ${d.failed[0].reason}`)
    } catch (e) {
      setDriveNote(e instanceof Error ? e.message : 'Drive import failed')
    } finally {
      setDriveBusy(false)
    }
  }

  const connectGoogle = async () => {
    const { url } = await api<{ url: string }>('GET', '/calendar/connect')
    window.location.href = url
  }

  const addSubtask = async () => {
    if (!subtaskDraft.trim()) return
    const created = await addTask({ title: subtaskDraft.trim(), status: 'todo', priority: 'medium', listId: task.listId, parentTaskId: task.id })
    setSubtasks((s) => [...s, created])
    setSubtaskDraft('')
  }

  const toggleSubtask = async (sub: Task) => {
    const status: TaskStatus = sub.status === 'completed' ? 'todo' : 'completed'
    await updateTask(sub.id, { status })
    setSubtasks((s) => s.map((x) => (x.id === sub.id ? { ...x, status } : x)))
  }

  return (
    <aside className="w-[400px] shrink-0 border-l border-border bg-surface h-full overflow-y-auto" aria-label="Task details">
      <div className="sticky top-0 z-10 bg-surface border-b border-border px-4 py-3 flex items-center gap-2">
        <Badge tone={TASK_STATUS_META[task.status].tone}>{TASK_STATUS_META[task.status].label}</Badge>
        <span className="flex-1" />
        {confirmDelete ? (
          <>
            <Button variant="danger" size="sm" onClick={() => { void deleteTask(task.id); onClose() }}>Delete</Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Keep</Button>
          </>
        ) : (
          <Button variant="ghost" size="sm" aria-label="Delete task" icon={<Trash2 className="size-4" />} onClick={() => setConfirmDelete(true)} />
        )}
        <Button variant="ghost" size="sm" aria-label="Close panel" icon={<X className="size-4" />} onClick={onClose} />
      </div>

      <div className="p-4 grid gap-4">
        <textarea
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== task.title && void updateTask(task.id, { title: title.trim() })}
          rows={1}
          className="font-display font-semibold text-xl text-ink bg-transparent resize-none outline-none w-full"
          aria-label="Task title"
        />

        {/* property rows — ClickUp order */}
        <div className="grid gap-0.5">
          <Row icon={Check} label="Status">
            <Select value={task.status} onChange={(e) => void updateTask(task.id, { status: e.target.value as TaskStatus })} aria-label="Status">
              {(Object.keys(TASK_STATUS_META) as TaskStatus[]).map((s) => (
                <option key={s} value={s}>{TASK_STATUS_META[s].label}</option>
              ))}
            </Select>
          </Row>

          <Row icon={ListTodo} label="List">
            <Select value={task.listId ?? ''} onChange={(e) => void updateTask(task.id, { listId: e.target.value || null })} aria-label="List">
              <option value="">Unfiled</option>
              {lists.map((l) => {
                const m = merchants.find((mm) => mm.id === l.merchantId)
                return <option key={l.id} value={l.id}>{m ? `${m.name} / ${l.name}` : l.name}</option>
              })}
            </Select>
          </Row>

          <Row icon={UserRound} label="Assignees">
            {task.assignees.length === 0 && !assigneesOpen ? (
              <Empty onClick={() => setAssigneesOpen(true)} />
            ) : (
              <div className="flex items-center gap-1 flex-wrap">
                {task.assignees.map((a) => <Avatar key={a.id} user={a} size="xs" />)}
                <button onClick={() => setAssigneesOpen((o) => !o)} aria-label="Edit assignees"
                        className="size-6 rounded-full border border-dashed border-border text-ink-faint text-sm hover:text-ink hover:border-ink-faint">
                  +
                </button>
              </div>
            )}
            {assigneesOpen && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {members.map((m) => {
                  const on = task.assignees.some((a) => a.id === m.id)
                  return (
                    <button key={m.id} onClick={() => toggleAssignee(m.id)}
                            className={clsx('inline-flex items-center gap-1 rounded-full border pl-0.5 pr-2 py-0.5 text-xs',
                              on ? 'border-brand/50 bg-coral/10 text-ink font-medium' : 'border-border text-ink-muted hover:bg-surface-2')}>
                      <Avatar user={m} size="xs" />{m.fullName.split(' ')[0]}
                    </button>
                  )
                })}
              </div>
            )}
          </Row>

          <Row icon={CalendarDays} label="Dates">
            <div className="grid grid-cols-2 gap-1.5">
              <input type="datetime-local" value={toLocal(task.startsAt)} aria-label="Start date"
                     onChange={(e) => void updateTask(task.id, { startsAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
                     className="h-8 rounded-(--nv-radius-sm) border border-border bg-surface text-ink px-2 text-xs" />
              <input type="datetime-local" value={toLocal(task.dueAt)} aria-label="Due date"
                     onChange={(e) => void updateTask(task.id, { dueAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
                     className="h-8 rounded-(--nv-radius-sm) border border-border bg-surface text-ink px-2 text-xs" />
            </div>
          </Row>

          <Row icon={Flag} label="Priority">
            <Select value={task.priority} onChange={(e) => void updateTask(task.id, { priority: e.target.value as TaskPriority })} aria-label="Priority">
              {(Object.keys(TASK_PRIORITY_META) as TaskPriority[]).map((p) => (
                <option key={p} value={p}>{TASK_PRIORITY_META[p].label}</option>
              ))}
            </Select>
          </Row>

          <Row icon={Clock} label="Time estimate">
            {task.estimateMinutes === undefined && !estimateOpen ? (
              <Empty onClick={() => setEstimateOpen(true)} />
            ) : (
              <span className="inline-flex items-center gap-2">
                <input
                  type="number" min={0} placeholder="minutes" autoFocus={estimateOpen}
                  defaultValue={task.estimateMinutes ?? ''}
                  key={`est-${task.id}`}
                  onBlur={(e) => {
                    const v = e.target.value === '' ? null : Math.max(0, Number(e.target.value))
                    if (v !== (task.estimateMinutes ?? null)) void updateTask(task.id, { estimateMinutes: v })
                    if (v === null) setEstimateOpen(false)
                  }}
                  aria-label="Time estimate in minutes"
                  className="h-8 w-24 rounded-(--nv-radius-sm) border border-border bg-surface text-ink px-2 text-sm"
                />
                {task.estimateMinutes ? <span className="text-xs text-ink-muted">{fmtDuration(task.estimateMinutes * 60)}</span> : null}
              </span>
            )}
          </Row>

          <Row icon={Clock} label="Track time">
            <div className="flex items-center gap-2">
              {task.runningEntry && mine ? (
                <Button size="sm" variant="danger" icon={<Pause className="size-3.5" />} onClick={() => void taskTimer(task.id, 'stop')}>
                  Stop
                </Button>
              ) : (
                <Button size="sm" variant="secondary" icon={<Play className="size-3.5" />} onClick={() => void taskTimer(task.id, 'start')}>
                  Start
                </Button>
              )}
              {(task.trackedSeconds ?? 0) + runningSecs > 0 ? (
                <span className="text-sm tabular-nums text-ink-2">
                  {fmtDuration((task.trackedSeconds ?? 0) + (task.runningEntry ? runningSecs : 0))}
                  {task.runningEntry && !mine && <span className="text-xs text-ink-muted"> · running</span>}
                </span>
              ) : null}
            </div>
          </Row>

          <Row icon={Tag} label="Tags">
            {task.labels.length === 0 && !tagsOpen ? (
              <Empty onClick={() => setTagsOpen(true)} />
            ) : (
              <div className="flex items-center gap-1 flex-wrap">
                {task.labels.map((l) => (
                  <span key={l.id} className="text-xs font-medium rounded-full px-2 py-0.5 text-white" style={{ backgroundColor: l.color }}>
                    {l.name}
                  </span>
                ))}
                <button onClick={() => setTagsOpen((o) => !o)} aria-label="Edit tags"
                        className="size-6 rounded-full border border-dashed border-border text-ink-faint text-sm hover:text-ink hover:border-ink-faint">
                  +
                </button>
              </div>
            )}
            {tagsOpen && (
              <div className="mt-1.5 grid gap-1.5">
                {labels.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {labels.map((l) => {
                      const on = task.labels.some((x) => x.id === l.id)
                      return (
                        <button key={l.id} aria-pressed={on}
                                onClick={() => {
                                  const cur = task.labels.map((x) => x.id)
                                  void updateTask(task.id, { labelIds: on ? cur.filter((x) => x !== l.id) : [...cur, l.id] })
                                }}
                                className={clsx('text-xs font-medium rounded-full px-2 py-0.5 border transition-opacity',
                                  on ? 'text-white border-transparent' : 'text-ink-2 border-border opacity-70 hover:opacity-100')}
                                style={on ? { backgroundColor: l.color } : { borderColor: l.color, color: l.color }}>
                          {l.name}
                        </button>
                      )
                    })}
                  </div>
                )}
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    const name = tagDraft.trim()
                    if (!name) return
                    void addLabel(name).then((l) => updateTask(task.id, { labelIds: [...new Set([...task.labels.map((x) => x.id), l.id])] }))
                    setTagDraft('')
                  }}
                >
                  <input value={tagDraft} onChange={(e) => setTagDraft(e.target.value)}
                         placeholder="New tag — Enter to create & add" aria-label="New tag name"
                         className="w-full h-8 rounded-(--nv-radius-sm) border border-border bg-surface text-ink px-2 text-sm placeholder:text-ink-faint focus:border-brand focus:outline-none" />
                </form>
              </div>
            )}
          </Row>
        </div>

        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => description !== (task.description ?? '') && void updateTask(task.id, { description })}
          placeholder="Add description…"
          rows={3}
          className="text-sm text-ink-2 bg-surface-2/60 rounded-(--nv-radius-md) border border-border p-3 w-full resize-y placeholder:text-ink-faint focus:border-brand focus:outline-none"
          aria-label="Description"
        />

        {/* collapsible Fields */}
        {(list?.fields.length ?? 0) > 0 && (
          <div className="grid gap-1.5">
            <button onClick={() => setFieldsOpen((o) => !o)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
              <ChevronDown className={clsx('size-3.5 transition-transform', !fieldsOpen && '-rotate-90')} aria-hidden /> Fields
            </button>
            {fieldsOpen && list!.fields.map((f) => (
              <div key={f.id} className="grid grid-cols-[128px_1fr] items-center gap-2 border-b border-border/60 pb-1">
                <span className="text-sm text-ink-muted truncate pl-5">{f.name}</span>
                <input
                  key={`${task.id}-${f.id}`}
                  defaultValue={fieldDrafts.current[f.id] ?? ''}
                  onChange={(e) => { fieldDrafts.current[f.id] = e.target.value }}
                  onBlur={saveFields}
                  placeholder="—"
                  aria-label={f.name}
                  className="h-8 rounded-(--nv-radius-sm) bg-transparent text-ink px-2 text-sm placeholder:text-ink-faint focus:bg-surface focus:border focus:border-border focus:outline-none"
                />
              </div>
            ))}
          </div>
        )}

        {/* subtasks */}
        {(subtasks.length > 0 || addingSubtask) && (
          <div className="grid gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted inline-flex items-center gap-1.5">
              <ListTree className="size-3.5" aria-hidden /> Subtasks
            </p>
            {subtasks.map((s) => (
              <div key={s.id} className="flex items-center gap-2">
                <input type="checkbox" checked={s.status === 'completed'} onChange={() => void toggleSubtask(s)}
                       className="accent-(--nv-coral) size-4" aria-label={s.title} />
                <span className={clsx('text-sm flex-1', s.status === 'completed' ? 'line-through text-ink-faint' : 'text-ink-2')}>{s.title}</span>
              </div>
            ))}
            {addingSubtask && (
              <form onSubmit={(e) => { e.preventDefault(); void addSubtask() }}>
                <input autoFocus value={subtaskDraft} onChange={(e) => setSubtaskDraft(e.target.value)}
                       placeholder="Subtask name — Enter to add" aria-label="New subtask"
                       className="w-full h-8 rounded-(--nv-radius-sm) border border-border bg-surface text-ink px-2 text-sm placeholder:text-ink-faint focus:border-brand focus:outline-none" />
              </form>
            )}
          </div>
        )}

        {/* dependencies */}
        {(dependsOn.length > 0 || depPicking) && (
          <div className="grid gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted inline-flex items-center gap-1.5">
              <GitBranch className="size-3.5" aria-hidden /> Waiting on
            </p>
            {dependsOn.map((d) => (
              <div key={d.id} className="flex items-center gap-2 group">
                <Badge tone={TASK_STATUS_META[d.status].tone}>{TASK_STATUS_META[d.status].label}</Badge>
                <span className="text-sm text-ink-2 flex-1 truncate">{d.title}</span>
                <button onClick={() => void taskDependency(task.id, { remove: d.id })} aria-label={`Remove dependency ${d.title}`}
                        className="opacity-0 group-hover:opacity-100 text-ink-faint hover:text-error text-xs">✕</button>
              </div>
            ))}
            {depPicking && (
              <div className="border border-border rounded-(--nv-radius-md) p-2 grid gap-1.5 bg-surface-2/50">
                <input autoFocus value={depQuery} onChange={(e) => setDepQuery(e.target.value)}
                       placeholder="Search any task in the workspace…" aria-label="Search tasks to depend on"
                       className="h-8 rounded-(--nv-radius-sm) border border-border bg-surface text-ink px-2 text-sm placeholder:text-ink-faint focus:border-brand focus:outline-none" />
                {depOptions.length === 0 ? (
                  <p className="text-xs text-ink-muted px-1">No matching tasks.</p>
                ) : (
                  <div className="max-h-44 overflow-y-auto grid">
                    {depOptions.map((t) => (
                      <button key={t.id}
                              onClick={() => { void taskDependency(task.id, { add: t.id }); setDepPicking(false); setDepQuery('') }}
                              className="flex items-center gap-2 px-1.5 py-1.5 rounded-(--nv-radius-sm) hover:bg-surface-2 text-left">
                        <span className={clsx('size-2 rounded-full shrink-0', t.status === 'completed' ? 'bg-success' : 'bg-ink-faint/40')} />
                        <span className="text-sm text-ink truncate">{t.title}</span>
                        <span className="text-xs text-ink-faint truncate ml-auto shrink-0">{listLabelFor(t)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* checklist */}
        {((task.checklist?.length ?? 0) > 0 || checkOpen) && (
          <div className="grid gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted inline-flex items-center gap-1.5">
              <ListChecks className="size-3.5" aria-hidden /> Checklist
            </p>
            {(task.checklist ?? []).map((c) => (
              <div key={c.id} className="flex items-center gap-2 group">
                <input type="checkbox" checked={c.done} onChange={() => void taskChecklist(task.id, { toggle: c.id })}
                       className="accent-(--nv-coral) size-4" aria-label={c.label} />
                <span className={clsx('text-sm flex-1', c.done ? 'line-through text-ink-faint' : 'text-ink-2')}>{c.label}</span>
                <button onClick={() => void taskChecklist(task.id, { remove: c.id })} aria-label={`Remove ${c.label}`}
                        className="opacity-0 group-hover:opacity-100 text-ink-faint hover:text-error text-xs">✕</button>
              </div>
            ))}
            <form
              onSubmit={(e) => { e.preventDefault(); if (checkDraft.trim()) { void taskChecklist(task.id, { add: checkDraft.trim() }); setCheckDraft('') } }}
              className="flex gap-1.5"
            >
              <input value={checkDraft} onChange={(e) => setCheckDraft(e.target.value)} placeholder="Add checklist item…"
                     aria-label="Add checklist item" autoFocus={checkOpen}
                     className="h-8 flex-1 rounded-(--nv-radius-sm) border border-border bg-surface text-ink px-2 text-sm placeholder:text-ink-faint focus:border-brand focus:outline-none" />
              <Button type="submit" size="sm" variant="secondary" disabled={!checkDraft.trim()}>Add</Button>
            </form>
          </div>
        )}

        {/* attachments */}
        {(attachments.length > 0 || picking) && (
          <div className="grid gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted inline-flex items-center gap-1.5">
              <Paperclip className="size-3.5" aria-hidden /> Attachments
            </p>
            <div className="flex gap-1.5 flex-wrap">
              {attachments.map((p) => (
                <div key={p.id} className="relative size-16 rounded-(--nv-radius-sm) overflow-hidden group">
                  <img src={p.thumbUrl} alt={p.title ?? 'Attachment'} className="size-full object-cover" />
                  <button onClick={() => void taskAttachment(task.id, { remove: p.id })} aria-label="Remove attachment"
                          className="absolute top-0.5 right-0.5 size-4 rounded-full bg-black/60 text-white text-[10px] hidden group-hover:flex items-center justify-center">✕</button>
                </div>
              ))}
            </div>
            {picking && (
              <div className="border border-border rounded-(--nv-radius-md) p-2.5 grid gap-2 bg-surface-2/50">
                <div className="flex gap-2">
                  <input value={pickQuery} onChange={(e) => setPickQuery(e.target.value)} placeholder="Search the photo library…"
                         aria-label="Search photos to attach" autoFocus
                         className="h-8 flex-1 rounded-(--nv-radius-sm) border border-border bg-surface text-ink px-2 text-sm placeholder:text-ink-faint focus:border-brand focus:outline-none" />
                  {!DEMO && (
                    <Button size="sm" variant="secondary" loading={driveBusy} icon={<CloudDownload className="size-3.5" />}
                            onClick={() => void attachFromDrive()} aria-label="Import from Google Drive">
                      Drive
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setPicking(false)}>Done</Button>
                </div>
                {driveGate && (
                  <p className="text-xs text-ink-muted">
                    {driveGate === 'rescope'
                      ? 'Google is connected without Drive access yet — reconnect once to grant it. '
                      : 'Connect Google to pick photos straight from Drive. '}
                    <button onClick={() => void connectGoogle()} className="text-brand-deep dark:text-brand font-medium hover:underline">
                      {driveGate === 'rescope' ? 'Reconnect Google' : 'Connect Google'}
                    </button>
                  </p>
                )}
                {driveNote && <p className="text-xs text-ink-muted" role="status">{driveNote}</p>}
                <div className="grid grid-cols-5 gap-1 max-h-40 overflow-y-auto">
                  {pickerPhotos.map((p) => (
                    <button key={p.id} onClick={() => void taskAttachment(task.id, { add: p.id })}
                            className={clsx('relative aspect-square rounded-(--nv-radius-sm) overflow-hidden', task.attachmentIds?.includes(p.id) && 'opacity-40')}
                            aria-label={`Attach ${p.title ?? 'photo'}`}>
                      <img src={p.thumbUrl} alt="" className="absolute inset-0 size-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* action rows — like ClickUp's footer actions */}
        <div className="rounded-(--nv-radius-md) border border-border overflow-hidden">
          <ActionRow icon={ListTree} label="Add subtask" onClick={() => setAddingSubtask(true)} />
          <ActionRow icon={GitBranch} label="Relate items or add dependencies" onClick={() => setDepPicking(true)} />
          <ActionRow icon={ListChecks} label="Create checklist" onClick={() => setCheckOpen(true)} />
          <ActionRow icon={Paperclip} label="Attach file" onClick={() => setPicking(true)} />
        </div>

        {/* comments */}
        <div className="grid gap-2 border-t border-border pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Comments</p>
          <CommentThread comments={taskComments} onAdd={(body) => void addComment({ taskId: task.id }, body)} />
        </div>
      </div>
    </aside>
  )
}
