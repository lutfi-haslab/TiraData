import { Pool } from 'pg'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { and, asc, count, countDistinct, desc, eq, gte, lte, sql } from 'drizzle-orm'

import { logs, metrics, traces, schema } from '../db/schema.pg'
import type { PgSchema } from '../db/schema.pg'
import type { IStore, LogQueryParams, MetricQueryParams, TraceQueryParams, TtlDeleteResult } from '../../domain/store.interface'
import type { LogEntry, MetricEntry, SqlQueryResult, SystemStats, TraceEntry, AlertRule, AlertHistoryEntry } from '../../domain/types'

// ─── Startup Timestamp ────────────────────────────────────────────────────────

const startMs = Date.now()

// ─── DDL (idempotent setup) ───────────────────────────────────────────────────

const DDL = /* sql */`
  CREATE TABLE IF NOT EXISTS logs (
    id         VARCHAR(128) PRIMARY KEY,
    timestamp  BIGINT       NOT NULL,
    level      VARCHAR(16)  NOT NULL,
    service    VARCHAR(128) NOT NULL,
    message    TEXT         NOT NULL,
    attributes JSONB        NOT NULL DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS metrics (
    timestamp BIGINT            NOT NULL,
    name      VARCHAR(256)      NOT NULL,
    value     DOUBLE PRECISION  NOT NULL,
    labels    JSONB             NOT NULL DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS traces (
    trace_id   VARCHAR(128) NOT NULL,
    span_id    VARCHAR(128) PRIMARY KEY,
    parent_id  VARCHAR(128),
    start_time BIGINT       NOT NULL,
    duration   BIGINT       NOT NULL,
    name       VARCHAR(256) NOT NULL,
    attributes JSONB        NOT NULL DEFAULT '{}'
  );

  -- Covering + GIN indexes for Postgres
  CREATE INDEX IF NOT EXISTS idx_logs_ts      ON logs    (timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_logs_svc_ts  ON logs    (service, timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_logs_lvl_ts  ON logs    (level, timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_logs_attrs   ON logs    USING GIN (attributes);
  CREATE INDEX IF NOT EXISTS idx_metrics_ts   ON metrics (name, timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_metrics_lbl  ON metrics USING GIN (labels);
  CREATE INDEX IF NOT EXISTS idx_traces_ts    ON traces  (start_time DESC);
  CREATE INDEX IF NOT EXISTS idx_traces_id    ON traces  (trace_id);

  CREATE TABLE IF NOT EXISTS alert_rules (
    id          VARCHAR(128) PRIMARY KEY,
    name        VARCHAR(256) NOT NULL,
    query       TEXT         NOT NULL,
    threshold   DOUBLE PRECISION NOT NULL,
    condition   VARCHAR(8)   NOT NULL,
    interval_ms BIGINT       NOT NULL,
    enabled     BOOLEAN      NOT NULL DEFAULT TRUE,
    last_checked BIGINT
  );

  CREATE TABLE IF NOT EXISTS alert_history (
    id        VARCHAR(128) PRIMARY KEY,
    rule_id   VARCHAR(128) NOT NULL,
    timestamp BIGINT       NOT NULL,
    value     DOUBLE PRECISION NOT NULL,
    triggered BOOLEAN      NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_alert_hist_rule ON alert_history (rule_id, timestamp DESC);
`

// ─── PostgreSQL Store (Drizzle + pg) ─────────────────────────────────────────

export class PostgresStore implements IStore {
  private readonly pool: Pool
  private readonly db: NodePgDatabase<PgSchema>

  constructor(connectionString?: string) {
    const url = connectionString ?? Bun.env.DATABASE_URL ?? 'postgres://localhost:5432/tiradata'

    this.pool = new Pool({
      connectionString: url,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    })

    this.db = drizzle(this.pool, { schema })
  }

  /** Must be called once after construction to apply DDL. */
  async init(): Promise<void> {
    await this.pool.query(DDL)
  }

  // ─── Write ──────────────────────────────────────────────────────────────────

  async insertLogs(batch: LogEntry[]): Promise<void> {
    if (batch.length === 0) return
    await this.db.insert(logs).values(
      batch.map((row) => ({
        id:         row.id,
        timestamp:  row.timestamp,
        level:      row.level,
        service:    row.service,
        message:    row.message,
        attributes: row.attributes,
      }))
    ).onConflictDoNothing()
  }

  async insertMetrics(batch: MetricEntry[]): Promise<void> {
    if (batch.length === 0) return
    await this.db.insert(metrics).values(
      batch.map((row) => ({
        timestamp: row.timestamp,
        name:      row.name,
        value:     row.value,
        labels:    row.labels,
      }))
    )
  }

