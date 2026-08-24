import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Camera, CloudOff, Download, ImagePlus, LayoutGrid, Rows3, Search,
  SlidersHorizontal, Sparkles, Store, Trash2, Upload, X,
} from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { Button } from '../components/common/Button'
import { PhotoGallery } from '../components/photo/PhotoGallery'
import { PhotoViewer } from '../components/photo/PhotoViewer'
import { GridCanvas, type GridDrag, type GridItem } from '../components/photo/GridCanvas'
import { EmptyState } from '../components/common/EmptyState'
import { api, absoluteUrl, DEMO } from '../services/api'
import { useData } from '../store/data'
import { useUi } from '../store/ui'
import type { ApprovalStatus, Photo } from '../types'

interface Board { id: string; name: string; items: GridItem[] }

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

function TreeRow({ active, onClick, icon, count, children }: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  count?: number
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={
        active
          ? 'flex items-center gap-2 px-3 py-1.5 text-sm text-left bg-coral/10 text-ink font-medium border-r-2 border-(--nv-coral)'
          : 'flex items-center gap-2 px-3 py-1.5 text-sm text-left text-ink-muted hover:bg-surface-2'
      }
    >
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {count !== undefined && <span className="text-xs text-ink-faint tabular-nums">{count}</span>}
    </button>
  )
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

  /* ---------- grid builder (always-split canvas) ---------- */
  const [boards, setBoards] = useState<Board[]>([])
  const [target, setTarget] = useState('')
  const [feedCache, setFeedCache] = useState<Record<string, GridItem[]>>({})
  const [gridDrag, setGridDrag] = useState<GridDrag | null>(null)
  const [boardNaming, setBoardNaming] = useState(false)
  const [boardName, setBoardName] = useState('')

  const mapItem = (i: GridItem) => ({ ...i, thumbUrl: absoluteUrl(i.thumbUrl) })

  useEffect(() => {
    if (DEMO) { setBoards([{ id: 'demo-board', name: 'Moodboard', items: [] }]); return }
    api<{ items: Board[] }>('GET', '/boards')
      .then((d) => setBoards(d.items.map((b) => ({ ...b, items: b.items.map(mapItem) }))))
      .catch(() => {})
  }, [])

  // default the canvas to the first merchant's feed grid
  useEffect(() => {
    if (!target && merchants.length) setTarget(`merchant:${merchants[0].id}`)
  }, [merchants, target])

  const targetKind = target.startsWith('board:') ? 'board' as const : target.startsWith('merchant:') ? 'merchant' as const : null
  const targetId = target.split(':')[1] ?? ''

  useEffect(() => {
    if (targetKind !== 'merchant' || !targetId || feedCache[targetId]) return
    if (DEMO) {
      setFeedCache((c) => ({
        ...c,
        [targetId]: photos
          .filter((p) => p.merchantId === targetId && p.approvalStatus === 'approved')
          .map((p, i) => ({ photoId: p.id, position: i, title: p.title, thumbUrl: p.thumbUrl })),
      }))
      return
    }
    api<{ items: GridItem[] }>('GET', `/merchants/${targetId}/feed`)
      .then((d) => setFeedCache((c) => ({ ...c, [targetId]: d.items.map(mapItem) })))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, photos])

  const gridItems: GridItem[] =
    targetKind === 'board' ? boards.find((b) => b.id === targetId)?.items ?? []
    : targetKind === 'merchant' ? feedCache[targetId] ?? []
    : []

  const localGrid = (fn: (items: GridItem[]) => GridItem[]) => {
    if (targetKind === 'board') setBoards((bs) => bs.map((b) => (b.id === targetId ? { ...b, items: fn(b.items) } : b)))
    else if (targetKind === 'merchant') setFeedCache((c) => ({ ...c, [targetId]: fn(c[targetId] ?? []) }))
  }
  const reconcile = (items: GridItem[]) => localGrid(() => items.map(mapItem))

  const gridPlace = (photoId: string, position: number) => {
    const p = photos.find((x) => x.id === photoId)
    localGrid((items) => [
      ...items.filter((i) => i.position !== position && i.photoId !== photoId),
      { photoId, position, title: p?.title, thumbUrl: p?.thumbUrl ?? items.find((i) => i.photoId === photoId)?.thumbUrl ?? '' },
    ])
    if (DEMO || !targetKind) return
    const req = targetKind === 'board'
      ? api<{ items: GridItem[] }>('POST', `/boards/${targetId}/items`, { photoId, position })
      : api<{ items: GridItem[] }>('POST', `/merchants/${targetId}/feed`, { photoId, position })
    void req.then((d) => reconcile(d.items)).catch(() => {})
  }

  const gridSwap = (aId: string, bId: string) => {
    localGrid((items) => {
      const a = items.find((i) => i.photoId === aId)
      const b = items.find((i) => i.photoId === bId)
      if (!a || !b) return items
      return items.map((i) => (i.photoId === aId ? { ...i, position: b.position } : i.photoId === bId ? { ...i, position: a.position } : i))
    })
    if (DEMO || !targetKind) return
    const req = targetKind === 'board'
      ? api<{ items: GridItem[] }>('PATCH', `/boards/${targetId}/items`, { swap: [aId, bId] })
      : api<{ items: GridItem[] }>('PATCH', `/merchants/${targetId}/feed`, { swap: [aId, bId] })
    void req.then((d) => reconcile(d.items)).catch(() => {})
  }

  const gridRemove = (photoId: string) => {
    localGrid((items) => items.filter((i) => i.photoId !== photoId))
    if (DEMO || !targetKind) return
    if (targetKind === 'board') void api('DELETE', `/boards/${targetId}/items/${photoId}`).catch(() => {})
    else void api('DELETE', `/merchants/${targetId}/feed/${photoId}`).catch(() => {})
  }

  const createBoard = async () => {
    if (!boardName.trim()) return
    if (DEMO) {
      const b: Board = { id: `board${Date.now()}`, name: boardName.trim(), items: [] }
      setBoards((bs) => [...bs, b]); setTarget(`board:${b.id}`)
    } else {
      const b = await api<Board>('POST', '/boards', { name: boardName.trim() })
      setBoards((bs) => [...bs, b]); setTarget(`board:${b.id}`)
    }
    setBoardNaming(false); setBoardName('')
  }

  const deleteBoard = async () => {
    if (targetKind !== 'board') return
    if (!DEMO) await api('DELETE', `/boards/${targetId}`).catch(() => {})
    setBoards((bs) => bs.filter((b) => b.id !== targetId))
    setTarget(merchants.length ? `merchant:${merchants[0].id}` : '')
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
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-1.5">Library</h3>
        <div className="grid -mx-2">
          <TreeRow
            active={merchantSel.size === 0}
            onClick={() => setMerchantSel(new Set())}
            icon={<ImagePlus className="size-3.5" aria-hidden />}
            count={photos.length}
          >
            All photos
          </TreeRow>
          {merchants.map((m) => (
            <TreeRow
              key={m.id}
              active={merchantSel.has(m.id)}
              onClick={() => {
                setMerchantSel((s) => (s.has(m.id) ? new Set() : new Set([m.id])))
                setTarget(`merchant:${m.id}`)
              }}
              icon={<Store className="size-3.5" aria-hidden />}
              count={merchantCount(m.id)}
            >
              {m.name}
            </TreeRow>
          ))}
          {hasUnassigned && (
            <TreeRow
              active={merchantSel.has('none')}
              onClick={() => setMerchantSel((s) => (s.has('none') ? new Set() : new Set(['none'])))}
              icon={<ImagePlus className="size-3.5" aria-hidden />}
              count={merchantCount('none')}
            >
              Unassigned
            </TreeRow>
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

      <div className="desktop:grid desktop:grid-cols-[240px_minmax(360px,44%)_1fr] desktop:gap-5 desktop:items-start">
        {/* filter panel — sidebar on desktop, drawer on mobile */}
        <aside className="hidden desktop:block sticky top-20 rounded-(--nv-radius-lg) border border-border bg-surface p-4">
          {filterPanel}
        </aside>

        {/* grid builder canvas — drag photos in from the gallery on the right */}
        <section className="sticky top-20 rounded-(--nv-radius-lg) border border-border bg-surface p-4 grid gap-3 content-start mb-4 desktop:mb-0" aria-label="Grid builder">
          <div className="flex items-center gap-2">
            <h2 className="font-display font-semibold text-lg text-ink flex-1">Grid builder</h2>
            {targetKind === 'board' && (
              <Button variant="ghost" size="sm" aria-label="Delete board" icon={<Trash2 className="size-4" />} onClick={() => void deleteBoard()} />
            )}
          </div>
          <div className="flex gap-2">
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              aria-label="Grid to edit"
              className="h-9 flex-1 rounded-(--nv-radius-md) border border-border bg-surface text-ink px-2.5 text-sm focus:border-brand focus:outline-none"
            >
              <optgroup label="Merchant feeds">
                {merchants.map((m) => <option key={m.id} value={`merchant:${m.id}`}>{m.name} — feed</option>)}
              </optgroup>
              {boards.length > 0 && (
                <optgroup label="Boards">
                  {boards.map((b) => <option key={b.id} value={`board:${b.id}`}>{b.name}</option>)}
                </optgroup>
              )}
            </select>
            {boardNaming ? (
              <form onSubmit={(e) => { e.preventDefault(); void createBoard() }}>
                <input
                  autoFocus value={boardName} onChange={(e) => setBoardName(e.target.value)}
                  onBlur={() => setBoardNaming(false)}
                  placeholder="Board name…" aria-label="New board name"
                  className="h-9 w-36 rounded-(--nv-radius-md) border border-border bg-surface text-ink px-2.5 text-sm focus:border-brand focus:outline-none"
                />
              </form>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => setBoardNaming(true)}>+ Board</Button>
            )}
          </div>
          <GridCanvas
            items={gridItems}
            drag={gridDrag}
            setDrag={setGridDrag}
            onPlace={gridPlace}
            onSwap={gridSwap}
            onRemove={gridRemove}
            onOpenItem={(item) => {
              const idx = filtered.findIndex((p) => p.id === item.photoId)
              if (idx >= 0) setViewerIndex(idx)
            }}
          />
          <p className="text-xs text-ink-muted">
            Drag photos from the library on the right into a cell — drag between cells to swap. Saves instantly.
            {targetKind === 'merchant' && ' This is the merchant’s feed grid, mirrored in their phone preview.'}
          </p>
        </section>

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
                  <PhotoGallery photos={g.photos} large onDragStartPhoto={(id) => setGridDrag({ kind: 'lib', photoId: id })} onDragEndPhoto={() => setGridDrag(null)} onOpen={(p) => setViewerIndex(filtered.findIndex((x) => x.id === p.id))} />
                </section>
              ))}
            </div>
          ) : (
            <PhotoGallery photos={filtered} large onDragStartPhoto={(id) => setGridDrag({ kind: 'lib', photoId: id })} onDragEndPhoto={() => setGridDrag(null)} onOpen={(p) => setViewerIndex(filtered.findIndex((x) => x.id === p.id))} />
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
