import { useMemo, useRef, useState, type DragEvent } from 'react'
import { Download, ImagePlus, Search, Trash2, Upload, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { Button } from '../components/common/Button'
import { Input } from '../components/common/Input'
import { Tabs } from '../components/common/Tabs'
import { PhotoGallery } from '../components/photo/PhotoGallery'
import { PhotoViewer } from '../components/photo/PhotoViewer'
import { useData } from '../store/data'
import { useUi } from '../store/ui'
import type { ApprovalStatus } from '../types'

type Filter = 'all' | 'needs_review' | 'approved' | 'rejected'

const FILTER_MATCH: Record<Exclude<Filter, 'all'>, ApprovalStatus[]> = {
  needs_review: ['pending', 'in_review', 'changes_requested'],
  approved: ['approved'],
  rejected: ['rejected'],
}

export default function PhotoLibrary() {
  const { photos, addPhotos } = useData()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const { selectedPhotoIds, clearPhotoSelection } = useUi()

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return photos.filter((p) => {
      const statusOk = filter === 'all' || (p.approvalStatus && FILTER_MATCH[filter].includes(p.approvalStatus))
      const queryOk = !q ||
        p.title?.toLowerCase().includes(q) ||
        p.tags.some((t) => t.tag.toLowerCase().includes(q))
      return statusOk && queryOk
    })
  }, [photos, filter, query])

  const count = (f: Filter) =>
    f === 'all' ? photos.length : photos.filter((p) => p.approvalStatus && FILTER_MATCH[f].includes(p.approvalStatus)).length

  const ingest = (list: FileList | null) => {
    if (!list) return
    const images = [...list].filter((f) => f.type.startsWith('image/'))
    if (images.length) addPhotos(images)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    ingest(e.dataTransfer.files)
  }

  return (
    <div
      className="grid gap-4 relative"
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false) }}
      onDrop={onDrop}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-display font-bold text-2xl text-ink">Photo Library</h1>
        <Button icon={<Upload className="size-4" />} onClick={() => fileInput.current?.click()}>Upload</Button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => { ingest(e.target.files); e.target.value = '' }}
        />
      </div>

      <Input
        icon={<Search />}
        placeholder="Search by title or tag…"
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

      <PhotoGallery
        photos={filtered}
        onOpen={(p) => setViewerIndex(filtered.findIndex((x) => x.id === p.id))}
      />

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
            <p className="font-medium text-ink">Drop images to upload</p>
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
