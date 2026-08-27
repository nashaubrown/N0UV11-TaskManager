import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { differenceInCalendarDays, format, isSameDay } from 'date-fns'
import {
  AlertTriangle, Camera, CheckCircle2, Clock, GitBranch, Handshake, MapPin, Plus, Store, Upload,
} from 'lucide-react'
import clsx from 'clsx'
import { Avatar } from '../components/common/Avatar'
import { Badge } from '../components/common/Badge'
import { Button } from '../components/common/Button'
import { Card, CardHeader } from '../components/common/Card'
import { Modal } from '../components/common/Modal'
import { Select } from '../components/common/Input'
import { StatTile } from '../components/common/StatTile'
import { TrendChart } from '../components/common/TrendChart'
import { TaskDetail } from '../components/task/TaskDetail'
import { TaskForm, type TaskFormValues } from '../components/task/TaskForm'
import { ShootForm } from '../components/shoot/ShootForm'
import { fmtDuration } from '../components/task/TaskPanel'
import { api, DEMO } from '../services/api'
import { timeAgo } from '../utils/format'
import { useAuth } from '../store/auth'
import { useData } from '../store/data'
import { SHOOT_STATUS_META, shootDisplayStatus, type Task } from '../types'

/* Mission-Control dashboard: my work first, shoots and quick actions beside
 * it, merchant health beneath, then trend / activity / approvals / deals. */

