import type { LogEntry, MetricEntry, TraceEntry, SqlQueryResult, SystemStats } from './types'

// ─── Query Param Types ────────────────────────────────────────────────────────

export interface LogQueryParams {
  service?: string
  level?: string
  from?: number    // Unix ms
  to?: number      // Unix ms
  limit?: number
  offset?: number
}

export interface MetricQueryParams {
  name?: string
  from?: number
  to?: number
  limit?: number
  offset?: number
}

export interface TraceQueryParams {
  trace_id?: string
  from?: number
  to?: number
  limit?: number
  offset?: number
}

export interface TtlDeleteResult {
  logs: number
  metrics: number
  traces: number
}

// ─── Store Interface ──────────────────────────────────────────────────────────

/**
 * IStore – common contract for all storage adapters.
 *
 * Both SQLiteStore and PostgresStore implement this interface so the HTTP
 * layer, queue, and use-cases are fully adapter-agnostic.
 *
 * Methods return Promises so Postgres (async I/O) and SQLite (sync, wrapped)
 * can both satisfy the contract uniformly.
 */
export interface IStore {
  // ── Write ────────────────────────────────────────────────────────────────
  insertLogs(batch: LogEntry[]): Promise<void>
  insertMetrics(batch: MetricEntry[]): Promise<void>
  insertTraces(batch: TraceEntry[]): Promise<void>

  // ── Read ─────────────────────────────────────────────────────────────────
  queryLogs(params: LogQueryParams): Promise<import('./types').PaginatedResponse<LogEntry>>
  queryMetrics(params: MetricQueryParams): Promise<import('./types').PaginatedResponse<MetricEntry>>
  metricNames(): Promise<string[]>
  queryTraces(params: TraceQueryParams): Promise<import('./types').PaginatedResponse<TraceEntry>>
  executeSql(sql: string): Promise<SqlQueryResult>

  // ── Stats ─────────────────────────────────────────────────────────────────
  collectStats(queueSize: number, capacity: number): Promise<SystemStats>

  // ── Maintenance ───────────────────────────────────────────────────────────
  /** Run VACUUM + ANALYZE (or equivalent) to reclaim space & update planner. */
  optimize(): Promise<{ durationMs: number }>

  /** Delete all records older than the given Unix ms timestamps. */
  deleteBefore(params: {
    logsBefore?: number
    metricsBefore?: number
    tracesBefore?: number
  }): Promise<TtlDeleteResult>
}
