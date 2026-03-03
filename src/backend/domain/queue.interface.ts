import type { LogEntry, MetricEntry, TraceEntry } from './types'

export interface IIngestionQueue {
  enqueueLog(entry: LogEntry): boolean
  enqueueMetric(entry: MetricEntry): boolean
  enqueueTrace(entry: TraceEntry): boolean
  size: number
  capacity: number
  dropped: number
  stop(): void
}
