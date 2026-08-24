import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import clsx from 'clsx'

/* The 3xN drag-and-drop grid canvas (same semantics as the merchant feed
 * builder): drop a photo on an exact cell, drag between cells to swap,
 * a new row appears when the last one fills. */

export interface GridItem {
  photoId: string
  position: number
  title?: string
  thumbUrl: string
}

export interface GridDrag {
  kind: 'lib' | 'cell'
  photoId: string
}

export function GridCanvas({ items, drag, setDrag, onPlace, onSwap, onRemove, onOpenItem }: {
  items: GridItem[]
  drag: GridDrag | null
  setDrag: (d: GridDrag | null) => void
  onPlace: (photoId: string, position: number) => void
  onSwap: (aId: string, bId: string) => void
  onRemove: (photoId: string) => void
  onOpenItem?: (item: GridItem) => void
}) {
  const [overCell, setOverCell] = useState<number | null>(null)

  const cellCount = useMemo(() => {
    const maxPos = items.length ? Math.max(...items.map((i) => i.position)) : -1
    return Math.max(9, Math.ceil((maxPos + 2) / 3) * 3)
  }, [items])
  const byCell = useMemo(() => new Map(items.map((i) => [i.position, i])), [items])

  const dropOnCell = (position: number) => {
    setOverCell(null)
    if (!drag) return
    const occupant = byCell.get(position)
    if (drag.kind === 'cell' && occupant && occupant.photoId !== drag.photoId) {
      onSwap(drag.photoId, occupant.photoId)
    } else if (!occupant || occupant.photoId !== drag.photoId) {
      onPlace(drag.photoId, position)
    }
    setDrag(null)
  }

  return (
    <div className="grid grid-cols-3 bg-surface-2 border border-border rounded-(--nv-radius-md) overflow-hidden">
      {Array.from({ length: cellCount }, (_, pos) => {
        const item = byCell.get(pos)
        return (
          <div
            key={pos}
            onDragOver={(e) => { e.preventDefault(); setOverCell(pos) }}
            onDragLeave={() => setOverCell((c) => (c === pos ? null : c))}
            onDrop={(e) => { e.preventDefault(); dropOnCell(pos) }}
            className={clsx(
              'relative aspect-square',
              overCell === pos && 'outline-2 outline-dashed outline-(--nv-coral) -outline-offset-2 z-10',
              !item && 'bg-surface-2',
            )}
            aria-label={item ? item.title ?? 'Grid photo' : `Empty cell ${pos + 1}`}
          >
            {item ? (
              <button
                draggable
                onDragStart={() => setDrag({ kind: 'cell', photoId: item.photoId })}
                onDragEnd={() => { setDrag(null); setOverCell(null) }}
                onClick={() => onOpenItem?.(item)}
                className={clsx(
                  'absolute inset-0 cursor-grab active:cursor-grabbing group',
                  drag?.photoId === item.photoId && 'opacity-50',
                )}
              >
                <img src={item.thumbUrl} alt="" className="size-full object-cover" draggable={false} />
                <span
                  role="button"
                  aria-label="Remove from grid"
                  onClick={(e) => { e.stopPropagation(); onRemove(item.photoId) }}
                  className="absolute top-1 right-1 size-6 rounded-full bg-black/55 text-white hidden group-hover:flex items-center justify-center text-xs"
                >
                  ✕
                </span>
              </button>
            ) : (
              <span className="absolute inset-1.5 rounded-(--nv-radius-sm) border border-dashed border-border flex items-center justify-center text-ink-faint">
                <Plus className="size-5" aria-hidden />
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
