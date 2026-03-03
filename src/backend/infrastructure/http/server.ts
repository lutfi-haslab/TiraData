import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { IngestionQueue } from '../queue/ingestion-queue'
import { SqliteStore } from '../sqlite/store'
import { normaliseLog, normaliseMetric, normaliseTrace } from '../../usecases/normalise'
import type {
  IngestLogPayload,
  IngestMetricPayload,
  IngestTracePayload,
} from '../../domain/types'

// ─── Singleton Fixtures ───────────────────────────────────────────────────────

const store = new SqliteStore()

const queue = new IngestionQueue(10_000, (logs, metrics, traces) => {
  if (logs.length)    store.insertLogs(logs)
  if (metrics.length) store.insertMetrics(metrics)
  if (traces.length)  store.insertTraces(traces)
})

// ─── Server Factory ───────────────────────────────────────────────────────────

export const createServer = () => {
  const app = new Hono()

  // ── Global middleware ──────────────────────────────────────────────────────
  app.use('*', logger())
  app.use('*', cors({ origin: '*' }))

  // ── Health ─────────────────────────────────────────────────────────────────
  app.get('/api/health', (c) =>
    c.json({ status: 'ok', time: new Date().toISOString() })
  )

  // ── Stats ──────────────────────────────────────────────────────────────────
  app.get('/api/stats', (c) =>
    c.json(store.collectStats(queue.size, queue.capacity))
  )

  // ── Ingestion ──────────────────────────────────────────────────────────────
  app.post('/api/ingest/log', async (c) => {
    let payload: IngestLogPayload
    try { payload = await c.req.json() }
    catch { return c.json({ error: 'Invalid JSON' }, 400) }

    const entry = normaliseLog(payload)
    const accepted = queue.enqueueLog(entry)

    return c.json({ success: true, id: entry.id, accepted }, accepted ? 202 : 429)
  })

  app.post('/api/ingest/metric', async (c) => {
    let payload: IngestMetricPayload
    try { payload = await c.req.json() }
    catch { return c.json({ error: 'Invalid JSON' }, 400) }

    const entry = normaliseMetric(payload)
    const accepted = queue.enqueueMetric(entry)

    return c.json({ success: true, accepted }, accepted ? 202 : 429)
  })

  app.post('/api/ingest/trace', async (c) => {
    let payload: IngestTracePayload
    try { payload = await c.req.json() }
    catch { return c.json({ error: 'Invalid JSON' }, 400) }

    const entry = normaliseTrace(payload)
    const accepted = queue.enqueueTrace(entry)

    return c.json({ success: true, span_id: entry.span_id, accepted }, accepted ? 202 : 429)
  })

  // ── Query ──────────────────────────────────────────────────────────────────
  app.get('/api/logs', (c) => {
    const q = c.req.query()
    const logs = store.queryLogs({
      service: q.service,
      level:   q.level,
      from:    q.from   ? Number(q.from)   : undefined,
      to:      q.to     ? Number(q.to)     : undefined,
      limit:   q.limit  ? Number(q.limit)  : 200,
      offset:  q.offset ? Number(q.offset) : 0,
    })
    return c.json({ data: logs, count: logs.length })
  })

  app.get('/api/metrics', (c) => {
    const q = c.req.query()
    const metrics = store.queryMetrics({
      name:  q.name,
      from:  q.from  ? Number(q.from)  : undefined,
      to:    q.to    ? Number(q.to)    : undefined,
      limit: q.limit ? Number(q.limit) : 500,
    })
    return c.json({ data: metrics, count: metrics.length })
  })

  app.get('/api/metrics/names', (c) =>
    c.json({ data: store.metricNames() })
  )

  app.get('/api/traces', (c) => {
    const q = c.req.query()
    const traces = store.queryTraces({
      trace_id: q.trace_id,
      from:  q.from  ? Number(q.from)  : undefined,
      to:    q.to    ? Number(q.to)    : undefined,
      limit: q.limit ? Number(q.limit) : 200,
    })
    return c.json({ data: traces, count: traces.length })
  })

  app.post('/api/query/sql', async (c) => {
    let body: { sql: string }
    try { body = await c.req.json() }
    catch { return c.json({ error: 'Invalid JSON' }, 400) }

    if (!body.sql || typeof body.sql !== 'string') {
      return c.json({ error: '`sql` field is required' }, 400)
    }

    try {
      const result = store.executeSql(body.sql)
      return c.json(result)
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400)
    }
  })

  return app
}

// Export queue/store for graceful shutdown hooks
export { queue, store }
