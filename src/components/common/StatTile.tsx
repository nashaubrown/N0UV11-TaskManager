import type { ReactNode } from 'react'
import clsx from 'clsx'
import { Card } from './Card'

/** Dashboard stat tile: label · value · optional signed delta vs a named
 *  period · optional sparkline. Value/labels use text tokens, never series
 *  color; delta color = direction × whether up is good. */
export function StatTile({ label, value, delta, deltaGood, deltaPeriod = 'last week', icon, spark }: {
  label: string
  value: string
  delta?: number
  deltaGood?: boolean
  deltaPeriod?: string
  icon?: ReactNode
  spark?: number[]
}) {
  return (
    <Card padding="md" className="flex flex-col gap-1 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-ink-muted truncate">{label}</span>
        {icon && <span className="text-ink-faint [&>svg]:size-4 shrink-0">{icon}</span>}
      </div>
      <div className="flex items-end justify-between gap-3">
        <span className="text-[28px] leading-tight font-semibold text-ink">{value}</span>
        {spark && spark.length > 1 && <Sparkline points={spark} />}
      </div>
      {delta !== undefined && (
        <span className={clsx('text-xs font-medium', deltaGood ? 'text-success' : 'text-error')}>
          {delta >= 0 ? '+' : ''}{delta}% vs {deltaPeriod}
        </span>
      )}
    </Card>
  )
}

function Sparkline({ points }: { points: number[] }) {
  const w = 72, h = 28, pad = 2
  const min = Math.min(...points), max = Math.max(...points)
  const span = max - min || 1
  const step = (w - pad * 2) / (points.length - 1)
  const y = (v: number) => h - pad - ((v - min) / span) * (h - pad * 2)
  const d = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${(pad + i * step).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const last = points.length - 1
  return (
    <svg width={w} height={h} aria-hidden className="shrink-0">
      <path d={d} fill="none" stroke="var(--nv-ink-faint)" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx={pad + last * step} cy={y(points[last])} r="2.5" fill="var(--nv-chart-line)" />
    </svg>
  )
}
