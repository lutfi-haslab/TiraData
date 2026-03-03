import { describe, it, expect, beforeAll } from 'bun:test'
import { createServer } from '../../src/backend/infrastructure/http/server'
import type { Hono } from 'hono'

// ─── Setup ────────────────────────────────────────────────────────────────────
// We test the Hono app directly via app.fetch() — no real TCP socket needed.

let app: Awaited<ReturnType<typeof createServer>>

beforeAll(async () => {
  // Override DB_PATH so tests use a temp in-memory DB
  process.env.STORE   = 'sqlite'
  process.env.DB_PATH = ':memory:'
  // Ensure we run in open mode for these tests
  delete process.env.MASTER_KEY
  delete process.env.INGEST_KEY
  app = await createServer()
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

const post = (path: string, body: unknown) =>
  app.fetch(new Request(`http://localhost${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  }))

const get = (path: string) =>
  app.fetch(new Request(`http://localhost${path}`))

// ─── Health ───────────────────────────────────────────────────────────────────

describe('GET /api/health', () => {
  it('returns 200 with status ok', async () => {
    const res  = await get('/api/health')
    const body = await res.json() as { status: string; time: string }

    expect(res.status).toBe(200)
    expect(body.status).toBe('ok')
    expect(body.time).toBeTruthy()
  })
})

// ─── Stats ────────────────────────────────────────────────────────────────────

describe('GET /api/stats', () => {
  it('returns 200 with expected shape', async () => {
    const res  = await get('/api/stats')
    const body = await res.json() as any

    expect(res.status).toBe(200)
    expect(body).toHaveProperty('logs.total')
    expect(body).toHaveProperty('metrics.total')
    expect(body).toHaveProperty('traces.total')
    expect(body).toHaveProperty('queue.size')
    expect(body).toHaveProperty('queue.capacity')
    expect(body).toHaveProperty('uptime_s')
  })
})

// ─── Log Ingestion ────────────────────────────────────────────────────────────

describe('POST /api/ingest/log', () => {
  it('returns 202 for valid payload', async () => {
    const res = await post('/api/ingest/log', {
      level:   'info',
      service: 'test-api',
      message: 'hello from test',
      attributes: { test: true },
    })
    const body = await res.json() as any

    expect(res.status).toBe(202)
    expect(body.success).toBe(true)
    expect(body.id).toBeTruthy()
    expect(body.accepted).toBe(true)
  })

  it('returns 202 with minimal payload (only message)', async () => {
    const res = await post('/api/ingest/log', { message: 'minimal' })
    expect(res.status).toBe(202)
  })

  it('returns 400 for invalid JSON', async () => {
    const res = await app.fetch(new Request('http://localhost/api/ingest/log', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    'not-json',
    }))
    expect(res.status).toBe(400)
  })
})

// ─── Metric Ingestion ─────────────────────────────────────────────────────────

describe('POST /api/ingest/metric', () => {
  it('returns 202 for valid payload', async () => {
    const res = await post('/api/ingest/metric', {
      name:   'http.request.duration',
      value:  142.5,
      labels: { env: 'test' },
    })
    const body = await res.json() as any

    expect(res.status).toBe(202)
    expect(body.success).toBe(true)
    expect(body.accepted).toBe(true)
  })

  it('returns 202 with minimal payload', async () => {
    const res = await post('/api/ingest/metric', { name: 'cpu', value: 50 })
    expect(res.status).toBe(202)
  })
})

// ─── Trace Ingestion ──────────────────────────────────────────────────────────

describe('POST /api/ingest/trace', () => {
  it('returns 202 for valid payload', async () => {
    const res = await post('/api/ingest/trace', {
      trace_id: 'trace-api-test',
      span_id:  'span-root',
      name:     'POST /api/orders',
      duration: 250,
    })
    const body = await res.json() as any

    expect(res.status).toBe(202)
    expect(body.success).toBe(true)
    expect(body.span_id).toBe('span-root')
  })

  it('returns 202 with parent span', async () => {
    const res = await post('/api/ingest/trace', {
      trace_id:  'trace-api-test',
      span_id:   'span-child',
      parent_id: 'span-root',
      name:      'db.query',
      duration:  80,
    })
    expect(res.status).toBe(202)
  })
})

// ─── Query Endpoints ──────────────────────────────────────────────────────────

describe('GET /api/logs', () => {
  it('returns 200 with data and count', async () => {
    const res  = await get('/api/logs')
    const body = await res.json() as any

    expect(res.status).toBe(200)
    expect(Array.isArray(body.data)).toBe(true)
    expect(typeof body.count).toBe('number')
  })

  it('accepts filter query params without error', async () => {
    const res = await get('/api/logs?service=test-api&level=info&limit=5')
    expect(res.status).toBe(200)
  })
})

describe('GET /api/metrics', () => {
  it('returns 200 with data and count', async () => {
    const res  = await get('/api/metrics')
    const body = await res.json() as any

    expect(res.status).toBe(200)
    expect(Array.isArray(body.data)).toBe(true)
  })

  it('accepts name filter', async () => {
    const res = await get('/api/metrics?name=http.request.duration&limit=10')
    expect(res.status).toBe(200)
  })
})

describe('GET /api/metrics/names', () => {
  it('returns 200 with data array', async () => {
    const res  = await get('/api/metrics/names')
    const body = await res.json() as any

    expect(res.status).toBe(200)
    expect(Array.isArray(body.data)).toBe(true)
  })
})

describe('GET /api/traces', () => {
  it('returns 200 with data and count', async () => {
    const res  = await get('/api/traces')
    const body = await res.json() as any

    expect(res.status).toBe(200)
    expect(Array.isArray(body.data)).toBe(true)
  })

  it('accepts trace_id filter', async () => {
    const res = await get('/api/traces?trace_id=trace-api-test')
    expect(res.status).toBe(200)
  })
})

// ─── SQL Query ────────────────────────────────────────────────────────────────

describe('POST /api/query/sql', () => {
  it('executes a valid SELECT and returns result shape', async () => {
    const res  = await post('/api/query/sql', { sql: 'SELECT 42 AS answer' })
    const body = await res.json() as any

    expect(res.status).toBe(200)
    expect(body.columns).toEqual(['answer'])
    expect(body.rows).toEqual([[42]])
    expect(body.rowCount).toBe(1)
    expect(typeof body.durationMs).toBe('number')
  })

  it('blocks INSERT statements — returns 400', async () => {
    const res  = await post('/api/query/sql', { sql: "INSERT INTO logs (id) VALUES ('x')" })
    expect(res.status).toBe(400)
    const body = await res.json() as any
    expect(body.error).toMatch(/SELECT/i)
  })

  it('blocks DROP statements — returns 400', async () => {
    const res = await post('/api/query/sql', { sql: 'DROP TABLE logs' })
    expect(res.status).toBe(400)
  })

  it('returns 400 when sql field is missing', async () => {
    const res = await post('/api/query/sql', { query: 'SELECT 1' })
    expect(res.status).toBe(400)
  })

  it('returns 400 for malformed JSON', async () => {
    const res = await app.fetch(new Request('http://localhost/api/query/sql', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    '{{bad json',
    }))
    expect(res.status).toBe(400)
  })

  it('allows WITH (CTE) queries', async () => {
    const res  = await post('/api/query/sql', {
      sql: 'WITH nums AS (SELECT 1 AS n UNION SELECT 2) SELECT * FROM nums'
    })
    const body = await res.json() as any
    expect(res.status).toBe(200)
    expect(body.rowCount).toBe(2)
  })
})
