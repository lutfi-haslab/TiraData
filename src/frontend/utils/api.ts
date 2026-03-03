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

export interface Project {
  id: string
  name: string
  createdAt: number
}

export interface UserProject {
  userId: string
  projectId: string
  role: 'admin' | 'viewer'
  createdAt: number
}

export interface ApiKey {
  key: string
  projectId: string
  name: string
  role: 'admin' | 'ingest'
  createdAt: number
}

// ─── Core Fetch Helper ────────────────────────────────────────────────────────

async function apiFetch<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const apiKey = localStorage.getItem('tira_api_key') || ''
  const projectId = localStorage.getItem('tira_project_id') || ''
  const jwt = localStorage.getItem('tira_jwt') || ''

  const headers = new Headers(init?.headers)
  if (apiKey) headers.set('X-API-Key', apiKey)
  if (projectId) headers.set('X-Project-Id', projectId)
  if (jwt) headers.set('Authorization', `Bearer ${jwt}`)

  const res = await fetch(input, { ...init, headers })
  if (!res.ok) {
    if (res.status === 401 && !input.toString().includes('/api/auth/')) {
      // Clear token and redirect to login if not already on auth page
      localStorage.removeItem('tira_jwt')
      if (window.location.pathname !== '/login' && window.location.pathname !== '/signup') {
        window.location.href = '/login'
      }
    }
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

  metrics: (params: { name?: string; from?: number; to?: number; limit?: number; offset?: number } = {}) => {
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

  traces: (params: { trace_id?: string; from?: number; to?: number; limit?: number; offset?: number } = {}) => {
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

  // ── Admin: Projects & Keys ───────────────────────────────────────────────
  getProjects: () =>
    apiFetch<Project[]>('/api/admin/projects'),

  createProject: (name: string, id?: string) =>
    apiFetch<{ success: boolean; project: Project }>('/api/admin/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, id }),
    }),

  getProjectUsers: (projectId: string) =>
    apiFetch<UserProject[]>(`/api/admin/projects/${projectId}/users`),

  shareProject: (projectId: string, email: string, role: 'admin' | 'viewer') =>
    apiFetch<{ success: boolean }>(`/api/admin/projects/${projectId}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role }),
    }),

  getKeys: () =>
    apiFetch<ApiKey[]>('/api/admin/keys'),

  createKey: (name: string, role: 'admin' | 'ingest' = 'ingest') =>
    apiFetch<{ success: boolean; key: ApiKey }>('/api/admin/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, role }),
    }),

  // ── Auth ───────────────────────────────────────────────────────────────────
  login: (email: string, password: string) =>
    apiFetch<{ success: boolean; token: string; user: { id: string; email: string } }>('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }),

  signup: (email: string, password: string) =>
    apiFetch<{ success: boolean; token: string; user: { id: string; email: string } }>('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }),

  getMe: () =>
    apiFetch<{ user: { id: string; email: string }; token: string | null }>('/api/auth/me'),
}
