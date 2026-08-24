import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Bookmark, ChartColumn, ChevronDown, Copy, Grid3x3, Heart, Link2, MessageCircle, Play, Send, Sparkles, SquarePlay, SquareUser, Trash2, UserPlus } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import { Button } from '../components/common/Button'
import { Card } from '../components/common/Card'
import { EmptyState } from '../components/common/EmptyState'
import { api, absoluteUrl, DEMO } from '../services/api'
import { GridCanvas, RowsPicker, useGridRows } from '../components/photo/GridCanvas'
import { PickSheet } from '../components/photo/PickSheet'
import { useData } from '../store/data'
import { demoAnalytics } from '../services/analyticsData'
import { compact } from '../components/analytics/MetricChart'
import { timeAgo } from '../utils/format'
import type { FeedItem, FeedLive } from '../types'

/* Instagram-style feed planner: profile header + 3-column grid inside a
 * phone frame. Order = posting order (top-left is most recent). Drag to
 * reorder; approved photos join from the tray on the right. */

export default function MerchantProfile() {
  const { merchantId } = useParams()
  const { merchants, photos, addPhotos } = useData()
  const merchant = merchants.find((m) => m.id === merchantId)

  const [items, setItems] = useState<FeedItem[]>([])
  const [live, setLive] = useState<FeedLive | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [ratio, setRatio] = useState<'1:1' | '3:4'>('3:4')
  const [openItem, setOpenItem] = useState<FeedItem | null>(null)
  const [igTab, setIgTab] = useState<'grid' | 'reels' | 'tagged'>('grid')
  const [caption, setCaption] = useState('')
  const [captionBusy, setCaptionBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [drag, setDrag] = useState<{ kind: 'lib' | 'cell'; photoId: string } | null>(null)
  const [pickFor, setPickFor] = useState<number | null>(null)
  const [pickBusy, setPickBusy] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!merchantId) return
    if (DEMO) {
      setItems(
        photos
          .filter((p) => p.merchantId === merchantId && p.approvalStatus === 'approved')
          .map((p, i) => ({ photoId: p.id, position: i, title: p.title, url: p.url, thumbUrl: p.thumbUrl })),
      )
      const demoMerchant = merchants.find((m) => m.id === merchantId)
      const a = demoAnalytics(merchantId, demoMerchant?.igHandle, photos)
      setLive({
        username: a.account?.username,
        name: demoMerchant?.name,
        followers: a.series.at(-1)?.followers,
        following: Math.round((a.series.at(-1)?.followers ?? 0) * 0.12),
        mediaCount: a.posts.length,
        lastSyncedAt: a.account?.lastSyncedAt,
        posts: a.posts.filter((p) => p.thumbUrl).map((p) => ({ id: p.id, thumbUrl: p.thumbUrl!, postedAt: p.postedAt, mediaType: p.mediaType })),
      })
      setLoaded(true)
      return
    }
    api<{ items: FeedItem[]; live: FeedLive | null }>('GET', `/merchants/${merchantId}/feed`)
      .then((d) => {
        setItems(d.items.map((i) => ({ ...i, url: absoluteUrl(i.url), thumbUrl: absoluteUrl(i.thumbUrl) })))
        setLive(d.live)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the feed'))
      .finally(() => setLoaded(true))
  }, [merchantId, photos])

  const inPlan = useMemo(() => new Set(items.map((i) => i.photoId)), [items])
  const library = useMemo(() => {
    const q = query.trim().toLowerCase()
    return photos.filter(
      (p) =>
        p.merchantId === merchantId &&
        p.status === 'ready' &&
        (!q || (p.title ?? '').toLowerCase().includes(q) || p.tags.some((t) => t.tag.toLowerCase().includes(q))),
    )
  }, [photos, merchantId, query])

  /** Grid cells: at least the chosen rows, and a fresh row appears once the
   *  last row holds a photo — the minimum never hides placed photos. */
  const [minRows, setMinRows] = useGridRows(`feed:${merchantId}`)

  /** Put a photo in an exact cell (replacing any occupant) — persisted immediately. */
  const placeAt = async (photoId: string, position: number) => {
    const p = photos.find((x) => x.id === photoId)
    setItems((cur) => [
      ...cur.filter((i) => i.position !== position && i.photoId !== photoId),
      {
        ...(cur.find((i) => i.photoId === photoId) ??
          { photoId, title: p?.title, url: p?.url ?? '', thumbUrl: p?.thumbUrl ?? '' }),
        position,
      } as FeedItem,
    ])
    if (!DEMO) {
      try {
        const d = await api<{ items: FeedItem[] }>('POST', `/merchants/${merchantId}/feed`, { photoId, position })
        setItems(d.items.map((i) => ({ ...i, url: absoluteUrl(i.url), thumbUrl: absoluteUrl(i.thumbUrl) })))
        setError(undefined)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save the grid')
      }
    }
  }

  /** Swap two occupied cells — persisted immediately. */
  const swapCells = async (aId: string, bId: string) => {
    setItems((cur) => {
      const a = cur.find((i) => i.photoId === aId)
      const b = cur.find((i) => i.photoId === bId)
      if (!a || !b) return cur
      return cur.map((i) =>
        i.photoId === aId ? { ...i, position: b.position } : i.photoId === bId ? { ...i, position: a.position } : i,
      )
    })
    if (!DEMO) {
      void api('PATCH', `/merchants/${merchantId}/feed`, { swap: [aId, bId] }).catch(() => setError('Could not save the swap'))
    }
  }

  /** Tap-to-fill (touch and click): pick from this merchant's library, or upload straight into the cell. */
  const pickPhoto = (photoId: string) => {
    if (pickFor === null) return
    void placeAt(photoId, pickFor)
    setPickFor(null)
  }

  const pickUpload = async (list: FileList | null) => {
    const images = [...(list ?? [])].filter((f) => f.type.startsWith('image/'))
    if (!images.length || pickFor === null) return
    setPickBusy(true)
    try {
      const added = await addPhotos(images, { merchantId })
      if (added[0]) void placeAt(added[0].id, pickFor)
      setPickFor(null)
    } finally {
      setPickBusy(false)
    }
  }

  const remove = async (photoId: string) => {
    setOpenItem(null)
    setItems((cur) => cur.filter((i) => i.photoId !== photoId).map((i, idx) => ({ ...i, position: idx })))
    if (!DEMO) await api('DELETE', `/merchants/${merchantId}/feed/${photoId}`).catch(() => {})
  }

  const saveCaption = async () => {
    if (!openItem) return
    setItems((cur) => cur.map((i) => (i.photoId === openItem.photoId ? { ...i, caption } : i)))
    if (!DEMO) await api('PATCH', `/merchants/${merchantId}/feed/${openItem.photoId}`, { caption }).catch(() => {})
    setOpenItem(null)
  }

  const aiCaption = async () => {
    if (!openItem) return
    setCaptionBusy(true)
    try {
      if (DEMO) {
        setCaption(`Golden hour at ${merchant?.name ?? 'the café'} — come find your favourite corner. ☕\n\n#maldives #${(merchant?.name ?? '').toLowerCase().replace(/[^a-z]/g, '')} #visitmaldives`)
      } else {
        const d = await api<{ caption: string }>('POST', `/merchants/${merchantId}/feed/${openItem.photoId}/caption-ai`)
        setCaption(d.caption)
      }
      setError(undefined)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not draft a caption')
    } finally {
      setCaptionBusy(false)
    }
  }

  if (!merchant) {
    return <EmptyState title="Merchant not found" description="It may have been removed." />
  }

  const handle = live?.username || merchant.igHandle || merchant.name.toLowerCase().replace(/[^a-z0-9]/g, '')
  const igUrl = live?.username ? `https://instagram.com/${live.username}` : undefined

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Link to="/merchants" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink transition-colors">
            <ArrowLeft className="size-4" aria-hidden /> Merchants
          </Link>
          <h1 className="font-display font-bold text-2xl text-ink mt-1">{merchant.name} — feed preview</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/analytics?merchant=${merchant.id}`}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-(--nv-radius-md) border border-border text-sm font-medium text-ink-2 hover:bg-surface-2 transition-colors"
          >
            <ChartColumn className="size-4" aria-hidden /> Analytics
          </Link>
          <div className="inline-flex rounded-full border border-border overflow-hidden text-sm font-medium">
            {(['1:1', '3:4'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRatio(r)}
                aria-pressed={ratio === r}
                className={clsx('px-3 py-1.5 transition-colors', ratio === r ? 'nv-gradient text-on-brand' : 'text-ink-muted hover:bg-surface-2')}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-error">{error}</p>}

      <div className="grid desktop:grid-cols-[460px_1fr] gap-6 items-start justify-items-center desktop:justify-items-start">
        {/* phone frame */}
        {/* iPhone Pro Max proportions: ~430pt wide, 19.5:9 */}
        <div className="w-[430px] max-w-full rounded-[54px] border-[12px] border-ink bg-black shadow-xl overflow-hidden">
          {/* fixed phone height — the screen scrolls inside, like a real phone */}
          <div className="bg-white dark:bg-neutral-950 h-[780px] max-h-[80dvh] flex flex-col">
            {/* dynamic island */}
            <div className="h-10 bg-inherit flex items-center justify-center shrink-0">
              <div className="w-28 h-6 rounded-full bg-black" />
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col overscroll-contain">
            <div className="px-4 pb-2 flex items-center justify-between">
              {igUrl ? (
                <a href={igUrl} target="_blank" rel="noreferrer"
                   className="font-semibold text-[15px] text-neutral-900 dark:text-neutral-100 hover:underline">
                  {handle}
                </a>
              ) : (
                <span className="font-semibold text-[15px] text-neutral-900 dark:text-neutral-100">{handle}</span>
              )}
              <Grid3x3 className="size-4 text-neutral-500" aria-hidden />
            </div>
            {/* profile header — matches the Instagram mobile layout */}
            <div className="px-4 py-2 flex items-start gap-6">
              {live?.avatarUrl || merchant.logoUrl ? (
                <img src={live?.avatarUrl ?? merchant.logoUrl} alt="" className="size-20 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />
              ) : (
                <div className="size-20 rounded-full nv-gradient flex items-center justify-center text-white font-display font-bold text-2xl shrink-0">
                  {merchant.name[0]}
                </div>
              )}
              <div className="flex-1 min-w-0 pt-1">
                <p className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                  {live?.name ?? merchant.name}
                </p>
                <div className="flex gap-7 mt-2 text-neutral-900 dark:text-neutral-100">
                  <div>
                    <p className="text-[15px] font-semibold leading-tight">{(live?.mediaCount ?? 0) + items.length}</p>
                    <p className="text-[13px] leading-tight">posts</p>
                  </div>
                  <div>
                    <p className="text-[15px] font-semibold leading-tight">{live?.followers !== undefined ? compact(live.followers) : '—'}</p>
                    <p className="text-[13px] leading-tight">followers</p>
                  </div>
                  <div>
                    <p className="text-[15px] font-semibold leading-tight">{live?.following !== undefined ? compact(live.following) : '—'}</p>
                    <p className="text-[13px] leading-tight">following</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="px-4 pb-2">
              {(live?.bio || merchant.bio) && (
                <p className="text-[13px] text-neutral-900 dark:text-neutral-100 whitespace-pre-wrap">{live?.bio ?? merchant.bio}</p>
              )}
              {live?.website && (
                <a href={live.website.startsWith('http') ? live.website : `https://${live.website}`} target="_blank" rel="noreferrer"
                   className="inline-flex items-center gap-1 text-[13px] font-medium text-[#4150f7] dark:text-[#8a98ff]">
                  <Link2 className="size-3.5 -rotate-45" aria-hidden />
                  {live.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                </a>
              )}
              {!live?.website && merchant.location && <p className="text-[13px] text-neutral-500">{merchant.location}</p>}
            </div>
            {/* action pills — decorative, part of the realistic preview */}
            <div className="px-4 pb-3 flex gap-1.5" aria-hidden>
              <span className="flex-1 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 text-[13px] font-semibold flex items-center justify-center gap-1">
                Following <ChevronDown className="size-3.5" />
              </span>
              <span className="flex-1 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 text-[13px] font-semibold flex items-center justify-center">
                Message
              </span>
              <span className="w-9 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 flex items-center justify-center">
                <UserPlus className="size-4" />
              </span>
            </div>
            {/* profile tabs: grid (plan + published) · reels · tagged */}
            {(() => {
              const livePosts = live?.posts ?? []
              const shown =
                igTab === 'reels' ? livePosts.filter((p) => !p.tagged && p.mediaType === 'VIDEO')
                : igTab === 'tagged' ? livePosts.filter((p) => p.tagged)
                : livePosts.filter((p) => !p.tagged)
              const empty =
                igTab === 'reels' ? 'No reels published yet.'
                : igTab === 'tagged' ? 'No tagged posts — collabs and tags land here after a sync.'
                : 'No posts planned yet — add approved photos from the tray.'
              return (
                <>
                  <div className="flex border-t border-neutral-200 dark:border-neutral-800" role="tablist" aria-label="Profile tabs">
                    {([['grid', Grid3x3], ['reels', SquarePlay], ['tagged', SquareUser]] as const).map(([t, Icon]) => (
                      <button
                        key={t}
                        role="tab"
                        aria-selected={igTab === t}
                        aria-label={t}
                        onClick={() => setIgTab(t)}
                        className={clsx(
                          'flex-1 flex justify-center py-2.5 -mb-px transition-colors',
                          igTab === t
                            ? 'border-b-2 border-neutral-900 dark:border-white text-neutral-900 dark:text-white'
                            : 'text-neutral-400',
                        )}
                      >
                        <Icon className="size-5" aria-hidden />
                      </button>
                    ))}
                  </div>
                  {(igTab !== 'grid' || items.length === 0) && shown.length === 0 ? (
                    <p className="flex-1 grid place-items-center text-center text-[13px] text-neutral-500 px-6 py-10">{empty}</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-px bg-white dark:bg-neutral-950">
                      {igTab === 'grid' && [...items].sort((a, b) => a.position - b.position).map((item) => (
                        <button
                          key={item.photoId}
                          onClick={() => { setOpenItem(item); setCaption(item.caption ?? '') }}
                          className={clsx(
                            'relative overflow-hidden bg-neutral-200',
                            ratio === '1:1' ? 'aspect-square' : 'aspect-[3/4]',
                          )}
                          aria-label={item.title ?? 'Planned post'}
                        >
                          <img src={item.thumbUrl} alt="" className="absolute inset-0 size-full object-cover" draggable={false} />
                          <span className="absolute top-1.5 right-1.5 size-2.5 rounded-full nv-gradient ring-2 ring-white/80" title="Planned — not posted yet" />
                        </button>
                      ))}
                      {shown.map((p) => (
                        <a
                          key={p.id}
                          href={p.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className={clsx(
                            'relative overflow-hidden bg-neutral-200',
                            igTab === 'reels' ? 'aspect-[9/16]' : ratio === '1:1' ? 'aspect-square' : 'aspect-[3/4]',
                            !p.permalink && 'pointer-events-none',
                          )}
                          aria-label="Published Instagram post"
                        >
                          <img src={p.thumbUrl} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
                          {p.mediaType === 'VIDEO' && igTab !== 'reels' && (
                            <Play className="absolute top-1.5 right-1.5 size-3.5 text-white drop-shadow" fill="currentColor" aria-hidden />
                          )}
                          {p.mediaType === 'CAROUSEL_ALBUM' && (
                            <Copy className="absolute top-1.5 right-1.5 size-3.5 text-white drop-shadow" aria-hidden />
                          )}
                        </a>
                      ))}
                    </div>
                  )}
                </>
              )
            })()}
            {live && (
              <p className="text-center text-[11px] text-neutral-400 py-2">
                Live from @{live.username ?? handle}
                {live.lastSyncedAt && <> · synced {timeAgo(live.lastSyncedAt)}</>}
                {items.length > 0 && <> · <span className="text-neutral-500">• = planned</span></>}
              </p>
            )}
            <div className="mt-auto h-8" />
            </div>
          </div>
        </div>

        {/* grid builder + photo library */}
        <div className="w-full grid desktop:grid-cols-[minmax(300px,420px)_1fr] gap-5 items-start">
          {/* the 3×3 canvas — grows a row when the last one fills */}
          <Card padding="md" className="grid gap-2.5 content-start">
            <div>
              <h2 className="font-display font-semibold text-lg text-ink">Grid builder</h2>
              <p className="text-sm text-ink-muted">
                <span className="hidden desktop:inline">Drag photos from the library into a cell, or tap an empty cell to fill it. Every move saves instantly.</span>
                <span className="desktop:hidden">Tap a cell to add a photo. Hold a photo, then drag it to reorder. Every move saves instantly.</span>
              </p>
            </div>
            <RowsPicker value={minRows} onChange={setMinRows} />
            <GridCanvas
              items={items}
              drag={drag}
              setDrag={setDrag}
              minRows={minRows}
              onPickCell={setPickFor}
              onPlace={(photoId, position) => void placeAt(photoId, position)}
              onSwap={(a, b) => void swapCells(a, b)}
              onRemove={(id) => void remove(id)}
              onOpenItem={(gi) => {
                const fi = items.find((i) => i.photoId === gi.photoId)
                if (fi) { setOpenItem(fi); setCaption(fi.caption ?? '') }
              }}
            />
            <p className="text-xs text-ink-muted">Top-left posts last, like Instagram. The phone preview mirrors this grid.</p>
          </Card>

          {/* the library to drag from */}
          <Card padding="md" className="grid gap-3 content-start">
            <div>
              <h2 className="font-display font-semibold text-lg text-ink">Photo library</h2>
              <p className="text-sm text-ink-muted">{merchant.name}'s photos — drag any of them onto the grid.</p>
            </div>
            <PickSheet
              open={pickFor !== null}
              busy={pickBusy}
              photos={library}
              usedIds={inPlan}
              onPick={pickPhoto}
              onUpload={(files) => void pickUpload(files)}
              onClose={() => setPickFor(null)}
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search photos…"
              aria-label="Search photos"
              className="h-9 rounded-(--nv-radius-md) border border-border bg-surface text-ink placeholder:text-ink-faint px-3 text-sm
                         focus:border-brand focus:outline-none"
            />
            {!loaded ? null : library.length === 0 ? (
              <p className="text-sm text-ink-muted">No photos match — upload some in the Photo Library and assign them to {merchant.name}.</p>
            ) : (
              <div className="grid grid-cols-3 tablet:grid-cols-4 desktop:grid-cols-5 gap-1.5 max-h-[520px] overflow-y-auto pr-1">
                {library.map((p) => {
                  const used = inPlan.has(p.id)
                  return (
                    <div
                      key={p.id}
                      draggable
                      onDragStart={() => setDrag({ kind: 'lib', photoId: p.id })}
                      onDragEnd={() => setDrag(null)}
                      title={p.title}
                      className={clsx(
                        'relative aspect-square rounded-(--nv-radius-sm) overflow-hidden bg-surface-2 cursor-grab active:cursor-grabbing',
                        used && 'opacity-45',
                        drag?.photoId === p.id && 'opacity-40',
                      )}
                    >
                      <img src={p.thumbUrl} alt={p.title ?? 'Photo'} className="absolute inset-0 size-full object-cover" draggable={false} />
                      {used && (
                        <span className="absolute bottom-1 right-1 size-4 rounded-full nv-gradient text-white text-[10px] flex items-center justify-center">✓</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* post detail: caption editor + AI + remove */}
      <AnimatePresence>
        {openItem && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
            onClick={() => setOpenItem(null)}
          >
            <motion.div
              initial={{ scale: 0.96 }} animate={{ scale: 1 }} exit={{ scale: 0.96 }}
              className="bg-surface rounded-(--nv-radius-lg) shadow-xl max-w-sm w-full overflow-hidden"
              onClick={(e) => e.stopPropagation()}
              role="dialog" aria-label="Planned post"
            >
              <div className="flex items-center gap-2.5 p-3">
                <div className="size-8 rounded-full nv-gradient flex items-center justify-center text-white font-bold text-sm">
                  {merchant.name[0]}
                </div>
                <span className="text-sm font-semibold text-ink">{handle}</span>
              </div>
              <img src={openItem.url} alt={openItem.title ?? ''} className="w-full max-h-80 object-cover" />
              <div className="p-3 grid gap-3">
                <div className="flex items-center gap-4 text-ink">
                  <Heart className="size-5" aria-hidden /><MessageCircle className="size-5" aria-hidden />
                  <Send className="size-5" aria-hidden /><Bookmark className="size-5 ml-auto" aria-hidden />
                </div>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Write a caption…"
                  rows={3}
                  aria-label="Caption"
                  className="w-full rounded-(--nv-radius-md) border border-border bg-surface text-ink placeholder:text-ink-faint
                             px-3 py-2 text-sm focus:border-brand focus:outline-none resize-y"
                />
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" loading={captionBusy} icon={<Sparkles className="size-4" />}
                          onClick={() => void aiCaption()}>
                    AI caption
                  </Button>
                  <Button size="sm" onClick={() => void saveCaption()}>Save</Button>
                  <Button size="sm" variant="ghost" className="ml-auto" aria-label="Remove from plan"
                          icon={<Trash2 className="size-4" />} onClick={() => void remove(openItem.photoId)} />
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
