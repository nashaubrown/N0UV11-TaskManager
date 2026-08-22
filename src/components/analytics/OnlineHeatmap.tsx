import { useMemo } from 'react'
import { Clock } from 'lucide-react'
import { Badge } from '../common/Badge'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Day × hour heatmap of audience activity, with the top posting slots
 *  called out. Intensity rides the brand coral. */
export function OnlineHeatmap({ data }: { data: { dow: number; hour: number; value: number }[] }) {
  const { grid, max, top } = useMemo(() => {
    const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0))
    for (const d of data) if (d.dow >= 0 && d.dow < 7 && d.hour >= 0 && d.hour < 24) grid[d.dow][d.hour] = d.value
    const max = Math.max(...grid.flat(), 0.001)
    const top = [...data]
      .sort((a, b) => b.value - a.value)
      .filter((d, i, arr) => arr.findIndex((x) => x.dow === d.dow && Math.abs(x.hour - d.hour) <= 1) === i)
      .slice(0, 3)
    return { grid, max, top }
  }, [data])

  if (data.length === 0) {
    return (
      <p className="text-sm text-ink-muted py-6 text-center">
        No audience data yet. Instagram shares online times once the account has 100+ followers and a sync has run.
      </p>
    )
  }

  const fmtHour = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? 'am' : 'pm'}`

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-sm text-ink-muted">
          <Clock className="size-4" aria-hidden /> Best times to post:
        </span>
        {top.map((t) => (
          <Badge key={`${t.dow}-${t.hour}`} tone="brand">{DAYS[t.dow]} {fmtHour(t.hour)}</Badge>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0.5" role="img" aria-label="Audience online activity by day and hour">
          <thead>
            <tr>
              <th className="w-9" />
              {Array.from({ length: 24 }, (_, h) => (
                <th key={h} className="text-[9px] font-normal text-ink-faint text-center min-w-4 pb-0.5">
                  {h % 3 === 0 ? fmtHour(h).replace('am', '').replace('pm', h < 12 ? 'a' : 'p') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, dow) => (
              <tr key={dow}>
                <td className="text-[10px] text-ink-muted pr-1.5 text-right">{DAYS[dow]}</td>
                {row.map((v, hour) => (
                  <td
                    key={hour}
                    className="size-4 rounded-[3px]"
                    style={{ backgroundColor: `color-mix(in oklab, var(--nv-coral) ${Math.round((v / max) * 88)}%, var(--nv-surface-2))` }}
                    title={`${DAYS[dow]} ${fmtHour(hour)}`}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
