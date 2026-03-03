import { createServer, getQueue, getStore } from './infrastructure/http/server'
import { createGrpcServer } from './infrastructure/grpc/server'
import { ServerCredentials } from '@grpc/grpc-js'
import { TTLJob } from './usecases/ttl-job'
import { AlertingEngine } from './usecases/alerting-engine'

const port = Number(Bun.env.PORT ?? 3000)
const grpcPort = Number(Bun.env.GRPC_PORT ?? 4317)

// createServer is async (awaits store initialisation)
const { app, websocket } = await createServer()

// ─── Start gRPC Server ────────────────────────────────────────────────────────
const grpcServer = await createGrpcServer()
grpcServer.bindAsync(`0.0.0.0:${grpcPort}`, ServerCredentials.createInsecure(), (err, port) => {
  if (err) console.error(`[gRPC] Failed to start: ${err.message}`)
  else {
    console.log(`[gRPC] OTLP native receiver listening on 0.0.0.0:${port}`)
  }
})

// ─── Automated Jobs ──────────────────────────────────────────────────────────
const store = getStore()
let ttlJob: TTLJob | null = null
let alertEngine: AlertingEngine | null = null

if (store) {
  ttlJob = new TTLJob(store)
  ttlJob.start()

  alertEngine = new AlertingEngine(store)
  alertEngine.start()
}

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

const shutdown = (signal: string) => {
  console.log(`\n[${signal}] Shutting down – draining queue...`)
  getQueue()?.stop()
  ttlJob?.stop()
  alertEngine?.stop()
  grpcServer.forceShutdown()
  console.log('Goodbye.')
}

process.on('SIGINT',  () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

// ─── Start ────────────────────────────────────────────────────────────────────

console.log(`[tiradata] HTTP backend listening on http://localhost:${port}`)

export default { port, fetch: app.fetch, websocket }
