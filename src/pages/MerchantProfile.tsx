import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Bookmark, ChartColumn, ChevronDown, Copy, Grid3x3, Heart, Link2, MessageCircle, Play, Plus, Send, Sparkles, SquarePlay, SquareUser, Trash2, UserPlus } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import { Button } from '../components/common/Button'
import { Card } from '../components/common/Card'
import { EmptyState } from '../components/common/EmptyState'
import { api, absoluteUrl, DEMO } from '../services/api'
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
  const { merchants, photos } = useData()
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
  const [dragId, setDragId] = useState<string | null>(null)

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
  const tray = useMemo(
    () => photos.filter((p) => p.merchantId === merchantId && p.approvalStatus === 'approved' && !inPlan.has(p.id)),
    [photos, merchantId, inPlan],
  )

  const persistOrder = (next: FeedItem[]) => {
    setItems(next.map((i, idx) => ({ ...i, position: idx })))
    if (!DEMO && merchantId) {
      void api('PATCH', `/merchants/${merchantId}/feed`, { order: next.map((i) => i.photoId) }).catch(() => {})
    }
  }

  const add = async (photoId: string) => {
    if (DEMO) {
      const p = photos.find((x) => x.id === photoId)!
      persistOrder([{ photoId, position: 0, title: p.title, url: p.url, thumbUrl: p.thumbUrl }, ...items])
      return
    }
    try {
      const d = await api<{ items: FeedItem[] }>('POST', `/merchants/${merchantId}/feed`, { photoId })
      setItems(d.items.map((i) => ({ ...i, url: absoluteUrl(i.url), thumbUrl: absoluteUrl(i.thumbUrl) })))
      setError(undefined)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the photo')
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

  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return
    const next = [...items]
    const from = next.findIndex((i) => i.photoId === dragId)
    const to = next.findIndex((i) => i.photoId === targetId)
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    persistOrder(next)
    setDragId(null)
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
          <div className="bg-white dark:bg-neutral-950 min-h-[890px] flex flex-col">
            {/* dynamic island */}
            <div className="h-10 bg-inherit flex items-center justify-center">
              <div className="w-28 h-6 rounded-full bg-black" />
            </div>
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
                      {igTab === 'grid' && items.map((item) => (
                        <button
                          key={item.photoId}
                          draggable
                          onDragStart={() => setDragId(item.photoId)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => onDrop(item.photoId)}
                          onClick={() => { setOpenItem(item); setCaption(item.caption ?? '') }}
                          className={clsx(
                            'relative overflow-hidden bg-neutral-200 cursor-grab active:cursor-grabbing',
                            ratio === '1:1' ? 'aspect-square' : 'aspect-[3/4]',
                            dragId === item.photoId && 'opacity-50',
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

        {/* approved-photo tray */}
        <Card padding="lg" className="w-full grid gap-3 content-start">
          <div>
            <h2 className="font-display font-semibold text-lg text-ink">Approved photos</h2>
            <p className="text-sm text-ink-muted">Add to the plan — drag tiles on the phone to set posting order (top-left posts last).</p>
          </div>
          {!loaded ? null : tray.length === 0 ? (
            <p className="text-sm text-ink-muted">
              {items.length > 0 ? 'Every approved photo is on the plan.' : 'No approved photos for this merchant yet — approvals feed the plan.'}
            </p>
          ) : (
            <div className="grid grid-cols-3 tablet:grid-cols-4 gap-2">
              {tray.map((p) => (
                <button
                  key={p.id}
                  onClick={() => void add(p.id)}
                  className="group relative aspect-square rounded-(--nv-radius-md) overflow-hidden bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand"
                  aria-label={`Add ${p.title ?? 'photo'} to the feed plan`}
                >
                  <img src={p.thumbUrl} alt="" className="absolute inset-0 size-full object-cover" />
                  <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Plus className="size-6 text-white" aria-hidden />
                  </span>
                </button>
              ))}
            </div>
          )}
        </Card>
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
