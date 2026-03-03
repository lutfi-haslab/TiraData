import {
  sqliteTable,
  text,
  integer,
  real,
  index,
} from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// ─── Tables ───────────────────────────────────────────────────────────────────

export const logs = sqliteTable(
  'logs',
  {
    id:         text('id').primaryKey(),
    timestamp:  integer('timestamp').notNull(),
    level:      text('level').notNull(),
    service:    text('service').notNull(),
    message:    text('message').notNull(),
    attributes: text('attributes').notNull().default('{}'),
    projectId:  text('project_id').notNull(),
  },
  (t) => [
    index('idx_logs_ts').on(t.timestamp),
    index('idx_logs_svc_ts').on(t.service, t.timestamp),
    index('idx_logs_lvl_ts').on(t.level, t.timestamp),
    index('idx_logs_project_ts').on(t.projectId, t.timestamp),
    // Composite index for common filtering
    index('idx_logs_svc_lvl_ts').on(t.service, t.level, t.timestamp),
  ]
)

export const metrics = sqliteTable(
  'metrics',
  {
    timestamp: integer('timestamp').notNull(),
    name:      text('name').notNull(),
    value:     real('value').notNull(),
    labels:    text('labels').notNull().default('{}'),
    projectId: text('project_id').notNull(),
  },
  (t) => [
    index('idx_metrics_name_ts').on(t.name, t.timestamp),
    index('idx_metrics_project_ts').on(t.projectId, t.timestamp),
  ]
)

export const traces = sqliteTable(
  'traces',
  {
    traceId:    text('trace_id').notNull(),
    spanId:     text('span_id').primaryKey(),
    parentId:   text('parent_id'),
    startTime:  integer('start_time').notNull(),
    duration:   integer('duration').notNull(),
    name:       text('name').notNull(),
    attributes: text('attributes').notNull().default('{}'),
    projectId:  text('project_id').notNull(),
  },
  (t) => [
    index('idx_traces_ts').on(t.startTime),
    index('idx_traces_trace_id').on(t.traceId),
    index('idx_traces_project_ts').on(t.projectId, t.startTime),
  ]
)

export const alertRules = sqliteTable('alert_rules', {
  id:         text('id').primaryKey(),
  name:       text('name').notNull(),
  query:      text('query').notNull(), // SQL query returning a single numeric value
  threshold:  real('threshold').notNull(),
  condition:  text('condition').notNull(), // 'gt' | 'lt'
  intervalMs: integer('interval_ms').notNull(),
  enabled:    integer('enabled', { mode: 'boolean' }).notNull().default(true),
  lastChecked: integer('last_checked'),
  projectId:  text('project_id').notNull(),
})

export const alertHistory = sqliteTable('alert_history', {
  id:        text('id').primaryKey(),
  ruleId:    text('rule_id').notNull(),
  timestamp: integer('timestamp').notNull(),
  value:     real('value').notNull(),
  triggered: integer('triggered', { mode: 'boolean' }).notNull(),
  projectId: text('project_id').notNull(),
})

export const projects = sqliteTable('projects', {
  id:   text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: integer('created_at').notNull(),
})

export const apiKeys = sqliteTable('api_keys', {
  key:       text('key').primaryKey(),
  projectId: text('project_id').notNull(),
  name:      text('name').notNull(), // label for the key e.g. "Prod Ingest"
  role:      text('role').notNull(), // 'admin' | 'ingest'
  createdAt: integer('created_at').notNull(),
})

export type SqliteSchema = {
  logs: typeof logs
  metrics: typeof metrics
  traces: typeof traces
  alertRules: typeof alertRules
  alertHistory: typeof alertHistory
  projects: typeof projects
  apiKeys: typeof apiKeys
}

export const schema: SqliteSchema = { 
  logs, 
  metrics, 
  traces, 
  alertRules, 
  alertHistory,
  projects,
  apiKeys
}
