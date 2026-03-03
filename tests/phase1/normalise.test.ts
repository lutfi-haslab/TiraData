import { describe, it, expect } from 'bun:test'
import { normaliseLog, normaliseMetric, normaliseTrace } from '../../src/backend/usecases/normalise'

describe('normaliseLog', () => {
  it('generates an id', () => {
    const entry = normaliseLog({ message: 'hello' })
    expect(entry.id).toBeTruthy()
    expect(typeof entry.id).toBe('string')
  })

  it('defaults level to info when not provided', () => {
    const entry = normaliseLog({ message: 'hello' })
    expect(entry.level).toBe('info')
  })

  it('defaults level to info for unknown level', () => {
    const entry = normaliseLog({ message: 'hi', level: 'critical' as any })
    expect(entry.level).toBe('info')
  })

  it('accepts all valid levels', () => {
    const levels = ['debug', 'info', 'warn', 'error', 'fatal'] as const
    for (const level of levels) {
      expect(normaliseLog({ message: 'x', level }).level).toBe(level)
    }
  })

  it('defaults service to unknown', () => {
    const entry = normaliseLog({ message: 'test' })
    expect(entry.service).toBe('unknown')
  })

  it('uses provided service', () => {
    const entry = normaliseLog({ message: 'test', service: 'api-gateway' })
    expect(entry.service).toBe('api-gateway')
  })

  it('uses provided timestamp (ms)', () => {
    const ts = Date.now() - 5000
    const entry = normaliseLog({ message: 'test', timestamp: ts })
    expect(entry.timestamp).toBe(ts)
  })

  it('converts seconds-epoch timestamp to ms', () => {
    const tsSeconds = Math.floor(Date.now() / 1000) - 100
    const entry = normaliseLog({ message: 'test', timestamp: tsSeconds })
    expect(entry.timestamp).toBe(tsSeconds * 1000)
  })

  it('defaults timestamp to now when not provided', () => {
    const before = Date.now()
    const entry  = normaliseLog({ message: 'test' })
    const after  = Date.now()
    expect(entry.timestamp).toBeGreaterThanOrEqual(before)
    expect(entry.timestamp).toBeLessThanOrEqual(after)
  })

  it('clamps message to 4096 chars', () => {
    const long  = 'x'.repeat(5000)
    const entry = normaliseLog({ message: long })
    expect(entry.message).toHaveLength(4096)
  })

  it('clamps service to 128 chars', () => {
    const long  = 'a'.repeat(200)
    const entry = normaliseLog({ message: 'hi', service: long })
    expect(entry.service).toHaveLength(128)
  })

  it('defaults attributes to {}', () => {
    const entry = normaliseLog({ message: 'test' })
    expect(entry.attributes).toEqual({})
  })

  it('passes valid attributes through', () => {
    const attrs = { user_id: 'u1', request_id: 'r2', count: 42 }
    const entry = normaliseLog({ message: 'test', attributes: attrs })
    expect(entry.attributes).toMatchObject(attrs)
  })

  it('drops function values from attributes', () => {
    const entry = normaliseLog({ message: 'test', attributes: { fn: () => {}, val: 1 } as any })
    expect(entry.attributes).not.toHaveProperty('fn')
    expect(entry.attributes).toHaveProperty('val', 1)
  })

  it('caps attributes at 64 keys', () => {
    const attrs = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`k${i}`, i]))
    const entry = normaliseLog({ message: 'test', attributes: attrs })
    expect(Object.keys(entry.attributes).length).toBeLessThanOrEqual(64)
  })
})

describe('normaliseMetric', () => {
  it('uses provided name and value', () => {
    const entry = normaliseMetric({ name: 'cpu.usage', value: 42.5 })
    expect(entry.name).toBe('cpu.usage')
    expect(entry.value).toBe(42.5)
  })

  it('defaults non-finite value to 0', () => {
    expect(normaliseMetric({ name: 'x', value: NaN }).value).toBe(0)
    expect(normaliseMetric({ name: 'x', value: Infinity }).value).toBe(0)
  })

  it('allows negative values', () => {
    const entry = normaliseMetric({ name: 'temp', value: -10.5 })
    expect(entry.value).toBe(-10.5)
  })

  it('defaults labels to {}', () => {
    const entry = normaliseMetric({ name: 'x', value: 1 })
    expect(entry.labels).toEqual({})
  })

  it('passes string labels through', () => {
    const entry = normaliseMetric({ name: 'x', value: 1, labels: { env: 'prod', region: 'us-east' } })
    expect(entry.labels).toMatchObject({ env: 'prod', region: 'us-east' })
  })

  it('clamps name to 256 chars', () => {
    const entry = normaliseMetric({ name: 'n'.repeat(300), value: 1 })
    expect(entry.name).toHaveLength(256)
  })
})

describe('normaliseTrace', () => {
  it('preserves valid trace_id and span_id', () => {
    const entry = normaliseTrace({ trace_id: 'trace-1', span_id: 'span-1', name: 'handler', duration: 100 })
    expect(entry.trace_id).toBe('trace-1')
    expect(entry.span_id).toBe('span-1')
  })

  it('sets parent_id to null when not provided', () => {
    const entry = normaliseTrace({ trace_id: 't', span_id: 's', name: 'x', duration: 10 })
    expect(entry.parent_id).toBeNull()
  })

  it('passes parent_id through when provided', () => {
    const entry = normaliseTrace({ trace_id: 't', span_id: 's', parent_id: 'p-1', name: 'x', duration: 10 })
    expect(entry.parent_id).toBe('p-1')
  })

  it('clamps duration to 0 minimum', () => {
    const entry = normaliseTrace({ trace_id: 't', span_id: 's', name: 'x', duration: -5 })
    expect(entry.duration).toBe(0)
  })

  it('floors duration to integer', () => {
    const entry = normaliseTrace({ trace_id: 't', span_id: 's', name: 'x', duration: 99.9 })
    expect(entry.duration).toBe(99)
  })

  it('generates fallback id if span_id contains invalid chars', () => {
    const entry = normaliseTrace({ trace_id: '!!!', span_id: '!!!', name: 'x', duration: 10 })
    expect(entry.span_id.length).toBeGreaterThan(0)
  })
})
