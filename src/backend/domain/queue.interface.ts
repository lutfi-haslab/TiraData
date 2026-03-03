import type { LogEntry, MetricEntry, TraceEntry } from './types'

export interface IIngestionQueue {
  enqueueLog(entry: LogEntry): boolean
  enqueueMetric(entry: MetricEntry): boolean
  enqueueTrace(entry: TraceEntry): boolean
  size: number
  capacity: number
  dropped: number
  stop(): void
  /** Subscribe to new logs in real-time (for tailing) */
  onLog(cb: (log: LogEntry) => void): () => void
}
