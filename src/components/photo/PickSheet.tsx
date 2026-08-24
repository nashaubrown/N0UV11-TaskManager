import { useRef } from 'react'
import { Camera, Upload, X } from 'lucide-react'
import clsx from 'clsx'
import { Button } from '../common/Button'
import type { Photo } from '../../types'

/* Bottom sheet for filling a grid cell on touch (and by click on desktop):
 * shoot or upload a photo straight into the cell, or pick one from the
 * library. The parent places whatever is chosen. */

export function PickSheet({ open, busy, photos, usedIds, onPick, onUpload, onClose }: {
  open: boolean
  busy?: boolean
  photos: Photo[]
  usedIds?: Set<string>
  onPick: (photoId: string) => void
  onUpload: (files: FileList | null) => void
  onClose: () => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Add a photo to the grid">
      <button className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 max-h-[75dvh] rounded-t-(--nv-radius-lg) bg-surface border-t border-border shadow-xl
                      flex flex-col pb-[env(safe-area-inset-bottom)] desktop:max-w-xl desktop:mx-auto desktop:rounded-(--nv-radius-lg) desktop:bottom-8">
        <div className="flex items-center gap-2 px-4 pt-3 pb-2 shrink-0">
          <span className="font-display font-semibold text-ink flex-1">Add to grid</span>
          <Button variant="ghost" size="sm" aria-label="Close" icon={<X className="size-4" />} onClick={onClose} />
        </div>
        <div className="flex gap-2 px-4 pb-3 shrink-0">
          <Button size="sm" variant="secondary" loading={busy} icon={<Camera className="size-4" />}
                  className="tablet:hidden" onClick={() => cameraInput.current?.click()}>
            Take photo
          </Button>
          <Button size="sm" variant="secondary" loading={busy} icon={<Upload className="size-4" />}
                  onClick={() => fileInput.current?.click()}>
            Upload
          </Button>
        </div>
        <input ref={fileInput} type="file" accept="image/*" multiple className="hidden"
               onChange={(e) => { onUpload(e.target.files); e.target.value = '' }} />
        <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden"
               onChange={(e) => { onUpload(e.target.files); e.target.value = '' }} />
        {photos.length === 0 ? (
          <p className="text-sm text-ink-muted px-4 pb-6">No photos here yet — upload one above.</p>
        ) : (
          <div className="grid grid-cols-4 tablet:grid-cols-6 gap-0.5 px-1 pb-2 overflow-y-auto overscroll-contain">
            {photos.map((p) => (
              <button key={p.id} onClick={() => onPick(p.id)} aria-label={`Place ${p.title ?? 'photo'}`}
                      className={clsx('relative aspect-square overflow-hidden rounded-(--nv-radius-sm)', usedIds?.has(p.id) && 'opacity-40')}>
                <img src={p.thumbUrl} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
