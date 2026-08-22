import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import clsx from 'clsx'
import { Button } from './Button'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'full'
}

const sizes = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  full: 'max-w-[min(96vw,1200px)]',
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end tablet:items-center justify-center p-0 tablet:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 24, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className={clsx(
              'relative w-full bg-surface border border-border shadow-xl flex flex-col max-h-[92dvh]',
              'rounded-t-(--nv-radius-lg) tablet:rounded-(--nv-radius-lg)',
              sizes[size],
            )}
          >
            <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-border">
              <h2 className="font-display font-semibold text-lg text-ink">{title}</h2>
              <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close" icon={<X className="size-4" />} />
            </div>
            <div className="px-5 py-4 overflow-y-auto">{children}</div>
            {footer && <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
