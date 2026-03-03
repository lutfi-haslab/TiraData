import { createServer, getQueue, getStore } from './infrastructure/http/server'
import { TTLJob } from './usecases/ttl-job'
import { AlertingEngine } from './usecases/alerting-engine'

const port = Number(Bun.env.PORT ?? 3000)

// createServer is async (awaits store initialisation)
const { app, websocket } = await createServer()

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
  console.log('Goodbye.')
}

process.on('SIGINT',  () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

// ─── Start ────────────────────────────────────────────────────────────────────

console.log(`[tiradata] backend listening on http://localhost:${port}`)

export default { port, fetch: app.fetch, websocket }
