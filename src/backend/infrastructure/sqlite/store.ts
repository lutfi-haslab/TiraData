import { Database } from 'bun:sqlite'
import type { LogEntry, MetricEntry, SqlQueryResult, SystemStats, TraceEntry } from '../domain/types'

// ─── Schema DDL ──────────────────────────────────────────────────────────────

const DDL = /* sql */`
  CREATE TABLE IF NOT EXISTS logs (
    id        TEXT    PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    level     TEXT    NOT NULL,
    service   TEXT    NOT NULL,
    message   TEXT    NOT NULL,
    attributes TEXT   NOT NULL DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS metrics (
    timestamp INTEGER NOT NULL,
    name      TEXT    NOT NULL,
    value     REAL    NOT NULL,
    labels    TEXT    NOT NULL DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS traces (
    trace_id   TEXT    NOT NULL,
    span_id    TEXT    NOT NULL PRIMARY KEY,
    parent_id  TEXT,
    start_time INTEGER NOT NULL,
    duration   INTEGER NOT NULL,
    name       TEXT    NOT NULL,
    attributes TEXT    NOT NULL DEFAULT '{}'
  );

  -- Covering indexes for time-range queries
  CREATE INDEX IF NOT EXISTS idx_logs_ts     ON logs    (timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_logs_svc    ON logs    (service, timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_metrics_ts  ON metrics (name, timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_traces_ts   ON traces  (start_time DESC);
  CREATE INDEX IF NOT EXISTS idx_traces_id   ON traces  (trace_id);
`

// ─── Prepared Statement Cache ─────────────────────────────────────────────────

const startMs = Date.now()

export class SqliteStore {
  private readonly db: Database

  // Prepared statements compiled once, reused on every call
  private readonly stmtInsertLog: ReturnType<Database['prepare']>
  private readonly stmtInsertMetric: ReturnType<Database['prepare']>
  private readonly stmtInsertTrace: ReturnType<Database['prepare']>
  private readonly stmtCountLogs: ReturnType<Database['prepare']>
  private readonly stmtCountLogs1h: ReturnType<Database['prepare']>
  private readonly stmtCountMetrics: ReturnType<Database['prepare']>
  private readonly stmtCountSeries: ReturnType<Database['prepare']>
  private readonly stmtCountTraces: ReturnType<Database['prepare']>

  constructor(path = 'tiradata.db') {
    this.db = new Database(path)

    // WAL mode: much better concurrent read performance
    this.db.run('PRAGMA journal_mode = WAL;')
    this.db.run('PRAGMA synchronous = NORMAL;')
    this.db.run('PRAGMA cache_size = -64000;') // 64 MB cache
    this.db.run('PRAGMA temp_store = MEMORY;')

    // Apply schema
    this.db.exec(DDL)

    // Compile prepared statements once at startup
    this.stmtInsertLog = this.db.prepare(
      `INSERT INTO logs (id, timestamp, level, service, message, attributes)
       VALUES ($id, $timestamp, $level, $service, $message, $attributes)`
    )
    this.stmtInsertMetric = this.db.prepare(
      `INSERT INTO metrics (timestamp, name, value, labels)
       VALUES ($timestamp, $name, $value, $labels)`
    )
    this.stmtInsertTrace = this.db.prepare(
      `INSERT OR IGNORE INTO traces (trace_id, span_id, parent_id, start_time, duration, name, attributes)
       VALUES ($trace_id, $span_id, $parent_id, $start_time, $duration, $name, $attributes)`
    )
    this.stmtCountLogs = this.db.prepare(`SELECT COUNT(*) AS n FROM logs`)
    this.stmtCountLogs1h = this.db.prepare(
      `SELECT COUNT(*) AS n FROM logs WHERE timestamp >= $since`
    )
    this.stmtCountMetrics = this.db.prepare(`SELECT COUNT(*) AS n FROM metrics`)
    this.stmtCountSeries = this.db.prepare(`SELECT COUNT(DISTINCT name) AS n FROM metrics`)
    this.stmtCountTraces = this.db.prepare(`SELECT COUNT(*) AS n FROM traces`)
  }

  // ─── Batch Insert ─────────────────────────────────────────────────────────

  /** Insert a batch of logs inside a single transaction. */
  insertLogs(batch: LogEntry[]): void {
    const tx = this.db.transaction((rows: LogEntry[]) => {
      for (const row of rows) {
        this.stmtInsertLog.run({
          $id: row.id,
          $timestamp: row.timestamp,
          $level: row.level,
          $service: row.service,
          $message: row.message,
          $attributes: JSON.stringify(row.attributes),
        })
      }
    })
    tx(batch)
  }

  /** Insert a batch of metrics inside a single transaction. */
  insertMetrics(batch: MetricEntry[]): void {
    const tx = this.db.transaction((rows: MetricEntry[]) => {
      for (const row of rows) {
        this.stmtInsertMetric.run({
          $timestamp: row.timestamp,
          $name: row.name,
          $value: row.value,
          $labels: JSON.stringify(row.labels),
        })
      }
    })
    tx(batch)
  }

