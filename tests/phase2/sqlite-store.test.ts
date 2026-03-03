import { describe, it, expect, beforeEach } from 'bun:test'
import { SqliteStore } from '../../src/backend/infrastructure/sqlite/store'
import type { LogEntry, MetricEntry, TraceEntry } from '../../src/backend/domain/types'

// Phase 2 tests focus on: Drizzle query builder correctness, optimize(), deleteBefore() TTL

let store: SqliteStore

beforeEach(() => {
  store = new SqliteStore(':memory:')
})

const makeLog = (overrides: Partial<LogEntry> = {}): LogEntry => ({
  id:         crypto.randomUUID(),
  timestamp:  Date.now(),
  level:      'info',
  service:    'svc',
  message:    'msg',
  attributes: {},
  ...overrides,
})

const makeMetric = (overrides: Partial<MetricEntry> = {}): MetricEntry => ({
  timestamp: Date.now(),
  name:      'test.metric',
  value:     1.0,
  labels:    {},
  ...overrides,
})

const makeTrace = (overrides: Partial<TraceEntry> = {}): TraceEntry => ({
  trace_id:   'tid',
  span_id:    crypto.randomUUID(),
  parent_id:  null,
  start_time: Date.now(),
  duration:   10,
  name:       'span',
  attributes: {},
  ...overrides,
})

// ─── Drizzle query builder ────────────────────────────────────────────────────

describe('SqliteStore (Drizzle) – combined filters', () => {
  it('combines service + level filters (AND)', async () => {
    await store.insertLogs([
      makeLog({ service: 'api', level: 'error' }),
      makeLog({ service: 'api', level: 'info'  }),
      makeLog({ service: 'db',  level: 'error' }),
    ])
    const { data: results } = await store.queryLogs({ service: 'api', level: 'error' })
    expect(results).toHaveLength(1)
    expect(results[0].service).toBe('api')
    expect(results[0].level).toBe('error')
  })

  it('combines name + time filters for metrics', async () => {
    const now = Date.now()
    await store.insertMetrics([
      makeMetric({ name: 'cpu', timestamp: now - 5000, value: 10 }),
      makeMetric({ name: 'cpu', timestamp: now,        value: 20 }),
      makeMetric({ name: 'mem', timestamp: now,        value: 50 }),
    ])
    const { data: results } = await store.queryMetrics({
      name: 'cpu',
      from: now - 1000,
      to:   now + 1000,
    })
    expect(results).toHaveLength(1)
    expect(results[0].value).toBe(20)
  })

  it('combines trace_id + time range filter', async () => {
    const now = Date.now()
    await store.insertTraces([
      makeTrace({ trace_id: 'A', span_id: 's1', start_time: now - 3000 }),
      makeTrace({ trace_id: 'A', span_id: 's2', start_time: now }),
      makeTrace({ trace_id: 'B', span_id: 's3', start_time: now }),
    ])
    const { data: results } = await store.queryTraces({ trace_id: 'A', from: now - 1000 })
    expect(results).toHaveLength(1)
    expect(results[0].span_id).toBe('s2')
  })
})

describe('SqliteStore (Drizzle) – pagination', () => {
  it('offset works for logs', async () => {
    const now = Date.now()
    await store.insertLogs(
      Array.from({ length: 5 }, (_, i) =>
        makeLog({ timestamp: now - i * 1000, message: `msg-${i}` })
      )
    )
    const { data: page1 } = await store.queryLogs({ limit: 2, offset: 0 })
    const { data: page2 } = await store.queryLogs({ limit: 2, offset: 2 })

    expect(page1).toHaveLength(2)
    expect(page2).toHaveLength(2)
    expect(page1[0].message).not.toBe(page2[0].message)
  })

  it('clamps limit to max 1000 for logs', async () => {
    // Insert 3 rows, request 9999 — should still work without error
    await store.insertLogs(Array.from({ length: 3 }, () => makeLog()))
    const { data: results } = await store.queryLogs({ limit: 9999 })
    expect(results).toHaveLength(3)
  })
})

// ─── optimize() ──────────────────────────────────────────────────────────────

