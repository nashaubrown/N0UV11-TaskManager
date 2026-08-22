import { useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Camera, CloudOff, Download, ImagePlus, LayoutGrid, Rows3, Search,
  SlidersHorizontal, Sparkles, Store, Trash2, Upload, X,
} from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { Button } from '../components/common/Button'
import { PhotoGallery } from '../components/photo/PhotoGallery'
import { PhotoViewer } from '../components/photo/PhotoViewer'
import { EmptyState } from '../components/common/EmptyState'
import { useData } from '../store/data'
import { useUi } from '../store/ui'
import type { ApprovalStatus, Photo } from '../types'

type StatusKey = 'needs_review' | 'approved' | 'rejected'

const STATUS_MATCH: Record<StatusKey, ApprovalStatus[]> = {
  needs_review: ['pending', 'in_review', 'changes_requested'],
  approved: ['approved'],
  rejected: ['rejected'],
}
const STATUS_LABEL: Record<StatusKey, string> = {
  needs_review: 'Needs review',
  approved: 'Approved',
  rejected: 'Rejected',
}

function FilterCheck({ checked, onChange, children, count }: {
  checked: boolean
  onChange: () => void
  children: ReactNode
  count?: number
}) {
  return (
    <label className="flex items-center gap-2.5 py-1 px-1 rounded-md text-sm text-ink-2 cursor-pointer hover:bg-surface-2 transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="size-4 rounded accent-(--nv-coral) shrink-0"
      />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {count !== undefined && <span className="text-xs text-ink-faint tabular-nums">{count}</span>}
    </label>
  )
}

