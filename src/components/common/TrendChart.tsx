import { useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'

interface Point { date: string; count: number }

/** Single-series area/line trend (brand hue = the one series). Crosshair
 *  snaps to nearest X with a tooltip; grid and axes stay recessive; all
 *  text wears text tokens. */
export function TrendChart({ data, height = 200, ariaLabel }: {
  data: Point[]
  height?: number
  ariaLabel: string
}) {
  const ref = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  const W = 640, H = height
  const m = { top: 12, right: 12, bottom: 24, left: 30 }
  const iw = W - m.left - m.right, ih = H - m.top - m.bottom

  const { xs, ys, path, area, yTicks } = useMemo(() => {
    const max = Math.max(...data.map((d) => d.count), 1)
    const niceMax = Math.ceil(max / 2) * 2
    const step = iw / (data.length - 1)
    const xs = data.map((_, i) => m.left + i * step)
    const ys = data.map((d) => m.top + ih - (d.count / niceMax) * ih)
    const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')
    const area = `${path} L${xs[xs.length - 1].toFixed(1)},${m.top + ih} L${xs[0].toFixed(1)},${m.top + ih} Z`
    const yTicks = [0, niceMax / 2, niceMax]
    return { xs, ys, path, area, yTicks, niceMax }
  }, [data, ih, iw, m.left, m.top])

  const yFor = (v: number) => m.top + ih - (v / yTicks[2]) * ih

  const onMove = (e: React.PointerEvent) => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    const px = ((e.clientX - rect.left) / rect.width) * W
    let best = 0
    for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - px) < Math.abs(xs[best] - px)) best = i
    setHover(best)
  }

  return (
    <div className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={ariaLabel}
        className="w-full h-auto touch-none"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="nv-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--nv-chart-line)" stopOpacity="0.22" />
            <stop offset="1" stopColor="var(--nv-chart-line)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* recessive grid */}
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={m.left} x2={W - m.right} y1={yFor(t)} y2={yFor(t)} stroke="var(--nv-border)" strokeWidth="1" />
            <text x={m.left - 8} y={yFor(t) + 4} textAnchor="end" fontSize="11" fill="var(--nv-ink-faint)">{t}</text>
          </g>
        ))}
        {/* x labels: first, middle, last */}
        {[0, Math.floor(data.length / 2), data.length - 1].map((i, k) => (
          <text
            key={i}
            x={xs[i]}
            y={H - 6}
            textAnchor={k === 0 ? 'start' : k === 2 ? 'end' : 'middle'}
            fontSize="11"
            fill="var(--nv-ink-faint)"
          >
            {format(new Date(data[i].date), 'MMM d')}
          </text>
        ))}

        <path d={area} fill="url(#nv-trend-fill)" />
        <path d={path} fill="none" stroke="var(--nv-chart-line)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {hover !== null && (
          <g>
            <line x1={xs[hover]} x2={xs[hover]} y1={m.top} y2={m.top + ih} stroke="var(--nv-ink-faint)" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={xs[hover]} cy={ys[hover]} r="4" fill="var(--nv-chart-line)" stroke="var(--nv-surface)" strokeWidth="2" />
          </g>
        )}
      </svg>

      {hover !== null && (
        <div
          className="absolute pointer-events-none -translate-x-1/2 bg-surface border border-border rounded-(--nv-radius-md) shadow-md px-2.5 py-1.5 text-xs whitespace-nowrap"
          style={{ left: `${(xs[hover] / W) * 100}%`, top: 0 }}
        >
          <span className="font-semibold text-ink tabular-nums">{data[hover].count} completed</span>
          <span className="text-ink-muted"> · {format(new Date(data[hover].date), 'EEE, MMM d')}</span>
        </div>
      )}
    </div>
  )
}
