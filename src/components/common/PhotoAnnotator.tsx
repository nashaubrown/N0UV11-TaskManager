import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Eraser, PenLine, Undo2 } from 'lucide-react'
import clsx from 'clsx'
import { Button } from './Button'

/* Freehand markup over a photo. Strokes are kept in normalized (0..1)
 * coordinates so they survive resizes, and export as a transparent PNG the
 * same aspect ratio as the photo — displayed by overlaying it on the image. */

interface Stroke {
  color: string
  points: { x: number; y: number }[]
}

const COLORS = ['#FF6B5B', '#FFD166', '#FFFFFF', '#111111']

export interface PhotoAnnotatorHandle {
  /** Transparent PNG of the strokes at the photo's aspect ratio, or undefined if empty. */
  exportPng: () => string | undefined
  clear: () => void
  hasStrokes: () => boolean
}

export const PhotoAnnotator = forwardRef<PhotoAnnotatorHandle, {
  src: string
  alt: string
  drawing: boolean
  onStrokesChange?: (hasStrokes: boolean) => void
  className?: string
}>(function PhotoAnnotator({ src, alt, drawing, onStrokesChange, className }, ref) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const strokesRef = useRef<Stroke[]>([])
  const liveStroke = useRef<Stroke | null>(null)
  const [color, setColor] = useState(COLORS[0])
  const [, bump] = useState(0)

  const notify = () => {
    bump((n) => n + 1)
    onStrokesChange?.(strokesRef.current.length > 0)
  }

  const redraw = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { width: w, height: h } = canvas
    ctx.clearRect(0, 0, w, h)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const s of [...strokesRef.current, ...(liveStroke.current ? [liveStroke.current] : [])]) {
      if (s.points.length < 2) continue
      ctx.strokeStyle = s.color
      ctx.lineWidth = Math.max(2.5, w * 0.006)
      ctx.beginPath()
      ctx.moveTo(s.points[0].x * w, s.points[0].y * h)
      for (const p of s.points.slice(1)) ctx.lineTo(p.x * w, p.y * h)
      ctx.stroke()
    }
  }

  // keep the canvas bitmap matched to its on-screen size
  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const fit = () => {
      const r = wrap.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.max(1, Math.round(r.width * dpr))
      canvas.height = Math.max(1, Math.round(r.height * dpr))
      redraw()
    }
    fit()
    const obs = new ResizeObserver(fit)
    obs.observe(wrap)
    return () => obs.disconnect()
  }, [])

  useImperativeHandle(ref, () => ({
    hasStrokes: () => strokesRef.current.length > 0,
    clear: () => { strokesRef.current = []; liveStroke.current = null; redraw(); notify() },
    exportPng: () => {
      if (!strokesRef.current.length) return undefined
      const img = imgRef.current
      const aspect = img && img.naturalWidth ? img.naturalHeight / img.naturalWidth : 3 / 4
      const w = 1280
      const h = Math.round(w * aspect)
      const out = document.createElement('canvas')
      out.width = w
      out.height = h
      const ctx = out.getContext('2d')!
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      for (const s of strokesRef.current) {
        if (s.points.length < 2) continue
        ctx.strokeStyle = s.color
        ctx.lineWidth = Math.max(3, w * 0.006)
        ctx.beginPath()
        ctx.moveTo(s.points[0].x * w, s.points[0].y * h)
        for (const p of s.points.slice(1)) ctx.lineTo(p.x * w, p.y * h)
        ctx.stroke()
      }
      return out.toDataURL('image/png')
    },
  }))

  const toPoint = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    }
  }

  const down = (e: React.PointerEvent) => {
    if (!drawing) return
    e.preventDefault()
    canvasRef.current?.setPointerCapture(e.pointerId)
    liveStroke.current = { color, points: [toPoint(e)] }
    redraw()
  }
  const move = (e: React.PointerEvent) => {
    if (!drawing || !liveStroke.current) return
    liveStroke.current.points.push(toPoint(e))
    redraw()
  }
  const up = () => {
    if (!liveStroke.current) return
    if (liveStroke.current.points.length > 1) strokesRef.current.push(liveStroke.current)
    liveStroke.current = null
    redraw()
    notify()
  }

  const hasStrokes = strokesRef.current.length > 0

  return (
    <div className={className}>
      <div ref={wrapRef} className="relative mx-auto max-h-[50dvh] w-fit">
        <img ref={imgRef} src={src} alt={alt} className="block max-h-[50dvh] w-auto max-w-full" draggable={false} />
        <canvas
          ref={canvasRef}
          className={clsx('absolute inset-0 size-full touch-none', drawing ? 'cursor-crosshair' : 'pointer-events-none')}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          aria-label={drawing ? 'Draw on the photo' : undefined}
        />
      </div>
      {drawing && (
        <div className="flex items-center gap-2 justify-center py-2 bg-surface-2 border-t border-border flex-wrap">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted">
            <PenLine className="size-3.5" aria-hidden /> Pen
          </span>
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Pen color ${c}`}
              onClick={() => setColor(c)}
              className={clsx(
                'size-6 rounded-full border-2 transition-transform',
                color === c ? 'border-ink scale-110' : 'border-border',
              )}
              style={{ backgroundColor: c }}
            />
          ))}
          <span className="w-px h-5 bg-border mx-1" aria-hidden />
          <Button
            type="button" variant="ghost" size="sm" icon={<Undo2 className="size-4" />}
            disabled={!hasStrokes}
            onClick={() => { strokesRef.current.pop(); redraw(); notify() }}
          >
            Undo
          </Button>
          <Button
            type="button" variant="ghost" size="sm" icon={<Eraser className="size-4" />}
            disabled={!hasStrokes}
            onClick={() => { strokesRef.current = []; liveStroke.current = null; redraw(); notify() }}
          >
            Clear
          </Button>
        </div>
      )}
    </div>
  )
})

/** A saved markup rendered back over its photo. */
export function AnnotatedPhoto({ photoUrl, annotation, alt, className }: {
  photoUrl: string
  annotation: string
  alt?: string
  className?: string
}) {
  return (
    <div className={clsx('relative rounded-(--nv-radius-md) overflow-hidden border border-border', className)}>
      <img src={photoUrl} alt={alt ?? 'Photo'} className="block w-full h-auto" />
      <img src={annotation} alt="Reviewer's drawing on the photo" className="absolute inset-0 size-full" />
    </div>
  )
}
