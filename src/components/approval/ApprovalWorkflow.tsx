import { Check, Clock, MessageSquareWarning, X } from 'lucide-react'
import clsx from 'clsx'
import type { ApprovalRequest } from '../../types'
import { formatDate } from '../../utils/format'

/** Vertical stepper for a multi-step approval request. */
export function ApprovalWorkflow({ request }: { request: ApprovalRequest }) {
  return (
    <ol className="relative">
      {request.steps.map((step, i) => {
        const isLast = i === request.steps.length - 1
        const done = step.decidedAction === 'approve'
        const rejected = step.decidedAction === 'reject'
        const changes = step.decidedAction === 'request_changes'
        const current = !step.decidedAction && step.stepNo === request.currentStep

        return (
          <li key={step.stepNo} className="relative flex gap-3 pb-6 last:pb-0">
            {!isLast && (
              <span
                aria-hidden
                className={clsx('absolute left-[15px] top-8 bottom-0 w-px', done ? 'nv-gradient' : 'bg-border')}
              />
            )}
            <span
              className={clsx(
                'relative z-10 size-8 rounded-full flex items-center justify-center shrink-0 border-2',
                done && 'nv-gradient border-transparent text-on-brand',
                rejected && 'bg-error border-error text-white',
                changes && 'bg-warning-bg border-warning text-warning',
                current && 'bg-surface border-brand text-brand',
                !step.decidedAction && !current && 'bg-surface-2 border-border text-ink-faint',
              )}
            >
              {done ? <Check className="size-4" strokeWidth={3} />
                : rejected ? <X className="size-4" strokeWidth={3} />
                : changes ? <MessageSquareWarning className="size-4" />
                : <Clock className="size-4" />}
            </span>
            <div className="min-w-0 pt-1">
              <p className={clsx('text-sm font-medium', current ? 'text-ink' : 'text-ink-2')}>
                Step {step.stepNo} · {step.name}
                {current && <span className="ml-2 text-xs font-normal text-brand-deep dark:text-brand">← awaiting decision</span>}
              </p>
              <p className="text-xs text-ink-muted mt-0.5">
                {step.approver ? step.approver.fullName : 'Any approver'}
                {step.decidedAt && ` · ${formatDate(step.decidedAt)}`}
              </p>
              {step.feedback && <p className="text-sm text-ink-muted mt-1.5 bg-surface-2 rounded-(--nv-radius-md) px-3 py-2">{step.feedback}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
