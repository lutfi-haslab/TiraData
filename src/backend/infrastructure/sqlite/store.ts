import { Database } from 'bun:sqlite'
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import {
  and, asc, count, countDistinct, desc, eq, gte, lte, sql, inArray
} from 'drizzle-orm'

import { logs, metrics, traces, schema } from '../db/schema.sqlite'
import type { SqliteSchema } from '../db/schema.sqlite'
import type { IStore, LogQueryParams, MetricQueryParams, TraceQueryParams, TtlDeleteResult } from '../../domain/store.interface'
import type { LogEntry, MetricEntry, SqlQueryResult, SystemStats, TraceEntry, AlertRule, AlertHistoryEntry } from '../../domain/types'

// ─── Startup Timestamp ────────────────────────────────────────────────────────

const startMs = Date.now()

// ─── DDL (run once on startup) ────────────────────────────────────────────────
// Drizzle does not auto-create tables — we push DDL via drizzle-kit or here directly.

const DDL = /* sql */`
  CREATE TABLE IF NOT EXISTS projects (
    id         TEXT    PRIMARY KEY,
    name       TEXT    NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS api_keys (
    key        TEXT    PRIMARY KEY,
    project_id TEXT    NOT NULL,
    name       TEXT    NOT NULL,
    role       TEXT    NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS logs (
    id         TEXT    PRIMARY KEY,
    timestamp  INTEGER NOT NULL,
    level      TEXT    NOT NULL,
    service    TEXT    NOT NULL,
    message    TEXT    NOT NULL,
    attributes TEXT    NOT NULL DEFAULT '{}',
    project_id TEXT    NOT NULL
  );
  CREATE TABLE IF NOT EXISTS metrics (
    timestamp  INTEGER NOT NULL,
    name       TEXT    NOT NULL,
    value      REAL    NOT NULL,
    labels     TEXT    NOT NULL DEFAULT '{}',
    project_id TEXT    NOT NULL
  );
  CREATE TABLE IF NOT EXISTS traces (
    trace_id   TEXT    NOT NULL,
    span_id    TEXT    NOT NULL PRIMARY KEY,
    parent_id  TEXT,
    start_time INTEGER NOT NULL,
    duration   INTEGER NOT NULL,
    name       TEXT    NOT NULL,
    attributes TEXT    NOT NULL DEFAULT '{}',
    project_id TEXT    NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_logs_ts      ON logs    (timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_logs_proj_ts ON logs    (project_id, timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_logs_svc_ts  ON logs    (service, timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_metrics_ts   ON metrics (name, timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_metrics_proj ON metrics (project_id, timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_traces_ts    ON traces  (start_time DESC);
  CREATE INDEX IF NOT EXISTS idx_traces_proj  ON traces  (project_id, start_time DESC);
  CREATE TABLE IF NOT EXISTS alert_rules (
    id           TEXT    PRIMARY KEY,
    name         TEXT    NOT NULL,
    query        TEXT    NOT NULL,
    threshold    REAL    NOT NULL,
    condition    TEXT    NOT NULL,
    interval_ms  INTEGER NOT NULL,
    enabled      INTEGER NOT NULL DEFAULT 1,
    last_checked INTEGER,
    project_id   TEXT    NOT NULL
  );
  CREATE TABLE IF NOT EXISTS alert_history (
    id         TEXT    PRIMARY KEY,
    rule_id    TEXT    NOT NULL,
    timestamp  INTEGER NOT NULL,
    value      REAL    NOT NULL,
    triggered  INTEGER NOT NULL,
    project_id TEXT    NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_alert_hist_rule ON alert_history (rule_id, timestamp DESC);
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT    PRIMARY KEY,
    email         TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    created_at    INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS user_projects (
    user_id     TEXT    NOT NULL,
    project_id  TEXT    NOT NULL,
    role        TEXT    NOT NULL,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_up_user ON user_projects (user_id);
  CREATE INDEX IF NOT EXISTS idx_up_proj ON user_projects (project_id);
`

// ─── SQLite Store (Drizzle) ───────────────────────────────────────────────────

export class SqliteStore implements IStore {
  private readonly client: Database
  private readonly db: BunSQLiteDatabase<SqliteSchema>

