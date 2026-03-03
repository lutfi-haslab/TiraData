import { appendFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { LogEntry, MetricEntry, TraceEntry } from '../../domain/types'
import type { IIngestionQueue } from '../../domain/queue.interface'

type QueueItem =
  | { kind: 'log';    data: LogEntry }
  | { kind: 'metric'; data: MetricEntry }
  | { kind: 'trace';  data: TraceEntry }

type FlushFn = (logs: LogEntry[], metrics: MetricEntry[], traces: TraceEntry[]) => Promise<void>

const FLUSH_INTERVAL_MS = 250
const BATCH_SIZE = 500

/**
 * WALQueue – Persistent Write-Ahead Log queue.
 *
 * Items are appended to a .wal file as JSON lines (NDJSON).
 * A separate .offset file tracks the last successfully flushed byte position.
 */
export class WALQueue implements IIngestionQueue {
  private readonly walPath: string
  private readonly offsetPath: string
  private timer: ReturnType<typeof setInterval> | null = null
  private currentOffset = 0
  private isFlushing = false
  private _dropped = 0
  private _capacity: number

  constructor(
    capacity = 100_000,
    private readonly flush: FlushFn,
    basePath = '.'
  ) {
    this._capacity = capacity
    this.walPath = join(basePath, 'tiradata.wal')
    this.offsetPath = join(basePath, 'offset.dat')

    this.init()
    this.start()
  }

  private init() {
    // 1. Ensure WAL file exists
    if (!existsSync(this.walPath)) {
      writeFileSync(this.walPath, '')
    }

    // 2. Read last offset
    if (existsSync(this.offsetPath)) {
      try {
        const buf = readFileSync(this.offsetPath)
        this.currentOffset = parseInt(buf.toString().trim(), 10) || 0
      } catch {
        this.currentOffset = 0
      }
    }

    // 3. Crash Recovery: Replay anything after currentOffset on startup
    this.replay()
  }

  private replay() {
    console.log(`[WAL] Replaying from offset ${this.currentOffset}...`)
    // In a real high-perf system, we'd read in chunks.
    // Here we'll read the tail of the file.
    try {
      const stats = Bun.file(this.walPath).size
      if (stats > this.currentOffset) {
        // Simple replay logic: read the whole tail, split by newline
        // We do this synchronously on startup
        const tail = readFileSync(this.walPath).subarray(this.currentOffset)
        const lines = tail.toString().split('\n').filter(l => l.trim())
        
        if (lines.length > 0) {
          console.log(`[WAL] Recovered ${lines.length} items from crash.`)
          // We won't flush immediately here to avoid blocking startup too long,
          // but they will be picked up by the first flush interval.
        }
      } else if (stats < this.currentOffset) {
        // WAL was truncated or corrupted? Reset offset.
        this.currentOffset = 0
      }
    } catch (e) {
      console.error('[WAL] Recovery failed:', e)
    }
  }

  enqueueLog(entry: LogEntry): boolean {
    return this.append({ kind: 'log', data: entry })
  }

  enqueueMetric(entry: MetricEntry): boolean {
    return this.append({ kind: 'metric', data: entry })
  }

  enqueueTrace(entry: TraceEntry): boolean {
    return this.append({ kind: 'trace', data: entry })
  }

  private append(item: QueueItem): boolean {
    // Check "capacity" (approximated by file size vs some limit, or just count)
    // For simplicity, we'll check if file is getting too huge, 
    // but the plan says WAL_MAX_BYTES. Let's use 50MB.
    const WAL_MAX_BYTES = 50 * 1024 * 1024
    try {
      const size = existsSync(this.walPath) ? Bun.file(this.walPath).size : 0
      if (size > WAL_MAX_BYTES) {
        this._dropped++
        return false
      }

      const line = JSON.stringify(item) + '\n'
      appendFileSync(this.walPath, line)
      return true
    } catch (e) {
      this._dropped++
      console.error('[WAL] Append failed:', e)
      return false
    }
  }

  get size(): number {
    // Approximate size: how many bytes are pending?
    try {
        const stats = existsSync(this.walPath) ? Bun.file(this.walPath).size : 0
        return Math.max(0, stats - this.currentOffset)
    } catch { return 0 }
  }
  get capacity(): number { return 50 * 1024 * 1024 } // 50MB
  get dropped(): number { return this._dropped }

  private async flushNow() {
    if (this.isFlushing) return
    this.isFlushing = true

    try {
      const walFile = Bun.file(this.walPath)
      const size = walFile.size
      if (size <= this.currentOffset) {
        this.isFlushing = false
        return
      }

      // Read chunk from currentOffset
      // Note: We read up to BATCH_SIZE lines or similar.
      // For simplicity in this demo, we'll read a chunk of text.
      const buffer = await walFile.slice(this.currentOffset).arrayBuffer()
      const text = new TextDecoder().decode(buffer)
      const lines = text.split('\n').filter(l => l.trim())
      
      if (lines.length === 0) {
        this.isFlushing = false
        return
      }

      // We'll process up to BATCH_SIZE
      const toProcess = lines.slice(0, BATCH_SIZE)
      const items: QueueItem[] = toProcess.map(l => JSON.parse(l))

      const logs: LogEntry[] = []
      const metrics: MetricEntry[] = []
      const traces: TraceEntry[] = []

      for (const item of items) {
        if (item.kind === 'log') logs.push(item.data)
        else if (item.kind === 'metric') metrics.push(item.data)
        else if (item.kind === 'trace') traces.push(item.data)
      }

      await this.flush(logs, metrics, traces)

      // Calculate how many bytes we actually processed
      // This is slightly tricky with strings; we should ideally track the byte length of each line.
      let bytesProcessed = 0
      for (let i = 0; i < toProcess.length; i++) {
        bytesProcessed += Buffer.byteLength(toProcess[i]) + 1 // +1 for newline
      }

      this.currentOffset += bytesProcessed
      writeFileSync(this.offsetPath, this.currentOffset.toString())

      // Periodic truncation: if currentOffset is large, truncate file to save space
      if (this.currentOffset > 10 * 1024 * 1024) { // 10MB
        this.truncate()
      }

    } catch (e) {
      console.error('[WAL] Flush failed:', e)
    } finally {
      this.isFlushing = false
    }
  }

  private truncate() {
    try {
      console.log('[WAL] Truncating file...')
      // To truncate effectively while keeping the tail, we read the remainder and rewrite it.
      const remainder = readFileSync(this.walPath).subarray(this.currentOffset)
      writeFileSync(this.walPath, remainder)
      this.currentOffset = 0
      writeFileSync(this.offsetPath, '0')
    } catch (e) {
      console.error('[WAL] Truncate failed:', e)
    }
  }

  private start() {
    this.timer = setInterval(() => this.flushNow(), FLUSH_INTERVAL_MS)
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    // One final flush is tricky with async, but we can try
    // flushNow() is async. App shutdown will wait for the returns?
  }
}
