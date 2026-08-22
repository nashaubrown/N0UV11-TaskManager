import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import clsx from 'clsx'

const fieldBase =
  'w-full rounded-(--nv-radius-md) border border-border bg-surface text-ink placeholder:text-ink-faint ' +
  'px-3.5 text-sm transition-colors focus:border-brand focus:outline-none disabled:opacity-50'

interface FieldWrapProps { label?: string; hint?: string; error?: string; id: string; children: ReactNode }

function FieldWrap({ label, hint, error, id, children }: FieldWrapProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-ink-2">{label}</label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-error">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-muted">{hint}</p>
      ) : null}
    </div>
  )
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string; hint?: string; error?: string; icon?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, icon, className, id: idProp, ...rest }, ref,
) {
  const autoId = useId()
  const id = idProp ?? autoId
  return (
    <FieldWrap label={label} hint={hint} error={error} id={id}>
      <div className="relative">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint [&>svg]:size-4">{icon}</span>}
        <input
          ref={ref}
          id={id}
          className={clsx(fieldBase, 'h-10', icon && 'pl-9', error && 'border-error', className)}
          {...rest}
        />
      </div>
    </FieldWrap>
  )
})

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string; hint?: string; error?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, className, id: idProp, rows = 3, ...rest }, ref,
) {
  const autoId = useId()
  const id = idProp ?? autoId
  return (
    <FieldWrap label={label} hint={hint} error={error} id={id}>
      <textarea ref={ref} id={id} rows={rows} className={clsx(fieldBase, 'py-2.5', error && 'border-error', className)} {...rest} />
    </FieldWrap>
  )
})

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string; hint?: string; error?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, className, id: idProp, children, ...rest }, ref,
) {
  const autoId = useId()
  const id = idProp ?? autoId
  return (
    <FieldWrap label={label} hint={hint} error={error} id={id}>
      <select ref={ref} id={id} className={clsx(fieldBase, 'h-10 appearance-none', error && 'border-error', className)} {...rest}>
        {children}
      </select>
    </FieldWrap>
  )
})
