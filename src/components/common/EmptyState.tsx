import type { ReactNode } from 'react'

export function EmptyState({ icon, title, description, action }: {
  icon?: ReactNode; title: string; description?: string; action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      {icon && (
        <div className="mb-4 size-14 rounded-full nv-gradient-soft flex items-center justify-center text-brand-deep dark:text-brand [&>svg]:size-6">
          {icon}
        </div>
      )}
      <h3 className="font-display font-semibold text-ink">{title}</h3>
      {description && <p className="text-sm text-ink-muted mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
