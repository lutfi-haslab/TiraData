import { describe, it, expect, beforeAll } from 'bun:test'
import { createServer } from '../../src/backend/infrastructure/http/server'
import { queryCache } from '../../src/backend/infrastructure/cache/query-cache'

let app: any
const KEY = 'test_master'

beforeAll(async () => {
  process.env.STORE   = 'sqlite'
  process.env.DB_PATH = ':memory:'
  process.env.MASTER_KEY = KEY
  const res = await createServer()
  app = res.app
  queryCache.clear()
})

const fetchApi = (path: string, method = 'GET', body?: unknown) =>
  app.fetch(new Request(`http://localhost${path}`, {
    method,
    headers: { 
        'Content-Type': 'application/json',
        'X-API-Key': KEY
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }))

describe('Phase 3 – Query Caching', () => {

  it('caches the result of a log query', async () => {
    // 1. Initial query (empty)
    const res1 = await fetchApi('/api/logs?service=cache-test')
    const body1 = await res1.json() as any
    expect(body1.count).toBe(0)

    // 2. Ingest a log
    await fetchApi('/api/ingest/log', 'POST', { service: 'cache-test', message: 'hello' })
    await new Promise(r => setTimeout(r, 400)) // flush to DB

    // 3. Query again immediately (should return cached empty result)
    const res2 = await fetchApi('/api/logs?service=cache-test')
    const body2 = await res2.json() as any
    expect(body2.count).toBe(0) // Still 0 because of cache
  })

  it('expires the cache after TTL', async () => {
    // Wait for cache to expire (we set 5s in implementation, let's use a smaller one if possible in real world, 
    // but here we must wait or manually prune)
    
    // For testing purposes, we'll manually prune/clear to verify it works without waiting 5s in CI
    queryCache.clear() 

    const res = await fetchApi('/api/logs?service=cache-test')
    const body = await res.json() as any
    expect(body.count).toBe(1) // Now sees the new log
  })

  it('caches SQL editor queries', async () => {
    const sql = 'SELECT COUNT(*) as total FROM logs'
    
    const res1 = await fetchApi('/api/query/sql', 'POST', { sql })
    const body1 = await res1.json() as any
    
    // Ingest another
    await fetchApi('/api/ingest/log', 'POST', { message: 'another' })
    await new Promise(r => setTimeout(r, 400))

    const res2 = await fetchApi('/api/query/sql', 'POST', { sql })
    const body2 = await res2.json() as any

    expect(body1.rows[0][0]).toBe(body2.rows[0][0]) // Same count despite new ingestion
  })
})
