import { WALQueue } from '../../src/backend/infrastructure/queue/wal-queue'
import { unlinkSync, existsSync } from 'node:fs'
import type { LogEntry } from '../../src/backend/domain/types'

// Setup cleanup
if (existsSync('tiradata.wal')) unlinkSync('tiradata.wal')
if (existsSync('offset.dat')) unlinkSync('offset.dat')

const logsBatch: LogEntry[] = []

const flushFn = async (logs: any[]) => {
  logsBatch.push(...logs)
}

console.log('--- Step 1: Populate WAL with items ---')
const q1 = new WALQueue(100_000, flushFn)
q1.enqueueLog({ id: '1', timestamp: Date.now(), level: 'info', service: 'test', message: 'msg1', attributes: {} })
q1.enqueueLog({ id: '2', timestamp: Date.now(), level: 'info', service: 'test', message: 'msg2', attributes: {} })
q1.stop()

console.log('--- Step 2: Simulate restart and verify recovery ---')
// We haven't let the flush interval (250ms) run, so q1 should have left 2 items in WAL file.
// New queue should pick them up on init.
const q2 = new WALQueue(100_000, flushFn)

// Wait for flush
await new Promise(r => setTimeout(r, 500))

if (logsBatch.length === 2) {
  console.log('✅ Crash recovery successful! Recovered 2 items.')
} else {
  console.log(`❌ Recovery failed. Expected 2 items, got ${logsBatch.length}`)
  process.exit(1)
}

// Cleanup
if (existsSync('tiradata.wal')) unlinkSync('tiradata.wal')
if (existsSync('offset.dat')) unlinkSync('offset.dat')
