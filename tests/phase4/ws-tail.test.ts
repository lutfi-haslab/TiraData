import { describe, it, expect, beforeAll } from 'bun:test'
import { createServer } from '../../src/backend/infrastructure/http/server'

let app: any
let websocket: any
const PORT = 3001
const KEY = 'master_tail_test'

beforeAll(async () => {
    process.env.STORE = 'sqlite'
    process.env.DB_PATH = ':memory:'
    process.env.MASTER_KEY = KEY
    const res = await createServer()
    app = res.app
    websocket = res.websocket
})

describe('Phase 4 – Live Log Tailing (WebSocket)', () => {

    it('receives logs in real-time via WebSocket', async () => {
        const server = Bun.serve({
            port: PORT,
            fetch: app.fetch,
            websocket
        })

        const logsReceived: any[] = []
        
        // Connect to WS
        const ws = new WebSocket(`ws://localhost:${PORT}/ws/tail?key=${KEY}`)
        
        ws.onmessage = (event) => {
            logsReceived.push(JSON.parse(event.data))
        }

        // Wait for connection
        await new Promise(r => setTimeout(r, 100))

        // Ingest a log
        await app.fetch(new Request(`http://localhost/api/ingest/log?key=${KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ service: 'ws-test', message: 'hello-ws' })
        }))

        // Give it a moment to propagate
        await new Promise(r => setTimeout(r, 100))

        expect(logsReceived.length).toBe(1)
        expect(logsReceived[0].message).toBe('hello-ws')

        ws.close()
        server.stop()
    })

    it('respects server-side filtering (service)', async () => {
        const server = Bun.serve({
            port: PORT + 1,
            fetch: app.fetch,
            websocket
        })

        const logsReceived: any[] = []
        const ws = new WebSocket(`ws://localhost:${PORT + 1}/ws/tail?key=${KEY}&service=target-svc`)
        
        ws.onmessage = (event) => {
            logsReceived.push(JSON.parse(event.data))
        }

        await new Promise(r => setTimeout(r, 100))

        // Ingest two logs, one matching, one not
        await app.fetch(new Request(`http://localhost/api/ingest/log?key=${KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ service: 'other-svc', message: 'skip-me' })
        }))
        await app.fetch(new Request(`http://localhost/api/ingest/log?key=${KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ service: 'target-svc', message: 'capture-me' })
        }))

        await new Promise(r => setTimeout(r, 100))

        expect(logsReceived.length).toBe(1)
        expect(logsReceived[0].message).toBe('capture-me')

        ws.close()
        server.stop()
    })
})
