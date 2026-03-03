import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { sign } from 'hono/jwt'
import { logger } from 'hono/logger'
import { createBunWebSocket } from 'hono/bun'
import { IngestionQueue } from '../queue/ingestion-queue'
import { WALQueue } from '../queue/wal-queue'
import { createStore } from '../store-factory'
import { normaliseLog, normaliseMetric, normaliseTrace } from '../../usecases/normalise'
import { mapOTLPLogs, mapOTLPMetrics, mapOTLPTraces } from '../../usecases/otlp-mapper'
import { createAuthMiddleware } from './middleware'
import { queryCache } from '../cache/query-cache'
import type { IStore } from '../../domain/store.interface'
import type { IIngestionQueue } from '../../domain/queue.interface'
import type {
  IngestLogPayload,
  IngestMetricPayload,
  IngestTracePayload,
  AlertRule,
} from '../../domain/types'

// ─── Async Server Factory ─────────────────────────────────────────────────────
// Must be async because createStore() awaits PostgresStore.init()

let _queue: IIngestionQueue | null = null
let _store: IStore | null = null

const { upgradeWebSocket, websocket } = createBunWebSocket()

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

  const app = new Hono<{ Variables: { projectId: string, role: string, userId?: string } }>()

  // ── Global middleware ──────────────────────────────────────────────────────
  app.use('*', logger())
  app.use('*', cors({ origin: '*' }))
  
  const auth = createAuthMiddleware(_store!)
  app.use('/api/*', auth)
  app.use('/v1/*', auth) // OTLP routes

  // Helper to get effective projectId
  const getPID = (c: any) => {
    const contextId = c.get('projectId') || 'default'
    if (contextId === 'master') {
      return c.req.header('X-Project-Id') || c.req.query('projectId') || 'default'
    }
    return contextId
  }

  // ── Live Tail (WebSocket) ──────────────────────────────────────────────────
  app.get('/ws/tail', upgradeWebSocket((c) => {
    const key = c.req.query('key')
    const master = Bun.env.MASTER_KEY
    if (master && key !== master) return {} // Hono WS handles this as closing
    
    // Filter params
    const fSvc   = c.req.query('service')
    const fLevel = c.req.query('level')

    let unsubscribe: (() => void) | null = null

    return {
      onOpen(_event, ws) {
        console.log('[WS] Tail connected')
        unsubscribe = _queue!.onLog((log) => {
          // Server-side filter
          if (fSvc && log.service !== fSvc) return
          if (fLevel && log.level !== fLevel) return
          
          ws.send(JSON.stringify(log))
        })
      },
      onClose() {
        console.log('[WS] Tail disconnected')
        unsubscribe?.()
      }
    }
  }))

  // ── Health ─────────────────────────────────────────────────────────────────
  app.get('/api/health', (c) =>
    c.json({ status: 'ok', time: new Date().toISOString() })
  )

  // ── Stats ──────────────────────────────────────────────────────────────────
  app.get('/api/stats', async (c) => {
    const pid = getPID(c)
    return c.json(await _store!.collectStats(_queue!.size, _queue!.capacity, pid))
  })

  // ── Ingestion ──────────────────────────────────────────────────────────────
  app.post('/api/ingest/log', async (c) => {
    let payload: IngestLogPayload
    try { payload = await c.req.json() }
    catch { return c.json({ error: 'Invalid JSON' }, 400) }

    const pid = getPID(c)
    const entry    = { ...normaliseLog(payload), projectId: pid }
    const accepted = _queue!.enqueueLog(entry)
    return c.json({ success: true, id: entry.id, accepted }, accepted ? 202 : 429)
  })

  app.post('/api/ingest/metric', async (c) => {
    let payload: IngestMetricPayload
    try { payload = await c.req.json() }
    catch { return c.json({ error: 'Invalid JSON' }, 400) }

    const pid = getPID(c)
    const entry    = { ...normaliseMetric(payload), projectId: pid }
    const accepted = _queue!.enqueueMetric(entry)
    return c.json({ success: true, accepted }, accepted ? 202 : 429)
  })

  app.post('/api/ingest/trace', async (c) => {
    let payload: IngestTracePayload
    try { payload = await c.req.json() }
    catch { return c.json({ error: 'Invalid JSON' }, 400) }

    const pid = getPID(c)
    const entry    = { ...normaliseTrace(payload), projectId: pid }
    const accepted = _queue!.enqueueTrace(entry)
    return c.json({ success: true, span_id: entry.span_id, accepted }, accepted ? 202 : 429)
  })

  // ── OTLP (OpenTelemetry) Ingestion ─────────────────────────────────────────
  app.post('/v1/logs', async (c) => {
    const body = await c.req.json()
    const entries = mapOTLPLogs(body)
    if (entries.length === 0) return c.json({ partialSuccess: false }, 200)

    const pid = getPID(c)
    let accepted = 0
    for (const e of entries) {
      if (_queue!.enqueueLog({ ...e, projectId: pid })) accepted++
    }
    return c.json({ partialSuccess: accepted < entries.length }, 
      accepted > 0 ? 200 : 429)
  })

  app.post('/v1/metrics', async (c) => {
    const body = await c.req.json()
    const entries = mapOTLPMetrics(body)
    if (entries.length === 0) return c.json({ partialSuccess: false }, 200)

    const pid = getPID(c)
    let accepted = 0
    for (const e of entries) {
      if (_queue!.enqueueMetric({ ...e, projectId: pid })) accepted++
    }
    return c.json({ partialSuccess: accepted < entries.length }, 
      accepted > 0 ? 200 : 429)
  })

  app.post('/v1/traces', async (c) => {
    const body = await c.req.json()
    const entries = mapOTLPTraces(body)
    if (entries.length === 0) return c.json({ partialSuccess: false }, 200)

    const pid = getPID(c)
    let accepted = 0
    for (const e of entries) {
      if (_queue!.enqueueTrace({ ...e, projectId: pid })) accepted++
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

    const pid = getPID(c)
    const result = await _store!.queryLogs({
      projectId: pid,
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

    const pid = getPID(c)
    const result = await _store!.queryMetrics({
      projectId: pid,
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
    const pid = getPID(c)
    const cacheKey = `metrics:names:${pid}`
    const result = { data: await _store!.metricNames(pid) }
    queryCache.set(cacheKey, result, 60000) // Cache names for 1 min
    return c.json(result)
  })

  app.get('/api/traces', async (c) => {
    const q = c.req.query()
    const cacheKey = `traces:${c.req.url}`
    const cached = queryCache.get(cacheKey)
    if (cached) return c.json(cached)

    const pid = getPID(c)
    const result = await _store!.queryTraces({
      projectId: pid,
      trace_id: q.trace_id,
      service: q.service,
      name: q.name,
      from: q.from ? Number(q.from) : undefined,
      to: q.to ? Number(q.to) : undefined,
      limit: q.limit ? Number(q.limit) : 200,
      offset: q.offset ? Number(q.offset) : 0,
    })

    queryCache.set(cacheKey, result)
    return c.json(result)
  })

  app.get('/api/apm/services', async (c) => {
    const q = c.req.query()
    const pid = getPID(c)
    const from = q.from ? Number(q.from) : Date.now() - 3_600_000
    const to   = q.to   ? Number(q.to)   : Date.now()
    const result = await _store!.queryTraces({ projectId: pid, from, to, limit: 5000, offset: 0 })
    const spans = result.data

    interface OpStats { count: number; totalDuration: number; errors: number; durations: number[] }
    interface SvcStats { service: string; requests: number; errors: number; totalDuration: number; durations: number[]; operations: Map<string, OpStats> }

    const services = new Map<string, SvcStats>()
    for (const span of spans) {
      const svc = (span.attributes as any)?.['service.name'] || 'unknown'
      const isError = !!(span.attributes as any)?.['error'] || Number((span.attributes as any)?.['http.status_code']) >= 500
      if (!services.has(svc)) services.set(svc, { service: svc, requests: 0, errors: 0, totalDuration: 0, durations: [], operations: new Map() })
      const s = services.get(svc)!
      s.requests++; if (isError) s.errors++; s.totalDuration += span.duration; s.durations.push(span.duration)
      if (!s.operations.has(span.name)) s.operations.set(span.name, { count: 0, totalDuration: 0, errors: 0, durations: [] })
      const op = s.operations.get(span.name)!
      op.count++; op.totalDuration += span.duration; if (isError) op.errors++; op.durations.push(span.duration)
    }

    const pct = (arr: number[], p: number) => {
      if (!arr.length) return 0
      const sorted = [...arr].sort((a, b) => a - b)
      return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)]
    }

    const out = [...services.values()].map(s => ({
      service: s.service, requests: s.requests, errors: s.errors,
      errorRate: s.requests > 0 ? s.errors / s.requests : 0,
      avgLatency: s.requests > 0 ? s.totalDuration / s.requests : 0,
      p50: pct(s.durations, 50), p95: pct(s.durations, 95), p99: pct(s.durations, 99),
      operations: [...s.operations.entries()].map(([name, op]) => ({
        name, requests: op.count, errors: op.errors,
        errorRate: op.count > 0 ? op.errors / op.count : 0,
        avgLatency: op.count > 0 ? op.totalDuration / op.count : 0,
        p50: pct(op.durations, 50), p95: pct(op.durations, 95), p99: pct(op.durations, 99),
      })).sort((a, b) => b.requests - a.requests)
    })).sort((a, b) => b.requests - a.requests)

    return c.json({ services: out, from, to, totalSpans: spans.length })
  })

  app.get('/api/apm/histogram', async (c) => {
    const q = c.req.query()
    const pid = getPID(c)
    const from = q.from ? Number(q.from) : Date.now() - 3_600_000
    const to   = q.to   ? Number(q.to)   : Date.now()
    const service = q.service

    const result = await _store!.queryTraces({ projectId: pid, from, to, limit: 5000, offset: 0 })
    let spans = result.data
    if (service) spans = spans.filter(s => (s.attributes as any)?.['service.name'] === service)

    const buckets = 24
    const bucketMs = Math.max(1, (to - from) / buckets)
    const reqBuckets = Array(buckets).fill(0)
    const errBuckets = Array(buckets).fill(0)
    for (const span of spans) {
      const idx = Math.min(buckets - 1, Math.floor((span.start_time - from) / bucketMs))
      if (idx >= 0) { reqBuckets[idx]++; if ((span.attributes as any)?.['error']) errBuckets[idx]++ }
    }
    const times = Array.from({ length: buckets }, (_, i) => from + i * bucketMs)

    const latencyBucketMs = 50
    const maxLatency = Math.max(...spans.map(s => s.duration), 500)
    const numBkts = Math.min(40, Math.ceil(maxLatency / latencyBucketMs))
    const latencyHistogram = Array.from({ length: numBkts }, (_, i) => ({ bucket: i * latencyBucketMs, count: 0 }))
    for (const span of spans) {
      const b = Math.min(numBkts - 1, Math.floor(span.duration / latencyBucketMs))
      if (b >= 0) latencyHistogram[b].count++
    }

    return c.json({ times, requests: reqBuckets, errors: errBuckets, latencyHistogram })
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
      // For isolation logic we need the raw context projectId (may be 'master'),
      // not the getPID() which downcasts 'master' to a specific project.
      const rawPid = c.get('projectId') as string || 'default'
      const result = await _store!.executeSql(body.sql, rawPid)
      queryCache.set(cacheKey, result)
      return c.json(result)
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400)
    }
  })

  // ── Auth ───────────────────────────────────────────────────────────────────

  app.post('/api/auth/signup', async (c) => {
    let body: any
    try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON' }, 400) }
    
    if (!body.email || !body.password) {
      return c.json({ error: 'Email and password required' }, 400)
    }

    const existing = await _store!.getUserByEmail(body.email)
    if (existing) {
      return c.json({ error: 'User already exists with this email' }, 409)
    }

    const passwordHash = await Bun.password.hash(body.password, { algorithm: 'bcrypt', cost: 10 })
    const user = {
      id: crypto.randomUUID(),
      email: body.email,
      passwordHash,
      createdAt: Date.now()
    }
    await _store!.saveUser(user)

    const token = await sign({ userId: user.id }, Bun.env.JWT_SECRET || 'super-secret-tira-key', 'HS256')
    return c.json({ success: true, token, user: { id: user.id, email: user.email } }, 201)
  })

  app.post('/api/auth/login', async (c) => {
    let body: any
    try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON' }, 400) }

    if (!body.email || !body.password) {
      return c.json({ error: 'Email and password required' }, 400)
    }

    const user = await _store!.getUserByEmail(body.email)
    if (!user) {
      return c.json({ error: 'Invalid credentials' }, 401)
    }

    const isValid = await Bun.password.verify(body.password, user.passwordHash)
    if (!isValid) {
      return c.json({ error: 'Invalid credentials' }, 401)
    }

    const token = await sign({ userId: user.id }, Bun.env.JWT_SECRET || 'super-secret-tira-key', 'HS256')
    return c.json({ success: true, token, user: { id: user.id, email: user.email } })
  })

  app.get('/api/auth/me', async (c) => {
    const userId = c.get('userId' as any)
    if (!userId) {
      return c.json({ user: { id: 'admin', email: 'admin@tiradata' }, token: null })
    }
    const user = await _store!.getUserById(userId)
    if (!user) {
      return c.json({ error: 'User not found' }, 404)
    }
    return c.json({ user: { id: user.id, email: user.email }, token: null })
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
    const pid = getPID(c)
    const body = await c.req.json().catch(() => ({})) as Record<string, number>
    const now  = Date.now()

    // Body params take priority; env vars are the fallback defaults
    const logsDays    = Number(body.logsDays    ?? Bun.env.TTL_LOGS_DAYS    ?? 30)
    const metricsDays = Number(body.metricsDays ?? Bun.env.TTL_METRICS_DAYS ?? 90)
    const tracesDays  = Number(body.tracesDays  ?? Bun.env.TTL_TRACES_DAYS  ?? 7)

    const result = await _store!.deleteBefore({
      projectId:     pid,
      logsBefore:    now - logsDays    * 86_400_000,
      metricsBefore: now - metricsDays * 86_400_000,
      tracesBefore:  now - tracesDays  * 86_400_000,
    })

    return c.json({ success: true, deleted: result, retention: { logsDays, metricsDays, tracesDays } })
  })

  // ── Projects & API Keys ───────────────────────────────────────────────────
  app.get('/api/admin/projects', async (c) => {
    const userId = c.get('userId')
    if (!userId && c.get('projectId') !== 'master') return c.json({ error: 'System admin only' }, 403)
    return c.json(await _store!.getProjects(userId))
  })

  app.post('/api/admin/projects', async (c) => {
    if (c.get('projectId') !== 'master') return c.json({ error: 'System admin only' }, 403)
    const body = await c.req.json()
    const proj = { id: body.id || crypto.randomUUID(), name: body.name, createdAt: Date.now() }
    await _store!.saveProject(proj)
    
    const userId = c.get('userId')
    if (userId) {
      await _store!.shareProject({ userId, projectId: proj.id, role: 'admin', createdAt: Date.now() })
    }
    return c.json({ success: true, project: proj })
  })

  app.post('/api/admin/projects/:id/share', async (c) => {
    const pid = c.req.param('id')
    if (c.get('projectId') !== 'master' && c.get('projectId') !== pid) return c.json({ error: 'Admin only' }, 403)
    const body = await c.req.json()
    const user = await _store!.getUserByEmail(body.email)
    if (!user) return c.json({ error: 'User not found' }, 404)
    await _store!.shareProject({
      userId: user.id,
      projectId: pid,
      role: body.role || 'viewer',
      createdAt: Date.now()
    })
    return c.json({ success: true })
  })

  app.get('/api/admin/projects/:id/users', async (c) => {
    const pid = c.req.param('id')
    if (c.get('projectId') !== 'master' && c.get('projectId') !== pid) return c.json({ error: 'Admin only' }, 403)
    return c.json(await _store!.getUserProjects(pid))
  })

  app.get('/api/admin/keys', async (c) => {
    const pid = getPID(c)
    return c.json(await _store!.getApiKeys(pid))
  })

  app.post('/api/admin/keys', async (c) => {
    const pid = getPID(c)
    // Only project admins or master can create keys
    if (c.get('role') !== 'admin') return c.json({ error: 'Admin required' }, 403)
    
    const body = await c.req.json()
    const key = {
      key: crypto.randomUUID().replace(/-/g, ''),
      projectId: pid,
      name: body.name || 'New Key',
      role: (body.role === 'admin' ? 'admin' : 'ingest') as 'admin' | 'ingest',
      createdAt: Date.now()
    }
    await _store!.saveApiKey(key)
    return c.json({ success: true, key })
  })

  // ── Alerts ─────────────────────────────────────────────────────────────────
  app.get('/api/alerts/rules', async (c) => {
    const pid = getPID(c)
    const rules = await _store!.getAlertRules(pid)
    return c.json(rules)
  })
  app.post('/api/alerts/rules', async (c) => {
    const body = await c.req.json()
    const pid = getPID(c)
    const rule: AlertRule = {
      id: body.id || crypto.randomUUID(),
      name: body.name,
      query: body.query,
      threshold: Number(body.threshold),
      condition: body.condition || 'gt',
      intervalMs: Number(body.intervalMs) || 60000,
      enabled: body.enabled !== false,
      lastChecked: body.lastChecked,
      projectId: pid
    }
    await _store!.saveAlertRule(rule)
    return c.json({ success: true, rule })
  })

  app.delete('/api/alerts/rules/:id', async (c) => {
    const pid = getPID(c)
    const id = c.req.param('id')
    await _store!.deleteAlertRule(id, pid)
    return c.json({ success: true })
  })

  app.get('/api/alerts/history', async (c) => {
    const pid = getPID(c)
    const ruleId = c.req.query('rule_id')
    const limit  = Number(c.req.query('limit')) || 100
    const history = await _store!.getAlertHistory(pid, ruleId, limit)
    return c.json(history)
  })

  // ── Visualization ──────────────────────────────────────────────────────────
  app.get('/api/query/service-map', async (c) => {
    const pid = getPID(c)
    const from = Number(c.req.query('from')) || undefined
    const to   = Number(c.req.query('to')) || undefined
    const edges = await _store!.getServiceMap(pid, from, to)
    return c.json(edges)
  })

  return { app, websocket }
}

// ─── Accessors for graceful shutdown ─────────────────────────────────────────
export const getQueue = () => _queue
export const getStore = () => _store
