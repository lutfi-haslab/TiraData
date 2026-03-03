import { describe, it, expect, beforeAll } from 'bun:test'
import { createServer } from '../../src/backend/infrastructure/http/server'

let app: any
const MASTER_KEY = 'test_master'

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
            'X-API-Key': MASTER_KEY
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    }))

describe('Phase 4 – Service Map Visualization', () => {

    it('generates service map edges from traces', async () => {
        // 1. Ingest parent span (frontend)
        await fetchApi('/v1/traces', 'POST', {
            resourceSpans: [{
                resource: { attributes: [{ key: 'service.name', value: { stringValue: 'frontend' } }] },
                scopeSpans: [{
                    spans: [{ 
                        traceId: 't1', 
                        spanId: 's1', 
                        name: 'GET /',
                        startTimeUnixNano: String(Date.now() * 1000000),
                        endTimeUnixNano: String((Date.now() + 10) * 1000000)
                    }]
                }]
            }]
        })

        // 2. Ingest child span (backend, parent is frontend)
        await fetchApi('/v1/traces', 'POST', {
            resourceSpans: [{
                resource: { attributes: [{ key: 'service.name', value: { stringValue: 'backend' } }] },
                scopeSpans: [{
                    spans: [{ 
                        traceId: 't1', 
                        spanId: 's2', 
                        parentSpanId: 's1', 
                        name: 'POST /api',
                        startTimeUnixNano: String(Date.now() * 1000000),
                        endTimeUnixNano: String((Date.now() + 5) * 1000000)
                    }]
                }]
            }]
        })

        // Wait for flush
        await new Promise(r => setTimeout(r, 400))

        const res = await fetchApi('/api/query/service-map')
        const edges = await res.json() as any[]

        expect(edges.length).toBe(1)
        expect(edges[0].source).toBe('frontend')
        expect(edges[0].target).toBe('backend')
        expect(edges[0].count).toBe(1)
    })
})