  async insertTraces(batch: TraceEntry[]): Promise<void> {
    if (batch.length === 0) return
    await this.db.insert(traces).values(
      batch.map((row) => ({
        traceId:    row.trace_id,
        spanId:     row.span_id,
        parentId:   row.parent_id ?? null,
        startTime:  row.start_time,
        duration:   row.duration,
        name:       row.name,
        attributes: row.attributes,
      }))
    ).onConflictDoNothing()
  }

  // ─── Read ────────────────────────────────────────────────────────────────────

  async queryLogs(params: LogQueryParams): Promise<import('../../domain/types').PaginatedResponse<LogEntry>> {
    const limit = Math.min(params.limit ?? 200, 1000)
    const offset = params.offset ?? 0

    const conditions = [
      params.service ? eq(logs.service, params.service) : undefined,
      params.level ? eq(logs.level, params.level) : undefined,
      params.from ? gte(logs.timestamp, params.from) : undefined,
      params.to ? lte(logs.timestamp, params.to) : undefined,
    ].filter(Boolean) as ReturnType<typeof eq>[]

    const whereClause = conditions.length ? and(...conditions) : undefined

    const [[{ n: total }]] = await Promise.all([
      this.db.select({ n: count() }).from(logs).where(whereClause),
    ])

    const rows = await this.db
      .select()
      .from(logs)
      .where(whereClause)
      .orderBy(desc(logs.timestamp))
      .limit(limit)
      .offset(offset)

    const data = rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      level: r.level as LogEntry['level'],
      service: r.service,
      message: r.message,
      attributes: r.attributes as Record<string, unknown>,
    }))

    return { data, count: Number(total) }
  }

  async queryMetrics(params: MetricQueryParams): Promise<import('../../domain/types').PaginatedResponse<MetricEntry>> {
    const limit = Math.min(params.limit ?? 500, 5000)
    const offset = params.offset ?? 0

    const conditions = [
      params.name ? eq(metrics.name, params.name) : undefined,
      params.from ? gte(metrics.timestamp, params.from) : undefined,
      params.to ? lte(metrics.timestamp, params.to) : undefined,
    ].filter(Boolean) as ReturnType<typeof eq>[]

    const whereClause = conditions.length ? and(...conditions) : undefined

    const [[{ n: total }]] = await Promise.all([
      this.db.select({ n: count() }).from(metrics).where(whereClause),
    ])

    const rows = await this.db
      .select()
      .from(metrics)
      .where(whereClause)
      .orderBy(asc(metrics.timestamp))
      .limit(limit)
      .offset(offset)

    const data = rows.map((r) => ({
      timestamp: r.timestamp,
      name: r.name,
      value: r.value,
      labels: r.labels as Record<string, string>,
    }))

    return { data, count: Number(total) }
  }

  async metricNames(): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ name: metrics.name })
      .from(metrics)
      .orderBy(asc(metrics.name))
    return rows.map((r) => r.name)
  }

  async queryTraces(params: TraceQueryParams): Promise<import('../../domain/types').PaginatedResponse<TraceEntry>> {
    const limit = Math.min(params.limit ?? 200, 1000)
    const offset = params.offset ?? 0

    const conditions = [
      params.trace_id ? eq(traces.traceId, params.trace_id) : undefined,
      params.from ? gte(traces.startTime, params.from) : undefined,
      params.to ? lte(traces.startTime, params.to) : undefined,
    ].filter(Boolean) as ReturnType<typeof eq>[]

    const whereClause = conditions.length ? and(...conditions) : undefined

    const [[{ n: total }]] = await Promise.all([
      this.db.select({ n: count() }).from(traces).where(whereClause),
    ])

    const rows = await this.db
      .select()
      .from(traces)
      .where(whereClause)
      .orderBy(desc(traces.startTime))
      .limit(limit)
      .offset(offset)

    const data = rows.map((r) => ({
      trace_id: r.traceId,
      span_id: r.spanId,
      parent_id: r.parentId ?? null,
      start_time: r.startTime,
      duration: r.duration,
      name: r.name,
      attributes: r.attributes as Record<string, unknown>,
    }))

    return { data, count: Number(total) }
  }

  /** Raw SQL passthrough — SELECT / CTE only. */
  async executeSql(sqlStr: string): Promise<SqlQueryResult> {
    const t0 = performance.now()
    const cleanSql = sqlStr.replace(/--.*$|\/\*[\s\S]*?\*\//gm, '').trim().toUpperCase()
    if (!cleanSql.startsWith('SELECT') && !cleanSql.startsWith('WITH')) {
      throw new Error('Only SELECT / CTE queries are allowed')
    }
    const result = await this.pool.query(sqlStr)
    const durationMs = performance.now() - t0
    const columns = result.fields.map((f) => f.name)
    const rows = result.rows.map((r) => columns.map((c) => r[c]))
    return { columns, rows, rowCount: result.rowCount ?? rows.length, durationMs }
  }

  // ─── Stats ───────────────────────────────────────────────────────────────────

  async collectStats(queueSize: number, queueCapacity: number): Promise<SystemStats> {
    const oneHourAgo = Date.now() - 60 * 60 * 1000

    const [[logTotal], [logHour], [metTotal], [metSeries], [trcTotal]] = await Promise.all([
      this.db.select({ n: count() }).from(logs),
      this.db.select({ n: count() }).from(logs).where(gte(logs.timestamp, oneHourAgo)),
      this.db.select({ n: count() }).from(metrics),
      this.db.select({ n: countDistinct(metrics.name) }).from(metrics),
      this.db.select({ n: count() }).from(traces),
    ])

    return {
      logs:    { total: logTotal.n, last_1h: logHour.n },
      metrics: { total: metTotal.n, series: metSeries.n },
      traces:  { total: trcTotal.n },
      queue:   { size: queueSize, capacity: queueCapacity, utilization: queueCapacity > 0 ? queueSize / queueCapacity : 0 },
      uptime_s: Math.floor((Date.now() - startMs) / 1000),
    }
  }

  // ─── Maintenance ─────────────────────────────────────────────────────────────

  async optimize(): Promise<{ durationMs: number }> {
    const t0 = performance.now()
    await this.pool.query('VACUUM ANALYZE logs; VACUUM ANALYZE metrics; VACUUM ANALYZE traces;')
    return { durationMs: performance.now() - t0 }
  }

  async deleteBefore(params: {
    logsBefore?: number
    metricsBefore?: number
    tracesBefore?: number
  }): Promise<TtlDeleteResult> {
    const results = await Promise.all([
      params.logsBefore
        ? this.db.delete(logs).where(lte(logs.timestamp, params.logsBefore)).returning({ id: logs.id })
        : Promise.resolve([]),
      params.metricsBefore
        ? this.db.delete(metrics).where(lte(metrics.timestamp, params.metricsBefore)).returning({ name: metrics.name })
        : Promise.resolve([]),
      params.tracesBefore
        ? this.db.delete(traces).where(lte(traces.startTime, params.tracesBefore)).returning({ spanId: traces.spanId })
        : Promise.resolve([]),
    ])
    return { logs: results[0].length, metrics: results[1].length, traces: results[2].length }
  }

  // ── Alerts ───────────────────────────────────────────────────────────────

  async getAlertRules(): Promise<AlertRule[]> {
    const rows = await this.db.select().from(schema.alertRules)
    return rows as AlertRule[]
  }

  async saveAlertRule(rule: AlertRule): Promise<void> {
    await this.db.insert(schema.alertRules)
      .values(rule)
      .onConflictDoUpdate({
        target: schema.alertRules.id,
        set: {
          name: rule.name,
          query: rule.query,
          threshold: rule.threshold,
          condition: rule.condition,
          intervalMs: rule.intervalMs,
          enabled: rule.enabled,
          lastChecked: rule.lastChecked ?? null
        }
      })
  }

  async deleteAlertRule(id: string): Promise<void> {
    await this.db.delete(schema.alertRules).where(eq(schema.alertRules.id, id))
  }

  async saveAlertHistory(entry: AlertHistoryEntry): Promise<void> {
    await this.db.insert(schema.alertHistory).values(entry)
  }

  async getAlertHistory(ruleId?: string, limit = 100): Promise<AlertHistoryEntry[]> {
    let q = this.db.select().from(schema.alertHistory)
    if (ruleId) {
      q = q.where(eq(schema.alertHistory.ruleId, ruleId)) as any
    }
    return q.orderBy(desc(schema.alertHistory.timestamp)).limit(limit) as any
  }

  // ── Visualization ──────────────────────────────────────────────────────────

  async getServiceMap(from?: number, to?: number): Promise<{ source: string, target: string, count: number }[]> {
    const res = await this.pool.query({
      text: `
        SELECT 
          p.attributes->>'service.name' as source,
          c.attributes->>'service.name' as target,
          COUNT(*)::int as count
        FROM traces c
        JOIN traces p ON c.parent_id = p.span_id
        WHERE p.attributes->>'service.name' IS NOT NULL 
          AND c.attributes->>'service.name' IS NOT NULL 
          AND p.attributes->>'service.name' != c.attributes->>'service.name'
          ${from ? `AND c.start_time >= ${from}` : ''}
          ${to ? `AND c.start_time <= ${to}` : ''}
        GROUP BY 1, 2
      `
    })
    return res.rows
  }

  async end(): Promise<void> {
    await this.pool.end()
  }
}
