import { useState, type FormEvent } from 'react'
import { MapPin, MessageSquare, Send } from 'lucide-react'
import type { CommentModel } from '../../types'
import { Avatar } from './Avatar'
import { Button } from './Button'
import { timeAgo } from '../../utils/format'

function CommentRow({ comment, nested }: { comment: CommentModel; nested?: boolean }) {
  return (
    <div className={nested ? 'ml-9 mt-3' : ''}>
      <div className="flex gap-2.5">
        {comment.author ? (
          <Avatar user={comment.author} size="sm" />
        ) : (
          <span className="size-8 rounded-full bg-surface-2 text-ink-muted text-xs font-semibold flex items-center justify-center shrink-0">
            {(comment.guestName ?? 'G')[0]}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-sm font-medium text-ink">
              {comment.author?.fullName ?? comment.guestName ?? 'Guest'}
            </span>
            <span className="text-xs text-ink-faint">{timeAgo(comment.createdAt)}</span>
            {comment.pinX !== undefined && (
              <span className="inline-flex items-center gap-0.5 text-xs text-brand-deep dark:text-brand">
                <MapPin className="size-3" aria-hidden /> pinned
              </span>
            )}
          </div>
          <p className="text-sm text-ink-2 mt-0.5 break-words">{comment.body}</p>
        </div>
      </div>
      {comment.replies?.map((r) => <CommentRow key={r.id} comment={r} nested />)}
    </div>
  )
}

export function CommentThread({ comments, onAdd, placeholder = 'Write a comment…' }: {
  comments: CommentModel[]
  onAdd: (body: string) => void
  placeholder?: string
}) {
  const [draft, setDraft] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const body = draft.trim()
    if (!body) return
    onAdd(body)
    setDraft('')
  }

  return (
    <div className="grid gap-4">
      {comments.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <MessageSquare className="size-4" aria-hidden /> No comments yet — start the thread.
        </p>
      ) : (
        <div className="grid gap-4">
          {comments.map((c) => <CommentRow key={c.id} comment={c} />)}
        </div>
      )}
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          aria-label="Add a comment"
          className="flex-1 h-10 rounded-(--nv-radius-md) border border-border bg-surface text-ink placeholder:text-ink-faint
                     px-3.5 text-sm transition-colors focus:border-brand focus:outline-none"
        />
        <Button type="submit" size="md" disabled={!draft.trim()} icon={<Send className="size-4" />} aria-label="Send comment" />
      </form>
    </div>
  )
}
