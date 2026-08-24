import { useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import clsx from 'clsx'

/* The 3xN drag-and-drop grid canvas (same semantics as the merchant feed
 * builder): drop a photo on an exact cell, drag between cells to swap,
 * a new row appears when the last one fills. */

/** Chosen minimum rows per grid, remembered in this browser. */
const rowsKey = (key: string) => `nouvii.gridRows.${key}`
const loadRows = (key: string) => {
  try {
    const n = Number(localStorage.getItem(rowsKey(key)))
    return Number.isInteger(n) && n >= 1 && n <= 60 ? n : 3
  } catch { return 3 }
}

export function useGridRows(key: string): [number, (rows: number) => void] {
  const [rows, setRows] = useState(() => loadRows(key))
  useEffect(() => { setRows(loadRows(key)) }, [key])
  const update = (n: number) => {
    const clamped = Math.min(60, Math.max(1, Math.round(n) || 3))
    setRows(clamped)
    try { localStorage.setItem(rowsKey(key), String(clamped)) } catch { /* private mode */ }
  }
  return [rows, update]
}

/** Rows preset picker: Auto (3) / 6 / 8 / 10 / custom. The size is a minimum —
 *  the grid still grows past it and never hides placed photos. */
export function RowsPicker({ value, onChange }: { value: number; onChange: (rows: number) => void }) {
  const presets = [6, 8, 10]
  const isCustom = value !== 3 && !presets.includes(value)
  const [customOpen, setCustomOpen] = useState(isCustom)
  const pill = (on: boolean) =>
    clsx('rounded-full border px-2.5 py-1 text-xs transition-colors',
      on ? 'border-brand/50 bg-coral/10 text-ink font-medium' : 'border-border text-ink-muted hover:bg-surface-2')

  return (
    <div className="flex items-center gap-1 flex-wrap" role="group" aria-label="Grid rows">
      <span className="text-xs text-ink-muted mr-0.5">Rows</span>
      <button className={pill(value === 3 && !customOpen)} onClick={() => { setCustomOpen(false); onChange(3) }} aria-pressed={value === 3 && !customOpen}>
        Auto
      </button>
      {presets.map((n) => (
        <button key={n} className={pill(value === n && !customOpen)} onClick={() => { setCustomOpen(false); onChange(n) }} aria-pressed={value === n && !customOpen}>
          {n}
        </button>
      ))}
      {customOpen ? (
        <input
          type="number" min={1} max={60} autoFocus defaultValue={isCustom ? value : ''}
          aria-label="Custom row count"
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          onBlur={(e) => {
            const n = Number(e.target.value)
            if (n >= 1) onChange(n)
            else setCustomOpen(false)
          }}
          className="h-6.5 w-14 rounded-full border border-border bg-surface text-ink px-2 text-xs focus:border-brand focus:outline-none"
        />
      ) : (
        <button className={pill(isCustom)} onClick={() => setCustomOpen(true)} aria-pressed={isCustom}>
          {isCustom ? `${value} rows` : 'Custom'}
        </button>
      )}
    </div>
  )
}

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

export function GridCanvas({ items, drag, setDrag, onPlace, onSwap, onRemove, onOpenItem, minRows = 3 }: {
  items: GridItem[]
  drag: GridDrag | null
  setDrag: (d: GridDrag | null) => void
  onPlace: (photoId: string, position: number) => void
  onSwap: (aId: string, bId: string) => void
  onRemove: (photoId: string) => void
  onOpenItem?: (item: GridItem) => void
  /** Minimum rows to show — the grid still grows past this, never hiding placed photos. */
  minRows?: number
}) {
  const [overCell, setOverCell] = useState<number | null>(null)

  const cellCount = useMemo(() => {
    const maxPos = items.length ? Math.max(...items.map((i) => i.position)) : -1
    return Math.max(minRows * 3, Math.ceil((maxPos + 2) / 3) * 3)
  }, [items, minRows])
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