  /** Insert a batch of traces inside a single transaction. */
  insertTraces(batch: TraceEntry[]): void {
    const tx = this.db.transaction((rows: TraceEntry[]) => {
      for (const row of rows) {
        this.stmtInsertTrace.run({
          $trace_id: row.trace_id,
          $span_id: row.span_id,
          $parent_id: row.parent_id ?? null,
          $start_time: row.start_time,
          $duration: row.duration,
          $name: row.name,
          $attributes: JSON.stringify(row.attributes),
        })
      }
    })
    tx(batch)
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  /** Execute arbitrary read-only SQL in a sandboxed way. */
  executeSql(sql: string): SqlQueryResult {
    const t0 = performance.now()

    // Restrict to SELECT-only for safety
    const normalised = sql.trim().toUpperCase()
    if (!normalised.startsWith('SELECT') && !normalised.startsWith('WITH')) {
      throw new Error('Only SELECT / CTE queries are allowed')
    }

    const stmt = this.db.prepare(sql)
    const rows = stmt.all() as Record<string, unknown>[]
    const durationMs = performance.now() - t0

    if (rows.length === 0) {
      return { columns: [], rows: [], rowCount: 0, durationMs }
    }

    const columns = Object.keys(rows[0])
    const data = rows.map((r) => columns.map((c) => r[c]))

    return { columns, rows: data, rowCount: rows.length, durationMs }
  }

  /** Paginated log query with optional filters. */
  queryLogs(params: {
    service?: string
    level?: string
    from?: number
    to?: number
    limit?: number
    offset?: number
  }): LogEntry[] {
    const conditions: string[] = []
    const args: unknown[] = []

    if (params.service) { conditions.push('service = ?'); args.push(params.service) }
    if (params.level)   { conditions.push('level = ?');   args.push(params.level) }
    if (params.from)    { conditions.push('timestamp >= ?'); args.push(params.from) }
    if (params.to)      { conditions.push('timestamp <= ?'); args.push(params.to) }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const limit = Math.min(params.limit ?? 200, 1000)
    const offset = params.offset ?? 0

    const sql = `
      SELECT id, timestamp, level, service, message, attributes
      FROM logs
      ${where}
      ORDER BY timestamp DESC
      LIMIT ${limit} OFFSET ${offset}
    `

    const rows = this.db.prepare(sql).all(...args) as Array<{
      id: string; timestamp: number; level: string
      service: string; message: string; attributes: string
    }>

    return rows.map((r) => ({
      ...r,
      level: r.level as LogEntry['level'],
      attributes: JSON.parse(r.attributes) as Record<string, unknown>,
    }))
  }

  /** Time-series metric query. Groups by a time bucket (resolution in ms). */
  queryMetrics(params: {
    name?: string
    from?: number
    to?: number
    limit?: number
  }): MetricEntry[] {
    const conditions: string[] = []
    const args: unknown[] = []

    if (params.name) { conditions.push('name = ?'); args.push(params.name) }
    if (params.from) { conditions.push('timestamp >= ?'); args.push(params.from) }
    if (params.to)   { conditions.push('timestamp <= ?'); args.push(params.to) }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const limit = Math.min(params.limit ?? 500, 5000)

    const sql = `
      SELECT timestamp, name, value, labels
      FROM metrics
      ${where}
      ORDER BY timestamp ASC
      LIMIT ${limit}
    `

    const rows = this.db.prepare(sql).all(...args) as Array<{
      timestamp: number; name: string; value: number; labels: string
    }>

    return rows.map((r) => ({
      ...r,
      labels: JSON.parse(r.labels) as Record<string, string>,
    }))
  }

  /** Distinct metric series names. */
  metricNames(): string[] {
    const rows = this.db.prepare('SELECT DISTINCT name FROM metrics ORDER BY name').all() as Array<{ name: string }>
    return rows.map((r) => r.name)
  }

  /** Paginated trace query. */
  queryTraces(params: {
    trace_id?: string
    from?: number
    to?: number
    limit?: number
  }): TraceEntry[] {
    const conditions: string[] = []
    const args: unknown[] = []

    if (params.trace_id) { conditions.push('trace_id = ?'); args.push(params.trace_id) }
    if (params.from)     { conditions.push('start_time >= ?'); args.push(params.from) }
    if (params.to)       { conditions.push('start_time <= ?'); args.push(params.to) }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const limit = Math.min(params.limit ?? 200, 1000)

    const sql = `
      SELECT trace_id, span_id, parent_id, start_time, duration, name, attributes
      FROM traces
      ${where}
      ORDER BY start_time DESC
      LIMIT ${limit}
    `

    const rows = this.db.prepare(sql).all(...args) as Array<{
      trace_id: string; span_id: string; parent_id: string | null
      start_time: number; duration: number; name: string; attributes: string
    }>

    return rows.map((r) => ({
      ...r,
      attributes: JSON.parse(r.attributes) as Record<string, unknown>,
    }))
  }

  // ─── Stats ────────────────────────────────────────────────────────────────

  collectStats(queueSize: number, queueCapacity: number): SystemStats {
    const oneHourAgo = Date.now() - 60 * 60 * 1000

    const totalLogs   = (this.stmtCountLogs.get() as { n: number }).n
    const logs1h      = (this.stmtCountLogs1h.get({ $since: oneHourAgo }) as { n: number }).n
    const totalMetrics = (this.stmtCountMetrics.get() as { n: number }).n
    const seriesCount  = (this.stmtCountSeries.get() as { n: number }).n
    const totalTraces  = (this.stmtCountTraces.get() as { n: number }).n

    return {
      logs:    { total: totalLogs, last_1h: logs1h },
      metrics: { total: totalMetrics, series: seriesCount },
      traces:  { total: totalTraces },
      queue:   {
        size: queueSize,
        capacity: queueCapacity,
        utilization: queueCapacity > 0 ? queueSize / queueCapacity : 0,
      },
      uptime_s: Math.floor((Date.now() - startMs) / 1000),
    }
  }
}
