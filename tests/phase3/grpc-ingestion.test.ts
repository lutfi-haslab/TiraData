import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import * as grpc from '@grpc/grpc-js'
import * as protoLoader from '@grpc/proto-loader'
import path from 'path'
import { createServer, getStore } from '../../src/backend/infrastructure/http/server'
import { createGrpcServer } from '../../src/backend/infrastructure/grpc/server'

let httpServer: any
let grpcServer: grpc.Server
const GRPC_PORT = 4318 // Use different port for test
const PROTO_DIR = path.resolve(__dirname, '../../src/backend/infrastructure/grpc/protos')

beforeAll(async () => {
  process.env.STORE = 'sqlite'
  process.env.DB_PATH = ':memory:'
  
  // Start HTTP (initializes store and queue)
  const res = await createServer()
  httpServer = res.app

  // Start gRPC
  grpcServer = await createGrpcServer()
  await new Promise<void>((resolve, reject) => {
    grpcServer.bindAsync(`0.0.0.0:${GRPC_PORT}`, grpc.ServerCredentials.createInsecure(), (err, port) => {
      if (err) reject(err)
      else {
        resolve()
      }
    })
  })
})

afterAll(() => {
  grpcServer.forceShutdown()
})

describe('Phase 3 – gRPC OTLP Ingestion', () => {

  it('can ingest logs via gRPC', async () => {
    const packageDefinition = protoLoader.loadSync(
      'opentelemetry/proto/collector/logs/v1/logs_service.proto',
      { includeDirs: [PROTO_DIR] }
    )
    const proto = grpc.loadPackageDefinition(packageDefinition) as any
    const client = new proto.opentelemetry.proto.collector.logs.v1.LogsService(
      `localhost:${GRPC_PORT}`,
      grpc.credentials.createInsecure()
    )

    const request = {
      resourceLogs: [{
        resource: { attributes: [{ key: 'service.name', value: { stringValue: 'grpc-test-service' } }] },
        scopeLogs: [{
          logRecords: [{
            timeUnixNano: String(Date.now() * 1000000),
            severityText: 'INFO',
            body: { stringValue: 'Hello from gRPC' },
            attributes: [{ key: 'test', value: { boolValue: true } }]
          }]
        }]
      }]
    }

    const response = await new Promise((resolve, reject) => {
      client.export(request, (err: any, resp: any) => {
        if (err) reject(err)
        else resolve(resp)
      })
    })

    expect(response).toBeDefined()
    
    // Verify in DB via HTTP API
    // We need to wait for queue flush (250ms)
    await new Promise(r => setTimeout(r, 500))
    
    const store = getStore()
    const logs = await store!.queryLogs({ projectId: 'default', limit: 1 })
    expect(logs.data.length).toBe(1)
    expect(logs.data[0].service).toBe('grpc-test-service')
    expect(logs.data[0].message).toBe('Hello from gRPC')
  })

  it('can ingest metrics via gRPC', async () => {
    const packageDefinition = protoLoader.loadSync(
      'opentelemetry/proto/collector/metrics/v1/metrics_service.proto',
      { includeDirs: [PROTO_DIR] }
    )
    const proto = grpc.loadPackageDefinition(packageDefinition) as any
    const client = new proto.opentelemetry.proto.collector.metrics.v1.MetricsService(
      `localhost:${GRPC_PORT}`,
      grpc.credentials.createInsecure()
    )

    const request = {
      resourceMetrics: [{
        resource: { attributes: [{ key: 'service.name', value: { stringValue: 'grpc-test-service' } }] },
        scopeMetrics: [{
          metrics: [{
            name: 'grpc.test.metric',
            sum: { dataPoints: [{ asDouble: 42.5, timeUnixNano: String(Date.now() * 1000000) }] }
          }]
        }]
      }]
    }

    await new Promise((resolve, reject) => {
      client.export(request, (err: any, resp: any) => {
        if (err) reject(err)
        else resolve(resp)
      })
    })

    await new Promise(r => setTimeout(r, 500))
    
    const store = getStore()
    const metrics = await store!.queryMetrics({ projectId: 'default', name: 'grpc.test.metric' })
    expect(metrics.data.length).toBe(1)
    expect(metrics.data[0].value).toBe(42.5)
  })

  it('can ingest traces via gRPC', async () => {
    const packageDefinition = protoLoader.loadSync(
      'opentelemetry/proto/collector/trace/v1/trace_service.proto',
      { includeDirs: [PROTO_DIR] }
    )
    const proto = grpc.loadPackageDefinition(packageDefinition) as any
    const client = new proto.opentelemetry.proto.collector.trace.v1.TraceService(
      `localhost:${GRPC_PORT}`,
      grpc.credentials.createInsecure()
    )

    const traceIdHex = '4bf92f3577b34da6a3ce929d0e0e4736'
    const spanIdHex = '00f067aa0ba902b7'

    const request = {
      resourceSpans: [{
        scopeSpans: [{
          spans: [{
            traceId: Buffer.from(traceIdHex, 'hex'),
            spanId: Buffer.from(spanIdHex, 'hex'),
            name: 'grpc-span',
            startTimeUnixNano: String(Date.now() * 1000000),
            endTimeUnixNano: String((Date.now() + 100) * 1000000),
            attributes: [{ key: 'service.name', value: { stringValue: 'grpc-test-service' } }]
          }]
        }]
      }]
    }

    await new Promise((resolve, reject) => {
      client.export(request, (err: any, resp: any) => {
        if (err) reject(err)
        else resolve(resp)
      })
    })

    await new Promise(r => setTimeout(r, 500))
    
    const store = getStore()
    const traces = await store!.queryTraces({ projectId: 'default', trace_id: traceIdHex })
    expect(traces.data.length).toBe(1)
    expect(traces.data[0].name).toBe('grpc-span')
  })
})
