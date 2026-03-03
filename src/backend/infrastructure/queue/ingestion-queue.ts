import { RingBuffer } from '../../domain/ring-buffer'
import type { LogEntry, MetricEntry, TraceEntry } from '../../domain/types'

type QueueItem =
  | { kind: 'log';    data: LogEntry }
  | { kind: 'metric'; data: MetricEntry }
  | { kind: 'trace';  data: TraceEntry }

type FlushFn = (logs: LogEntry[], metrics: MetricEntry[], traces: TraceEntry[]) => Promise<void>

const BATCH_SIZE   = 500
const FLUSH_INTERVAL_MS = 250

import type { IIngestionQueue } from '../../domain/queue.interface'

/**
 * IngestionQueue – decouples the HTTP handler from the storage layer.
 *
 * Items are written immediately to the ring buffer (non-blocking),
 * then drained to the DB on a fixed interval or when the batch fills up.
 *
 * This means:
 *  - HTTP handlers never block on disk I/O
 *  - DB writes happen in larger, cheaper batches
 *  - Backpressure is communicated back to callers via the return value
 */
export class IngestionQueue implements IIngestionQueue {
  private readonly buf: RingBuffer<QueueItem>
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    capacity = 10_000,
    private readonly flush: FlushFn
  ) {
    this.buf = new RingBuffer<QueueItem>(capacity)
    this.start()
  }

  enqueueLog(entry: LogEntry): boolean {
    return this.buf.enqueue({ kind: 'log', data: entry })
  }

  enqueueMetric(entry: MetricEntry): boolean {
    return this.buf.enqueue({ kind: 'metric', data: entry })
  }

  enqueueTrace(entry: TraceEntry): boolean {
    return this.buf.enqueue({ kind: 'trace', data: entry })
  }

  get size(): number { return this.buf.size }
  get capacity(): number { return this.buf.capacity }
  get dropped(): number { return this.buf.droppedCount }

  /** Drain and flush whatever is in the buffer right now. */
  flushNow(): void {
    const items = this.buf.dequeueMany(BATCH_SIZE)
    if (items.length === 0) return

    const logs:    LogEntry[]    = []
    const metrics: MetricEntry[] = []
    const traces:  TraceEntry[]  = []

    for (const item of items) {
      if (item.kind === 'log')    logs.push(item.data)
      else if (item.kind === 'metric') metrics.push(item.data)
      else if (item.kind === 'trace')  traces.push(item.data)
    }

    this.flush(logs, metrics, traces)
  }

  private start(): void {
    this.timer = setInterval(() => this.flushNow(), FLUSH_INTERVAL_MS)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    // Final drain
    this.flushNow()
  }
}