  constructor(path: string = Bun.env.DB_PATH ?? 'tiradata.db') {
    this.client = new Database(path)

    // Performance PRAGMAs
    this.client.run('PRAGMA journal_mode = WAL;')
    this.client.run('PRAGMA synchronous   = NORMAL;')
    this.client.run('PRAGMA cache_size    = -64000;')
    this.client.run('PRAGMA temp_store    = MEMORY;')
    this.client.run('PRAGMA mmap_size     = 268435456;')

    // Apply schema
    this.client.exec(DDL)

    this.db = drizzle(this.client, { schema })
  }

  // ─── Write ──────────────────────────────────────────────────────────────────

  async insertLogs(batch: LogEntry[]): Promise<void> {
    if (batch.length === 0) return
    // Drizzle batch insert inside a transaction for performance
    this.client.transaction(() => {
      for (const row of batch) {
        this.db.insert(logs).values({
          id:         row.id,
          timestamp:  row.timestamp,
          level:      row.level,
          service:    row.service,
          message:    row.message,
          attributes: JSON.stringify(row.attributes),
          projectId:  row.projectId,
        }).onConflictDoNothing().run()
      }
    })()
  }

  async insertMetrics(batch: MetricEntry[]): Promise<void> {
    if (batch.length === 0) return
    this.client.transaction(() => {
      for (const row of batch) {
        this.db.insert(metrics).values({
          timestamp: row.timestamp,
          name:      row.name,
          value:     row.value,
          labels:    JSON.stringify(row.labels),
          projectId: row.projectId,
        }).run()
      }
    })()
  }

