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
  },
  (t) => [
    index('idx_logs_ts').on(t.timestamp),
    index('idx_logs_svc_ts').on(t.service, t.timestamp),
    index('idx_logs_lvl_ts').on(t.level, t.timestamp),
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
  },
  (t) => [
    index('idx_metrics_name_ts').on(t.name, t.timestamp),
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
  },
  (t) => [
    index('idx_traces_ts').on(t.startTime),
    index('idx_traces_trace_id').on(t.traceId),
  ]
)

export type SqliteSchema = {
  logs: typeof logs
  metrics: typeof metrics
  traces: typeof traces
}

export const schema: SqliteSchema = { logs, metrics, traces }
