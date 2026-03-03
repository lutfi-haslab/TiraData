import { generateId } from '../domain/id'
import type {
  IngestLogPayload,
  IngestMetricPayload,
  IngestTracePayload,
  LogEntry,
  MetricEntry,
  TraceEntry,
} from '../domain/types'

// ─── Normalisation Helpers ────────────────────────────────────────────────────

const VALID_LEVELS = new Set(['debug', 'info', 'warn', 'error', 'fatal'])

/**
 * Normalise a raw log payload into a validated LogEntry.
 * Fills defaults, coerces types, trims strings.
 */
export function normaliseLog(payload: IngestLogPayload): LogEntry {
  const level = VALID_LEVELS.has(payload.level ?? '')
    ? payload.level!
    : 'info'

  return {
    id: generateId(),
    timestamp: resolveTimestamp(payload.timestamp),
    level,
    service: (payload.service ?? 'unknown').slice(0, 128),
    message: (payload.message ?? '').slice(0, 4096),
    attributes: sanitiseAttributes(payload.attributes),
  }
}

/**
 * Normalise a raw metric payload into a validated MetricEntry.
 */
export function normaliseMetric(payload: IngestMetricPayload): MetricEntry {
  return {
    timestamp: resolveTimestamp(payload.timestamp),
    name: (payload.name ?? '').slice(0, 256),
    value: Number.isFinite(payload.value) ? payload.value : 0,
    labels: sanitiseLabels(payload.labels),
  }
}

/**
 * Normalise a raw trace payload into a validated TraceEntry.
 */
export function normaliseTrace(payload: IngestTracePayload): TraceEntry {
  return {
    trace_id: sanitiseId(payload.trace_id),
    span_id: sanitiseId(payload.span_id),
    parent_id: payload.parent_id ? sanitiseId(payload.parent_id) : null,
    start_time: resolveTimestamp(payload.start_time),
    duration: Math.max(0, Math.floor(payload.duration)),
    name: (payload.name ?? '').slice(0, 256),
    attributes: sanitiseAttributes(payload.attributes),
  }
}

// ─── Private Helpers ─────────────────────────────────────────────────────────

function resolveTimestamp(ts: number | undefined): number {
  if (ts == null) return Date.now()
  // Accept both seconds and milliseconds epoch
  return ts < 1e12 ? ts * 1000 : ts
}

function sanitiseAttributes(
  attrs: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (attrs == null || typeof attrs !== 'object' || Array.isArray(attrs)) {
    return {}
  }
  // Keep only primitives + arrays, drop functions / circular refs
  return Object.fromEntries(
    Object.entries(attrs)
      .filter(([, v]) => typeof v !== 'function')
      .slice(0, 64)                     // max 64 keys
      .map(([k, v]) => [k.slice(0, 64), v])
  )
}

function sanitiseLabels(
  labels: Record<string, string> | undefined
): Record<string, string> {
  if (labels == null) return {}
  return Object.fromEntries(
    Object.entries(labels)
      .filter(([, v]) => typeof v === 'string')
      .slice(0, 16)
      .map(([k, v]) => [k.slice(0, 64), v.slice(0, 256)])
  )
}

function sanitiseId(id: string): string {
  return (id ?? '').replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 128) || generateId()
}
