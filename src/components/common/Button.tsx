import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import clsx from 'clsx'
import { Loader2 } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
  iconRight?: ReactNode
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
}

const variants: Record<Variant, string> = {
  primary:
    'nv-gradient text-on-brand shadow-sm hover:shadow-md hover:brightness-105 active:brightness-95',
  secondary:
    'bg-surface text-ink border border-border shadow-sm hover:bg-surface-2 active:bg-surface-2',
  ghost: 'bg-transparent text-ink-muted hover:bg-surface-2 hover:text-ink',
  danger: 'bg-error text-white shadow-sm hover:brightness-110 active:brightness-95',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, iconRight, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center rounded-(--nv-radius-md) font-medium select-none',
        'transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none',
        sizes[size],
        variants[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
      {iconRight}
    </button>
  )
})
