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
  CREATE TABLE IF NOT EXISTS projects (
    id         VARCHAR(128) PRIMARY KEY,
    name       VARCHAR(256) NOT NULL,
    created_at BIGINT       NOT NULL
  );

  CREATE TABLE IF NOT EXISTS api_keys (
    key        VARCHAR(128) PRIMARY KEY,
    project_id VARCHAR(128) NOT NULL REFERENCES projects(id),
    name       VARCHAR(256) NOT NULL,
    role       VARCHAR(32)  NOT NULL,
    created_at BIGINT       NOT NULL
  );

  CREATE TABLE IF NOT EXISTS logs (
    id         VARCHAR(128) PRIMARY KEY,
    timestamp  BIGINT       NOT NULL,
    level      VARCHAR(16)  NOT NULL,
    service    VARCHAR(128) NOT NULL,
    message    TEXT         NOT NULL,
    attributes JSONB        NOT NULL DEFAULT '{}',
    project_id VARCHAR(128) NOT NULL
  );

  CREATE TABLE IF NOT EXISTS metrics (
    timestamp  BIGINT            NOT NULL,
    name       VARCHAR(256)      NOT NULL,
    value      DOUBLE PRECISION  NOT NULL,
    labels     JSONB             NOT NULL DEFAULT '{}',
    project_id VARCHAR(128)      NOT NULL
  );

  CREATE TABLE IF NOT EXISTS traces (
    trace_id   VARCHAR(128) NOT NULL,
    span_id    VARCHAR(128) PRIMARY KEY,
    parent_id  VARCHAR(128),
    start_time BIGINT       NOT NULL,
    duration   BIGINT       NOT NULL,
    name       VARCHAR(256) NOT NULL,
    attributes JSONB        NOT NULL DEFAULT '{}',
    project_id VARCHAR(128) NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_logs_ts      ON logs    (timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_logs_proj_ts ON logs    (project_id, timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_logs_svc_ts  ON logs    (service, timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_logs_lvl_ts  ON logs    (level, timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_logs_attrs   ON logs    USING GIN (attributes);
  CREATE INDEX IF NOT EXISTS idx_metrics_ts   ON metrics (name, timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_metrics_proj ON metrics (project_id, timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_metrics_lbl  ON metrics USING GIN (labels);
  CREATE INDEX IF NOT EXISTS idx_traces_ts    ON traces  (start_time DESC);
  CREATE INDEX IF NOT EXISTS idx_traces_proj  ON traces  (project_id, start_time DESC);
  CREATE INDEX IF NOT EXISTS idx_traces_id    ON traces  (trace_id);

  CREATE TABLE IF NOT EXISTS alert_rules (
    id           VARCHAR(128) PRIMARY KEY,
    name         VARCHAR(256) NOT NULL,
    query        TEXT         NOT NULL,
    threshold    DOUBLE PRECISION NOT NULL,
    condition    VARCHAR(8)   NOT NULL,
    interval_ms  BIGINT       NOT NULL,
    enabled      BOOLEAN      NOT NULL DEFAULT TRUE,
    last_checked BIGINT,
    project_id   VARCHAR(128) NOT NULL
  );

  CREATE TABLE IF NOT EXISTS alert_history (
    id         VARCHAR(128) PRIMARY KEY,
    rule_id    VARCHAR(128) NOT NULL,
    timestamp  BIGINT       NOT NULL,
    value      DOUBLE PRECISION NOT NULL,
    triggered  BOOLEAN      NOT NULL,
    project_id VARCHAR(128) NOT NULL
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
        projectId:  row.projectId,
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
        projectId: row.projectId,
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
        projectId:  row.projectId,
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
      eq(logs.projectId, params.projectId),
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
      projectId: r.projectId,
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
      eq(metrics.projectId, params.projectId),
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
      projectId: r.projectId,
    }))

    return { data, count: Number(total) }
  }

  async metricNames(projectId: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ name: metrics.name })
      .from(metrics)
      .where(eq(metrics.projectId, projectId))
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
      eq(traces.projectId, params.projectId),
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
      projectId: r.projectId,
    }))

    return { data, count: Number(total) }
  }

  /** Raw SQL passthrough — SELECT / CTE only. */
  async executeSql(sqlStr: string, projectId: string): Promise<SqlQueryResult> {
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

  async collectStats(queueSize: number, queueCapacity: number, projectId: string): Promise<SystemStats> {
    const oneHourAgo = Date.now() - 60 * 60 * 1000

    const [[logTotal], [logHour], [metTotal], [metSeries], [trcTotal]] = await Promise.all([
      this.db.select({ n: count() }).from(logs).where(eq(logs.projectId, projectId)),
      this.db.select({ n: count() }).from(logs).where(and(eq(logs.projectId, projectId), gte(logs.timestamp, oneHourAgo))),
      this.db.select({ n: count() }).from(metrics).where(eq(metrics.projectId, projectId)),
      this.db.select({ n: countDistinct(metrics.name) }).from(metrics).where(eq(metrics.projectId, projectId)),
      this.db.select({ n: count() }).from(traces).where(eq(traces.projectId, projectId)),
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
    projectId: string
  }): Promise<TtlDeleteResult> {
    const results = await Promise.all([
      params.logsBefore
        ? this.db.delete(logs).where(and(eq(logs.timestamp, params.logsBefore), eq(logs.projectId, params.projectId))).returning({ id: logs.id })
        : Promise.resolve([]),
      params.metricsBefore
        ? this.db.delete(metrics).where(and(eq(metrics.timestamp, params.metricsBefore), eq(metrics.projectId, params.projectId))).returning({ name: metrics.name })
        : Promise.resolve([]),
      params.tracesBefore
        ? this.db.delete(traces).where(and(eq(traces.startTime, params.tracesBefore), eq(traces.projectId, params.projectId))).returning({ spanId: traces.spanId })
        : Promise.resolve([]),
    ])
    return { logs: results[0].length, metrics: results[1].length, traces: results[2].length }
  }

  // ── Alerts ───────────────────────────────────────────────────────────────

  async getAlertRules(projectId: string): Promise<AlertRule[]> {
    const rows = await this.db.select().from(schema.alertRules).where(eq(schema.alertRules.projectId, projectId))
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
          lastChecked: rule.lastChecked ?? null,
          projectId: rule.projectId
        }
      })
  }

  async deleteAlertRule(id: string, projectId: string): Promise<void> {
    await this.db.delete(schema.alertRules).where(and(eq(schema.alertRules.id, id), eq(schema.alertRules.projectId, projectId)))
  }

  async saveAlertHistory(entry: AlertHistoryEntry): Promise<void> {
    await this.db.insert(schema.alertHistory).values(entry)
  }

  async getAlertHistory(projectId: string, ruleId?: string, limit = 100): Promise<AlertHistoryEntry[]> {
    let q = this.db.select().from(schema.alertHistory).where(eq(schema.alertHistory.projectId, projectId)) as any
    if (ruleId) {
      q = q.where(and(eq(schema.alertHistory.projectId, projectId), eq(schema.alertHistory.ruleId, ruleId))) as any
    }
    return q.orderBy(desc(schema.alertHistory.timestamp)).limit(limit) as any
  }

  // ── Visualization ──────────────────────────────────────────────────────────

  async getServiceMap(projectId: string, from?: number, to?: number): Promise<{ source: string, target: string, count: number }[]> {
    const res = await this.pool.query({
      text: `
        SELECT 
          p.attributes->>'service.name' as source,
          c.attributes->>'service.name' as target,
          COUNT(*)::int as count
        FROM traces c
        JOIN traces p ON c.parent_id = p.span_id
        WHERE c.project_id = $1
          AND p.attributes->>'service.name' IS NOT NULL 
          AND c.attributes->>'service.name' IS NOT NULL 
          AND p.attributes->>'service.name' != c.attributes->>'service.name'
          ${from ? `AND c.start_time >= ${from}` : ''}
          ${to ? `AND c.start_time <= ${to}` : ''}
        GROUP BY 1, 2
      `,
      values: [projectId]
    })
    return res.rows
  }

  // ── Project Management ──────────────────────────────────────────────────────

  async getProjects(): Promise<import('../../domain/types').Project[]> {
    const rows = await this.db.select().from(schema.projects)
    return rows.map(r => ({ ...r, createdAt: Number(r.createdAt) }))
  }

  async saveProject(project: import('../../domain/types').Project): Promise<void> {
    await this.db.insert(schema.projects).values({
      id: project.id,
      name: project.name,
      createdAt: project.createdAt
    }).onConflictDoUpdate({
      target: schema.projects.id,
      set: { name: project.name }
    })
  }

  async getApiKeys(projectId: string): Promise<import('../../domain/types').ApiKey[]> {
    const rows = await this.db.select().from(schema.apiKeys).where(eq(schema.apiKeys.projectId, projectId))
    return rows.map(r => ({
      ...r,
      role: r.role as 'admin' | 'ingest',
      createdAt: Number(r.createdAt)
    }))
  }

  async saveApiKey(key: import('../../domain/types').ApiKey): Promise<void> {
    await this.db.insert(schema.apiKeys).values({
      ...key,
      createdAt: key.createdAt
    }).onConflictDoNothing()
  }

  async getApiKey(key: string): Promise<import('../../domain/types').ApiKey | null> {
    const [row] = await this.db.select().from(schema.apiKeys).where(eq(schema.apiKeys.key, key))
    if (!row) return null
    return {
      ...row,
      role: row.role as 'admin' | 'ingest',
      createdAt: Number(row.createdAt)
    }
  }

  async end(): Promise<void> {
    await this.pool.end()
  }
}
