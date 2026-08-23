import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek,
} from 'date-fns'
import {
  CalendarClock, ChartColumn, ChevronLeft, ChevronRight, Download, ExternalLink, Eye, Heart,
  MessageCircle, MousePointerClick, Printer, RefreshCw, Unplug, UserRound, Users,
} from 'lucide-react'
import { Badge } from '../components/common/Badge'
import { Button } from '../components/common/Button'
import { Card, CardHeader } from '../components/common/Card'
import { EmptyState } from '../components/common/EmptyState'
import { Select } from '../components/common/Input'
import { Modal } from '../components/common/Modal'
import { StatTile } from '../components/common/StatTile'
import { Tabs } from '../components/common/Tabs'
import { MetricChart, compact } from '../components/analytics/MetricChart'
import { OnlineHeatmap } from '../components/analytics/OnlineHeatmap'
import { api, absoluteUrl, DEMO } from '../services/api'
import {
  demoAnalytics, fetchAnalytics, fetchAnalyticsStatus, startConnect, syncNow, disconnect,
  type AnalyticsData, type AnalyticsPost, type AnalyticsProviders,
} from '../services/analyticsData'
import { useAuth } from '../store/auth'
import { useData } from '../store/data'
import type { FeedItem } from '../types'

/* Metricool-style analytics: per-merchant Instagram dashboard, content
 * planner, best-times heatmap, and client reports. Real numbers come from
 * the Meta Graph API once a merchant's IG business account is connected;
 * the demo build shows generated sample data. */

type Tab = 'overview' | 'planner' | 'besttimes' | 'reports'

const engagementRate = (posts: AnalyticsPost[]) => {
  const scored = posts.filter((p) => p.reach && (p.likes !== undefined || p.comments !== undefined))
  if (!scored.length) return undefined
  const rate = scored.reduce((s, p) => s + ((p.likes ?? 0) + (p.comments ?? 0) + (p.saved ?? 0)) / p.reach!, 0) / scored.length
  return Math.round(rate * 1000) / 10
}

const sum = (xs: (number | undefined)[]) => xs.reduce<number>((s, x) => s + (x ?? 0), 0)

const pctDelta = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : undefined)