describe('SqliteStore – optimize()', () => {
  it('returns durationMs', async () => {
    const result = await store.optimize()
    expect(typeof result.durationMs).toBe('number')
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('does not corrupt data after VACUUM', async () => {
    await store.insertLogs([makeLog({ message: 'before vacuum' })])
    await store.optimize()
    const { data: results } = await store.queryLogs({ limit: 10 })
    expect(results).toHaveLength(1)
    expect(results[0].message).toBe('before vacuum')
  })

  it('can be called multiple times safely', async () => {
    await store.optimize()
    await store.optimize()   // should not throw
  })
})

// ─── deleteBefore() (TTL) ────────────────────────────────────────────────────

describe('SqliteStore – deleteBefore() TTL', () => {
  it('deletes logs older than cutoff', async () => {
    const now = Date.now()
    await store.insertLogs([
      makeLog({ timestamp: now - 10_000 }),   // old
      makeLog({ timestamp: now - 5_000  }),   // old
      makeLog({ timestamp: now          }),   // new — keep
    ])

    const result = await store.deleteBefore({ logsBefore: now - 3_000 })

    expect(result.logs).toBe(2)
    expect(result.metrics).toBe(0)
    expect(result.traces).toBe(0)

    const { data: remaining } = await store.queryLogs({ limit: 10 })
    expect(remaining).toHaveLength(1)
  })

  it('deletes metrics older than cutoff', async () => {
    const now = Date.now()
    await store.insertMetrics([
      makeMetric({ timestamp: now - 10_000 }),
      makeMetric({ timestamp: now          }),
    ])

    const result = await store.deleteBefore({ metricsBefore: now - 5_000 })
    expect(result.metrics).toBe(1)

    const { data: remaining } = await store.queryMetrics({})
    expect(remaining).toHaveLength(1)
  })

  it('deletes traces older than cutoff', async () => {
    const now = Date.now()
    await store.insertTraces([
      makeTrace({ span_id: 's1', start_time: now - 10_000 }),
      makeTrace({ span_id: 's2', start_time: now          }),
    ])

    const result = await store.deleteBefore({ tracesBefore: now - 5_000 })
    expect(result.traces).toBe(1)

    const { data: remaining } = await store.queryTraces({})
    expect(remaining).toHaveLength(1)
  })

  it('handles all three TTL types in one call', async () => {
    const now = Date.now()
    const cutoff = now - 5_000

    await store.insertLogs([makeLog({ timestamp: cutoff - 1000 })])
    await store.insertMetrics([makeMetric({ timestamp: cutoff - 1000 })])
    await store.insertTraces([makeTrace({ span_id: 'x1', start_time: cutoff - 1000 })])

    const result = await store.deleteBefore({
      logsBefore:    cutoff,
      metricsBefore: cutoff,
      tracesBefore:  cutoff,
    })

    expect(result.logs).toBe(1)
    expect(result.metrics).toBe(1)
    expect(result.traces).toBe(1)
  })

  it('returns 0 deletes when nothing matches cutoff', async () => {
    const now = Date.now()
    await store.insertLogs([makeLog({ timestamp: now })])

    const result = await store.deleteBefore({ logsBefore: now - 10_000 })
    expect(result.logs).toBe(0)
  })

  it('is idempotent — second delete returns 0', async () => {
    const now = Date.now()
    await store.insertLogs([makeLog({ timestamp: now - 10_000 })])

    const cutoff = now - 5_000
    await store.deleteBefore({ logsBefore: cutoff })
    const second = await store.deleteBefore({ logsBefore: cutoff })
    expect(second.logs).toBe(0)
  })

  it('skips undefined params (only deletes what is specified)', async () => {
    const now = Date.now()
    await store.insertLogs([makeLog({ timestamp: now - 10_000 })])
    await store.insertMetrics([makeMetric({ timestamp: now - 10_000 })])

    // Only delete logs, not metrics
    const result = await store.deleteBefore({ logsBefore: now })
    expect(result.logs).toBe(1)
    expect(result.metrics).toBe(0)

    const { data: metrics } = await store.queryMetrics({})
    expect(metrics).toHaveLength(1)
  })
})
