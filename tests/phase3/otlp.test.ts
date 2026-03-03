import { describe, it, expect, beforeAll } from 'bun:test'
import { createServer } from '../../src/backend/infrastructure/http/server'

let app: any
const KEY = 'test_master'

beforeAll(async () => {
  process.env.STORE   = 'sqlite'
  process.env.DB_PATH = ':memory:'
  process.env.MASTER_KEY = KEY
  const res = await createServer()
  app = res.app
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

describe('Phase 3 – OTLP (OpenTelemetry) Ingestion', () => {
  
  it('maps and ingests OTLP Logs', async () => {
    const payload = {
      resourceLogs: [{
        resource: { attributes: [{ key: 'service.name', value: { stringValue: 'test-service' } }] },
        scopeLogs: [{
          logRecords: [{
            severityText: 'ERROR',
            body: { stringValue: 'OTLP log message' },
            attributes: [{ key: 'app.version', value: { stringValue: '1.0.0' } }]
          }]
        }]
      }]
    }

    const res = await fetchApi('/v1/logs', 'POST', payload)
    expect(res.status).toBe(200)

    await new Promise(r => setTimeout(r, 400)) // flush

    const queryRes = await fetchApi('/api/logs?service=test-service')
    const body = await queryRes.json() as any
    expect(body.count).toBe(1)
    expect(body.data[0].message).toBe('OTLP log message')
    expect(body.data[0].level).toBe('error')
    expect(body.data[0].attributes['app.version']).toBe('1.0.0')
  })

  it('maps and ingests OTLP Metrics', async () => {
    const payload = {
      resourceMetrics: [{
        resource: { attributes: [{ key: 'host', value: { stringValue: 'localhost' } }] },
        scopeMetrics: [{
          metrics: [{
            name: 'cpu_usage',
            gauge: {
                dataPoints: [{
                    asDouble: 42.5,
                    attributes: [{ key: 'core', value: { intValue: 1 } }]
                }]
            }
          }]
        }]
      }]
    }

    const res = await fetchApi('/v1/metrics', 'POST', payload)
    expect(res.status).toBe(200)

    await new Promise(r => setTimeout(r, 400))

    const queryRes = await fetchApi('/api/metrics?name=cpu_usage')
    const body = await queryRes.json() as any
    expect(body.data.length).toBeGreaterThanOrEqual(1)
    expect(body.data[0].value).toBe(42.5)
    expect(body.data[0].labels['core']).toBe(1)
  })

  it('maps and ingests OTLP Traces', async () => {
    const payload = {
      resourceSpans: [{
        resource: { attributes: [{ key: 'service.name', value: { stringValue: 'trace-service' } }] },
        scopeSpans: [{
          spans: [{
            traceId: 'trace-1',
            spanId: 'span-1',
            name: 'GET /user',
            startTimeUnixNano: '1700000000000000000',
            endTimeUnixNano: '1700000000500000000',
            attributes: [{ key: 'http.status_code', value: { intValue: 200 } }]
          }]
        }]
      }]
    }

    const res = await fetchApi('/v1/traces', 'POST', payload)
    expect(res.status).toBe(200)

    await new Promise(r => setTimeout(r, 400))

    const queryRes = await fetchApi('/api/traces?trace_id=trace-1')
    const body = await queryRes.json() as any
    expect(body.data.length).toBe(1)
    expect(body.data[0].name).toBe('GET /user')
    expect(body.data[0].duration).toBe(500)
  })
})
