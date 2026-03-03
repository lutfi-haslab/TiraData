// ─── Core Domain Types ───────────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal'

export interface LogEntry {
  id: string
  timestamp: number // Unix ms
  level: LogLevel
  service: string
  message: string
  attributes: Record<string, unknown>
}

export interface MetricEntry {
  timestamp: number // Unix ms
  name: string
  value: number
  labels: Record<string, string>
}

export interface TraceEntry {
  trace_id: string
  span_id: string
  parent_id: string | null
  start_time: number // Unix ms
  duration: number // ms
  name: string
  attributes: Record<string, unknown>
}

// ─── Ingestion Payloads ───────────────────────────────────────────────────────

export interface IngestLogPayload {
  level?: LogLevel
  service?: string
  message: string
  attributes?: Record<string, unknown>
  timestamp?: number
}

export interface IngestMetricPayload {
  name: string
  value: number
  labels?: Record<string, string>
  timestamp?: number
}

export interface IngestTracePayload {
  trace_id: string
  span_id: string
  parent_id?: string
  start_time?: number
  duration: number
  name: string
  attributes?: Record<string, unknown>
}

export interface PaginatedResponse<T> {
  data: T[]
  count: number // Total matching records for pagination
}

// ─── Query ────────────────────────────────────────────────────────────────────

export interface SqlQueryResult {
  columns: string[]
  rows: unknown[][]
  rowCount: number
  durationMs: number
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export interface SystemStats {
  logs: { total: number; last_1h: number }
  metrics: { total: number; series: number }
  traces: { total: number }
  queue: { size: number; capacity: number; utilization: number }
  uptime_s: number
}
