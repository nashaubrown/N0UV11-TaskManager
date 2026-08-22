import { useEffect, useMemo, useState } from 'react'
import { Check, MessageSquare, Pencil, Send, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import { apiOrigin, absoluteUrl, DEMO } from '../services/api'
import { Badge } from '../components/common/Badge'
import { Button } from '../components/common/Button'
import { Input } from '../components/common/Input'
import { APPROVAL_STATUS_META, type ApprovalStatus } from '../types'
import { photos as demoPhotos, projects as demoProjects } from '../mocks/data'

/* Public client review portal — no login, reached via a signed share link.
 * Fetches its own data (never the authed store). */

interface PortalComment { id: string; author: string; isGuest: boolean; body: string; replies?: PortalComment[] }
interface PortalPhoto {
  id: string
  title?: string
  url: string
  thumbUrl: string
  approvalStatus: ApprovalStatus
  comments: PortalComment[]
}
interface PortalFeed {
  merchant: { name: string; igHandle?: string; bio?: string; location?: string; logoUrl?: string }
  items: { photoId: string; thumbUrl: string; url: string }[]
}

interface PortalData {
  feeds?: PortalFeed[]
  organization: string
  project: { name: string; description?: string }
  label?: string
  canComment: boolean
  canApprove: boolean
  photos: PortalPhoto[]
}

const demoData = (): PortalData => ({
  organization: 'NOUVII Studio',
  project: { name: demoProjects[0].name, description: demoProjects[0].description },
  label: 'Café Aroma (demo)',
  canComment: true,
  canApprove: true,
  photos: demoPhotos
    .filter((p) => p.projectId === 'p1' && p.status === 'ready')
    .map((p) => ({
      id: p.id,
      title: p.title,
      url: p.url,
      thumbUrl: p.thumbUrl,
      approvalStatus: p.approvalStatus ?? 'pending',
      comments: [],
    })),
})

export default function Portal({ token }: { token: string }) {
  const [data, setData] = useState<PortalData | null>(null)
  const [error, setError] = useState<string>()
  const [openId, setOpenId] = useState<string | null>(null)
  const [guestName, setGuestName] = useState(() => {
    try { return localStorage.getItem('nv.guestName') ?? '' } catch { return '' }
  })
  const [draft, setDraft] = useState('')
  const [feedbackFor, setFeedbackFor] = useState<{ photoId: string; action: 'reject' | 'request_changes' } | null>(null)
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    if (DEMO) { setData(demoData()); return }
    fetch(`${apiOrigin}/api/portal/${token}`)
      .then(async (res) => {
        const body = await res.json()
        if (!res.ok) throw new Error(body?.error?.message ?? 'This review link is not available')
        setData({
          ...body,
          photos: body.photos.map((p: PortalPhoto) => ({ ...p, url: absoluteUrl(p.url), thumbUrl: absoluteUrl(p.thumbUrl) })),
          feeds: (body.feeds ?? []).map((f: PortalFeed) => ({
            ...f,
            items: f.items.map((i) => ({ ...i, url: absoluteUrl(i.url), thumbUrl: absoluteUrl(i.thumbUrl) })),
          })),
        })
      })
      .catch((e) => setError(e.message))
  }, [token])

  const open = useMemo(() => data?.photos.find((p) => p.id === openId) ?? null, [data, openId])

  const rememberName = (name: string) => {
    setGuestName(name)
    try { localStorage.setItem('nv.guestName', name) } catch { /* fine */ }
  }

  const patchPhoto = (photoId: string, patch: Partial<PortalPhoto>) =>
    setData((d) => d && { ...d, photos: d.photos.map((p) => (p.id === photoId ? { ...p, ...patch } : p)) })

  const decide = async (photoId: string, action: 'approve' | 'reject' | 'request_changes', fb?: string) => {
    if (!guestName.trim()) return setError('Add your name first so the team knows who reviewed.')
    setError(undefined)
    const optimistic: ApprovalStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'changes_requested'
    if (DEMO) return patchPhoto(photoId, { approvalStatus: optimistic })
    const res = await fetch(`${apiOrigin}/api/portal/${token}/photos/${photoId}/decisions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, guestName: guestName.trim(), feedback: fb || undefined }),
    })
    const body = await res.json()
    if (!res.ok) return setError(body?.error?.message ?? 'Could not save your review')
    patchPhoto(photoId, { approvalStatus: body.approvalStatus })
  }

  const comment = async (photoId: string) => {
    const body = draft.trim()
    if (!body) return
    if (!guestName.trim()) return setError('Add your name first so the team knows who commented.')
    setError(undefined)
    if (DEMO) {
      patchPhoto(photoId, { comments: [...(open?.comments ?? []), { id: `${Date.now()}`, author: `${guestName} (client)`, isGuest: true, body }] })
      setDraft('')
      return
    }
    const res = await fetch(`${apiOrigin}/api/portal/${token}/photos/${photoId}/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ guestName: guestName.trim(), body }),
    })
    const saved = await res.json()
    if (!res.ok) return setError(saved?.error?.message ?? 'Could not post your comment')
    patchPhoto(photoId, { comments: [...(data!.photos.find((p) => p.id === photoId)!.comments), { id: saved.id, author: saved.author, isGuest: true, body: saved.body }] })
    setDraft('')
  }

  if (error && !data) {
    return (
      <div className="min-h-dvh bg-canvas flex flex-col items-center justify-center gap-3 p-6 text-center">
        <span className="font-display font-bold text-2xl nv-gradient-text">NOUVII</span>
        <p className="text-ink">{error}</p>
        <p className="text-sm text-ink-muted">Ask the studio for a fresh review link.</p>
      </div>
    )
  }
  if (!data) {
    return (
      <div className="min-h-dvh bg-canvas flex items-center justify-center" role="status" aria-label="Loading">
        <span className="size-8 rounded-full border-2 border-border border-t-(--nv-coral) animate-spin" />
      </div>
    )
  }

  const decided = data.photos.filter((p) => ['approved', 'rejected'].includes(p.approvalStatus)).length

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="nv-gradient text-on-brand">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <p className="text-sm text-white/75 font-medium">{data.organization} · photo review</p>
          <h1 className="font-display font-bold text-3xl text-balance mt-1">{data.project.name}</h1>
          {data.project.description && <p className="text-white/85 mt-1">{data.project.description}</p>}
          <p className="text-sm text-white/75 mt-3 tabular-nums">
            {decided}/{data.photos.length} photos reviewed
            {data.label && <> · prepared for <span className="font-medium text-white">{data.label}</span></>}
          </p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 grid gap-4">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="max-w-xs flex-1 min-w-52">
            <Input
              label="Your name"
              placeholder="So the team knows who reviewed"
              value={guestName}
              onChange={(e) => rememberName(e.target.value)}
            />
          </div>
          {error && <p role="alert" className="text-sm text-error pb-2">{error}</p>}
        </div>

        <div className="grid grid-cols-2 tablet:grid-cols-3 gap-3">
          {data.photos.map((p) => {
            const meta = APPROVAL_STATUS_META[p.approvalStatus]
            return (
              <button
                key={p.id}
                onClick={() => setOpenId(p.id)}
                className="group relative aspect-[4/3] rounded-(--nv-radius-lg) overflow-hidden bg-surface-2 text-left
                           focus-visible:outline-2 focus-visible:outline-brand"
              >
                <img src={p.thumbUrl} alt={p.title ?? 'Photo'} className="absolute inset-0 size-full object-cover transition-transform group-hover:scale-[1.03]" />
                <span className="absolute top-2 right-2"><Badge tone={meta.tone}>{meta.label}</Badge></span>
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2.5 pt-8">
                  <span className="block text-sm font-medium text-white truncate">{p.title ?? 'Untitled'}</span>
                  {p.comments.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-white/85">
                      <MessageSquare className="size-3" aria-hidden /> {p.comments.length}
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
        {(data.feeds?.length ?? 0) > 0 && (
          <section className="grid gap-4 mt-6">
            <div>
              <h2 className="font-display font-semibold text-xl text-ink">How your feed will look</h2>
              <p className="text-sm text-ink-muted">Approved photos, laid out in posting order.</p>
            </div>
            <div className="flex flex-wrap gap-6 justify-center tablet:justify-start">
              {data.feeds!.map((f) => (
                <div key={f.merchant.name} className="w-[360px] max-w-full rounded-[44px] border-[10px] border-ink bg-black shadow-xl overflow-hidden">
                  <div className="bg-white">
                    <div className="h-8 flex items-center justify-center"><div className="w-24 h-5 rounded-full bg-black" /></div>
                    <div className="px-3 py-2 flex items-center gap-4">
                      <div className="size-12 rounded-full nv-gradient flex items-center justify-center text-white font-display font-bold">
                        {f.merchant.name[0]}
                      </div>
                      <div>
                        <p className="text-[13px] font-semibold text-neutral-900">{f.merchant.igHandle ?? f.merchant.name}</p>
                        <p className="text-[12px] text-neutral-500">{f.items.length} planned posts</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-px">
                      {f.items.map((i) => (
                        <div key={i.photoId} className="relative aspect-[3/4] bg-neutral-200">
                          <img src={i.thumbUrl} alt="" className="absolute inset-0 size-full object-cover" />
                        </div>
                      ))}
                    </div>
                    <div className="h-4" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* review modal */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
            onClick={() => setOpenId(null)}
          >
            <motion.div
              initial={{ scale: 0.96, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 10 }}
              className="bg-surface rounded-(--nv-radius-lg) shadow-xl max-w-3xl w-full max-h-[92dvh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-label={open.title ?? 'Photo review'}
            >
              <img src={open.url} alt={open.title ?? 'Photo'} className="w-full max-h-[50dvh] object-contain bg-black/5" />
              <div className="p-4 grid gap-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-display font-semibold text-lg text-ink flex-1 min-w-40">{open.title ?? 'Untitled'}</h2>
                  <Badge tone={APPROVAL_STATUS_META[open.approvalStatus].tone}>
                    {APPROVAL_STATUS_META[open.approvalStatus].label}
                  </Badge>
                </div>

                {data.canApprove && !['approved', 'rejected'].includes(open.approvalStatus) && (
                  feedbackFor?.photoId === open.id ? (
                    <div className="grid gap-2">
                      <Input
                        label={feedbackFor.action === 'reject' ? 'Why is this rejected?' : 'What should change?'}
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => { void decide(open.id, feedbackFor.action, feedback); setFeedbackFor(null); setFeedback('') }}>
                          Send
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setFeedbackFor(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" icon={<Check className="size-4" />} onClick={() => void decide(open.id, 'approve')}>
                        Approve
                      </Button>
                      <Button size="sm" variant="secondary" icon={<Pencil className="size-4" />}
                              onClick={() => setFeedbackFor({ photoId: open.id, action: 'request_changes' })}>
                        Request changes
                      </Button>
                      <Button size="sm" variant="danger" icon={<X className="size-4" />}
                              onClick={() => setFeedbackFor({ photoId: open.id, action: 'reject' })}>
                        Reject
                      </Button>
                    </div>
                  )
                )}

                <div className="border-t border-border pt-3 grid gap-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Comments</h3>
                  {open.comments.length === 0 && <p className="text-sm text-ink-muted">No comments yet.</p>}
                  {open.comments.map((c) => (
                    <div key={c.id} className="grid gap-1">
                      <p className="text-sm">
                        <span className={clsx('font-medium', c.isGuest ? 'text-brand-deep dark:text-brand' : 'text-ink')}>{c.author}</span>
                        <span className="text-ink-2"> — {c.body}</span>
                      </p>
                      {c.replies?.map((r) => (
                        <p key={r.id} className="text-sm ml-4">
                          <span className="font-medium text-ink">{r.author}</span>
                          <span className="text-ink-2"> — {r.body}</span>
                        </p>
                      ))}
                    </div>
                  ))}
                  {data.canComment && (
                    <form
                      className="flex gap-2"
                      onSubmit={(e) => { e.preventDefault(); void comment(open.id) }}
                    >
                      <input
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder="Write a comment…"
                        aria-label="Add a comment"
                        className="flex-1 h-10 rounded-(--nv-radius-md) border border-border bg-surface text-ink placeholder:text-ink-faint
                                   px-3.5 text-sm transition-colors focus:border-brand focus:outline-none"
                      />
                      <Button type="submit" size="md" disabled={!draft.trim()} icon={<Send className="size-4" />} aria-label="Send comment" />
                    </form>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="max-w-5xl mx-auto px-4 pb-8 text-center text-xs text-ink-faint">
        Powered by NOUVII
      </footer>
    </div>
  )
}
