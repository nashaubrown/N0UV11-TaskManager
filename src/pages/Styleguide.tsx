import { useState } from 'react'
import { Plus, Search, Sparkles } from 'lucide-react'
import { Avatar, AvatarGroup } from '../components/common/Avatar'
import { Badge } from '../components/common/Badge'
import { Button } from '../components/common/Button'
import { Card, CardHeader } from '../components/common/Card'
import { EmptyState } from '../components/common/EmptyState'
import { Input, Select, Textarea } from '../components/common/Input'
import { Modal } from '../components/common/Modal'
import { ProgressBar } from '../components/common/ProgressBar'
import { StatTile } from '../components/common/StatTile'
import { Tabs } from '../components/common/Tabs'
import { TrendChart } from '../components/common/TrendChart'
import { TaskCard } from '../components/task/TaskCard'
import { PhotoCard } from '../components/photo/PhotoCard'
import { ApprovalWorkflow } from '../components/approval/ApprovalWorkflow'
import { approvals, completionTrend, photos, tasks, users } from '../mocks/data'
import { APPROVAL_STATUS_META, TASK_PRIORITY_META, TASK_STATUS_META } from '../types'

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3">
      <div>
        <h2 className="font-display font-semibold text-xl text-ink">{title}</h2>
        {note && <p className="text-sm text-ink-muted mt-0.5">{note}</p>}
      </div>
      {children}
    </section>
  )
}

const swatches = [
  ['Coral', 'var(--nv-coral)'], ['Deep red', 'var(--nv-deep-red)'],
  ['Bg', 'var(--nv-bg)'], ['Surface', 'var(--nv-surface)'], ['Surface 2', 'var(--nv-surface-2)'],
  ['Border', 'var(--nv-border)'], ['Ink', 'var(--nv-ink)'], ['Ink muted', 'var(--nv-ink-muted)'],
  ['Success', 'var(--nv-success)'], ['Warning', 'var(--nv-warning)'], ['Error', 'var(--nv-error)'], ['Info', 'var(--nv-info)'],
] as const