export default function Analytics() {
  const { merchants, photos } = useData()
  const { capabilities } = useAuth()
  const canManage = capabilities.includes('merchants.manage')
  const canReports = capabilities.includes('export.reports')
  const queryClient = useQueryClient()

  const [params, setParams] = useSearchParams()
  const merchantId = params.get('merchant') ?? ''
  const merchant = merchants.find((m) => m.id === merchantId)
  const tab = (params.get('tab') as Tab) ?? 'overview'
  const [days, setDays] = useState(30)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(() => {
    const ig = params.get('ig')
    if (ig === 'connected') return { tone: 'success', text: 'Instagram connected — first sync is running, numbers appear within a minute.' }
    if (ig === 'error') return { tone: 'error', text: params.get('reason') ?? 'Instagram connection failed.' }
    return null
  })

  const setParam = (key: string, value?: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('ig'); next.delete('reason')
    setParams(next, { replace: true })
  }

  const status = useQuery({ queryKey: ['analytics-status'], queryFn: fetchAnalyticsStatus, enabled: !DEMO })
  const data = useQuery<AnalyticsData>({
    queryKey: ['analytics', merchantId, days],
    queryFn: () => (DEMO ? Promise.resolve(demoAnalytics(merchantId, merchant?.igHandle, photos, days)) : fetchAnalytics(merchantId, days)),
    enabled: Boolean(merchantId),
    refetchInterval: DEMO ? false : 30_000,
  })

  const connect = async (provider: 'instagram' | 'facebook') => {
    setBusy(true)
    try {
      const { url } = await startConnect(merchantId, provider)
      window.location.href = url
    } catch (e) {
      setNotice({ tone: 'error', text: e instanceof Error ? e.message : 'Could not start the connection' })
      setBusy(false)
    }
  }

  const refresh = async () => {
    setBusy(true)
    try {
      await syncNow(merchantId)
      await queryClient.invalidateQueries({ queryKey: ['analytics', merchantId] })
      setNotice({ tone: 'success', text: 'Fresh numbers pulled from Instagram.' })
    } catch (e) {
      setNotice({ tone: 'error', text: e instanceof Error ? e.message : 'Sync failed' })
    } finally {
      setBusy(false)
    }
  }

  const unlink = async () => {
    setBusy(true)
    try {
      await disconnect(merchantId)
      await queryClient.invalidateQueries({ queryKey: ['analytics', merchantId] })
      await queryClient.invalidateQueries({ queryKey: ['analytics-status'] })
      setNotice({ tone: 'success', text: 'Instagram disconnected for this merchant.' })
    } finally {
      setBusy(false)
    }
  }

  if (!merchants.length) {
    return <EmptyState title="No merchants yet" description="Add a merchant first — analytics are tracked per merchant." />
  }

  // merchant-first: pick who you're looking at, then their analytics load
  if (!merchantId) {
    const accounts = status.data?.accounts ?? []
    return (
      <div className="grid gap-5">
        <div>
          <h1 className="font-display font-bold text-2xl text-ink">Analytics</h1>
          <p className="text-sm text-ink-muted">Pick a merchant to open their Instagram performance, planner and reports.</p>
        </div>
        {notice && (
          <p role="status" className={`text-sm rounded-(--nv-radius-md) border px-3.5 py-2.5 ${notice.tone === 'success' ? 'text-success bg-success-bg border-success/30' : 'text-error bg-error-bg border-error/30'}`}>
            {notice.text}
          </p>
        )}
        <div className="grid tablet:grid-cols-2 desktop:grid-cols-3 gap-4">
          {merchants.map((m) => {
            const acc = accounts.find((a) => a.merchantId === m.id)
            return (
              <button
                key={m.id}
                onClick={() => setParam('merchant', m.id)}
                className="group flex items-center gap-3.5 rounded-(--nv-radius-lg) border border-border bg-surface p-4 text-left
                           transition-colors hover:border-brand/50 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand"
              >
                {m.logoUrl ? (
                  <img src={m.logoUrl} alt="" className="size-11 rounded-full object-cover shrink-0" />
                ) : (
                  <span className="size-11 rounded-full nv-gradient flex items-center justify-center text-on-brand font-display font-bold text-lg shrink-0">
                    {m.name[0]}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink truncate">{m.name}</span>
                  <span className="mt-1 block">
                    {DEMO ? (
                      <Badge tone="info">Sample data</Badge>
                    ) : acc ? (
                      <Badge tone="success">@{acc.username ?? 'connected'}</Badge>
                    ) : (
                      <Badge tone="neutral">Not connected</Badge>
                    )}
                  </span>
                </span>
                <ChevronRight className="size-4 text-ink-faint group-hover:text-ink shrink-0" aria-hidden />
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const d = data.data
  const connected = DEMO || Boolean(d?.account)

  return (
    <div className="grid gap-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <button onClick={() => setParam('merchant', undefined)}
                  className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink transition-colors">
            <ChevronLeft className="size-4" aria-hidden /> All merchants
          </button>
          <h1 className="font-display font-bold text-2xl text-ink mt-0.5">{merchant?.name ?? 'Analytics'}</h1>
          <p className="text-sm text-ink-muted">Instagram performance, planning and reports.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select aria-label="Merchant" value={merchantId} onChange={(e) => setParam('merchant', e.target.value)} className="min-w-44">
            {merchants.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
          {connected && !DEMO && canManage && (
            <>
              <Button variant="secondary" size="md" icon={<RefreshCw className="size-4" />} onClick={() => void refresh()} disabled={busy}>
                Sync
              </Button>
              <Button variant="ghost" size="md" icon={<Unplug className="size-4" />} onClick={() => void unlink()} disabled={busy} aria-label="Disconnect Instagram" />
            </>
          )}
        </div>
      </div>

      {notice && (
        <p role="status" className={`text-sm rounded-(--nv-radius-md) border px-3.5 py-2.5 ${notice.tone === 'success' ? 'text-success bg-success-bg border-success/30' : 'text-error bg-error-bg border-error/30'}`}>
          {notice.text}
        </p>
      )}

      {d?.sample && (
        <p className="text-xs text-ink-muted -mt-2">
          <Badge tone="info">Sample data</Badge> Demo numbers — connect the real API backend to see live Instagram metrics.
        </p>
      )}

      <Tabs<Tab>
        value={tab}
        onChange={(t) => setParam('tab', t)}
        items={[
          { value: 'overview', label: 'Overview' },
          { value: 'planner', label: 'Planner' },
          { value: 'besttimes', label: 'Best times' },
          { value: 'reports', label: 'Reports' },
        ]}
      />

      {(() => {
        // the planner and reports work from the feed plan even before
        // Instagram is connected; live metrics tabs need the connection
        const needsConnection = tab === 'overview' || tab === 'besttimes'
        if (needsConnection && !connected && !DEMO) {
          return (
            <ConnectCard
              configured={Boolean(d?.configured ?? status.data?.configured)}
              providers={d?.providers ?? status.data?.providers}
              redirectUrl={status.data?.redirectUrl}
              igRedirectUrl={status.data?.igRedirectUrl}
              canManage={canManage}
              busy={busy}
              onConnect={(provider) => void connect(provider)}
              merchantName={merchant?.name ?? 'this merchant'}
            />
          )
        }
        if (tab === 'overview') return <Overview data={d} days={days} setDays={setDays} />
        if (tab === 'planner') return <Planner merchantId={merchantId} igPosts={d?.posts ?? []} />
        if (tab === 'besttimes') {
          return (
            <Card padding="lg">
              <CardHeader title="When the audience is online" subtitle="Averaged over the last two weeks — post into the hot cells" />
              <div className="mt-3"><OnlineHeatmap data={d?.onlineTimes ?? []} /></div>
            </Card>
          )
        }
        return <Reports data={d} merchantName={merchant?.name ?? ''} canReports={canReports} />
      })()}
    </div>
  )
}

/* ---------- connect / setup ---------- */

function ConnectCard({ configured, providers, redirectUrl, igRedirectUrl, canManage, busy, onConnect, merchantName }: {
  configured: boolean
  providers?: AnalyticsProviders
  redirectUrl?: string
  igRedirectUrl?: string
  canManage: boolean
  busy: boolean
  onConnect: (provider: 'instagram' | 'facebook') => void
  merchantName: string
}) {
  if (!configured) {
    return (
      <Card padding="lg" className="max-w-2xl">
        <CardHeader title="Set up Instagram analytics" subtitle="One-time Meta app setup by the studio" />
        <ol className="list-decimal ml-5 mt-3 grid gap-2 text-sm text-ink-2">
          <li>Create an app at <span className="font-medium text-ink">developers.facebook.com</span> (type “Business”).</li>
          <li>
            <span className="font-medium text-ink">Instagram-only merchants (no Facebook Page):</span> add the{' '}
            <span className="font-medium text-ink">Instagram</span> product (“API setup with Instagram business login”),
            register the redirect URL{' '}
            <code className="text-xs bg-surface-2 border border-border rounded px-1.5 py-0.5 break-all">{igRedirectUrl ?? 'https://<your-api>/api/analytics/oauth/instagram/callback'}</code>{' '}
            there, and set <code className="text-xs bg-surface-2 border border-border rounded px-1.5 py-0.5">IG_APP_ID</code> +{' '}
            <code className="text-xs bg-surface-2 border border-border rounded px-1.5 py-0.5">IG_APP_SECRET</code> on the server.
          </li>
          <li>
            <span className="font-medium text-ink">Page-linked merchants (optional fallback):</span> add{' '}
            <span className="font-medium text-ink">Facebook Login for Business</span>, register{' '}
            <code className="text-xs bg-surface-2 border border-border rounded px-1.5 py-0.5 break-all">{redirectUrl ?? 'https://<your-api>/api/analytics/oauth/callback'}</code>,
            and set <code className="text-xs bg-surface-2 border border-border rounded px-1.5 py-0.5">META_APP_ID</code> +{' '}
            <code className="text-xs bg-surface-2 border border-border rounded px-1.5 py-0.5">META_APP_SECRET</code>.
          </li>
          <li>The merchant's Instagram must be a <span className="font-medium text-ink">professional account</span> (Business or Creator).</li>
        </ol>
        <p className="text-xs text-ink-muted mt-3">Once configured, connect buttons appear here for every merchant.</p>
      </Card>
    )
  }
  return (
    <Card padding="lg" className="max-w-xl text-center grid gap-3 justify-items-center">
      <span className="size-12 rounded-full nv-gradient flex items-center justify-center text-on-brand">
        <ChartColumn className="size-6" aria-hidden />
      </span>
      <div>
        <h2 className="font-display font-semibold text-lg text-ink">Connect {merchantName}'s Instagram</h2>
        <p className="text-sm text-ink-muted mt-1">
          NOUVII pulls followers, reach, post performance and audience times — read-only.
        </p>
      </div>
      {canManage ? (
        <div className="grid gap-2 justify-items-center">
          {providers?.instagram !== false && (
            <Button onClick={() => onConnect('instagram')} disabled={busy}>
              {busy ? 'Opening Instagram…' : 'Log in with Instagram'}
            </Button>
          )}
          {providers?.facebook && (
            <Button
              variant={providers?.instagram === false ? 'primary' : 'secondary'}
              size={providers?.instagram === false ? 'md' : 'sm'}
              onClick={() => onConnect('facebook')}
              disabled={busy}
            >
              {providers?.instagram === false ? 'Connect via Facebook' : 'Use Facebook instead (Page-linked account)'}
            </Button>
          )}
          <p className="text-xs text-ink-muted max-w-sm">
            Instagram login works with just the merchant's IG professional account — no Facebook Page needed.
          </p>
        </div>
      ) : (
        <p className="text-sm text-ink-muted">Ask someone with merchant-management access to connect it.</p>
      )}
    </Card>
  )
}

/* ---------- overview ---------- */

function Overview({ data, days, setDays }: { data?: AnalyticsData; days: number; setDays: (d: number) => void }) {
  const series = data?.series ?? []
  const posts = data?.posts ?? []
  const half = Math.floor(series.length / 2)
  const [prev, cur] = [series.slice(0, half), series.slice(half)]
  const followersNow = series.at(-1)?.followers
  const followersStart = series[0]?.followers
  const er = engagementRate(posts)
  const topPosts = [...posts].sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0)).slice(0, 6)

  return (
    <div className="grid gap-5">
      <div className="flex justify-end">
        <Select aria-label="Period" value={String(days)} onChange={(e) => setDays(Number(e.target.value))} className="w-36">
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </Select>
      </div>
      <div className="grid grid-cols-2 desktop:grid-cols-4 gap-4">
        <StatTile
          label="Followers" icon={<Users />}
          value={followersNow !== undefined ? compact(followersNow) : '—'}
          delta={followersNow !== undefined && followersStart ? pctDelta(followersNow, followersStart) : undefined}
          deltaGood={(followersNow ?? 0) >= (followersStart ?? 0)} deltaPeriod={`${days}d ago`}
          spark={series.map((s) => s.followers ?? 0)}
        />
        <StatTile
          label="Reach" icon={<Eye />}
          value={compact(sum(cur.map((s) => s.reach)) + sum(prev.map((s) => s.reach)))}
          delta={pctDelta(sum(cur.map((s) => s.reach)), sum(prev.map((s) => s.reach)))}
          deltaGood={sum(cur.map((s) => s.reach)) >= sum(prev.map((s) => s.reach))} deltaPeriod="previous half"
          spark={series.map((s) => s.reach ?? 0)}
        />
        <StatTile
          label="Engagement rate" icon={<Heart />}
          value={er !== undefined ? `${er}%` : '—'}
        />
        <StatTile
          label="Profile views" icon={<UserRound />}
          value={compact(sum(series.map((s) => s.profileViews)))}
          spark={series.map((s) => s.profileViews ?? 0)}
        />
      </div>

      <div className="grid desktop:grid-cols-2 gap-5">
        <Card padding="lg">
          <CardHeader title="Follower growth" />
          <MetricChart
            data={series.filter((s) => s.followers !== undefined).map((s) => ({ date: s.day, value: s.followers! }))}
            unit="followers" ariaLabel="Followers over time"
          />
        </Card>
        <Card padding="lg">
          <CardHeader title="Daily reach" />
          <MetricChart
            data={series.filter((s) => s.reach !== undefined).map((s) => ({ date: s.day, value: s.reach! }))}
            unit="reached" ariaLabel="Daily reach over time"
          />
        </Card>
      </div>

      <Card padding="lg">
        <CardHeader title="Top posts" subtitle="By likes, over the loaded window" />
        {topPosts.length === 0 ? (
          <p className="text-sm text-ink-muted mt-2">No post data yet.</p>
        ) : (
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-muted border-b border-border">
                  <th className="py-2 pr-3 font-medium">Post</th>
                  <th className="py-2 px-3 font-medium">Posted</th>
                  <th className="py-2 px-3 font-medium"><span className="inline-flex items-center gap-1"><Heart className="size-3.5" aria-hidden />Likes</span></th>
                  <th className="py-2 px-3 font-medium"><span className="inline-flex items-center gap-1"><MessageCircle className="size-3.5" aria-hidden />Comments</span></th>
                  <th className="py-2 px-3 font-medium"><span className="inline-flex items-center gap-1"><Eye className="size-3.5" aria-hidden />Reach</span></th>
                  <th className="py-2 pl-3 font-medium"><span className="inline-flex items-center gap-1"><MousePointerClick className="size-3.5" aria-hidden />Saves</span></th>
                </tr>
              </thead>
              <tbody>
                {topPosts.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3">
                      <span className="flex items-center gap-2.5 min-w-44">
                        {p.thumbUrl && <img src={p.thumbUrl} alt="" className="size-10 rounded-(--nv-radius-sm) object-cover shrink-0" />}
                        <span className="text-ink-2 line-clamp-2 max-w-72">{p.caption ?? 'Untitled post'}</span>
                        {p.permalink && (
                          <a href={p.permalink} target="_blank" rel="noreferrer" aria-label="Open on Instagram" className="text-ink-faint hover:text-ink">
                            <ExternalLink className="size-3.5" aria-hidden />
                          </a>
                        )}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-ink-muted whitespace-nowrap">{p.postedAt ? format(new Date(p.postedAt), 'MMM d') : '—'}</td>
                    <td className="py-2 px-3 tabular-nums">{p.likes?.toLocaleString() ?? '—'}</td>
                    <td className="py-2 px-3 tabular-nums">{p.comments?.toLocaleString() ?? '—'}</td>
                    <td className="py-2 px-3 tabular-nums">{p.reach?.toLocaleString() ?? '—'}</td>
                    <td className="py-2 pl-3 tabular-nums">{p.saved?.toLocaleString() ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

/* ---------- content planner ---------- */

function Planner({ merchantId, igPosts }: { merchantId: string; igPosts: AnalyticsPost[] }) {
  const { photos } = useData()
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [items, setItems] = useState<FeedItem[]>([])
  const [pickDay, setPickDay] = useState<Date | null>(null)

  useEffect(() => {
    if (DEMO) {
      setItems(
        photos
          .filter((p) => p.merchantId === merchantId && p.approvalStatus === 'approved')
          .map((p, i) => ({ photoId: p.id, position: i, title: p.title, url: p.url, thumbUrl: p.thumbUrl })),
      )
      return
    }
    api<{ items: FeedItem[] }>('GET', `/merchants/${merchantId}/feed`)
      .then((res) => setItems(res.items.map((i) => ({ ...i, url: absoluteUrl(i.url), thumbUrl: absoluteUrl(i.thumbUrl) }))))
      .catch(() => setItems([]))
  }, [merchantId, photos])

  const schedule = async (photoId: string, when: Date | null) => {
    setItems((cur) => cur.map((i) => (i.photoId === photoId ? { ...i, scheduledAt: when?.toISOString() } : i)))
    setPickDay(null)
    if (!DEMO) {
      await api('PATCH', `/merchants/${merchantId}/feed/${photoId}`, { scheduledAt: when ? when.toISOString() : null }).catch(() => {})
    }
  }

  const unscheduled = items.filter((i) => !i.scheduledAt)
  const gridStart = startOfWeek(startOfMonth(month))
  const gridEnd = endOfWeek(endOfMonth(month))
  const gridDays = eachDayOfInterval({ start: gridStart, end: gridEnd })

  return (
    <div className="grid desktop:grid-cols-4 gap-5 items-start">
      <Card padding="lg" className="desktop:col-span-3">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="font-display font-semibold text-lg text-ink">{format(month, 'MMMM yyyy')}</h2>
          <span className="flex gap-1">
            <Button variant="ghost" size="sm" icon={<ChevronLeft className="size-4" />} aria-label="Previous month" onClick={() => setMonth((m) => addMonths(m, -1))} />
            <Button variant="ghost" size="sm" onClick={() => setMonth(startOfMonth(new Date()))}>Today</Button>
            <Button variant="ghost" size="sm" icon={<ChevronRight className="size-4" />} aria-label="Next month" onClick={() => setMonth((m) => addMonths(m, 1))} />
          </span>
        </div>
        <div className="grid grid-cols-7 text-center text-xs text-ink-muted font-medium mb-1">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <span key={d} className="py-1">{d}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {gridDays.map((day) => {
            const planned = items.filter((i) => i.scheduledAt && isSameDay(new Date(i.scheduledAt), day))
            const published = igPosts.filter((p) => p.postedAt && isSameDay(new Date(p.postedAt), day))
            const inMonth = isSameMonth(day, month)
            return (
              <button
                key={day.toISOString()}
                onClick={() => setPickDay(day)}
                className={`min-h-20 rounded-(--nv-radius-md) border p-1.5 text-left align-top transition-colors
                            ${inMonth ? 'border-border bg-surface hover:border-brand/50' : 'border-transparent bg-surface-2/50 text-ink-faint'}
                            ${isSameDay(day, new Date()) ? 'outline-2 outline-(--nv-coral)/40' : ''}`}
                aria-label={`Plan a post on ${format(day, 'MMMM d')}`}
              >
                <span className="text-xs tabular-nums text-ink-muted">{format(day, 'd')}</span>
                <span className="mt-1 flex flex-wrap gap-1">
                  {planned.map((i) => (
                    <img key={i.photoId} src={i.thumbUrl} alt={i.title ?? 'Planned post'} title={i.title}
                         className="size-7 rounded-[4px] object-cover ring-2 ring-(--nv-coral)" />
                  ))}
                  {published.map((p) => (
                    p.thumbUrl
                      ? <img key={p.id} src={p.thumbUrl} alt="Published post" className="size-7 rounded-[4px] object-cover opacity-60" />
                      : <span key={p.id} className="size-2 rounded-full bg-ink-faint mt-2" title="Published on Instagram" />
                  ))}
                </span>
              </button>
            )
          })}
        </div>
        <p className="text-xs text-ink-muted mt-3 flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-[3px] ring-2 ring-(--nv-coral) bg-surface-2" /> planned from the feed plan</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-[3px] bg-ink-faint/40" /> already published</span>
        </p>
      </Card>

      <Card padding="lg">
        <CardHeader title="Ready to schedule" subtitle="Approved photos on the feed plan" />
        {unscheduled.length === 0 ? (
          <p className="text-sm text-ink-muted mt-2">
            Everything on the plan has a slot. Add more photos on the merchant's <span className="font-medium">feed planner</span>.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5 mt-2">
            {unscheduled.map((i) => (
              <img key={i.photoId} src={i.thumbUrl} alt={i.title ?? 'Photo'} title={i.title}
                   className="aspect-square rounded-(--nv-radius-sm) object-cover" />
            ))}
          </div>
        )}
        <p className="text-xs text-ink-muted mt-3 flex items-start gap-1.5">
          <CalendarClock className="size-3.5 mt-0.5 shrink-0" aria-hidden />
          Click a day on the calendar to give one a posting slot.
        </p>
      </Card>

      <Modal open={pickDay !== null} onClose={() => setPickDay(null)} title={pickDay ? `Plan for ${format(pickDay, 'EEEE, MMM d')}` : undefined}>
        {pickDay && (
          <div className="grid gap-4">
            {items.filter((i) => i.scheduledAt && isSameDay(new Date(i.scheduledAt), pickDay)).map((i) => (
              <div key={i.photoId} className="flex items-center gap-3">
                <img src={i.thumbUrl} alt="" className="size-12 rounded-(--nv-radius-sm) object-cover" />
                <span className="text-sm text-ink-2 flex-1 truncate">{i.title ?? 'Planned post'}</span>
                <Button variant="ghost" size="sm" onClick={() => void schedule(i.photoId, null)}>Unschedule</Button>
              </div>
            ))}
            {unscheduled.length === 0 ? (
              <p className="text-sm text-ink-muted">No unscheduled photos left on the feed plan.</p>
            ) : (
              <>
                <p className="text-sm text-ink-muted">Pick a photo to post this day (7:00 pm local):</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {unscheduled.map((i) => (
                    <button key={i.photoId} onClick={() => void schedule(i.photoId, new Date(pickDay.getFullYear(), pickDay.getMonth(), pickDay.getDate(), 19))}
                            className="relative aspect-square rounded-(--nv-radius-sm) overflow-hidden focus-visible:outline-2 focus-visible:outline-brand hover:opacity-85">
                      <img src={i.thumbUrl} alt={i.title ?? 'Photo'} className="absolute inset-0 size-full object-cover" />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

/* ---------- reports ---------- */

function Reports({ data, merchantName, canReports }: { data?: AnalyticsData; merchantName: string; canReports: boolean }) {
  const series = data?.series ?? []
  const posts = data?.posts ?? []
  const er = engagementRate(posts)
  const kpis = [
    ['Followers', series.at(-1)?.followers?.toLocaleString() ?? '—'],
    ['Total reach', sum(series.map((s) => s.reach)).toLocaleString()],
    ['Total impressions', sum(series.map((s) => s.impressions)).toLocaleString()],
    ['Profile views', sum(series.map((s) => s.profileViews)).toLocaleString()],
    ['Website clicks', sum(series.map((s) => s.websiteClicks)).toLocaleString()],
    ['Engagement rate', er !== undefined ? `${er}%` : '—'],
  ] as const

  const downloadCsv = () => {
    const header = 'day,followers,reach,impressions,profile_views,website_clicks'
    const rows = series.map((s) => [s.day, s.followers ?? '', s.reach ?? '', s.impressions ?? '', s.profileViews ?? '', s.websiteClicks ?? ''].join(','))
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${merchantName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-instagram-report.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const printReport = () => {
    const w = window.open('', '_blank', 'width=800,height=900')
    if (!w) return
    const top = [...posts].sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0)).slice(0, 5)
    w.document.write(`<!doctype html><html><head><title>${merchantName} — Instagram report</title>
<style>
  body{font-family:Inter,system-ui,sans-serif;color:#1a1a1a;margin:40px;max-width:680px}
  h1{font-size:22px;margin:0} .brand{background:linear-gradient(90deg,#FF6B5B,#C41E3A);-webkit-background-clip:text;background-clip:text;color:transparent;font-weight:800}
  .sub{color:#666;font-size:13px;margin-top:4px}
  .kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:28px 0}
  .kpi{border:1px solid #e5e5e5;border-radius:10px;padding:12px}
  .kpi b{display:block;font-size:20px;margin-top:2px} .kpi span{font-size:12px;color:#666}
  table{width:100%;border-collapse:collapse;font-size:13px} th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #eee}
  th{color:#666;font-weight:600;font-size:12px}
  footer{margin-top:32px;font-size:11px;color:#999}
</style></head><body>
<h1><span class="brand">NOUVII</span> · ${merchantName}</h1>
<p class="sub">Instagram performance report · ${new Date().toLocaleDateString()} · last ${series.length} days${data?.sample ? ' · sample data' : ''}</p>
<div class="kpis">${kpis.map(([k, v]) => `<div class="kpi"><span>${k}</span><b>${v}</b></div>`).join('')}</div>
<h3>Top posts</h3>
<table><tr><th>Caption</th><th>Likes</th><th>Comments</th><th>Reach</th></tr>
${top.map((p) => `<tr><td>${(p.caption ?? 'Untitled').slice(0, 60).replace(/</g, '&lt;')}</td><td>${p.likes ?? '—'}</td><td>${p.comments ?? '—'}</td><td>${p.reach ?? '—'}</td></tr>`).join('')}
</table>
<footer>Prepared with NOUVII — Task Manager &amp; Photo Library</footer>
<script>window.print()</script></body></html>`)
    w.document.close()
  }

  return (
    <Card padding="lg" className="max-w-3xl">
      <CardHeader title="Client report" subtitle="A branded summary to share with the merchant" />
      <div className="grid grid-cols-2 tablet:grid-cols-3 gap-3 mt-3">
        {kpis.map(([k, v]) => (
          <div key={k} className="rounded-(--nv-radius-md) border border-border p-3">
            <p className="text-xs text-ink-muted">{k}</p>
            <p className="text-lg font-semibold text-ink tabular-nums">{v}</p>
          </div>
        ))}
      </div>
      {canReports ? (
        <div className="flex gap-2 mt-4 flex-wrap">
          <Button icon={<Printer className="size-4" />} onClick={printReport}>Print / save as PDF</Button>
          <Button variant="secondary" icon={<Download className="size-4" />} onClick={downloadCsv}>Download CSV</Button>
        </div>
      ) : (
        <p className="text-sm text-ink-muted mt-4">Exporting needs the “Export CSV &amp; reports” access — ask an admin to grant it.</p>
      )}
      <p className="text-xs text-ink-muted mt-3">
        Tip: the merchant's live feed preview is on their <Link to="/merchants" className="text-brand-deep dark:text-brand hover:underline">profile page</Link>.
      </p>
    </Card>
  )
}
