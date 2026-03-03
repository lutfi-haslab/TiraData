import type { IStore } from '../domain/store.interface'
import type { AlertRule, AlertHistoryEntry } from '../domain/types'

export class AlertingEngine {
  private timer: ReturnType<typeof setInterval> | null = null
  private isRunning = false

  constructor(
    private readonly store: IStore,
    private readonly intervalMs = 5_000 // Check every 5s
  ) {}

  start() {
    if (this.timer) return
    console.log('[Alerting] Starting engine...')
    this.timer = setInterval(() => this.run(), this.intervalMs)
    // Run immediately on start
    this.run()
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    console.log('[Alerting] Engine stopped.')
  }

  async run() {
    if (this.isRunning) return
    this.isRunning = true

    try {
      const rules = await this.store.getAlertRules()
      const enabledRules = rules.filter(r => r.enabled)
      const now = Date.now()

      for (const rule of enabledRules) {
        const nextRun = (rule.lastChecked ?? 0) + rule.intervalMs
        if (now < nextRun) continue

        await this.evaluateRule(rule)
      }
    } catch (e) {
      console.error('[Alerting] Run failed:', e)
    } finally {
      this.isRunning = false
    }
  }

  private async evaluateRule(rule: AlertRule) {
    try {
      console.log(`[Alerting] Evaluating rule: ${rule.name}`)
      
      const result = await this.store.executeSql(rule.query)
      if (result.rows.length === 0) return

      // Assume first column of first row is the value
      const value = Number(result.rows[0][0])
      if (isNaN(value)) {
          console.warn(`[Alerting] Rule ${rule.name} query returned non-numeric value:`, result.rows[0][0])
          return
      }

      let triggered = false
      if (rule.condition === 'gt') triggered = value > rule.threshold
      else if (rule.condition === 'lt') triggered = value < rule.threshold

      const history: AlertHistoryEntry = {
        id: crypto.randomUUID(),
        ruleId: rule.id,
        timestamp: Date.now(),
        value,
        triggered
      }

      await this.store.saveAlertHistory(history)
      
      // Update last checked
      await this.store.saveAlertRule({
        ...rule,
        lastChecked: Date.now()
      })

      if (triggered) {
        console.warn(`[ALERT TRIGGERED] ${rule.name}: current value ${value} is ${rule.condition} ${rule.threshold}`)
        // TODO: Notification channels (Slack, Email, etc.)
      }
    } catch (e) {
      console.error(`[Alerting] Error evaluating rule ${rule.name}:`, e)
    }
  }
}
