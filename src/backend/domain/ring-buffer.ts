/**
 * RingBuffer – fixed-capacity FIFO queue with configurable backpressure.
 *
 * - O(1) enqueue / dequeue
 * - Head index moves forward on dequeue (no shifting)
 * - Overflows are dropped and counted for observability
 */
export class RingBuffer<T> {
  private readonly buf: (T | undefined)[]
  private head = 0    // read pointer
  private tail = 0    // write pointer
  private count = 0   // live items
  private dropped = 0 // items lost under pressure

  constructor(readonly capacity: number) {
    this.buf = new Array(capacity)
  }

  /** Enqueue an item. Returns false and increments drop counter when full. */
  enqueue(item: T): boolean {
    if (this.count === this.capacity) {
      this.dropped++
      return false
    }
    this.buf[this.tail] = item
    this.tail = (this.tail + 1) % this.capacity
    this.count++
    return true
  }

  /** Dequeue up to `max` items atomically. */
  dequeueMany(max: number): T[] {
    const batch: T[] = []
    const take = Math.min(max, this.count)
    for (let i = 0; i < take; i++) {
      batch.push(this.buf[this.head] as T)
      this.buf[this.head] = undefined // release reference (GC)
      this.head = (this.head + 1) % this.capacity
      this.count--
    }
    return batch
  }

  get size(): number { return this.count }
  get droppedCount(): number { return this.dropped }
  get isFull(): boolean { return this.count === this.capacity }
  get isEmpty(): boolean { return this.count === 0 }
}
