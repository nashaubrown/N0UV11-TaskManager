import { format, formatDistanceToNow, isPast, isToday } from 'date-fns'

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let v = bytes
  let i = -1
  do { v /= 1024; i++ } while (v >= 1024 && i < units.length - 1)
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`
}

export function formatDue(dueAt: string): { label: string; overdue: boolean } {
  const d = new Date(dueAt)
  if (isToday(d)) return { label: 'Due today', overdue: false }
  if (isPast(d)) return { label: `Overdue · ${formatDistanceToNow(d)} ago`, overdue: true }
  return { label: `Due ${format(d, 'MMM d')}`, overdue: false }
}

export const formatDate = (iso: string) => format(new Date(iso), 'MMM d, yyyy')
export const formatDateTime = (iso: string) => format(new Date(iso), "MMM d, yyyy 'at' h:mm a")
export const timeAgo = (iso: string) => `${formatDistanceToNow(new Date(iso))} ago`

export function formatMoney(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100)
}

export const initials = (name: string) =>
  name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
