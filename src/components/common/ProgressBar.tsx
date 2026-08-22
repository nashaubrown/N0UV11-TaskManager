import clsx from 'clsx'

export function ProgressBar({ value, max = 100, label, className }: {
  value: number; max?: number; label?: string; className?: string
}) {
  const pct = max === 0 ? 0 : Math.min(100, Math.round((value / max) * 100))
  return (
    <div className={clsx('flex items-center gap-2', className)}>
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemax={max}
        aria-label={label ?? 'Progress'}
        className="h-1.5 flex-1 rounded-full bg-surface-2 overflow-hidden"
      >
        <div className="h-full rounded-full nv-gradient transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
      {label && <span className="text-xs text-ink-muted tabular-nums shrink-0">{label}</span>}
    </div>
  )
}
