import { describe, it, expect } from 'bun:test'
import { RingBuffer } from '../../src/backend/domain/ring-buffer'

describe('RingBuffer', () => {
  // ── Basic enqueue / dequeue ───────────────────────────────────────────────

  it('starts empty', () => {
    const buf = new RingBuffer<number>(4)
    expect(buf.size).toBe(0)
    expect(buf.isEmpty).toBe(true)
    expect(buf.isFull).toBe(false)
  })

  it('enqueues and dequeues a single item', () => {
    const buf = new RingBuffer<string>(4)
    expect(buf.enqueue('a')).toBe(true)
    expect(buf.size).toBe(1)
    expect(buf.dequeueMany(1)).toEqual(['a'])
    expect(buf.size).toBe(0)
  })

  it('dequeues items in FIFO order', () => {
    const buf = new RingBuffer<number>(8)
    for (let i = 0; i < 5; i++) buf.enqueue(i)
    const out = buf.dequeueMany(5)
    expect(out).toEqual([0, 1, 2, 3, 4])
  })

  it('dequeueMany respects max limit', () => {
    const buf = new RingBuffer<number>(8)
    for (let i = 0; i < 5; i++) buf.enqueue(i)
    const out = buf.dequeueMany(2)
    expect(out).toHaveLength(2)
    expect(buf.size).toBe(3)
  })

  it('dequeueMany on empty buffer returns []', () => {
    const buf = new RingBuffer<number>(4)
    expect(buf.dequeueMany(10)).toEqual([])
  })

  // ── Backpressure ──────────────────────────────────────────────────────────

  it('returns false when full', () => {
    const buf = new RingBuffer<number>(3)
    expect(buf.enqueue(1)).toBe(true)
    expect(buf.enqueue(2)).toBe(true)
    expect(buf.enqueue(3)).toBe(true)
    expect(buf.isFull).toBe(true)
    expect(buf.enqueue(4)).toBe(false)   // dropped
    expect(buf.size).toBe(3)            // still 3
  })

  it('increments droppedCount on overflow', () => {
    const buf = new RingBuffer<number>(2)
    buf.enqueue(1)
    buf.enqueue(2)
    buf.enqueue(3) // dropped
    buf.enqueue(4) // dropped
    expect(buf.droppedCount).toBe(2)
  })

  it('accepts new items after draining', () => {
    const buf = new RingBuffer<number>(2)
    buf.enqueue(1)
    buf.enqueue(2)
    buf.dequeueMany(2)
    expect(buf.enqueue(3)).toBe(true)
    expect(buf.size).toBe(1)
  })

  // ── Wrap-around ───────────────────────────────────────────────────────────

  it('wraps around correctly (head/tail modulo)', () => {
    const buf = new RingBuffer<number>(3)
    buf.enqueue(10)
    buf.enqueue(20)
    buf.dequeueMany(1)     // consume 10, head advances
    buf.enqueue(30)
    buf.enqueue(40)        // wraps tail around
    expect(buf.dequeueMany(3)).toEqual([20, 30, 40])
    expect(buf.size).toBe(0)
  })

  it('handles repeated fill-drain cycles', () => {
    const buf = new RingBuffer<number>(4)
    for (let cycle = 0; cycle < 10; cycle++) {
      for (let i = 0; i < 4; i++) expect(buf.enqueue(i)).toBe(true)
      expect(buf.isFull).toBe(true)
      expect(buf.dequeueMany(4)).toHaveLength(4)
      expect(buf.isEmpty).toBe(true)
    }
  })

  // ── GC safety ─────────────────────────────────────────────────────────────

  it('clears references after dequeue (no memory leaks)', () => {
    const buf = new RingBuffer<object>(2)
    const obj = { x: 1 }
    buf.enqueue(obj)
    buf.dequeueMany(1)
    // Internal slot should be undefined after dequeue
    // @ts-expect-error - access private for test
    expect(buf.buf[0]).toBeUndefined()
  })
})
