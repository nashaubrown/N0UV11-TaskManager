import type { HTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md' | 'lg'
  interactive?: boolean
}

const pads = { none: '', sm: 'p-3', md: 'p-4', lg: 'p-6' }

export function Card({ padding = 'md', interactive, className, ...rest }: CardProps) {
  return (
    <div
      className={clsx(
        'bg-surface nv-glass border border-border rounded-(--nv-radius-lg) shadow-sm',
        interactive &&
          'transition-all duration-200 hover:shadow-md hover:-translate-y-px cursor-pointer',
        pads[padding],
        className,
      )}
      {...rest}
    />
  )
}

export function CardHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-3">
      <div className="min-w-0">
        <h3 className="font-display font-semibold text-lg text-ink truncate">{title}</h3>
        {subtitle && <p className="text-sm text-ink-muted mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}
