import { useMemo, useState } from 'react'
import { CalendarPlus, ChevronLeft, ChevronRight, MapPin, RefreshCw } from 'lucide-react'
import {
  addDays, addMonths, endOfMonth, endOfWeek, format, isSameDay, isSameMonth,
  isToday, startOfMonth, startOfWeek,
} from 'date-fns'
import clsx from 'clsx'
import { Button } from '../components/common/Button'
import { Card } from '../components/common/Card'
import { Modal } from '../components/common/Modal'
import { Badge } from '../components/common/Badge'
import { EmptyState } from '../components/common/EmptyState'
import { ShootForm } from '../components/shoot/ShootForm'
import { ShootDetail } from '../components/shoot/ShootDetail'
import { useData } from '../store/data'
import { api, DEMO } from '../services/api'
import { SHOOT_STATUS_META, shootDisplayStatus, type Shoot } from '../types'

/** Chip color per display status: soft background + readable text in both themes. */
const CHIP: Record<string, string> = {
  planning: 'bg-surface-2 text-ink-muted border border-dashed border-border',
  confirmed: 'bg-info-bg text-info',
  ongoing: 'nv-gradient text-on-brand',
  wrap_up: 'bg-warning-bg text-warning',
  completed: 'bg-success-bg text-success',
  cancelled: 'bg-surface-2 text-ink-faint line-through',
}

interface CalStatus { configured: boolean; connected: boolean; googleEmail?: string; pendingSyncs?: number }

function GoogleSyncChip() {
  const [status, setStatus] = useState<CalStatus | null>(null)
  const [busy, setBusy] = useState(false)

  useMemo(() => {
    if (!DEMO) api<CalStatus>('GET', '/calendar/status').then(setStatus).catch(() => setStatus(null))
  }, [])

  if (DEMO) return <Badge tone="neutral">Google sync — demo mode</Badge>
  if (!status) return null
  if (!status.configured) return <Badge tone="neutral">Google sync not configured on server</Badge>
  if (!status.connected) {
    return (
      <Button
        variant="secondary" size="sm" loading={busy}
        onClick={async () => {
          setBusy(true)
          try {
            const { url } = await api<{ url: string }>('GET', '/calendar/connect')
            window.location.href = url
          } finally {
            setBusy(false)
          }
        }}
      >
        Connect Google Calendar
      </Button>
    )
  }
  return (
    <span className="inline-flex items-center gap-2">
      <Badge tone="success">Google · {status.googleEmail}</Badge>
      <Button
        variant="ghost" size="sm" aria-label="Sync now" icon={<RefreshCw className="size-4" />}
        onClick={() => void api('POST', '/calendar/sync').catch(() => {})}
      />
    </span>
  )
}