export default function Styleguide() {
  const [modalOpen, setModalOpen] = useState(false)
  const [tab, setTab] = useState('one')

  return (
    <div className="grid gap-10">
      <div>
        <h1 className="font-display font-bold text-[32px] leading-tight nv-gradient-text inline-block">NOUVII Styleguide</h1>
        <p className="text-ink-muted mt-1">Every component, every state — the living reference for the design system. Flip the theme toggle in the header to QA dark mode.</p>
      </div>

      <Section title="Color tokens" note="Defined in src/styles/tokens.css; dark values swap via [data-theme].">
        <div className="grid grid-cols-3 tablet:grid-cols-6 gap-3">
          {swatches.map(([name, v]) => (
            <div key={name} className="grid gap-1.5">
              <div className="h-14 rounded-(--nv-radius-md) border border-border" style={{ background: v }} />
              <span className="text-xs text-ink-muted">{name}</span>
            </div>
          ))}
          <div className="grid gap-1.5 col-span-2">
            <div className="h-14 rounded-(--nv-radius-md) nv-gradient" />
            <span className="text-xs text-ink-muted">Brand gradient</span>
          </div>
        </div>
      </Section>

      <Section title="Typography" note="Sora for display/headings, Inter for body.">
        <Card padding="lg" className="grid gap-3">
          <p className="font-display font-bold text-[32px] leading-[1.2]">Display / Sora Bold 32</p>
          <p className="font-display font-semibold text-2xl leading-[1.25]">Heading / Sora 600 24</p>
          <p className="font-display font-semibold text-lg leading-[1.3]">Subheading / Sora 600 18</p>
          <p className="text-base">Body / Inter 400 16 — The quick coral fox jumps over the lazy dog.</p>
          <p className="text-sm text-ink-muted">Caption / Inter 400 14 — secondary information and metadata.</p>
        </Card>
      </Section>

      <Section title="Buttons" note="4 variants × 3 sizes, plus loading & disabled.">
        <Card padding="lg" className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button loading>Saving…</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm" icon={<Plus className="size-4" />}>Small</Button>
          <Button size="lg" icon={<Sparkles className="size-4" />}>Large</Button>
        </Card>
      </Section>

      <Section title="Badges" note="Status & priority pills — text label always present, never color alone.">
        <Card padding="lg" className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            {Object.entries(TASK_STATUS_META).map(([k, v]) => <Badge key={k} tone={v.tone}>{v.label}</Badge>)}
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(TASK_PRIORITY_META).map(([k, v]) => <Badge key={k} tone={v.tone}>{v.label}</Badge>)}
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(APPROVAL_STATUS_META).map(([k, v]) => <Badge key={k} tone={v.tone}>{v.label}</Badge>)}
            <Badge tone="brand" icon={<Sparkles className="size-3" />}>AI suggested</Badge>
          </div>
        </Card>
      </Section>

      <Section title="Forms">
        <Card padding="lg" className="grid tablet:grid-cols-2 gap-4 max-w-2xl">
          <Input label="Text input" placeholder="Type something…" hint="With a hint underneath." />
          <Input label="With icon" placeholder="Search…" icon={<Search />} />
          <Input label="Error state" defaultValue="Bad value" error="This field has a problem." />
          <Select label="Select">
            <option>Option A</option>
            <option>Option B</option>
          </Select>
          <div className="tablet:col-span-2">
            <Textarea label="Textarea" placeholder="Longer content…" />
          </div>
        </Card>
      </Section>

      <Section title="Avatars">
        <Card padding="lg" className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            {(['xs', 'sm', 'md', 'lg'] as const).map((s) => <Avatar key={s} user={users[0]} size={s} />)}
          </div>
          <AvatarGroup users={users} max={3} />
        </Card>
      </Section>

      <Section title="Tabs, progress, modal">
        <Card padding="lg" className="grid gap-5">
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { value: 'one', label: 'First', count: 8 },
              { value: 'two', label: 'Second', count: 3 },
              { value: 'three', label: 'Third' },
            ]}
          />
          <ProgressBar value={9} max={14} label="9/14 tasks" className="max-w-sm" />
          <div><Button variant="secondary" onClick={() => setModalOpen(true)}>Open modal</Button></div>
        </Card>
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Example modal"
          footer={<>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={() => setModalOpen(false)}>Confirm</Button>
          </>}
        >
          <p className="text-sm text-ink-muted">Bottom-sheet on mobile, centered dialog on tablet+. Escape and backdrop-click both close it.</p>
        </Modal>
      </Section>

      <Section title="Stat tiles & trend chart" note="Single-series trend in the brand hue; crosshair tooltip on hover; labels wear text tokens.">
        <div className="grid grid-cols-2 desktop:grid-cols-4 gap-3">
          <StatTile label="Open tasks" value="24" delta={12} deltaGood spark={completionTrend.map((d) => d.count)} />
          <StatTile label="Overdue" value="3" delta={-25} deltaGood />
          <StatTile label="Awaiting approval" value="6" />
          <StatTile label="Photos this week" value="38" delta={9} deltaGood />
        </div>
        <Card padding="lg">
          <CardHeader title="Tasks completed" subtitle="Trailing 14 days" />
          <TrendChart data={completionTrend} ariaLabel="Example trend chart" />
        </Card>
      </Section>

      <Section title="Task cards" note="Status, priority, labels, due state, sub-task & comment counts, assignees.">
        <div className="grid tablet:grid-cols-2 gap-3">
          {tasks.slice(0, 4).map((t) => <TaskCard key={t.id} task={t} />)}
        </div>
      </Section>

      <Section title="Photo cards" note="Hover to reveal selection; approval status pinned top-right.">
        <div className="grid grid-cols-2 tablet:grid-cols-4 gap-3">
          {photos.slice(0, 4).map((p) => <PhotoCard key={p.id} photo={p} />)}
        </div>
      </Section>

      <Section title="Approval workflow" note="Vertical stepper; gradient marks completed steps.">
        <Card padding="lg" className="max-w-md">
          <ApprovalWorkflow request={approvals[0]} />
        </Card>
      </Section>

      <Section title="Empty state">
        <Card>
          <EmptyState
            icon={<Search />}
            title="Nothing matches your filters"
            description="Try broadening the search or clearing a filter."
            action={<Button variant="secondary" size="sm">Clear filters</Button>}
          />
        </Card>
      </Section>
    </div>
  )
}
