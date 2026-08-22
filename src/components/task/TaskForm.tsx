import { useState, type FormEvent } from 'react'
import type { Task, TaskPriority, TaskStatus } from '../../types'
import { TASK_PRIORITY_META, TASK_STATUS_META } from '../../types'
import { Button } from '../common/Button'
import { Input, Select, Textarea } from '../common/Input'

export interface TaskFormValues {
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  dueAt?: string
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
      <div className="flex justify-end gap-2 pt-1">
        {onCancel && <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>}
        <Button type="submit">{initial?.id ? 'Save changes' : 'Create task'}</Button>
      </div>
    </form>
  )
}
