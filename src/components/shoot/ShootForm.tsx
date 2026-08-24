import { useState, type FormEvent } from 'react'
import clsx from 'clsx'
import { Check } from 'lucide-react'
import { Avatar } from '../common/Avatar'
import { Button } from '../common/Button'
import { Input, Select, Textarea } from '../common/Input'
import { useData, type NewShootInput } from '../../store/data'
import type { Shoot } from '../../types'

const toLocalInput = (iso: string) => {
  const d = new Date(iso)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export function ShootForm({ initial, defaultDate, onSubmit, onCancel }: {
  initial?: Shoot
  defaultDate?: Date
  onSubmit: (values: NewShootInput) => void
  onCancel: () => void
}) {
  const { merchants, projects, members, lists } = useData()
  const base = defaultDate ?? new Date()
  const defaultStart = new Date(base); defaultStart.setHours(9, 0, 0, 0)
  const defaultEnd = new Date(base); defaultEnd.setHours(12, 0, 0, 0)

  const [title, setTitle] = useState(initial?.title ?? '')
  const [location, setLocation] = useState(initial?.location ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [merchantId, setMerchantId] = useState(initial?.merchantId ?? '')
  const [projectId, setProjectId] = useState(initial?.projectId ?? '')
  const [startsAt, setStartsAt] = useState(toLocalInput(initial?.startsAt ?? defaultStart.toISOString()))
  const [endsAt, setEndsAt] = useState(toLocalInput(initial?.endsAt ?? defaultEnd.toISOString()))
  const [status, setStatus] = useState<Shoot['status']>(initial?.status ?? 'planning')
  const [listId, setListId] = useState(initial?.listId ?? '')
  const [crewIds, setCrewIds] = useState<string[]>(initial?.crew.map((u) => u.id) ?? [])
  const [error, setError] = useState<string>()

  const toggleCrew = (id: string) =>
    setCrewIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return setError('Give the shoot a title.')
    if (new Date(endsAt) <= new Date(startsAt)) return setError('End time must be after the start time.')
    onSubmit({
      title: title.trim(),
      description: description.trim() || undefined,
      location: location.trim() || undefined,
      merchantId: merchantId || undefined,
      projectId: projectId || undefined,
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
      status,
      // clearing an existing link sends null; a fresh shoot just omits it
      listId: listId || (initial ? null : undefined),
      crewIds,
    })
  }

  const listGroups = [
    ...merchants
      .map((m) => ({ label: m.name, lists: lists.filter((l) => l.merchantId === m.id) }))
      .filter((g) => g.lists.length > 0),
    ...(lists.some((l) => !l.merchantId) ? [{ label: 'Other lists', lists: lists.filter((l) => !l.merchantId) }] : []),
  ]

  return (
    <form onSubmit={submit} className="grid gap-4">
      <Input label="Title" placeholder="e.g. Espresso bar hero shoot" value={title} error={error}
             onChange={(e) => { setTitle(e.target.value); setError(undefined) }} autoFocus />
      <div className="grid tablet:grid-cols-2 gap-4">
        <Input label="Starts" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
        <Input label="Ends" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />
      </div>
      <Input label="Location" placeholder="Where is the shoot?" value={location} onChange={(e) => setLocation(e.target.value)} />
      <div className="grid tablet:grid-cols-3 gap-4">
        <Select label="Merchant" value={merchantId} onChange={(e) => setMerchantId(e.target.value)}>
          <option value="">None</option>
          {merchants.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>
        <Select label="Project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">None</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value as Shoot['status'])}>
          <option value="planning">Planning</option>
          <option value="confirmed">Confirmed</option>
        </Select>
      </div>
      <div>
        <Select label="Task list (Projects)" value={listId} onChange={(e) => setListId(e.target.value)}>
          <option value="">None</option>
          {listGroups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </optgroup>
          ))}
        </Select>
        <p className="text-xs text-ink-muted mt-1.5">
          Filing the shoot into a list creates a synced 📸 task there — it follows the shoot's title, dates and status, and the shoot shows on that list's Calendar and Gantt views.
        </p>
      </div>
      <fieldset>
        <legend className="text-sm font-medium text-ink mb-1.5">Crew</legend>
        <div className="flex flex-wrap gap-1.5">
          {members.map((m) => {
            const on = crewIds.includes(m.id)
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleCrew(m.id)}
                className={clsx(
                  'inline-flex items-center gap-1.5 rounded-full border pl-1 pr-2.5 py-1 text-sm transition-colors',
                  on
                    ? 'border-brand/50 bg-coral/10 text-ink font-medium'
                    : 'border-border text-ink-muted hover:bg-surface-2',
                )}
              >
                <Avatar user={m} size="xs" />
                {m.fullName.split(' ')[0]}
                {on && <Check className="size-3.5 text-brand-deep dark:text-brand" aria-hidden />}
              </button>
            )
          })}
        </div>
        <p className="text-xs text-ink-muted mt-1.5">
          Tagged crew get the shoot in their Google Calendar automatically once it's confirmed (and they've connected Google).
        </p>
      </fieldset>
      <Textarea label="Notes" placeholder="Shot list, gear, access notes…" value={description} onChange={(e) => setDescription(e.target.value)} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit">{initial ? 'Save changes' : 'Schedule shoot'}</Button>
      </div>
    </form>
  )
}
