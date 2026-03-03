import type { IStore } from '../domain/store.interface'

export class TTLJob {
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly store: IStore,
    private readonly intervalMs = 3600_000 // default 1 hour
  ) {}

  start() {
    console.log(`[TTL] Starting background cleanup job (interval: ${this.intervalMs / 1000}s)`)
    this.timer = setInterval(() => this.run(), this.intervalMs)
    // Run once on startup
    this.run()
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  async run() {
    const now = Date.now()
    const logsDays    = Number(Bun.env.TTL_LOGS_DAYS    ?? 30)
    const metricsDays = Number(Bun.env.TTL_METRICS_DAYS ?? 90)
    const tracesDays  = Number(Bun.env.TTL_TRACES_DAYS  ?? 7)

    console.log('[TTL] Running automated cleanup...')
    try {
      const result = await this.store.deleteBefore({
        logsBefore:    now - logsDays    * 86_400_000,
        metricsBefore: now - metricsDays * 86_400_000,
        tracesBefore:  now - tracesDays  * 86_400_000,
      })
      console.log(`[TTL] Cleanup complete. Deleted: logs=${result.logs}, metrics=${result.metrics}, traces=${result.traces}`)
    } catch (e) {
      console.error('[TTL] Cleanup failed:', e)
    }
  }
}
