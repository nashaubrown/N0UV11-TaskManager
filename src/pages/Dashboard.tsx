import { AlertTriangle, CheckCircle2, Clock, Image as ImageIcon } from 'lucide-react'
import { Card, CardHeader } from '../components/common/Card'
import { StatTile } from '../components/common/StatTile'
import { TrendChart } from '../components/common/TrendChart'
import { TaskCard } from '../components/task/TaskCard'
import { Badge } from '../components/common/Badge'
import { completionTrend, photos, tasks, currentUser } from '../mocks/data'
import { TASK_STATUS_META, type TaskStatus } from '../types'

const STATUS_ORDER: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'completed']

export default function Dashboard() {
  const open = tasks.filter((t) => !['completed', 'cancelled'].includes(t.status))
  const dueSoon = open
    .filter((t) => t.dueAt)
    .sort((a, b) => a.dueAt!.localeCompare(b.dueAt!))
    .slice(0, 3)
  const overdue = open.filter((t) => t.dueAt && new Date(t.dueAt) < new Date()).length
  const pendingApproval = photos.filter((p) => p.approvalStatus === 'in_review' || p.approvalStatus === 'pending').length
  const spark = completionTrend.slice(-12).map((d) => d.count)
  const counts = STATUS_ORDER.map((s) => ({ status: s, n: tasks.filter((t) => t.status === s).length }))
  const maxCount = Math.max(...counts.map((c) => c.n), 1)

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-display font-bold text-[28px] tablet:text-[32px] leading-tight text-ink">
          Good morning, {currentUser.fullName.split(' ')[0]}
        </h1>
        <p className="text-ink-muted mt-1">Here's what's moving across your projects today.</p>
      </div>

      <div className="grid grid-cols-2 desktop:grid-cols-4 gap-3">
        <StatTile label="Open tasks" value={String(open.length)} delta={12} deltaGood icon={<Clock />} spark={spark} />
        <StatTile label="Overdue" value={String(overdue)} delta={-25} deltaGood icon={<AlertTriangle />} />
        <StatTile label="Awaiting approval" value={String(pendingApproval)} icon={<CheckCircle2 />} />
        <StatTile label="Photos this week" value="38" delta={9} deltaGood icon={<ImageIcon />} />
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

      <section>
        <h2 className="font-display font-semibold text-lg text-ink mb-3">Due next</h2>
        <div className="grid tablet:grid-cols-3 gap-3">
          {dueSoon.map((t) => <TaskCard key={t.id} task={t} />)}
        </div>
      </section>
    </div>
  )
}
