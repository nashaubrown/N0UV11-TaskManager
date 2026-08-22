import { useState, type FormEvent } from 'react'
import clsx from 'clsx'
import type { Task, TaskPriority, TaskStatus } from '../../types'
import { TASK_PRIORITY_META, TASK_STATUS_META } from '../../types'
import { Button } from '../common/Button'
import { Input, Select, Textarea } from '../common/Input'
import { Avatar } from '../common/Avatar'
import { useData } from '../../store/data'

export interface TaskFormValues {
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  dueAt?: string
  assigneeIds: string[]
}

/** Phase 1: local-state form. Phase 2 swaps onSubmit to a mutation. */
export function TaskForm({ initial, onSubmit, onCancel }: {
  initial?: Partial<Task>
  onSubmit: (values: TaskFormValues) => void
  onCancel?: () => void
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [status, setStatus] = useState<TaskStatus>(initial?.status ?? 'todo')
  const [priority, setPriority] = useState<TaskPriority>(initial?.priority ?? 'medium')
  const [dueAt, setDueAt] = useState(initial?.dueAt?.slice(0, 10) ?? '')
  const members = useData((s) => s.members)
  const [assigneeIds, setAssigneeIds] = useState<string[]>(initial?.assignees?.map((a) => a.id) ?? [])

  const toggleAssignee = (id: string) =>
    setAssigneeIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  const [error, setError] = useState<string>()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return setError('Give the task a title.')
    onSubmit({
      title: title.trim(),
      description,
      status,
      priority,
      dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
      assigneeIds,
    })
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <Input
        label="Title"
        placeholder="e.g. Shoot espresso bar hero images"
        value={title}
        error={error}
        onChange={(e) => { setTitle(e.target.value); setError(undefined) }}
        autoFocus
      />
      <Textarea label="Description" placeholder="Optional details…" value={description} onChange={(e) => setDescription(e.target.value)} />
      <div className="grid grid-cols-1 tablet:grid-cols-3 gap-4">
        <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
          {(Object.keys(TASK_STATUS_META) as TaskStatus[]).map((s) => (
            <option key={s} value={s}>{TASK_STATUS_META[s].label}</option>
          ))}
        </Select>
        <Select label="Priority" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
          {(Object.keys(TASK_PRIORITY_META) as TaskPriority[]).map((p) => (
            <option key={p} value={p}>{TASK_PRIORITY_META[p].label}</option>
          ))}
        </Select>
        <Input label="Due date" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
      </div>
      {members.length > 0 && (
        <fieldset>
          <legend className="block text-sm font-medium text-ink-2 mb-1.5">Assignees</legend>
          <div className="flex flex-wrap gap-2">
            {members.map((m) => {
              const on = assigneeIds.includes(m.id)
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleAssignee(m.id)}
                  className={clsx(
                    'inline-flex items-center gap-2 rounded-full border pl-1 pr-3 py-1 text-sm font-medium transition-colors',
                    on
                      ? 'nv-gradient text-on-brand border-transparent shadow-sm'
                      : 'bg-surface text-ink-2 border-border hover:bg-surface-2',
                  )}
                >
                  <Avatar user={m} size="xs" />
                  {m.fullName.split(' ')[0]}
                </button>
              )
            })}
          </div>
        </fieldset>
      )}
      <div className="flex justify-end gap-2 pt-1">
        {onCancel && <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>}
        <Button type="submit">{initial?.id ? 'Save changes' : 'Create task'}</Button>
      </div>
    </form>
  )
}
