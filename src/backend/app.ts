import { createServer, getQueue } from './infrastructure/http/server'

const port = Number(Bun.env.PORT ?? 3000)

// createServer is async (awaits store initialisation)
const app = await createServer()

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

const shutdown = (signal: string) => {
  console.log(`\n[${signal}] Shutting down – draining queue...`)
  getQueue()?.stop()
  console.log('Goodbye.')
}

process.on('SIGINT',  () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

// ─── Start ────────────────────────────────────────────────────────────────────

console.log(`[tiradata] backend listening on http://localhost:${port}`)

export default { port, fetch: app.fetch }
