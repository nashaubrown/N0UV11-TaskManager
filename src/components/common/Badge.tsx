import type { ReactNode } from 'react'
import clsx from 'clsx'
import type { Tone } from '../../types'

export interface BadgeProps {
  tone?: Tone
  children: ReactNode
  icon?: ReactNode
  className?: string
}

const tones: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-ink-muted',
  info: 'bg-info-bg text-info',
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  error: 'bg-error-bg text-error',
  brand: 'nv-gradient-soft text-brand-deep dark:text-brand',
}

/** Status/priority pill. Semantic tones always ship with a text label —
 *  never color alone. */
export function Badge({ tone = 'neutral', icon, children, className }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  )
}