export default function Calendar() {
  const { shoots } = useData()
  const [cursor, setCursor] = useState(() => new Date())
  const [creating, setCreating] = useState<Date | null>(null)
  const [openShootId, setOpenShootId] = useState<string | null>(null)
  const { addShoot } = useData()

  const gridStart = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 })
  const gridEnd = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 })
  const days = useMemo(() => {
    const out: Date[] = []
    for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) out.push(d)
    return out
  }, [gridStart.getTime(), gridEnd.getTime()])

  const shootsOn = (day: Date) =>
    shoots
      .filter((s) => isSameDay(new Date(s.startsAt), day))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))

  const upcoming = useMemo(
    () =>
      [...shoots]
        .filter((s) => s.status !== 'cancelled' &&
          (new Date(s.endsAt) >= new Date() || shootDisplayStatus(s) === 'wrap_up'))
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
        .slice(0, 8),
    [shoots],
  )

  const chip = (s: Shoot) => {
    const display = shootDisplayStatus(s)
    return (
      <button
        key={s.id}
        onClick={() => setOpenShootId(s.id)}
        title={`${s.title} · ${SHOOT_STATUS_META[display].label}`}
        className={clsx(
          'w-full text-left rounded-md px-1.5 py-0.5 text-[11px] font-medium truncate transition-transform hover:scale-[1.02]',
          CHIP[display],
        )}
      >
        {format(new Date(s.startsAt), 'HH:mm')} {s.title}
      </button>
    )
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-display font-bold text-2xl text-ink">Photoshoot Calendar</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <GoogleSyncChip />
          <Button icon={<CalendarPlus className="size-4" />} onClick={() => setCreating(new Date())}>New shoot</Button>
        </div>
      </div>

      <div className="grid desktop:grid-cols-[1fr_290px] gap-4 items-start">
        {/* month grid */}
        <Card padding="md">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold text-lg text-ink">{format(cursor, 'MMMM yyyy')}</h2>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" aria-label="Previous month" icon={<ChevronLeft className="size-4" />}
                      onClick={() => setCursor((c) => addMonths(c, -1))} />
              <Button variant="secondary" size="sm" onClick={() => setCursor(new Date())}>Today</Button>
              <Button variant="ghost" size="sm" aria-label="Next month" icon={<ChevronRight className="size-4" />}
                      onClick={() => setCursor((c) => addMonths(c, 1))} />
            </div>
          </div>

          <div className="grid grid-cols-7 text-center text-xs font-semibold uppercase tracking-wide text-ink-muted pb-2">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <span key={d}>{d}</span>)}
          </div>
          <div className="grid grid-cols-7 border-t border-l border-border rounded-b overflow-hidden">
            {days.map((day) => {
              const inMonth = isSameMonth(day, cursor)
              const dayShoots = shootsOn(day)
              return (
                <div
                  key={day.toISOString()}
                  role="button"
                  tabIndex={0}
                  onClick={() => setCreating(day)}
                  onKeyDown={(e) => e.key === 'Enter' && setCreating(day)}
                  className={clsx(
                    'min-h-20 border-r border-b border-border p-1 grid gap-0.5 content-start cursor-pointer transition-colors hover:bg-surface-2',
                    !inMonth && 'bg-surface-2/50',
                  )}
                >
                  <span
                    className={clsx(
                      'size-6 flex items-center justify-center rounded-full text-xs tabular-nums justify-self-start',
                      isToday(day) ? 'nv-gradient text-on-brand font-semibold' : inMonth ? 'text-ink' : 'text-ink-faint',
                    )}
                  >
                    {format(day, 'd')}
                  </span>
                  {dayShoots.slice(0, 3).map((s) => (
                    <span key={s.id} onClick={(e) => e.stopPropagation()}>{chip(s)}</span>
                  ))}
                  {dayShoots.length > 3 && (
                    <span className="text-[10px] text-ink-faint px-1">+{dayShoots.length - 3} more</span>
                  )}
                </div>
              )
            })}
          </div>
        </Card>

        {/* upcoming list */}
        <Card padding="md" className="grid gap-3">
          <h2 className="font-display font-semibold text-lg text-ink">Upcoming shoots</h2>
          {upcoming.length === 0 ? (
            <EmptyState title="Nothing scheduled" description="Click a day on the calendar to plan a shoot." />
          ) : (
            <ul className="grid gap-1.5">
              {upcoming.map((s) => {
                const display = shootDisplayStatus(s)
                const meta = SHOOT_STATUS_META[display]
                return (
                  <li key={s.id}>
                    <button
                      onClick={() => setOpenShootId(s.id)}
                      className="w-full text-left rounded-(--nv-radius-md) border border-border p-2.5 grid gap-1 transition-colors hover:bg-surface-2"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-ink truncate">{s.title}</span>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </span>
                      <span className="text-xs text-ink-muted">
                        {format(new Date(s.startsAt), 'EEE d MMM · HH:mm')}–{format(new Date(s.endsAt), 'HH:mm')}
                      </span>
                      {s.location && (
                        <span className="text-xs text-ink-faint inline-flex items-center gap-1 truncate">
                          <MapPin className="size-3 shrink-0" aria-hidden />{s.location}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>

      <Modal open={creating !== null} onClose={() => setCreating(null)} title="New photoshoot" size="lg">
        <ShootForm
          defaultDate={creating ?? undefined}
          onSubmit={(values) => { void addShoot(values); setCreating(null) }}
          onCancel={() => setCreating(null)}
        />
      </Modal>

      <ShootDetail shootId={openShootId} onClose={() => setOpenShootId(null)} />
    </div>
  )
}
