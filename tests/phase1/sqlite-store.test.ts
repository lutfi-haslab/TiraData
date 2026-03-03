import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { SqliteStore } from '../../src/backend/infrastructure/sqlite/store'
import type { LogEntry, MetricEntry, TraceEntry } from '../../src/backend/domain/types'

// Use a unique in-memory DB per test file
let store: SqliteStore

beforeEach(() => {
  store = new SqliteStore(':memory:')
})

afterEach(() => {
  // SqliteStore uses Bun's Database which closes on GC — no explicit close needed
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeLog = (overrides: Partial<LogEntry> = {}): LogEntry => ({
  id:         crypto.randomUUID(),
  timestamp:  Date.now(),
  level:      'info',
  service:    'test-svc',
  message:    'test message',
  attributes: {},
  projectId:  'p1',
  ...overrides,
})

const makeMetric = (overrides: Partial<MetricEntry> = {}): MetricEntry => ({
  timestamp: Date.now(),
  name:      'cpu.usage',
  value:     50.0,
  labels:    { env: 'test' },
  projectId: 'p1',
  ...overrides,
})

const makeTrace = (overrides: Partial<TraceEntry> = {}): TraceEntry => ({
  trace_id:   'trace-1',
  span_id:    crypto.randomUUID(),
  parent_id:  null,
  start_time: Date.now(),
  duration:   100,
  name:       'GET /api',
  attributes: {},
  projectId:  'p1',
  ...overrides,
})

// ─── Logs ─────────────────────────────────────────────────────────────────────

describe('SqliteStore – logs', () => {
  it('inserts and queries a single log', async () => {
    const log = makeLog({ message: 'hello world', service: 'api' })
    await store.insertLogs([log])

    const { data: results } = await store.queryLogs({ projectId: 'p1', limit: 10 })
    expect(results).toHaveLength(1)
    expect(results[0].message).toBe('hello world')
    expect(results[0].service).toBe('api')
  })

  it('inserts a batch and returns all rows', async () => {
    const batch = Array.from({ length: 20 }, (_, i) => makeLog({ message: `msg-${i}` }))
    await store.insertLogs(batch)

    const { data: results } = await store.queryLogs({ projectId: 'p1', limit: 50 })
    expect(results).toHaveLength(20)
  })

  it('returns rows newest-first', async () => {
    const now = Date.now()
    await store.insertLogs([
      makeLog({ timestamp: now - 2000, message: 'oldest' }),
      makeLog({ timestamp: now - 1000, message: 'middle' }),
      makeLog({ timestamp: now,        message: 'newest' }),
    ])
    const { data: results } = await store.queryLogs({ projectId: 'p1', limit: 10 })
    expect(results[0].message).toBe('newest')
    expect(results[2].message).toBe('oldest')
  })

  it('filters by service', async () => {
    await store.insertLogs([
      makeLog({ service: 'api' }),
      makeLog({ service: 'worker' }),
      makeLog({ service: 'api' }),
    ])
    const { data: results } = await store.queryLogs({ projectId: 'p1', service: 'api' })
    expect(results).toHaveLength(2)
    expect(results.every((r) => r.service === 'api')).toBe(true)
  })

  it('filters by level', async () => {
    await store.insertLogs([
      makeLog({ level: 'info' }),
      makeLog({ level: 'error' }),
      makeLog({ level: 'error' }),
    ])
    const { data: errors } = await store.queryLogs({ projectId: 'p1', level: 'error' })
    expect(errors).toHaveLength(2)
    expect(errors.every((r: any) => r.level === 'error')).toBe(true)
  })

  it('filters by time range', async () => {
    const now = Date.now()
    await store.insertLogs([
      makeLog({ timestamp: now - 10_000 }),
      makeLog({ timestamp: now - 5_000  }),
      makeLog({ timestamp: now          }),
    ])
    const { data: results } = await store.queryLogs({ projectId: 'p1', from: now - 6_000, to: now - 4_000 })
    expect(results).toHaveLength(1)
  })

  it('respects limit', async () => {
    await store.insertLogs(Array.from({ length: 10 }, () => makeLog()))
    const { data: results } = await store.queryLogs({ projectId: 'p1', limit: 3 })
    expect(results).toHaveLength(3)
  })

  it('skips duplicate ids (idempotent insert)', async () => {
    const log = makeLog()
    await store.insertLogs([log, log])   // same id twice
    const { data: results } = await store.queryLogs({ projectId: 'p1', limit: 10 })
    expect(results).toHaveLength(1)
  })

  it('round-trips attributes as JSON', async () => {
    const attrs = { nested: { a: 1 }, list: [1, 2, 3], flag: true }
    const log   = makeLog({ attributes: attrs })
    await store.insertLogs([log])
    const { data: [result] } = await store.queryLogs({ projectId: 'p1', limit: 1 })
    expect(result.attributes).toMatchObject(attrs)
  })
})

// ─── Metrics ──────────────────────────────────────────────────────────────────

describe('SqliteStore – metrics', () => {
  it('inserts and queries a single metric', async () => {
    const m = makeMetric({ name: 'memory.used', value: 1024 })
    await store.insertMetrics([m])

    const { data: results } = await store.queryMetrics({ projectId: 'p1', name: 'memory.used' })
    expect(results).toHaveLength(1)
    expect(results[0].value).toBe(1024)
  })

  it('inserts a batch', async () => {
    const batch = Array.from({ length: 15 }, (_, i) =>
      makeMetric({ name: 'http.duration', value: i * 10, timestamp: Date.now() + i })
    )
    await store.insertMetrics(batch)
    const { data: results } = await store.queryMetrics({ projectId: 'p1', name: 'http.duration' })
    expect(results).toHaveLength(15)
  })

  it('returns rows oldest-first (asc timestamp)', async () => {
    const now = Date.now()
    await store.insertMetrics([
      makeMetric({ timestamp: now,        value: 3 }),
      makeMetric({ timestamp: now - 2000, value: 1 }),
      makeMetric({ timestamp: now - 1000, value: 2 }),
    ])
    const { data: results } = await store.queryMetrics({ projectId: 'p1' })
    expect(results[0].value).toBe(1)
    expect(results[2].value).toBe(3)
  })

  it('returns distinct metric names', async () => {
    await store.insertMetrics([
      makeMetric({ name: 'cpu' }),
      makeMetric({ name: 'mem' }),
      makeMetric({ name: 'cpu' }),
    ])
    const names = await store.metricNames('p1')
    expect(names.sort()).toEqual(['cpu', 'mem'])
  })

  it('round-trips labels as JSON', async () => {
    const m = makeMetric({ labels: { env: 'prod', region: 'us-east-1' } })
    await store.insertMetrics([m])
    const { data: [result] } = await store.queryMetrics({ projectId: 'p1' })
    expect(result.labels).toMatchObject({ env: 'prod', region: 'us-east-1' })
  })
})

// ─── Traces ───────────────────────────────────────────────────────────────────

describe('SqliteStore – traces', () => {
  it('inserts and queries a single span', async () => {
    const span = makeTrace({ name: 'db.query', duration: 42 })
    await store.insertTraces([span])

    const { data: results } = await store.queryTraces({ projectId: 'p1' })
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('db.query')
    expect(results[0].duration).toBe(42)
  })

  it('filters by trace_id', async () => {
    await store.insertTraces([
      makeTrace({ trace_id: 'trace-A', span_id: 's1' }),
      makeTrace({ trace_id: 'trace-A', span_id: 's2' }),
      makeTrace({ trace_id: 'trace-B', span_id: 's3' }),
    ])
    const { data: results } = await store.queryTraces({ projectId: 'p1', trace_id: 'trace-A' })
    expect(results).toHaveLength(2)
    expect(results.every((r) => r.trace_id === 'trace-A')).toBe(true)
  })

  it('skips duplicate span_ids (idempotent insert)', async () => {
    const span = makeTrace()
    await store.insertTraces([span, span])
    const { data: results } = await store.queryTraces({ projectId: 'p1' })
    expect(results).toHaveLength(1)
  })

  it('preserves parent_id null', async () => {
    const span = makeTrace({ parent_id: null })
    await store.insertTraces([span])
    const { data: [result] } = await store.queryTraces({ projectId: 'p1' })
    expect(result.parent_id).toBeNull()
  })

  it('preserves parent_id value', async () => {
    const span = makeTrace({ parent_id: 'span-parent' })
    await store.insertTraces([span])
    const { data: [result] } = await store.queryTraces({ projectId: 'p1' })
    expect(result.parent_id).toBe('span-parent')
  })
})

// ─── SQL Query Engine ─────────────────────────────────────────────────────────

describe('SqliteStore – executeSql', () => {
  it('runs a SELECT query and returns columns + rows', async () => {
    await store.insertLogs([
      makeLog({ level: 'error', service: 'api' }),
      makeLog({ level: 'error', service: 'api' }),
      makeLog({ level: 'info',  service: 'api' }),
    ])

    const result = await store.executeSql(
      "SELECT level, COUNT(*) as n FROM logs GROUP BY level ORDER BY level",
      'p1'
    )
    expect(result.columns).toEqual(['level', 'n'])
    expect(result.rowCount).toBe(2)
    expect(result.durationMs).toBeGreaterThanOrEqual(0)

    const errorRow = result.rows.find((r) => r[0] === 'error')
    expect(errorRow?.[1]).toBe(2)
  })

  it('returns empty result for no rows', async () => {
    const result = await store.executeSql('SELECT * FROM logs WHERE 1=0', 'p1')
    expect(result.columns).toEqual([])
    expect(result.rows).toEqual([])
    expect(result.rowCount).toBe(0)
  })

  it('rejects INSERT statements', async () => {
    expect(
      store.executeSql("INSERT INTO logs (id) VALUES ('x')", 'p1')
    ).rejects.toThrow('Only SELECT')
  })

  it('rejects UPDATE statements', async () => {
    expect(
      store.executeSql("UPDATE logs SET level='error'", 'p1')
    ).rejects.toThrow('Only SELECT')
  })

  it('rejects DROP statements', async () => {
    expect(
      store.executeSql('DROP TABLE logs', 'p1')
    ).rejects.toThrow('Only SELECT')
  })

  it('allows WITH (CTE) queries', async () => {
    const result = await store.executeSql('WITH x AS (SELECT 1 AS n) SELECT * FROM x', 'p1')
    expect(result.rowCount).toBe(1)
    expect(result.rows[0][0]).toBe(1)
  })
})

// ─── Stats ────────────────────────────────────────────────────────────────────

describe('SqliteStore – collectStats', () => {
  it('returns zeroes on empty store', async () => {
    const stats = await store.collectStats(0, 1000, 'p1')
    expect(stats.logs.total).toBe(0)
    expect(stats.logs.last_1h).toBe(0)
    expect(stats.metrics.total).toBe(0)
    expect(stats.metrics.series).toBe(0)
    expect(stats.traces.total).toBe(0)
  })

  it('counts inserted data correctly', async () => {
    await store.insertLogs([makeLog(), makeLog()])
    await store.insertMetrics([makeMetric({ name: 'a' }), makeMetric({ name: 'b' }), makeMetric({ name: 'a' })])
    await store.insertTraces([makeTrace({ span_id: 's1' }), makeTrace({ span_id: 's2' })])

    const stats = await store.collectStats(42, 1000, 'p1')
    expect(stats.logs.total).toBe(2)
    expect(stats.metrics.total).toBe(3)
    expect(stats.metrics.series).toBe(2)   // distinct names
    expect(stats.traces.total).toBe(2)
    expect(stats.queue.size).toBe(42)
    expect(stats.queue.capacity).toBe(1000)
    expect(stats.queue.utilization).toBeCloseTo(0.042)
  })

  it('only counts last_1h logs correctly', async () => {
    const now = Date.now()
    await store.insertLogs([
      makeLog({ timestamp: now - 30 * 60 * 1000 }),   // 30 min ago — in window
      makeLog({ timestamp: now - 90 * 60 * 1000 }),   // 90 min ago — outside window
    ])
    const stats = await store.collectStats(0, 1000, 'p1')
    expect(stats.logs.total).toBe(2)
    expect(stats.logs.last_1h).toBe(1)
  })
})
