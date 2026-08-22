import type { ReactNode } from 'react'
import clsx from 'clsx'
import { motion } from 'framer-motion'

export interface TabItem<T extends string = string> {
  value: T
  label: ReactNode
  count?: number
}

export function Tabs<T extends string>({ items, value, onChange, className }: {
  items: TabItem<T>[]
  value: T
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div role="tablist" className={clsx('flex gap-1 border-b border-border overflow-x-auto', className)}>
      {items.map((item) => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={clsx(
              'relative px-3.5 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
              active ? 'text-ink' : 'text-ink-muted hover:text-ink',
            )}
          >
            <span className="inline-flex items-center gap-1.5">
              {item.label}
              {item.count !== undefined && (
                <span className={clsx(
                  'rounded-full px-1.5 py-px text-xs',
                  active ? 'nv-gradient text-on-brand' : 'bg-surface-2 text-ink-muted',
                )}>
                  {item.count}
                </span>
              )}
            </span>
            {active && (
              <motion.span
                layoutId="nv-tab-underline"
                className="absolute inset-x-2 -bottom-px h-0.5 rounded-full nv-gradient"
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
