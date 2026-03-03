/**
 * Typed API Client
 *
 * All functions return typed data; errors surface as thrown Errors.
 * Every fetch goes through `apiFetch` which handles JSON parsing + error mapping.
 */

// ─── Shared Types (mirror domain/types.ts for browser) ────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal'

export interface LogEntry {
  id: string
  timestamp: number
  level: LogLevel
  service: string
  message: string
  attributes: Record<string, unknown>
}

export interface MetricEntry {
  timestamp: number
  name: string
  value: number
  labels: Record<string, string>
}

export interface TraceEntry {
  trace_id: string
  span_id: string
  parent_id: string | null
  start_time: number
  duration: number
  name: string
  attributes: Record<string, unknown>
}

export interface SystemStats {
  logs:    { total: number; last_1h: number }
  metrics: { total: number; series: number }
  traces:  { total: number }
  queue:   { size: number; capacity: number; utilization: number }
  uptime_s: number
}

export interface SqlQueryResult {
  columns: string[]
  rows: unknown[][]
  rowCount: number
  durationMs: number
  error?: string
}

// ─── Core Fetch Helper ────────────────────────────────────────────────────────

async function apiFetch<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init)
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`[${res.status}] ${text}`)
  }
  return res.json() as Promise<T>
}

// ─── API Functions ────────────────────────────────────────────────────────────

export const api = {
  health: () =>
    apiFetch<{ status: string; time: string }>('/api/health'),

  stats: () =>
    apiFetch<SystemStats>('/api/stats'),

  logs: (params: {
    service?: string
    level?: string
    from?: number
    to?: number
    limit?: number
    offset?: number
  } = {}) => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v != null) qs.set(k, String(v))
    }
    return apiFetch<{ data: LogEntry[]; count: number }>(
      `/api/logs?${qs.toString()}`
    )
  },

  metrics: (params: { name?: string; from?: number; to?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v != null) qs.set(k, String(v))
    }
    return apiFetch<{ data: MetricEntry[]; count: number }>(
      `/api/metrics?${qs.toString()}`
    )
  },

  metricNames: () =>
    apiFetch<{ data: string[] }>('/api/metrics/names'),

  traces: (params: { trace_id?: string; from?: number; to?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v != null) qs.set(k, String(v))
    }
    return apiFetch<{ data: TraceEntry[]; count: number }>(
      `/api/traces?${qs.toString()}`
    )
  },

  sqlQuery: (sql: string) =>
    apiFetch<SqlQueryResult>('/api/query/sql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql }),
    }),

  ingestLog:    (payload: unknown) =>
    apiFetch('/api/ingest/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  ingestMetric: (payload: unknown) =>
    apiFetch('/api/ingest/metric', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  ingestTrace:  (payload: unknown) =>
    apiFetch('/api/ingest/trace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
}
