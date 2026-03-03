import { describe, it, expect, beforeAll } from 'bun:test'
import { createServer } from '../../src/backend/infrastructure/http/server'

let app: any
const MASTER_KEY = 'test_master'
const PROJECT_ID = 'test-project-123'

beforeAll(async () => {
  process.env.STORE = 'sqlite'
  process.env.DB_PATH = ':memory:'
  process.env.MASTER_KEY = MASTER_KEY
  const res = await createServer()
  app = res.app
})

const fetchApi = (path: string, method = 'GET', body?: unknown) =>
  app.fetch(new Request(`http://localhost${path}`, {
    method,
    headers: { 
      'Content-Type': 'application/json',
      'X-API-Key': MASTER_KEY,
      'X-Project-Id': PROJECT_ID
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }))

describe('Phase 5 – APM & Distributed Tracing', () => {

  it('ingests traces correctly', async () => {
    const trace = {
      trace_id: 't1',
      span_id: 's1',
      name: 'GET /api/test',
      start_time: Date.now(),
      duration: 100,
      attributes: {
        'service.name': 'test-service',
        'http.method': 'GET'
      }
    }

    const res = await fetchApi('/api/ingest/trace', 'POST', trace)
    expect(res.status).toBe(202)
    // Wait for queue flush
    await new Promise(r => setTimeout(r, 500))
  })

  it('filters traces by service name (JSON attribute)', async () => {
    // Ingest another trace for a different service
    await fetchApi('/api/ingest/trace', 'POST', {
      trace_id: 't2',
      span_id: 's2',
      name: 'SELECT *',
      start_time: Date.now(),
      duration: 50,
      attributes: {
        'service.name': 'db-proxy',
        'db.system': 'sqlite'
      }
    })
    
    await new Promise(r => setTimeout(r, 500))

    // Query for db-proxy
    const res = await fetchApi('/api/traces?service=db-proxy')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.length).toBe(1)
    expect(body.data[0].attributes['service.name']).toBe('db-proxy')

    // Query for test-service
    const res2 = await fetchApi('/api/traces?service=test-service')
    const body2 = await res2.json()
    expect(body2.data.length).toBe(1)
    expect(body2.data[0].attributes['service.name']).toBe('test-service')
  })

  it('filters traces by operation name', async () => {
    const res = await fetchApi('/api/traces?name=SELECT *')
    const body = await res.json()
    expect(body.data.length).toBe(1)
    expect(body.data[0].name).toBe('SELECT *')
  })

  it('handles time range filtering', async () => {
    const now = Date.now()
    // Old trace
    await fetchApi('/api/ingest/trace', 'POST', {
      trace_id: 't-old',
      span_id: 's-old',
      name: 'Old Trace',
      start_time: now - 3600000, // 1 hour ago
      duration: 10,
      attributes: { 'service.name': 'test' }
    })
    
    await new Promise(r => setTimeout(r, 500))

    // Query for window that does NOT include 1 hour ago
    const res = await fetchApi(`/api/traces?from=${now - 300000}&to=${now + 300000}`)
    const body = await res.json()
    
    const hasOld = body.data.some((t: any) => t.name === 'Old Trace')
    expect(hasOld).toBe(false)
  })

  it('supports limit and offset', async () => {
    // We already have 4 traces (t1, t2, t-old, and the initial check). 
    const res = await fetchApi('/api/traces?limit=1')
    const body = await res.json()
    expect(body.data.length).toBe(1)
    expect(body.count).toBeGreaterThanOrEqual(3)
  })
})
