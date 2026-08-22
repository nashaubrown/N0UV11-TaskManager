import clsx from 'clsx'
import type { User } from '../../types'
import { initials } from '../../utils/format'

type Size = 'xs' | 'sm' | 'md' | 'lg'
const sizes: Record<Size, string> = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-14 text-lg',
}

/* Deterministic accent per user so avatars are stable across renders. */
const accents = ['#FF6B5B', '#C41E3A', '#0066D6', '#1E9E46', '#B96A00', '#7A5AF8']
const accentFor = (id: string) =>
  accents[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % accents.length]

export function Avatar({ user, size = 'md', className }: { user: User; size?: Size; className?: string }) {
  return user.avatarUrl ? (
    <img
      src={user.avatarUrl}
      alt={user.fullName}
      title={user.fullName}
      className={clsx('rounded-full object-cover shrink-0', sizes[size], className)}
    />
  ) : (
    <span
      title={user.fullName}
      aria-label={user.fullName}
      style={{ backgroundColor: accentFor(user.id) }}
      className={clsx(
        'rounded-full inline-flex items-center justify-center font-semibold text-white shrink-0',
        sizes[size],
        className,
      )}
    >
      {initials(user.fullName)}
    </span>
  )
}

export function AvatarGroup({ users, max = 3, size = 'sm' }: { users: User[]; max?: number; size?: Size }) {
  const shown = users.slice(0, max)
  const extra = users.length - shown.length
  return (
    <div className="flex -space-x-2">
      {shown.map((u) => (
        <Avatar key={u.id} user={u} size={size} className="ring-2 ring-surface" />
      ))}
      {extra > 0 && (
        <span
          className={clsx(
            'rounded-full inline-flex items-center justify-center font-medium bg-surface-2 text-ink-muted ring-2 ring-surface',
            sizes[size],
          )}
        >
          +{extra}
        </span>
      )}
    </div>
  )
}
