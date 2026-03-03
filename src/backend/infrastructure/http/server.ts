import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { IngestionQueue } from '../queue/ingestion-queue'
import { WALQueue } from '../queue/wal-queue'
import { createStore } from '../store-factory'
import { normaliseLog, normaliseMetric, normaliseTrace } from '../../usecases/normalise'
import { mapOTLPLogs, mapOTLPMetrics, mapOTLPTraces } from '../../usecases/otlp-mapper'
import { authMiddleware } from './middleware'
import { queryCache } from '../cache/query-cache'
import type { IStore } from '../../domain/store.interface'
import type { IIngestionQueue } from '../../domain/queue.interface'
import type {
  IngestLogPayload,
  IngestMetricPayload,
  IngestTracePayload,
} from '../../domain/types'

// ─── Async Server Factory ─────────────────────────────────────────────────────
// Must be async because createStore() awaits PostgresStore.init()

let _queue: IIngestionQueue | null = null
let _store: IStore | null = null

export const createServer = async () => {
  _store = await createStore()

  const queueMode = Bun.env.QUEUE_MODE ?? 'memory'
  const flushFn = async (logs: any[], metrics: any[], traces: any[]) => {
    if (logs.length)    await _store!.insertLogs(logs)
    if (metrics.length) await _store!.insertMetrics(metrics)
    if (traces.length)  await _store!.insertTraces(traces)
  }

  if (queueMode === 'wal') {
    console.log('[Queue] Using Persistent WAL Queue')
    _queue = new WALQueue(100_000, flushFn)
  } else {
    console.log('[Queue] Using In-Memory Ring Buffer')
    _queue = new IngestionQueue(10_000, flushFn)
  }

  const app = new Hono()

  // ── Global middleware ──────────────────────────────────────────────────────
  app.use('*', logger())
  app.use('*', cors({ origin: '*' }))
  app.use('/api/*', authMiddleware)
  app.use('/v1/*', authMiddleware) // OTLP routes

  // ── Health ─────────────────────────────────────────────────────────────────
  app.get('/api/health', (c) =>
    c.json({ status: 'ok', time: new Date().toISOString() })
  )

  // ── Stats ──────────────────────────────────────────────────────────────────
  app.get('/api/stats', async (c) =>
    c.json(await _store!.collectStats(_queue!.size, _queue!.capacity))
  )

  // ── Ingestion ──────────────────────────────────────────────────────────────
  app.post('/api/ingest/log', async (c) => {
    let payload: IngestLogPayload
    try { payload = await c.req.json() }
    catch { return c.json({ error: 'Invalid JSON' }, 400) }

    const entry    = normaliseLog(payload)
    const accepted = _queue!.enqueueLog(entry)
    return c.json({ success: true, id: entry.id, accepted }, accepted ? 202 : 429)
  })

  app.post('/api/ingest/metric', async (c) => {
    let payload: IngestMetricPayload
    try { payload = await c.req.json() }
    catch { return c.json({ error: 'Invalid JSON' }, 400) }

    const entry    = normaliseMetric(payload)
    const accepted = _queue!.enqueueMetric(entry)
    return c.json({ success: true, accepted }, accepted ? 202 : 429)
  })

  app.post('/api/ingest/trace', async (c) => {
    let payload: IngestTracePayload
    try { payload = await c.req.json() }
    catch { return c.json({ error: 'Invalid JSON' }, 400) }

    const entry    = normaliseTrace(payload)
    const accepted = _queue!.enqueueTrace(entry)
    return c.json({ success: true, span_id: entry.span_id, accepted }, accepted ? 202 : 429)
  })

  // ── OTLP (OpenTelemetry) Ingestion ─────────────────────────────────────────
  app.post('/v1/logs', async (c) => {
    const body = await c.req.json()
    const entries = mapOTLPLogs(body)
    if (entries.length === 0) return c.json({ partialSuccess: false }, 200)

    let accepted = 0
    for (const e of entries) {
      if (_queue!.enqueueLog(e)) accepted++
    }
    return c.json({ partialSuccess: accepted < entries.length }, 
      accepted > 0 ? 200 : 429)
  })

  app.post('/v1/metrics', async (c) => {
    const body = await c.req.json()
    const entries = mapOTLPMetrics(body)
    if (entries.length === 0) return c.json({ partialSuccess: false }, 200)

    let accepted = 0
    for (const e of entries) {
      if (_queue!.enqueueMetric(e)) accepted++
    }
    return c.json({ partialSuccess: accepted < entries.length }, 
      accepted > 0 ? 200 : 429)
  })

  app.post('/v1/traces', async (c) => {
    const body = await c.req.json()
    const entries = mapOTLPTraces(body)
    if (entries.length === 0) return c.json({ partialSuccess: false }, 200)

    let accepted = 0
    for (const e of entries) {
      if (_queue!.enqueueTrace(e)) accepted++
    }
    return c.json({ partialSuccess: accepted < entries.length }, 
      accepted > 0 ? 200 : 429)
  })

  // ── Query ──────────────────────────────────────────────────────────────────
  app.get('/api/logs', async (c) => {
    const q = c.req.query()
    const cacheKey = `logs:${c.req.url}`
    const cached = queryCache.get(cacheKey)
    if (cached) return c.json(cached)

    const result = await _store!.queryLogs({
      service: q.service,
      level: q.level,
      from: q.from ? Number(q.from) : undefined,
      to: q.to ? Number(q.to) : undefined,
      limit: q.limit ? Number(q.limit) : 200,
      offset: q.offset ? Number(q.offset) : 0,
    })

    queryCache.set(cacheKey, result)
    return c.json(result)
  })

  app.get('/api/metrics', async (c) => {
    const q = c.req.query()
    const cacheKey = `metrics:${c.req.url}`
    const cached = queryCache.get(cacheKey)
    if (cached) return c.json(cached)

    const result = await _store!.queryMetrics({
      name: q.name,
      from: q.from ? Number(q.from) : undefined,
      to: q.to ? Number(q.to) : undefined,
      limit: q.limit ? Number(q.limit) : 500,
      offset: q.offset ? Number(q.offset) : 0,
    })

    queryCache.set(cacheKey, result)
    return c.json(result)
  })

  app.get('/api/metrics/names', async (c) => {
    const cacheKey = 'metrics:names'
    const cached = queryCache.get(cacheKey)
    if (cached) return c.json(cached)

    const result = { data: await _store!.metricNames() }
    queryCache.set(cacheKey, result, 60000) // Cache names for 1 min
    return c.json(result)
  })

  app.get('/api/traces', async (c) => {
    const q = c.req.query()
    const cacheKey = `traces:${c.req.url}`
    const cached = queryCache.get(cacheKey)
    if (cached) return c.json(cached)

    const result = await _store!.queryTraces({
      trace_id: q.trace_id,
      from: q.from ? Number(q.from) : undefined,
      to: q.to ? Number(q.to) : undefined,
      limit: q.limit ? Number(q.limit) : 200,
      offset: q.offset ? Number(q.offset) : 0,
    })

    queryCache.set(cacheKey, result)
    return c.json(result)
  })

  app.post('/api/query/sql', async (c) => {
    let body: { sql: string }
    try { body = await c.req.json() }
    catch { return c.json({ error: 'Invalid JSON' }, 400) }

    if (!body.sql || typeof body.sql !== 'string') {
      return c.json({ error: '`sql` field is required' }, 400)
    }

    const cacheKey = `sql:${body.sql}`
    const cached = queryCache.get(cacheKey)
    if (cached) return c.json(cached)

    try {
      const result = await _store!.executeSql(body.sql)
      queryCache.set(cacheKey, result)
      return c.json(result)
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400)
    }
  })

  // ── Admin ──────────────────────────────────────────────────────────────────
  app.post('/api/admin/optimize', async (c) => {
    const result = await _store!.optimize()
    return c.json({ success: true, ...result })
  })

  app.get('/api/admin/config', (c) =>
    c.json({
      adapter:      Bun.env.STORE ?? 'sqlite',
      db_path:      Bun.env.DB_PATH ?? 'tiradata.db',
      queue_mode:    Bun.env.QUEUE_MODE ?? 'memory',
      queue_size:   _queue!.size,
      queue_cap:    _queue!.capacity,
      queue_dropped: _queue!.dropped,
    })
  )

  app.post('/api/admin/ttl/run', async (c) => {
    const body = await c.req.json().catch(() => ({})) as Record<string, number>
    const now  = Date.now()

    // Body params take priority; env vars are the fallback defaults
    const logsDays    = Number(body.logsDays    ?? Bun.env.TTL_LOGS_DAYS    ?? 30)
    const metricsDays = Number(body.metricsDays ?? Bun.env.TTL_METRICS_DAYS ?? 90)
    const tracesDays  = Number(body.tracesDays  ?? Bun.env.TTL_TRACES_DAYS  ?? 7)

    const result = await _store!.deleteBefore({
      logsBefore:    now - logsDays    * 86_400_000,
      metricsBefore: now - metricsDays * 86_400_000,
      tracesBefore:  now - tracesDays  * 86_400_000,
    })

    return c.json({ success: true, deleted: result, retention: { logsDays, metricsDays, tracesDays } })
  })

  return app
}

// ─── Accessors for graceful shutdown ─────────────────────────────────────────
export const getQueue = () => _queue
export const getStore = () => _store
