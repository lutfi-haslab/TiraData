import {
  pgTable,
  varchar,
  bigint,
  doublePrecision,
  text,
  jsonb,
  index,
  boolean,
} from 'drizzle-orm/pg-core'

// ─── Tables ───────────────────────────────────────────────────────────────────

export const logs = pgTable(
  'logs',
  {
    id:         varchar('id', { length: 128 }).primaryKey(),
    timestamp:  bigint('timestamp', { mode: 'number' }).notNull(),
    level:      varchar('level', { length: 16 }).notNull(),
    service:    varchar('service', { length: 128 }).notNull(),
    message:    text('message').notNull(),
    attributes: jsonb('attributes').notNull().default({}),
  },
  (t) => [
    index('idx_logs_ts').on(t.timestamp),
    index('idx_logs_svc_ts').on(t.service, t.timestamp),
    index('idx_logs_lvl_ts').on(t.level, t.timestamp),
    // GIN indexes for jsonb columns (optimization for @> queries, though we use them via SQL Editor mostly)
    index('idx_logs_attrs').using('gin', t.attributes),
  ]
)

export const metrics = pgTable(
  'metrics',
  {
    timestamp: bigint('timestamp', { mode: 'number' }).notNull(),
    name:      varchar('name', { length: 256 }).notNull(),
    value:     doublePrecision('value').notNull(),
    labels:    jsonb('labels').notNull().default({}),
  },
  (t) => [
    index('idx_metrics_name_ts').on(t.name, t.timestamp),
    index('idx_metrics_labels').using('gin', t.labels),
  ]
)

export const traces = pgTable(
  'traces',
  {
    traceId:    varchar('trace_id', { length: 128 }).notNull(),
    spanId:     varchar('span_id', { length: 128 }).primaryKey(),
    parentId:   varchar('parent_id', { length: 128 }),
    startTime:  bigint('start_time', { mode: 'number' }).notNull(),
    duration:   bigint('duration', { mode: 'number' }).notNull(),
    name:       varchar('name', { length: 256 }).notNull(),
    attributes: jsonb('attributes').notNull().default({}),
  },
  (t) => [
    index('idx_traces_ts').on(t.startTime),
    index('idx_traces_trace_id').on(t.traceId),
    index('idx_traces_attrs').using('gin', t.attributes),
  ]
)

export const alertRules = pgTable('alert_rules', {
  id:         varchar('id', { length: 128 }).primaryKey(),
  name:       varchar('name', { length: 256 }).notNull(),
  query:      text('query').notNull(),
  threshold:  doublePrecision('threshold').notNull(),
  condition:  varchar('condition', { length: 8 }).notNull(), // 'gt' | 'lt'
  intervalMs: bigint('interval_ms', { mode: 'number' }).notNull(),
  enabled:    boolean('enabled').notNull().default(true),
  lastChecked: bigint('last_checked', { mode: 'number' }),
})

export const alertHistory = pgTable('alert_history', {
  id:        varchar('id', { length: 128 }).primaryKey(),
  ruleId:    varchar('rule_id', { length: 128 }).notNull(),
  timestamp: bigint('timestamp', { mode: 'number' }).notNull(),
  value:     doublePrecision('value').notNull(),
  triggered: boolean('triggered').notNull(),
})

export type PgSchema = {
  logs: typeof logs
  metrics: typeof metrics
  traces: typeof traces
  alertRules: typeof alertRules
  alertHistory: typeof alertHistory
}

export const schema: PgSchema = { 
  logs, 
  metrics, 
  traces, 
  alertRules, 
  alertHistory 
}
