import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Sparkles, X, ZoomIn, ZoomOut } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import type { Photo } from '../../types'
import { APPROVAL_STATUS_META } from '../../types'
import { Badge } from '../common/Badge'
import { Button } from '../common/Button'
import { formatBytes, formatDateTime } from '../../utils/format'
import { CommentThread } from '../common/CommentThread'
import { useData } from '../../store/data'

/** Full-screen lightbox: keyboard navigation, zoom toggle, metadata rail. */
export function PhotoViewer({ photos, index, onClose, onNavigate }: {
  photos: Photo[]
  index: number | null
  onClose: () => void
  onNavigate: (nextIndex: number) => void
}) {
  const photo = index === null ? null : photos[index]
  const [zoomed, setZoomed] = useState(false)
  const { comments, addComment, merchants, loadComments } = useData()
  const photoComments = photo ? comments.filter((c) => c.photoId === photo.id) : []
  const merchant = photo ? merchants.find((m) => m.id === photo.merchantId) : undefined

  useEffect(() => {
    if (photo) void loadComments({ photoId: photo.id })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo?.id])

  useEffect(() => setZoomed(false), [index])

  useEffect(() => {
    if (index === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' && index < photos.length - 1) onNavigate(index + 1)
      if (e.key === 'ArrowLeft' && index > 0) onNavigate(index - 1)
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [index, photos.length, onClose, onNavigate])

  return createPortal(
    <AnimatePresence>
      {photo && index !== null && (
        <motion.div
          className="fixed inset-0 z-50 bg-black/90 flex flex-col desktop:flex-row"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          {/* stage */}
          <div className="relative flex-1 flex items-center justify-center overflow-hidden min-h-0">
            <motion.img
              key={photo.id}
              src={photo.url}
              alt={photo.title ?? 'Photo'}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: zoomed ? 1.8 : 1 }}
              transition={{ duration: 0.25 }}
              onClick={() => setZoomed((z) => !z)}
              className="max-h-full max-w-full object-contain cursor-zoom-in select-none"
              style={{ cursor: zoomed ? 'zoom-out' : 'zoom-in' }}
              draggable={false}
            />
            <div className="absolute top-3 left-3 flex gap-2">
              <Button variant="secondary" size="sm" onClick={onClose} icon={<X className="size-4" />} aria-label="Close viewer" />
              <Button variant="secondary" size="sm" onClick={() => setZoomed((z) => !z)}
                icon={zoomed ? <ZoomOut className="size-4" /> : <ZoomIn className="size-4" />}
                aria-label={zoomed ? 'Zoom out' : 'Zoom in'} />
            </div>
            {index > 0 && (
              <Button variant="secondary" size="sm" className="absolute left-3 top-1/2 -translate-y-1/2"
                onClick={() => onNavigate(index - 1)} icon={<ChevronLeft className="size-4" />} aria-label="Previous photo" />
            )}
            {index < photos.length - 1 && (
              <Button variant="secondary" size="sm" className="absolute right-3 top-1/2 -translate-y-1/2"
                onClick={() => onNavigate(index + 1)} icon={<ChevronRight className="size-4" />} aria-label="Next photo" />
            )}
            <span className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs text-white/70 tabular-nums">
              {index + 1} / {photos.length}
            </span>
          </div>

          {/* metadata rail */}
          <aside className="bg-surface border-t desktop:border-t-0 desktop:border-l border-border w-full desktop:w-80 shrink-0 p-5 overflow-y-auto max-h-[45dvh] desktop:max-h-none">
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-display font-semibold text-ink">{photo.title ?? 'Untitled'}</h2>
              {photo.approvalStatus && (
                <Badge tone={APPROVAL_STATUS_META[photo.approvalStatus].tone}>
                  {APPROVAL_STATUS_META[photo.approvalStatus].label}
                </Badge>
              )}
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              {merchant && (
                <>
                  <dt className="text-ink-muted">Merchant</dt>
                  <dd className="text-ink">{merchant.name}{merchant.location && <span className="text-ink-muted"> · {merchant.location}</span>}</dd>
                </>
              )}
              {photo.widthPx && photo.heightPx && (
                <>
                  <dt className="text-ink-muted">Dimensions</dt>
                  <dd className="text-ink tabular-nums">{photo.widthPx} × {photo.heightPx}</dd>
                </>
              )}
              <dt className="text-ink-muted">Size</dt>
              <dd className="text-ink">{formatBytes(photo.sizeBytes)}</dd>
              {photo.capturedAt && (
                <>
                  <dt className="text-ink-muted">Captured</dt>
                  <dd className="text-ink">{formatDateTime(photo.capturedAt)}</dd>
                </>
              )}
              {photo.deviceModel && (
                <>
                  <dt className="text-ink-muted">Device</dt>
                  <dd className="text-ink">{photo.deviceModel}</dd>
                </>
              )}
              <dt className="text-ink-muted">Versions</dt>
              <dd className="text-ink tabular-nums">{photo.versionCount}</dd>
            </dl>

            {photo.tags.length > 0 && (
              <div className="mt-5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-2">Tags</h3>
                <div className="flex flex-wrap gap-1.5">
                  {photo.tags.map((t) => (
                    <Badge
                      key={t.id}
                      tone={t.source === 'ai' ? (t.aiStatus === 'suggested' ? 'warning' : 'brand') : 'neutral'}
                      icon={t.source === 'ai' ? <Sparkles className="size-3" aria-hidden /> : undefined}
                    >
                      {t.tag}
                      {t.source === 'ai' && t.aiStatus === 'suggested' && ' · suggested'}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 border-t border-border pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-3">
                Comments{photoComments.length > 0 && ` · ${photo.commentCount}`}
              </h3>
              <CommentThread comments={photoComments} onAdd={(body) => addComment({ photoId: photo.id }, body)} />
            </div>
          </aside>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
