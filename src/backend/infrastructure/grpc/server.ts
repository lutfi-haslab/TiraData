import * as grpc from '@grpc/grpc-js'
import * as protoLoader from '@grpc/proto-loader'
import path from 'path'
import { getQueue } from '../http/server'
import { mapOTLPLogs, mapOTLPMetrics, mapOTLPTraces } from '../../usecases/otlp-mapper'

const PROTO_DIR = path.resolve(__dirname, 'protos')

export async function createGrpcServer() {
  const packageDefinition = protoLoader.loadSync([
    'opentelemetry/proto/collector/logs/v1/logs_service.proto',
    'opentelemetry/proto/collector/metrics/v1/metrics_service.proto',
    'opentelemetry/proto/collector/trace/v1/trace_service.proto'
  ], {
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    includeDirs: [PROTO_DIR]
  })

  const proto = grpc.loadPackageDefinition(packageDefinition) as any
  const server = new grpc.Server()

  const queue = getQueue()

  // ─── Logs Service ──────────────────────────────────────────────────────────
  server.addService(proto.opentelemetry.proto.collector.logs.v1.LogsService.service, {
    export: (call: any, callback: any) => {
      try {
        const body = call.request
        const entries = mapOTLPLogs(body)
        const pid = 'default' // TODO: Extract from headers/auth
        
        for (const e of entries) {
          queue?.enqueueLog({ ...e, projectId: pid })
        }
        callback(null, { partial_success: false })
      } catch (err: any) {
        callback({ code: grpc.status.INTERNAL, message: err.message })
      }
    }
  })

  // ─── Metrics Service ───────────────────────────────────────────────────────
  server.addService(proto.opentelemetry.proto.collector.metrics.v1.MetricsService.service, {
    export: (call: any, callback: any) => {
      try {
        const body = call.request
        const entries = mapOTLPMetrics(body)
        const pid = 'default'
        
        for (const e of entries) {
          queue?.enqueueMetric({ ...e, projectId: pid })
        }
        callback(null, { partial_success: false })
      } catch (err: any) {
        callback({ code: grpc.status.INTERNAL, message: err.message })
      }
    }
  })

  // ─── Traces Service ────────────────────────────────────────────────────────
  server.addService(proto.opentelemetry.proto.collector.trace.v1.TraceService.service, {
    export: (call: any, callback: any) => {
      try {
        const body = call.request
        const entries = mapOTLPTraces(body)
        const pid = 'default'
        
        for (const e of entries) {
          queue?.enqueueTrace({ ...e, projectId: pid })
        }
        callback(null, { partial_success: false })
      } catch (err: any) {
        callback({ code: grpc.status.INTERNAL, message: err.message })
      }
    }
  })

  return server
}
