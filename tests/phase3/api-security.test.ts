import { describe, it, expect, beforeAll } from 'bun:test'
import { createServer } from '../../src/backend/infrastructure/http/server'

let app: any
const MASTER_KEY = 'test_master'
const INGEST_KEY = 'test_ingest'

beforeAll(async () => {
  process.env.STORE   = 'sqlite'
  process.env.DB_PATH = ':memory:'
  process.env.MASTER_KEY = MASTER_KEY
  process.env.INGEST_KEY = INGEST_KEY
  const res = await createServer()
  app = res.app

  // Register the INGEST_KEY in the store since we now use DB-backed keys
  const { getStore } = await import('../../src/backend/infrastructure/http/server')
  const store = getStore()!
  await store.saveProject({ id: 'p1', name: 'Test Project', createdAt: Date.now() })
  await store.saveApiKey({ 
    key: INGEST_KEY, 
    projectId: 'p1', 
    name: 'Legacy Ingest Key', 
    role: 'ingest',
    createdAt: Date.now()
  })
})

const fetchApi = (path: string, method = 'GET', body?: unknown, key?: string) =>
  app.fetch(new Request(`http://localhost${path}${key ? `?key=${key}` : ''}`, {
    method,
    headers: { 
        'Content-Type': 'application/json',
        ...(key ? { 'X-API-Key': key } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }))

describe('Phase 3 – API Security (RBAC)', () => {
  
  describe('Unauthorized access', () => {
    it('returns 401 when no key is provided', async () => {
      const res = await fetchApi('/api/logs')
      expect(res.status).toBe(401)
      const body = await res.json() as any
      expect(body.error).toContain('Unauthorized')
    })

    it('returns 403 with invalid key', async () => {
      const res = await fetchApi('/api/logs', 'GET', undefined, 'wrong_key')
      expect(res.status).toBe(403)
    })
  })

  describe('Ingest Key access', () => {
    it('allows ingestion with ingest key', async () => {
      const res = await fetchApi('/api/ingest/log', 'POST', { message: 'hello' }, INGEST_KEY)
      expect(res.status).toBe(202)
    })

    it('forbids querying with ingest key', async () => {
      const res = await fetchApi('/api/logs', 'GET', undefined, INGEST_KEY)
      expect(res.status).toBe(403)
      const body = await res.json() as any
      expect(body.error).toContain('Forbidden')
    })

    it('forbids admin operations with ingest key', async () => {
      const res = await fetchApi('/api/admin/config', 'GET', undefined, INGEST_KEY)
      expect(res.status).toBe(403)
    })
  })

  describe('Master Key access', () => {
    it('allows querying with master key', async () => {
      const res = await fetchApi('/api/logs', 'GET', undefined, MASTER_KEY)
      expect(res.status).toBe(200)
    })

    it('allows admin operations with master key', async () => {
      const res = await fetchApi('/api/admin/config', 'GET', undefined, MASTER_KEY)
      expect(res.status).toBe(200)
    })

    it('allows ingestion with master key', async () => {
      const res = await fetchApi('/api/ingest/log', 'POST', { message: 'master hello' }, MASTER_KEY)
      expect(res.status).toBe(202)
    })
  })

  describe('OTLP Security', () => {
    it('allows OTLP ingestion with ingest key', async () => {
        const res = await fetchApi('/v1/logs', 'POST', { resourceLogs: [] }, INGEST_KEY)
        expect(res.status).toBe(200)
    })

    it('forbids OTLP ingestion without key', async () => {
        const res = await fetchApi('/v1/logs', 'POST', { resourceLogs: [] })
        expect(res.status).toBe(401)
    })
  })
})
