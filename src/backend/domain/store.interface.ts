import type { 
  LogEntry, 
  MetricEntry, 
  TraceEntry, 
  SqlQueryResult, 
  SystemStats,
  AlertRule,
  AlertHistoryEntry
} from './types'

// ─── Query Param Types ────────────────────────────────────────────────────────

export interface LogQueryParams {
  service?: string
  level?: string
  from?: number    // Unix ms
  to?: number      // Unix ms
  limit?: number
  offset?: number
  projectId: string
}

export interface MetricQueryParams {
  name?: string
  from?: number
  to?: number
  limit?: number
  offset?: number
  projectId: string
}

export interface TraceQueryParams {
  trace_id?: string
  from?: number
  to?: number
  limit?: number
  offset?: number
  projectId: string
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
  metricNames(projectId: string): Promise<string[]>
  queryTraces(params: TraceQueryParams): Promise<import('./types').PaginatedResponse<TraceEntry>>
  executeSql(sql: string, projectId: string): Promise<SqlQueryResult>

  // ── Stats ─────────────────────────────────────────────────────────────────
  collectStats(queueSize: number, capacity: number, projectId: string): Promise<SystemStats>

  // ── Maintenance ───────────────────────────────────────────────────────────
  /** Run VACUUM + ANALYZE (or equivalent) to reclaim space & update planner. */
  optimize(): Promise<{ durationMs: number }>

  /** Delete all records older than the given Unix ms timestamps. Scoped to project. */
  deleteBefore(params: {
    logsBefore?: number
    metricsBefore?: number
    tracesBefore?: number
    projectId: string
  }): Promise<TtlDeleteResult>

  // ── Alerts ───────────────────────────────────────────────────────────────
  getAlertRules(projectId: string): Promise<AlertRule[]>
  saveAlertRule(rule: AlertRule): Promise<void>
  deleteAlertRule(id: string, projectId: string): Promise<void>
  saveAlertHistory(entry: AlertHistoryEntry): Promise<void>
  getAlertHistory(projectId: string, ruleId?: string, limit?: number): Promise<AlertHistoryEntry[]>
  // ── Visualization ──────────────────────────────────────────────────────────
  getServiceMap(projectId: string, from?: number, to?: number): Promise<{ source: string, target: string, count: number }[]>

  // ── Project Management ──────────────────────────────────────────────────────
  getProjects(): Promise<import('./types').Project[]>
  saveProject(project: import('./types').Project): Promise<void>
  getApiKeys(projectId: string): Promise<import('./types').ApiKey[]>
  saveApiKey(key: import('./types').ApiKey): Promise<void>
  getApiKey(key: string): Promise<import('./types').ApiKey | null>
}
