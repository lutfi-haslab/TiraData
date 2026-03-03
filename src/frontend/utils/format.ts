import { format } from 'date-fns'

/** Format a Unix ms timestamp as a human-readable string. */
export function fmtTime(ts: number): string {
  return format(new Date(ts), 'yyyy-MM-dd HH:mm:ss.SSS')
}

/** Format a Unix ms timestamp as short time for chart axes. */
export function fmtTimeShort(ts: number): string {
  return format(new Date(ts), 'HH:mm:ss')
}

/** Format a duration in ms as a human-readable string. */
export function fmtDuration(ms: number): string {
  if (ms < 1)    return `${(ms * 1000).toFixed(0)}µs`
  if (ms < 1000) return `${ms.toFixed(1)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

/** Format uptime seconds as hh:mm:ss. */
export function fmtUptime(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':')
}

/** Format a large number with K/M suffix. */
export function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

/** Pretty-print JSON attributes. */
export function fmtAttrs(obj: Record<string, unknown>): string {
  const entries = Object.entries(obj)
  if (entries.length === 0) return '—'
  return entries.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ')
}
