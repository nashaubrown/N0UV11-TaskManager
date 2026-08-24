import { Check, Layers, Loader2, MessageSquare, Sparkles, Store } from 'lucide-react'
import clsx from 'clsx'
import { motion } from 'framer-motion'
import type { Photo } from '../../types'
import { APPROVAL_STATUS_META } from '../../types'
import { Badge } from '../common/Badge'
import { useData } from '../../store/data'

export function PhotoCard({ photo, selected, onOpen, onToggleSelect, onDragStartPhoto, onDragEndPhoto }: {
  photo: Photo
  selected?: boolean
  onOpen?: (photo: Photo) => void
  onToggleSelect?: (id: string) => void
  onDragStartPhoto?: (id: string) => void
  onDragEndPhoto?: () => void
}) {
  const approval = photo.approvalStatus ? APPROVAL_STATUS_META[photo.approvalStatus] : null
  const aiSuggested = photo.tags.some((t) => t.source === 'ai' && t.aiStatus === 'suggested')
  const merchant = useData((s) => s.merchants.find((m) => m.id === photo.merchantId))

  return (
    <motion.figure
      layout
      className={clsx(
        'group relative rounded-(--nv-radius-lg) overflow-hidden bg-surface-2 border shadow-sm cursor-pointer',
        selected ? 'border-brand ring-2 ring-brand/40' : 'border-border',
      )}
      whileHover={{ y: -2 }}
      onClick={() => onOpen?.(photo)}
      draggable={Boolean(onDragStartPhoto)}
      onDragStart={onDragStartPhoto ? () => onDragStartPhoto(photo.id) : undefined}
      onDragEnd={onDragEndPhoto}
    >
      <div className="aspect-[4/3] w-full overflow-hidden">
        <img
          src={photo.thumbUrl}
          alt={photo.title ?? 'Photo'}
          loading="lazy"
          className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
      </div>

      {/* top-left: selection checkbox */}
      {onToggleSelect && (
        <button
          aria-label={selected ? 'Deselect photo' : 'Select photo'}
          aria-pressed={selected}
          onClick={(e) => { e.stopPropagation(); onToggleSelect(photo.id) }}
          className={clsx(
            'absolute top-2 left-2 size-6 rounded-full border-2 flex items-center justify-center transition-all',
            selected
              ? 'nv-gradient border-transparent text-on-brand'
              : 'bg-black/30 border-white/70 text-transparent opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
          )}
        >
          <Check className="size-3.5" strokeWidth={3} />
        </button>
      )}

      {/* top-right: approval / processing */}
      <div className="absolute top-2 right-2 flex gap-1">
        {photo.status === 'processing' ? (
          <Badge tone="neutral" icon={<Loader2 className="size-3 animate-spin" aria-hidden />}>Processing</Badge>
        ) : approval ? (
          <Badge tone={approval.tone}>{approval.label}</Badge>
        ) : null}
      </div>

      {/* bottom scrim */}
      <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pt-8 pb-2.5">
        <p className="text-sm font-medium text-white truncate">{photo.title ?? 'Untitled'}</p>
        <div className="flex items-center gap-2.5 text-[11px] text-white/85 mt-0.5">
          {merchant && (
            <span className="inline-flex items-center gap-1 min-w-0">
              <Store className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{merchant.name}</span>
            </span>
          )}
          {photo.versionCount > 1 && (
            <span className="inline-flex items-center gap-1"><Layers className="size-3" aria-hidden />v{photo.versionCount}</span>
          )}
          {photo.commentCount > 0 && (
            <span className="inline-flex items-center gap-1"><MessageSquare className="size-3" aria-hidden />{photo.commentCount}</span>
          )}
          {aiSuggested && (
            <span className="inline-flex items-center gap-1"><Sparkles className="size-3" aria-hidden />AI tags</span>
          )}
        </div>
      </figcaption>
    </motion.figure>
  )
}