const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export default function Dashboard() {
  const { tasks, photos, shoots, deals, lists, merchants, addTask, addShoot } = useData()
  const user = useAuth((s) => s.user)
  const navigate = useNavigate()

  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const [scope, setScope] = useState<'mine' | 'all'>('mine')
  const [creating, setCreating] = useState(false)
  const [newListId, setNewListId] = useState('')
  const [schedulingShoot, setSchedulingShoot] = useState(false)

  /* ---------- derived work ---------- */
  const roots = useMemo(() => tasks.filter((t) => !t.parentTaskId), [tasks])
  const open = useMemo(() => roots.filter((t) => !['completed', 'cancelled'].includes(t.status)), [roots])
  const blockedIds = useMemo(() => {
    const stillOpen = (id: string) => {
      const d = tasks.find((x) => x.id === id)
      return Boolean(d && d.status !== 'completed' && d.status !== 'cancelled')
    }
    return new Set(open.filter((t) => (t.dependsOnIds ?? []).some(stillOpen)).map((t) => t.id))
  }, [open, tasks])

  const myOpen = useMemo(
    () => (scope === 'mine' ? open.filter((t) => t.assignees.some((a) => a.id === user?.id)) : open),
    [open, scope, user?.id],
  )
  const now = new Date()
  const weekAhead = new Date(now.getTime() + 7 * 86_400_000)
  const byDue = (a: Task, b: Task) => (a.dueAt ?? '').localeCompare(b.dueAt ?? '')
  const groups = [
    { key: 'overdue', label: 'Overdue', hot: true, tasks: myOpen.filter((t) => t.dueAt && new Date(t.dueAt) < now && !isSameDay(new Date(t.dueAt), now)).sort(byDue) },
    { key: 'today', label: 'Today', hot: false, tasks: myOpen.filter((t) => t.dueAt && isSameDay(new Date(t.dueAt), now)).sort(byDue) },
    { key: 'week', label: 'This week', hot: false, tasks: myOpen.filter((t) => t.dueAt && new Date(t.dueAt) > now && !isSameDay(new Date(t.dueAt), now) && new Date(t.dueAt) <= weekAhead).sort(byDue).slice(0, 6) },
  ].filter((g) => g.tasks.length > 0)

  const listLabel = (t: Task) => {
    const l = lists.find((x) => x.id === t.listId)
    if (!l) return 'Unfiled'
    const m = merchants.find((mm) => mm.id === l.merchantId)
    return m ? `${m.name} / ${l.name}` : l.name
  }

  /* ---------- KPIs ---------- */
  const overdueCount = open.filter((t) => t.dueAt && new Date(t.dueAt) < now).length
  const pendingApproval = photos.filter((p) => p.approvalStatus === 'in_review' || p.approvalStatus === 'pending')
  const trackedTotal = tasks.reduce((s, t) => s + (t.trackedSeconds ?? 0), 0)
  const dueToday = open.filter((t) => t.dueAt && isSameDay(new Date(t.dueAt), now)).length

  const completionTrend = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (13 - i))
    const next = new Date(d); next.setDate(d.getDate() + 1)
    return {
      date: d.toISOString(),
      count: tasks.filter((t) => t.completedAt && new Date(t.completedAt) >= d && new Date(t.completedAt) < next).length,
    }
  })
  const spark = completionTrend.slice(-12).map((d) => d.count)

  /* ---------- shoots ---------- */
  const nextShoots = shoots
    .filter((sh) => sh.status !== 'cancelled' && sh.status !== 'completed' && new Date(sh.endsAt) >= now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, 3)
  const shootsThisWeek = nextShoots.filter((sh) => new Date(sh.startsAt) <= weekAhead).length
  const countdown = (iso: string) => {
    const d = differenceInCalendarDays(new Date(iso), now)
    return d <= 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`
  }

  /* ---------- merchants ---------- */
  const merchantStats = useMemo(() => merchants.map((m) => {
    const listIds = new Set(lists.filter((l) => l.merchantId === m.id).map((l) => l.id))
    const mOpen = open.filter((t) => t.listId && listIds.has(t.listId))
    return {
      merchant: m,
      open: mOpen.length,
      overdue: mOpen.filter((t) => t.dueAt && new Date(t.dueAt) < now).length,
      blocked: mOpen.filter((t) => blockedIds.has(t.id)).length,
      nextShoot: shoots
        .filter((sh) => sh.merchantId === m.id && sh.status !== 'cancelled' && sh.status !== 'completed' && new Date(sh.endsAt) >= now)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0],
      thumbs: photos.filter((p) => p.merchantId === m.id && p.status === 'ready').slice(0, 3),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }).sort((a, b) => b.open - a.open || b.overdue - a.overdue).slice(0, 6), [merchants, lists, open, blockedIds, shoots, photos])

  const [followers, setFollowers] = useState<Record<string, number>>({})
  const igIds = merchantStats.filter((s) => s.merchant.igHandle).map((s) => s.merchant.id).join(',')
  useEffect(() => {
    if (DEMO || !igIds) return
    for (const id of igIds.split(',')) {
      api<{ live: { followers?: number } | null }>('GET', `/merchants/${id}/feed`)
        .then((d) => {
          if (d.live?.followers !== undefined) setFollowers((f) => ({ ...f, [id]: d.live!.followers! }))
        })
        .catch(() => {})
    }
  }, [igIds])

  /* ---------- activity ---------- */
  const activity = useMemo(() => {
    // raw camera/export filenames (long hex blobs) read as noise, not names
    const cleanTitle = (t?: string) => {
      const s = t?.trim()
      if (!s) return null
      if (s.length >= 12 && /^[0-9a-f_-]+$/i.test(s)) return null
      return s.length > 42 ? `${s.slice(0, 42)}…` : s
    }
    // one line per upload batch (same person, same hour), not one per photo
    const batches = new Map<string, { at: string; who?: string; count: number; sample: string | null }>()
    for (const p of photos) {
      const key = `${p.uploadedBy?.id ?? '?'}:${p.createdAt.slice(0, 13)}`
      const b = batches.get(key)
      if (b) {
        b.count += 1
        if (p.createdAt > b.at) b.at = p.createdAt
        b.sample ??= cleanTitle(p.title)
      } else {
        batches.set(key, { at: p.createdAt, who: p.uploadedBy?.fullName, count: 1, sample: cleanTitle(p.title) })
      }
    }
    const events: { at: string; who?: string; text: string }[] = [
      ...tasks
        .filter((t) => t.completedAt)
        .map((t) => ({ at: t.completedAt!, who: t.assignees[0]?.fullName, text: `completed “${t.title}”` })),
      ...[...batches.values()].map((b) => ({
        at: b.at,
        who: b.who,
        text: b.count === 1 ? `uploaded “${b.sample ?? 'a photo'}”` : `uploaded ${b.count} photos`,
      })),
      ...shoots.map((sh) => ({ at: sh.createdAt, text: `scheduled 📸 ${sh.title}` })),
    ]
    return events.filter((e) => e.at).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8)
  }, [tasks, photos, shoots])

  /* ---------- deals ---------- */
  const openDeals = deals.filter((d) => !['closed_won', 'closed_lost'].includes(d.stage))
  const openDealValue = openDeals.reduce((n, d) => n + (d.valueCents ?? 0), 0)
  const wonDealValue = deals.filter((d) => d.stage === 'closed_won').reduce((n, d) => n + (d.valueCents ?? 0), 0)
  const money = (cents: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100)

  const listGroups = [
    ...merchants
      .map((m) => ({ label: m.name, lists: lists.filter((l) => l.merchantId === m.id) }))
      .filter((g) => g.lists.length > 0),
    ...(lists.some((l) => !l.merchantId) ? [{ label: 'Other lists', lists: lists.filter((l) => !l.merchantId) }] : []),
  ]

  const createTask = async (values: TaskFormValues) => {
    const task = await addTask({ ...values, listId: newListId || undefined })
    setCreating(false)
    setOpenTaskId(task.id)
  }

  const TaskRow = ({ t }: { t: Task }) => (
    <button onClick={() => setOpenTaskId(t.id)}
            className="w-full flex items-center gap-2 rounded-(--nv-radius-md) border border-border px-2.5 py-2 text-left hover:bg-surface-2 transition-colors">
      <span className={clsx('size-2.5 rounded-full shrink-0', t.status === 'in_progress' ? 'bg-info' : 'bg-ink-faint/40')} />
      <span className="text-sm text-ink truncate flex-1 min-w-0">{t.title}</span>
      {blockedIds.has(t.id) && <Badge tone="warning">Blocked</Badge>}
      {t.labels.slice(0, 2).map((l) => (
        <span key={l.id} className="text-[10px] font-medium rounded-full px-1.5 py-px text-white shrink-0" style={{ backgroundColor: l.color }}>{l.name}</span>
      ))}
      <span className="text-[11px] text-ink-faint truncate max-w-32 shrink-0 hidden tablet:inline">{listLabel(t)}</span>
      <span className="text-xs text-ink-muted tabular-nums shrink-0">{t.dueAt ? format(new Date(t.dueAt), 'MMM d') : ''}</span>
    </button>
  )

  return (
    <div className="grid gap-6">
      {/* dashboard-only backdrop: a dusk-lagoon wash behind the glass */}
      <div className="nv-dash-scene" aria-hidden />
      {/* greeting + quick actions */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display font-bold text-[28px] tablet:text-[32px] leading-tight text-ink">
            {greeting()}, {(user?.fullName ?? 'there').split(' ')[0]}
          </h1>
          <p className="text-ink-muted mt-1">
            {format(now, 'EEEE d MMMM')} · {dueToday} due today · {shootsThisWeek} shoot{shootsThisWeek === 1 ? '' : 's'} this week
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => { setNewListId(''); setCreating(true) }}>New task</Button>
          <Button size="sm" variant="secondary" icon={<Camera className="size-4" />} onClick={() => setSchedulingShoot(true)}>Schedule shoot</Button>
          <Button size="sm" variant="secondary" icon={<Upload className="size-4" />} onClick={() => navigate('/photos')}>Upload photos</Button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 tablet:grid-cols-3 desktop:grid-cols-5 gap-3">
        <StatTile label="Open tasks" value={String(open.length)} icon={<Clock />} spark={spark} to="/tasks" />
        <StatTile label="Overdue" value={String(overdueCount)} icon={<AlertTriangle />} to="/tasks?filter=overdue" />
        <StatTile label="Blocked" value={String(blockedIds.size)} icon={<GitBranch />} to="/tasks?filter=blocked" />
        <StatTile label="Awaiting approval" value={String(pendingApproval.length)} icon={<CheckCircle2 />} to="/photos?status=needs_review" />
        <StatTile label="Time tracked" value={trackedTotal ? fmtDuration(trackedTotal) : '0m'} icon={<Clock />} to="/tasks" />
      </div>

      {/* my work + shoot rail */}
      <div className="grid desktop:grid-cols-5 gap-6 items-start">
        <Card padding="lg" className="desktop:col-span-3">
          <div className="flex items-center justify-between gap-2">
            <CardHeader title="My work" subtitle="Due soon, from every list" />
            <div className="flex rounded-full border border-border p-0.5" role="group" aria-label="Work scope">
              {(['mine', 'all'] as const).map((s) => (
                <button key={s} aria-pressed={scope === s} onClick={() => setScope(s)}
                        className={clsx('rounded-full px-3 py-1 text-xs font-medium transition-colors',
                          scope === s ? 'nv-gradient text-white' : 'text-ink-muted hover:text-ink')}>
                  {s === 'mine' ? 'Mine' : 'Everyone'}
                </button>
              ))}
            </div>
          </div>
          {groups.length === 0 ? (
            <p className="text-sm text-ink-muted mt-3">
              Nothing due{scope === 'mine' ? ' for you' : ''} this week — plan ahead on the <Link to="/tasks" className="text-brand-deep dark:text-brand font-medium hover:underline">Tasks page</Link>.
            </p>
          ) : (
            <div className="grid gap-3 mt-2">
              {groups.map((g) => (
                <div key={g.key} className="grid gap-1.5">
                  <p className={clsx('text-[11px] font-semibold uppercase tracking-wide', g.hot ? 'text-error' : 'text-ink-muted')}>
                    {g.label} · {g.tasks.length}
                  </p>
                  {g.tasks.map((t) => <TaskRow key={t.id} t={t} />)}
                </div>
              ))}
              <Link to="/tasks" className="text-sm font-medium text-brand-deep dark:text-brand hover:underline">All tasks →</Link>
            </div>
          )}
        </Card>

        <div className="desktop:col-span-2 grid gap-6">
          <Card padding="lg" interactive onClick={() => navigate('/calendar')}>
            <div className="flex items-baseline justify-between">
              <CardHeader title="Up next" subtitle="Photoshoots" />
              <Link to="/calendar" className="text-sm font-medium text-brand-deep dark:text-brand hover:underline">Calendar →</Link>
            </div>
            {nextShoots.length === 0 ? (
              <p className="text-sm text-ink-muted mt-2">Nothing scheduled — use “Schedule shoot” above.</p>
            ) : (
              <ul className="grid gap-2 mt-2">
                {nextShoots.map((sh) => {
                  const display = shootDisplayStatus(sh)
                  return (
                    <li key={sh.id} className="flex items-center gap-2.5 rounded-(--nv-radius-md) border border-border p-2.5">
                      <span aria-hidden>📸</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink truncate">{sh.title}</p>
                        <p className="text-xs text-ink-muted flex items-center gap-1.5 flex-wrap">
                          {format(new Date(sh.startsAt), 'EEE d MMM · HH:mm')}
                          {sh.location && <span className="inline-flex items-center gap-0.5"><MapPin className="size-3" aria-hidden />{sh.location}</span>}
                          {sh.gcalSynced && <Badge tone="success">Synced ✓</Badge>}
                        </p>
                      </div>
                      <div className="grid gap-1 justify-items-end shrink-0">
                        <Badge tone={SHOOT_STATUS_META[display].tone}>{SHOOT_STATUS_META[display].label}</Badge>
                        <span className="text-[11px] font-semibold text-brand-deep dark:text-brand">{countdown(sh.startsAt)}</span>
                      </div>
                      {sh.crew.length > 0 && (
                        <span className="flex -space-x-1.5 shrink-0">{sh.crew.slice(0, 3).map((u) => <Avatar key={u.id} user={u} size="xs" />)}</span>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          <Card padding="lg">
            <CardHeader title="Workload" subtitle="Open tasks by merchant" />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {merchantStats.filter((s) => s.open > 0).map((s) => (
                <Link key={s.merchant.id} to="/projects"
                      className={clsx('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors hover:bg-surface-2',
                        s.overdue > 0 ? 'border-error/40 text-error' : 'border-border text-ink-2')}>
                  {s.merchant.name} · {s.open}
                </Link>
              ))}
              {open.some((t) => !t.listId) && (
                <Link to="/projects?list=unfiled" className="inline-flex items-center rounded-full border border-dashed border-border px-3 py-1 text-sm text-ink-muted hover:bg-surface-2">
                  Unfiled · {open.filter((t) => !t.listId).length}
                </Link>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* merchant health */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-display font-semibold text-lg text-ink">Merchant health</h2>
          <Link to="/merchants" className="text-sm font-medium text-brand-deep dark:text-brand hover:underline">All merchants →</Link>
        </div>
        <div className="grid tablet:grid-cols-2 desktop:grid-cols-3 gap-3">
          {merchantStats.map(({ merchant: m, open: mOpen, overdue, blocked, nextShoot, thumbs }) => (
            <Card key={m.id} padding="md" interactive onClick={() => navigate(`/merchants/${m.id}`)} className="grid gap-2.5 content-start">
              <div className="flex items-center gap-2">
                <Store className="size-4 text-brand-deep dark:text-brand shrink-0" aria-hidden />
                <Link to={`/merchants/${m.id}`} className="font-medium text-ink truncate hover:underline flex-1">{m.name}</Link>
                {overdue > 0 ? (
                  <Badge tone="error">{overdue} overdue</Badge>
                ) : blocked > 0 ? (
                  <Badge tone="warning">{blocked} blocked</Badge>
                ) : mOpen > 0 ? (
                  <Badge tone="success">On track</Badge>
                ) : (
                  <Badge tone="neutral">Quiet</Badge>
                )}
              </div>
              {thumbs.length > 0 && (
                <div className="grid grid-cols-3 gap-0.5 rounded-(--nv-radius-sm) overflow-hidden">
                  {thumbs.map((p) => (
                    <img key={p.id} src={p.thumbUrl} alt="" className="aspect-square w-full object-cover" loading="lazy" />
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between text-xs text-ink-muted">
                <span>{mOpen} open task{mOpen === 1 ? '' : 's'}</span>
                {nextShoot
                  ? <span>📸 {format(new Date(nextShoot.startsAt), 'd MMM')}</span>
                  : <span className="text-ink-faint">no shoot planned</span>}
              </div>
              {m.igHandle && (
                <p className="text-xs text-ink-muted tabular-nums">
                  @{m.igHandle}
                  {followers[m.id] !== undefined && <span className="text-ink font-medium"> · {followers[m.id].toLocaleString()} followers</span>}
                </p>
              )}
            </Card>
          ))}
        </div>
      </section>

      {/* trend + activity */}
      <div className="grid desktop:grid-cols-5 gap-6 items-start">
        <Card padding="lg" className="desktop:col-span-3">
          <CardHeader title="Tasks completed" subtitle="Trailing 14 days" />
          <TrendChart data={completionTrend} ariaLabel="Tasks completed per day over the last 14 days" />
        </Card>
        <Card padding="lg" className="desktop:col-span-2">
          <CardHeader title="Activity" subtitle="Latest across the studio" />
          {activity.length === 0 ? (
            <p className="text-sm text-ink-muted mt-2">Things your team does will show up here.</p>
          ) : (
            <ul className="grid gap-2 mt-2">
              {activity.map((e, i) => (
                <li key={i} className="flex items-baseline gap-2 text-sm min-w-0">
                  <span className="text-ink-2 flex-1 min-w-0 truncate">
                    {e.who && <span className="font-medium text-ink">{e.who.split(' ')[0]} </span>}
                    {e.text}
                  </span>
                  <span className="text-xs text-ink-faint whitespace-nowrap ml-auto">{timeAgo(e.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* approvals + deals */}
      <div className="grid desktop:grid-cols-5 gap-6 items-start">
        <Card padding="lg" interactive onClick={() => navigate('/photos?status=needs_review')} className="desktop:col-span-3">
          <div className="flex items-baseline justify-between">
            <CardHeader title="Approvals queue" subtitle={pendingApproval.length ? `${pendingApproval.length} photo${pendingApproval.length === 1 ? '' : 's'} waiting` : 'All clear'} />
            <Link to="/photos" className="text-sm font-medium text-brand-deep dark:text-brand hover:underline">Review →</Link>
          </div>
          {pendingApproval.length > 0 && (
            <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1">
              {pendingApproval.slice(0, 8).map((p) => (
                <img key={p.id} src={p.thumbUrl} alt={p.title ?? 'Pending photo'}
                     className="size-16 rounded-(--nv-radius-sm) object-cover shrink-0" loading="lazy" />
              ))}
              {pendingApproval.length > 8 && (
                <span className="size-16 rounded-(--nv-radius-sm) bg-surface-2 grid place-items-center text-xs text-ink-muted shrink-0">
                  +{pendingApproval.length - 8}
                </span>
              )}
            </div>
          )}
        </Card>
        <Card padding="lg" interactive onClick={() => navigate('/deals')} className="desktop:col-span-2">
          <div className="flex items-baseline justify-between">
            <CardHeader title="Deals" subtitle="Pipeline snapshot" />
            <Link to="/deals" className="text-sm font-medium text-brand-deep dark:text-brand hover:underline">Board →</Link>
          </div>
          <div className="grid gap-2 mt-2">
            <div className="flex items-center gap-2 text-sm text-ink-2">
              <Handshake className="size-4 text-ink-muted" aria-hidden />
              {openDeals.length} open deal{openDeals.length === 1 ? '' : 's'}
            </div>
            <p className="text-2xl font-display font-bold text-ink tabular-nums">{money(openDealValue)}<span className="text-xs font-body font-normal text-ink-muted"> open</span></p>
            <p className="text-lg font-display font-semibold text-success tabular-nums">{money(wonDealValue)}<span className="text-xs font-body font-normal text-ink-muted"> won</span></p>
          </div>
        </Card>
      </div>

      <TaskDetail taskId={openTaskId} onClose={() => setOpenTaskId(null)} />

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
          <TaskForm onSubmit={(v) => void createTask(v)} onCancel={() => setCreating(false)} />
        </div>
      </Modal>

      <Modal open={schedulingShoot} onClose={() => setSchedulingShoot(false)} title="Schedule a shoot" size="lg">
        <ShootForm
          onSubmit={(values) => { void addShoot(values); setSchedulingShoot(false) }}
          onCancel={() => setSchedulingShoot(false)}
        />
      </Modal>

    </div>
  )
}