export default function PhotoLibrary() {
  const { photos, merchants, addPhotos, pendingUploads } = useData()
  const [searchParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [merchantSel, setMerchantSel] = useState<Set<string>>(() => {
    const m = searchParams.get('merchantId')
    return new Set(m ? [m] : [])
  })
  const [statusSel, setStatusSel] = useState<Set<StatusKey>>(new Set())
  const [aiOnly, setAiOnly] = useState(false)
  const [grouped, setGrouped] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const { selectedPhotoIds, clearPhotoSelection } = useUi()

  const merchantName = (id?: string) => merchants.find((m) => m.id === id)?.name

  const toggle = <T,>(set: Set<T>, v: T): Set<T> => {
    const next = new Set(set)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    return next
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return photos.filter((p) => {
      const statusOk =
        statusSel.size === 0 ||
        [...statusSel].some((k) => p.approvalStatus && STATUS_MATCH[k].includes(p.approvalStatus))
      const merchantOk = merchantSel.size === 0 || merchantSel.has(p.merchantId ?? 'none')
      const aiOk = !aiOnly || p.tags.some((t) => t.source === 'ai' && t.aiStatus === 'suggested')
      const queryOk = !q ||
        p.title?.toLowerCase().includes(q) ||
        p.tags.some((t) => t.tag.toLowerCase().includes(q) && t.aiStatus !== 'rejected') ||
        merchantName(p.merchantId)?.toLowerCase().includes(q)
      return statusOk && merchantOk && aiOk && queryOk
    })
  }, [photos, query, merchantSel, statusSel, aiOnly, merchants])

  const merchantCount = (id: string) =>
    photos.filter((p) => (id === 'none' ? !p.merchantId : p.merchantId === id)).length
  const statusCount = (k: StatusKey) =>
    photos.filter((p) => p.approvalStatus && STATUS_MATCH[k].includes(p.approvalStatus)).length
  const hasUnassigned = photos.some((p) => !p.merchantId)
  const activeFilterCount = merchantSel.size + statusSel.size + (aiOnly ? 1 : 0)

  const groups = useMemo(() => {
    if (!grouped) return null
    const out: { key: string; title: string; subtitle?: string; photos: Photo[] }[] = []
    for (const m of merchants) {
      const ps = filtered.filter((p) => p.merchantId === m.id)
      if (ps.length) out.push({ key: m.id, title: m.name, subtitle: m.location, photos: ps })
    }
    const none = filtered.filter((p) => !p.merchantId)
    if (none.length) out.push({ key: 'none', title: 'Unassigned', photos: none })
    return out
  }, [grouped, filtered, merchants])

  const ingest = (list: FileList | null) => {
    if (!list) return
    const images = [...list].filter((f) => f.type.startsWith('image/'))
    // uploads inherit the merchant when exactly one is selected
    const only = merchantSel.size === 1 ? [...merchantSel][0] : undefined
    if (images.length) void addPhotos(images, { merchantId: only && only !== 'none' ? only : undefined })
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    ingest(e.dataTransfer.files)
  }

  const filterPanel = (
    <div className="grid gap-5 content-start">
      <label className="relative block">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-faint" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search photos…"
          aria-label="Search photos"
          className="w-full h-9 rounded-(--nv-radius-md) border border-border bg-surface text-ink placeholder:text-ink-faint
                     pl-9 pr-3 text-sm transition-colors focus:border-brand focus:outline-none"
        />
      </label>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-1.5 flex items-center gap-1.5">
          <Store className="size-3.5" aria-hidden /> Merchant
        </h3>
        <div className="grid">
          {merchants.map((m) => (
            <FilterCheck
              key={m.id}
              checked={merchantSel.has(m.id)}
              onChange={() => setMerchantSel((s) => toggle(s, m.id))}
              count={merchantCount(m.id)}
            >
              {m.name}
            </FilterCheck>
          ))}
          {hasUnassigned && (
            <FilterCheck
              checked={merchantSel.has('none')}
              onChange={() => setMerchantSel((s) => toggle(s, 'none'))}
              count={merchantCount('none')}
            >
              Unassigned
            </FilterCheck>
          )}
        </div>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-1.5">Status</h3>
        <div className="grid">
          {(Object.keys(STATUS_LABEL) as StatusKey[]).map((k) => (
            <FilterCheck key={k} checked={statusSel.has(k)} onChange={() => setStatusSel((s) => toggle(s, k))} count={statusCount(k)}>
              {STATUS_LABEL[k]}
            </FilterCheck>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-1.5 flex items-center gap-1.5">
          <Sparkles className="size-3.5" aria-hidden /> AI
        </h3>
        <FilterCheck checked={aiOnly} onChange={() => setAiOnly((v) => !v)}>
          Has suggested tags
        </FilterCheck>
      </section>

      {activeFilterCount > 0 && (
        <Button
          variant="ghost" size="sm" className="justify-self-start"
          onClick={() => { setMerchantSel(new Set()); setStatusSel(new Set()); setAiOnly(false) }}
        >
          Clear filters ({activeFilterCount})
        </Button>
      )}
    </div>
  )

  return (
    <div
      className="grid gap-4 relative"
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false) }}
      onDrop={onDrop}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-display font-bold text-2xl text-ink">Photo Library</h1>
        <div className="flex items-center gap-2">
          {pendingUploads > 0 && (
            <span className="inline-flex items-center gap-1.5 text-sm text-warning" role="status">
              <CloudOff className="size-4" aria-hidden /> {pendingUploads} waiting for connection
            </span>
          )}
          <Button
            variant="secondary" size="sm" className="desktop:hidden relative"
            aria-label="Filters"
            icon={<SlidersHorizontal className="size-4" />}
            onClick={() => setDrawerOpen(true)}
          >
            Filters{activeFilterCount > 0 && ` · ${activeFilterCount}`}
          </Button>
          <Button
            variant="secondary" size="sm"
            aria-pressed={grouped}
            onClick={() => setGrouped((g) => !g)}
            icon={grouped ? <LayoutGrid className="size-4" /> : <Rows3 className="size-4" />}
          >
            <span className="hidden tablet:inline">{grouped ? 'Flat view' : 'Group by merchant'}</span>
          </Button>
          <Button
            variant="secondary"
            className="tablet:hidden"
            aria-label="Take photo"
            icon={<Camera className="size-4" />}
            onClick={() => cameraInput.current?.click()}
          />
          <Button icon={<Upload className="size-4" />} onClick={() => fileInput.current?.click()}>Upload</Button>
        </div>
        <input ref={fileInput} type="file" accept="image/*" multiple className="hidden"
               onChange={(e) => { ingest(e.target.files); e.target.value = '' }} />
        <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden"
               onChange={(e) => { ingest(e.target.files); e.target.value = '' }} />
      </div>

      <div className="desktop:grid desktop:grid-cols-[230px_1fr] desktop:gap-6 desktop:items-start">
        {/* filter panel — sidebar on desktop, drawer on mobile */}
        <aside className="hidden desktop:block sticky top-20 rounded-(--nv-radius-lg) border border-border bg-surface p-4">
          {filterPanel}
        </aside>

        <div className="grid gap-4 min-w-0">
          {groups ? (
            <div className="grid gap-6">
              {groups.length === 0 && (
                <EmptyState icon={<ImagePlus />} title="No photos match" description="Loosen the filters or upload something new." />
              )}
              {groups.map((g) => (
                <section key={g.key}>
                  <div className="flex items-baseline gap-2 mb-3">
                    <h2 className="font-display font-semibold text-lg text-ink inline-flex items-center gap-2">
                      {g.key !== 'none' && <Store className="size-4 text-brand-deep dark:text-brand" aria-hidden />}
                      {g.title}
                    </h2>
                    {g.subtitle && <span className="text-sm text-ink-muted">{g.subtitle}</span>}
                    <span className="text-sm text-ink-faint tabular-nums">· {g.photos.length}</span>
                  </div>
                  <PhotoGallery photos={g.photos} onOpen={(p) => setViewerIndex(filtered.findIndex((x) => x.id === p.id))} />
                </section>
              ))}
            </div>
          ) : (
            <PhotoGallery photos={filtered} onOpen={(p) => setViewerIndex(filtered.findIndex((x) => x.id === p.id))} />
          )}
        </div>
      </div>

      <PhotoViewer photos={filtered} index={viewerIndex} onClose={() => setViewerIndex(null)} onNavigate={setViewerIndex} />

      {/* mobile filter drawer */}
      <AnimatePresence>
        {drawerOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 desktop:hidden"
            onClick={() => setDrawerOpen(false)}
          >
            <motion.div
              initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 30, stiffness: 350 }}
              className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-surface shadow-xl p-4 overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
              role="dialog" aria-label="Photo filters"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display font-semibold text-lg text-ink">Filters</h2>
                <Button variant="ghost" size="sm" aria-label="Close filters" icon={<X className="size-4" />}
                        onClick={() => setDrawerOpen(false)} />
              </div>
              {filterPanel}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* drag-and-drop target */}
      <AnimatePresence>
        {dragging && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 rounded-(--nv-radius-lg) border-2 border-dashed border-brand nv-gradient-soft
                       flex flex-col items-center justify-center gap-2 pointer-events-none"
          >
            <ImagePlus className="size-8 text-brand-deep dark:text-brand" aria-hidden />
            <p className="font-medium text-ink">
              Drop images to upload
              {merchantSel.size === 1 && [...merchantSel][0] !== 'none' && (
                <span className="text-ink-muted"> → {merchantName([...merchantSel][0])}</span>
              )}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* bulk action bar */}
      <AnimatePresence>
        {selectedPhotoIds.length > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            className="fixed bottom-20 desktop:bottom-6 left-1/2 -translate-x-1/2 z-40
                       bg-surface border border-border shadow-xl rounded-full px-4 py-2 flex items-center gap-2"
          >
            <span className="text-sm font-medium text-ink px-1 tabular-nums">{selectedPhotoIds.length} selected</span>
            <Button variant="secondary" size="sm" icon={<Download className="size-4" />}>Download</Button>
            <Button variant="danger" size="sm" icon={<Trash2 className="size-4" />}>Delete</Button>
            <Button variant="ghost" size="sm" onClick={clearPhotoSelection} aria-label="Clear selection" icon={<X className="size-4" />} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
