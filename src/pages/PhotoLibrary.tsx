import { useMemo, useRef, useState, type DragEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Camera, CloudOff, Download, ImagePlus, LayoutGrid, Rows3, Search, Store, Trash2, Upload, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import { Button } from '../components/common/Button'
import { Input } from '../components/common/Input'
import { Tabs } from '../components/common/Tabs'
import { PhotoGallery } from '../components/photo/PhotoGallery'
import { PhotoViewer } from '../components/photo/PhotoViewer'
import { useData } from '../store/data'
import { useUi } from '../store/ui'
import type { ApprovalStatus, Photo } from '../types'

type Filter = 'all' | 'needs_review' | 'approved' | 'rejected'
type MerchantFilter = 'all' | 'none' | (string & {})

const FILTER_MATCH: Record<Exclude<Filter, 'all'>, ApprovalStatus[]> = {
  needs_review: ['pending', 'in_review', 'changes_requested'],
  approved: ['approved'],
  rejected: ['rejected'],
}

export default function PhotoLibrary() {
  const { photos, merchants, addPhotos, pendingUploads } = useData()
  const [filter, setFilter] = useState<Filter>('all')
  const [searchParams] = useSearchParams()
  const [merchantFilter, setMerchantFilter] = useState<MerchantFilter>(() => searchParams.get('merchantId') ?? 'all')
  const [grouped, setGrouped] = useState(false)
  const [query, setQuery] = useState('')
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const { selectedPhotoIds, clearPhotoSelection } = useUi()

  const merchantName = (id?: string) => merchants.find((m) => m.id === id)?.name

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return photos.filter((p) => {
      const statusOk = filter === 'all' || (p.approvalStatus && FILTER_MATCH[filter].includes(p.approvalStatus))
      const merchantOk =
        merchantFilter === 'all' ||
        (merchantFilter === 'none' ? !p.merchantId : p.merchantId === merchantFilter)
      const queryOk = !q ||
        p.title?.toLowerCase().includes(q) ||
        p.tags.some((t) => t.tag.toLowerCase().includes(q)) ||
        merchantName(p.merchantId)?.toLowerCase().includes(q)
      return statusOk && merchantOk && queryOk
    })
  }, [photos, filter, merchantFilter, query, merchants])

  const count = (f: Filter) =>
    f === 'all' ? photos.length : photos.filter((p) => p.approvalStatus && FILTER_MATCH[f].includes(p.approvalStatus)).length

  const merchantCount = (id: MerchantFilter) =>
    id === 'all' ? photos.length
    : id === 'none' ? photos.filter((p) => !p.merchantId).length
    : photos.filter((p) => p.merchantId === id).length

  const hasUnassigned = photos.some((p) => !p.merchantId)

  /** Group-by-merchant sections, in merchant order, unassigned last. */
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
    // uploads inherit the active merchant filter, so batches file themselves
    if (images.length) addPhotos(images, {
      merchantId: merchantFilter !== 'all' && merchantFilter !== 'none' ? merchantFilter : undefined,
    })
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    ingest(e.dataTransfer.files)
  }

  const chip = (active: boolean) =>
    clsx(
      'inline-flex items-center gap-1.5 rounded-full px-3 h-8 text-sm font-medium whitespace-nowrap transition-colors border',
      active
        ? 'nv-gradient text-on-brand border-transparent shadow-sm'
        : 'bg-surface text-ink-muted border-border hover:text-ink hover:bg-surface-2',
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
            variant="secondary"
            className="tablet:hidden"
            aria-label="Take photo"
            icon={<Camera className="size-4" />}
            onClick={() => cameraInput.current?.click()}
          />
          <Button icon={<Upload className="size-4" />} onClick={() => fileInput.current?.click()}>Upload</Button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => { ingest(e.target.files); e.target.value = '' }}
        />
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => { ingest(e.target.files); e.target.value = '' }}
        />
      </div>

      <Input
        icon={<Search />}
        placeholder="Search by title, tag, or merchant…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search photos"
      />

      <Tabs<Filter>
        value={filter}
        onChange={setFilter}
        items={[
          { value: 'all', label: 'All', count: count('all') },
          { value: 'needs_review', label: 'Needs review', count: count('needs_review') },
          { value: 'approved', label: 'Approved', count: count('approved') },
          { value: 'rejected', label: 'Rejected', count: count('rejected') },
        ]}
      />

      {/* merchant chips + group toggle */}
      <div className="flex items-center gap-2">
        <div className="flex gap-2 overflow-x-auto pb-1 flex-1" role="group" aria-label="Filter by merchant">
          <button className={chip(merchantFilter === 'all')} onClick={() => setMerchantFilter('all')}>
            All merchants
          </button>
          {merchants.map((m) => (
            <button
              key={m.id}
              className={chip(merchantFilter === m.id)}
              onClick={() => setMerchantFilter(merchantFilter === m.id ? 'all' : m.id)}
            >
              <Store className="size-3.5" aria-hidden />
              {m.name}
              <span className={clsx('text-xs tabular-nums', merchantFilter === m.id ? 'text-on-brand/80' : 'text-ink-faint')}>
                {merchantCount(m.id)}
              </span>
            </button>
          ))}
          {hasUnassigned && (
            <button
              className={chip(merchantFilter === 'none')}
              onClick={() => setMerchantFilter(merchantFilter === 'none' ? 'all' : 'none')}
            >
              Unassigned
              <span className={clsx('text-xs tabular-nums', merchantFilter === 'none' ? 'text-on-brand/80' : 'text-ink-faint')}>
                {merchantCount('none')}
              </span>
            </button>
          )}
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="shrink-0"
          aria-pressed={grouped}
          onClick={() => setGrouped((g) => !g)}
          icon={grouped ? <LayoutGrid className="size-4" /> : <Rows3 className="size-4" />}
        >
          {grouped ? 'Flat view' : 'Group by merchant'}
        </Button>
      </div>

      {groups ? (
        <div className="grid gap-6">
          {groups.length === 0 && (
            <PhotoGallery photos={[]} onOpen={() => {}} />
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
              <PhotoGallery
                photos={g.photos}
                onOpen={(p) => setViewerIndex(filtered.findIndex((x) => x.id === p.id))}
              />
            </section>
          ))}
        </div>
      ) : (
        <PhotoGallery
          photos={filtered}
          onOpen={(p) => setViewerIndex(filtered.findIndex((x) => x.id === p.id))}
        />
      )}

      <PhotoViewer
        photos={filtered}
        index={viewerIndex}
        onClose={() => setViewerIndex(null)}
        onNavigate={setViewerIndex}
      />

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
              {merchantFilter !== 'all' && merchantFilter !== 'none' && (
                <span className="text-ink-muted"> → {merchantName(merchantFilter)}</span>
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
            <span className="text-sm font-medium text-ink px-1 tabular-nums">
              {selectedPhotoIds.length} selected
            </span>
            <Button variant="secondary" size="sm" icon={<Download className="size-4" />}>Download</Button>
            <Button variant="danger" size="sm" icon={<Trash2 className="size-4" />}>Delete</Button>
            <Button variant="ghost" size="sm" onClick={clearPhotoSelection} aria-label="Clear selection" icon={<X className="size-4" />} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