  async insertTraces(batch: TraceEntry[]): Promise<void> {
    if (batch.length === 0) return
    this.client.transaction(() => {
      for (const row of batch) {
        this.db.insert(traces).values({
          traceId:    row.trace_id,
          spanId:     row.span_id,
          parentId:   row.parent_id ?? null,
          startTime:  row.start_time,
          duration:   row.duration,
          name:       row.name,
          attributes: JSON.stringify(row.attributes),
          projectId:  row.projectId,
        }).onConflictDoNothing().run()
      }
    })()
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

    const [totalRes] = this.db.select({ n: count() }).from(logs).where(whereClause).all()
    const rows = this.db
      .select()
      .from(logs)
      .where(whereClause)
      .orderBy(desc(logs.timestamp))
      .limit(limit)
      .offset(offset)
      .all()

    const data = rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      level: r.level as LogEntry['level'],
      service: r.service,
      message: r.message,
      attributes: JSON.parse(r.attributes) as Record<string, unknown>,
      projectId: r.projectId,
    }))

    return { data, count: totalRes.n }
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

    const [totalRes] = this.db.select({ n: count() }).from(metrics).where(whereClause).all()
    const rows = this.db
      .select()
      .from(metrics)
      .where(whereClause)
      .orderBy(asc(metrics.timestamp))
      .limit(limit)
      .offset(offset)
      .all()

    const data = rows.map((r) => ({
      timestamp: r.timestamp,
      name: r.name,
      value: r.value,
      labels: JSON.parse(r.labels) as Record<string, string>,
      projectId: r.projectId,
    }))

    return { data, count: totalRes.n }
  }

  async metricNames(projectId: string): Promise<string[]> {
    const rows = this.db
      .selectDistinct({ name: metrics.name })
      .from(metrics)
      .where(eq(metrics.projectId, projectId))
      .orderBy(asc(metrics.name))
      .all()
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

    const [totalRes] = this.db.select({ n: count() }).from(traces).where(whereClause).all()
    const rows = this.db
      .select()
      .from(traces)
      .where(whereClause)
      .orderBy(desc(traces.startTime))
      .limit(limit)
      .offset(offset)
      .all()

    const data = rows.map((r) => ({
      trace_id: r.traceId,
      span_id: r.spanId,
      parent_id: r.parentId ?? null,
      start_time: r.startTime,
      duration: r.duration,
      name: r.name,
      attributes: JSON.parse(r.attributes) as Record<string, unknown>,
      projectId: r.projectId,
    }))

    return { data, count: totalRes.n }
  }

  /** Raw SQL passthrough — SELECT / CTE only, for the query editor. */
  async executeSql(sqlStr: string, projectId: string): Promise<SqlQueryResult> {
    const t0 = performance.now()
    // Strip comments and whitespace to validate the first real statement
    const cleanSql = sqlStr.replace(/--.*$|\/\*[\s\S]*?\*\//gm, '').trim().toUpperCase()
    
    if (!cleanSql.startsWith('SELECT') && !cleanSql.startsWith('WITH')) {
      throw new Error('Only SELECT / CTE queries are allowed')
    }
    
    let safeSql = sqlStr
    if (projectId !== 'master') {
      if (/\b(users|projects|api_keys)\b/i.test(safeSql)) {
        throw new Error('Unauthorized table access')
      }
      safeSql = safeSql.replace(/\b(logs|metrics|traces)\b/gi, `(SELECT * FROM $1 WHERE project_id = '${projectId.replace(/'/g, "''")}')`)
    }

    const rows = this.client.prepare(safeSql).all() as Record<string, unknown>[]
    const durationMs = performance.now() - t0
    if (rows.length === 0) return { columns: [], rows: [], rowCount: 0, durationMs }
    const columns = Object.keys(rows[0])
    return { columns, rows: rows.map((r) => columns.map((c) => r[c])), rowCount: rows.length, durationMs }
  }

  // ─── Stats ───────────────────────────────────────────────────────────────────

  async collectStats(queueSize: number, queueCapacity: number, projectId: string): Promise<SystemStats> {
    const oneHourAgo = Date.now() - 60 * 60 * 1000

    const [logTotal]   = this.db.select({ n: count() }).from(logs).where(eq(logs.projectId, projectId)).all()
    const [logHour]    = this.db.select({ n: count() }).from(logs).where(and(eq(logs.projectId, projectId), gte(logs.timestamp, oneHourAgo))).all()
    const [metTotal]   = this.db.select({ n: count() }).from(metrics).where(eq(metrics.projectId, projectId)).all()
    const [metSeries]  = this.db.select({ n: countDistinct(metrics.name) }).from(metrics).where(eq(metrics.projectId, projectId)).all()
    const [trcTotal]   = this.db.select({ n: count() }).from(traces).where(eq(traces.projectId, projectId)).all()

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
    this.client.run('PRAGMA optimize;')
    this.client.run('VACUUM;')
    return { durationMs: performance.now() - t0 }
  }

  async deleteBefore(params: {
    logsBefore?: number
    metricsBefore?: number
    tracesBefore?: number
    projectId: string
  }): Promise<TtlDeleteResult> {
    let deletedLogs = 0, deletedMetrics = 0, deletedTraces = 0

    this.client.transaction(() => {
      if (params.logsBefore) {
        deletedLogs = this.client.prepare(`DELETE FROM logs WHERE timestamp <= ? AND project_id = ?`).run(params.logsBefore, params.projectId).changes
      }
      if (params.metricsBefore) {
        deletedMetrics = this.client.prepare(`DELETE FROM metrics WHERE timestamp <= ? AND project_id = ?`).run(params.metricsBefore, params.projectId).changes
      }
      if (params.tracesBefore) {
        deletedTraces = this.client.prepare(`DELETE FROM traces WHERE start_time <= ? AND project_id = ?`).run(params.tracesBefore, params.projectId).changes
      }
    })()

    return { logs: deletedLogs, metrics: deletedMetrics, traces: deletedTraces }
  }

  // ── Alerts ───────────────────────────────────────────────────────────────

  async getAlertRules(projectId: string): Promise<AlertRule[]> {
    const rows = this.db.select().from(schema.alertRules).where(eq(schema.alertRules.projectId, projectId)).all()
    return rows.map(r => ({
      ...r,
      condition: r.condition as 'gt' | 'lt',
      lastChecked: r.lastChecked ?? undefined
    }))
  }

  async saveAlertRule(rule: AlertRule): Promise<void> {
    this.db.insert(schema.alertRules)
      .values({
        ...rule,
        projectId: rule.projectId
      })
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
      .run()
  }

  async deleteAlertRule(id: string, projectId: string): Promise<void> {
    this.db.delete(schema.alertRules).where(and(eq(schema.alertRules.id, id), eq(schema.alertRules.projectId, projectId))).run()
  }

  async saveAlertHistory(entry: AlertHistoryEntry): Promise<void> {
    this.db.insert(schema.alertHistory).values(entry).run()
  }

  async getAlertHistory(projectId: string, ruleId?: string, limit = 100): Promise<AlertHistoryEntry[]> {
    let q = this.db.select().from(schema.alertHistory).where(eq(schema.alertHistory.projectId, projectId)) as any
    if (ruleId) {
      q = q.where(and(eq(schema.alertHistory.projectId, projectId), eq(schema.alertHistory.ruleId, ruleId))) as any
    }
    return q.orderBy(desc(schema.alertHistory.timestamp)).limit(limit).all()
  }

  // ── Visualization ──────────────────────────────────────────────────────────

  async getServiceMap(projectId: string, from?: number, to?: number): Promise<{ source: string, target: string, count: number }[]> {
    // In SQLite, we use json_extract.
    // We join traces (child) with traces (parent) on parent_id = span_id
    const sqlStr = `
      SELECT 
        json_extract(p.attributes, '$."service.name"') as source,
        json_extract(c.attributes, '$."service.name"') as target,
        COUNT(*) as count
      FROM traces c
      JOIN traces p ON c.parent_id = p.span_id
      WHERE c.project_id = ? AND source IS NOT NULL AND target IS NOT NULL AND source != target
      ${from ? `AND c.start_time >= ${from}` : ''}
      ${to ? `AND c.start_time <= ${to}` : ''}
      GROUP BY source, target
    `
    const rows = this.client.prepare(sqlStr).all(projectId) as any[]
    return rows.map(r => ({
      source: String(r.source),
      target: String(r.target),
      count: Number(r.count)
    }))
  }

  // ── Project Management ──────────────────────────────────────────────────────

  async getProjects(userId?: string): Promise<import('../../domain/types').Project[]> {
    if (!userId) {
      return this.db.select().from(schema.projects).all()
    }
    const userProjs = this.db.select().from(schema.userProjects).where(eq(schema.userProjects.userId, userId)).all()
    if (userProjs.length === 0) return []
    const projectIds = userProjs.map(p => p.projectId)
    return this.db.select().from(schema.projects).where(inArray(schema.projects.id, projectIds)).all()
  }

  async shareProject(userProject: import('../../domain/types').UserProject): Promise<void> {
    this.db.insert(schema.userProjects).values(userProject).onConflictDoNothing().run()
  }

  async getUserProjects(projectId: string): Promise<import('../../domain/types').UserProject[]> {
    const rows = this.db.select().from(schema.userProjects).where(eq(schema.userProjects.projectId, projectId)).all()
    return rows.map(r => ({ ...r, role: r.role as 'admin' | 'viewer' }))
  }

  async saveProject(project: import('../../domain/types').Project): Promise<void> {
    this.db.insert(schema.projects).values(project).onConflictDoUpdate({
      target: schema.projects.id,
      set: { name: project.name }
    }).run()
  }

  async getApiKeys(projectId: string): Promise<import('../../domain/types').ApiKey[]> {
    const rows = this.db.select().from(schema.apiKeys).where(eq(schema.apiKeys.projectId, projectId)).all()
    return rows.map(r => ({
      ...r,
      role: r.role as 'admin' | 'ingest'
    }))
  }

  async saveApiKey(key: import('../../domain/types').ApiKey): Promise<void> {
    this.db.insert(schema.apiKeys).values(key).onConflictDoNothing().run()
  }

  async getApiKey(key: string): Promise<import('../../domain/types').ApiKey | null> {
    const [row] = this.db.select().from(schema.apiKeys).where(eq(schema.apiKeys.key, key)).all()
    if (!row) return null
    return {
      ...row,
      role: row.role as 'admin' | 'ingest'
    }
  }

  // ── User Management ───────────────────────────────────────────────────────

  async saveUser(user: import('../../domain/types').User): Promise<void> {
    this.db.insert(schema.users).values({
      id: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      createdAt: user.createdAt,
    }).onConflictDoNothing().run()
  }

  async getUserByEmail(email: string): Promise<import('../../domain/types').User | null> {
    const [row] = this.db.select().from(schema.users).where(eq(schema.users.email, email)).all()
    if (!row) return null
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.passwordHash,
      createdAt: row.createdAt,
    }
  }

  async getUserById(id: string): Promise<import('../../domain/types').User | null> {
    const [row] = this.db.select().from(schema.users).where(eq(schema.users.id, id)).all()
    if (!row) return null
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.passwordHash,
      createdAt: row.createdAt,
    }
  }
}
