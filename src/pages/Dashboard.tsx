import { AlertTriangle, CalendarDays, CheckCircle2, Clock, Handshake, Image as ImageIcon, MapPin } from 'lucide-react'
import { Card, CardHeader } from '../components/common/Card'
import { StatTile } from '../components/common/StatTile'
import { TrendChart } from '../components/common/TrendChart'
import { TaskCard } from '../components/task/TaskCard'
import { Badge } from '../components/common/Badge'
import { useState } from 'react'
import { useAuth } from '../store/auth'
import { useData } from '../store/data'
import { TaskDetail } from '../components/task/TaskDetail'
import { SHOOT_STATUS_META, TASK_STATUS_META, shootDisplayStatus, type TaskStatus } from '../types'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'

const STATUS_ORDER: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'completed']

export default function Dashboard() {
  const { tasks, photos, shoots, deals } = useData()
  const user = useAuth((s) => s.user)
  // completions per day, trailing 14 days, from live data
  const completionTrend = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (13 - i))
    const next = new Date(d); next.setDate(d.getDate() + 1)
    return {
      date: d.toISOString(),
      count: tasks.filter((t) => t.completedAt && new Date(t.completedAt) >= d && new Date(t.completedAt) < next).length,
    }
  })
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const open = tasks.filter((t) => !['completed', 'cancelled'].includes(t.status))
  const dueSoon = open
    .filter((t) => t.dueAt)
    .sort((a, b) => a.dueAt!.localeCompare(b.dueAt!))
    .slice(0, 3)
  const overdue = open.filter((t) => t.dueAt && new Date(t.dueAt) < new Date()).length
  const pendingApproval = photos.filter((p) => p.approvalStatus === 'in_review' || p.approvalStatus === 'pending').length
  const spark = completionTrend.slice(-12).map((d) => d.count)
  const weekAgo = Date.now() - 7 * 86_400_000
  const twoWeeksAgo = Date.now() - 14 * 86_400_000
  const photosThisWeek = photos.filter((p) => new Date(p.createdAt).getTime() >= weekAgo).length
  const photosLastWeek = photos.filter((p) => {
    const t = new Date(p.createdAt).getTime()
    return t >= twoWeeksAgo && t < weekAgo
  }).length
  const photosDelta = photosLastWeek > 0 ? Math.round(((photosThisWeek - photosLastWeek) / photosLastWeek) * 100) : undefined

  const nextShoots = shoots
    .filter((sh) => sh.status !== 'cancelled' && sh.status !== 'completed' && new Date(sh.endsAt) >= new Date())
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, 3)
  const openDeals = deals.filter((d) => !['closed_won', 'closed_lost'].includes(d.stage))
  const openDealValue = openDeals.reduce((n, d) => n + (d.valueCents ?? 0), 0)
  const wonDealValue = deals.filter((d) => d.stage === 'closed_won').reduce((n, d) => n + (d.valueCents ?? 0), 0)
  const money = (cents: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100)

  const counts = STATUS_ORDER.map((s) => ({ status: s, n: tasks.filter((t) => t.status === s).length }))
  const maxCount = Math.max(...counts.map((c) => c.n), 1)

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-display font-bold text-[28px] tablet:text-[32px] leading-tight text-ink">
          Good morning, {(user?.fullName ?? 'there').split(' ')[0]}
        </h1>
        <p className="text-ink-muted mt-1">Here's what's moving across your projects today.</p>
      </div>

      <div className="grid grid-cols-2 desktop:grid-cols-4 gap-3">
        <StatTile label="Open tasks" value={String(open.length)} icon={<Clock />} spark={spark} />
        <StatTile label="Overdue" value={String(overdue)} icon={<AlertTriangle />} />
        <StatTile label="Awaiting approval" value={String(pendingApproval)} icon={<CheckCircle2 />} />
        <StatTile label="Photos this week" value={String(photosThisWeek)} delta={photosDelta} deltaGood icon={<ImageIcon />} />
      </div>

      <div className="grid desktop:grid-cols-5 gap-6">
        <Card padding="lg" className="desktop:col-span-3">
          <CardHeader title="Tasks completed" subtitle="Trailing 14 days" />
          <TrendChart data={completionTrend} ariaLabel="Tasks completed per day over the last 14 days" />
        </Card>

        <Card padding="lg" className="desktop:col-span-2">
          <CardHeader title="Pipeline" subtitle="Tasks by status" />
          <ul className="grid gap-3 mt-1">
            {counts.map(({ status, n }) => (
              <li key={status} className="grid gap-1">
                <div className="flex items-center justify-between text-sm">
                  <Badge tone={TASK_STATUS_META[status].tone}>{TASK_STATUS_META[status].label}</Badge>
                  <span className="text-ink font-medium tabular-nums">{n}</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden" aria-hidden>
                  <div className="h-full rounded-full nv-gradient" style={{ width: `${(n / maxCount) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid desktop:grid-cols-5 gap-6">
        <Card padding="lg" className="desktop:col-span-3">
          <div className="flex items-baseline justify-between">
            <CardHeader title="Next shoots" subtitle="From the photoshoot calendar" />
            <Link to="/calendar" className="text-sm font-medium text-brand-deep dark:text-brand hover:underline">Calendar →</Link>
          </div>
          {nextShoots.length === 0 ? (
            <p className="text-sm text-ink-muted mt-2">Nothing scheduled — plan one from the Calendar.</p>
          ) : (
            <ul className="grid gap-2 mt-2">
              {nextShoots.map((sh) => {
                const display = shootDisplayStatus(sh)
                return (
                  <li key={sh.id} className="flex items-center gap-3 rounded-(--nv-radius-md) border border-border p-2.5">
                    <CalendarDays className="size-4 text-ink-muted shrink-0" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink truncate">{sh.title}</p>
                      <p className="text-xs text-ink-muted">
                        {format(new Date(sh.startsAt), 'EEE d MMM · HH:mm')}
                        {sh.location && <span className="inline-flex items-center gap-1 ml-2"><MapPin className="size-3" aria-hidden />{sh.location}</span>}
                      </p>
                    </div>
                    <Badge tone={SHOOT_STATUS_META[display].tone}>{SHOOT_STATUS_META[display].label}</Badge>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
        <Card padding="lg" className="desktop:col-span-2">
          <div className="flex items-baseline justify-between">
            <CardHeader title="Deals" subtitle="Pipeline snapshot" />
            <Link to="/deals" className="text-sm font-medium text-brand-deep dark:text-brand hover:underline">Board →</Link>
          </div>
          <div className="grid gap-3 mt-2">
            <div className="flex items-center gap-3">
              <Handshake className="size-4 text-ink-muted" aria-hidden />
              <span className="text-sm text-ink-2">{openDeals.length} open deal{openDeals.length === 1 ? '' : 's'}</span>
            </div>
            <div>
              <p className="text-2xl font-display font-bold text-ink tabular-nums">{money(openDealValue)}</p>
              <p className="text-xs text-ink-muted">in the open pipeline</p>
            </div>
            <div>
              <p className="text-lg font-display font-semibold text-success tabular-nums">{money(wonDealValue)}</p>
              <p className="text-xs text-ink-muted">closed won</p>
            </div>
          </div>
        </Card>
      </div>

      <section>
        <h2 className="font-display font-semibold text-lg text-ink mb-3">Due next</h2>
        <div className="grid tablet:grid-cols-3 gap-3">
          {dueSoon.map((t) => <TaskCard key={t.id} task={t} onClick={() => setOpenTaskId(t.id)} />)}
        </div>
      </section>

      <TaskDetail taskId={openTaskId} onClose={() => setOpenTaskId(null)} />
    </div>
  )
}
