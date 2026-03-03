import type { LogEntry, MetricEntry, TraceEntry } from '../domain/types'
import { generateId } from '../domain/id'

/**
 * Partial OTLP JSON types for mapping
 */
interface OTLPAttribute {
  key: string
  value: { stringValue?: string; intValue?: number; doubleValue?: number; boolValue?: boolean }
}

function mapAttributes(attrs: OTLPAttribute[] = []): Record<string, any> {
  const result: Record<string, any> = {}
  for (const attr of attrs) {
    const val = attr.value
    result[attr.key] = val.stringValue ?? val.intValue ?? val.doubleValue ?? val.boolValue
  }
  return result
}

export function mapOTLPLogs(body: any): Omit<LogEntry, 'projectId'>[] {
  const entries: Omit<LogEntry, 'projectId'>[] = []
  const resourceLogs = body.resourceLogs || []

  for (const resLog of resourceLogs) {
    const baseAttrs = mapAttributes(resLog.resource?.attributes)
    const serviceName = baseAttrs['service.name'] || 'unknown'

    for (const scopeLog of (resLog.scopeLogs || [])) {
      for (const record of (scopeLog.logRecords || [])) {
        entries.push({
          id: generateId(),
          timestamp: Math.floor(Number(record.timeUnixNano || Date.now() * 1000000) / 1000000),
          level: (record.severityText || 'INFO').toLowerCase() as any,
          service: serviceName,
          message: record.body?.stringValue || JSON.stringify(record.body) || '',
          attributes: { ...baseAttrs, ...mapAttributes(record.attributes) }
        })
      }
    }
  }
  return entries
}

export function mapOTLPMetrics(body: any): Omit<MetricEntry, 'projectId'>[] {
  const entries: Omit<MetricEntry, 'projectId'>[] = []
  const resourceMetrics = body.resourceMetrics || []

  for (const resMet of resourceMetrics) {
    const baseAttrs = mapAttributes(resMet.resource?.attributes)

    for (const scopeMet of (resMet.scopeMetrics || [])) {
      for (const metric of (scopeMet.metrics || [])) {
        const name = metric.name
        // OTLP can have gauge, sum, histogram. We'll simplify to flat points for now.
        const dataPoints = metric.gauge?.dataPoints || metric.sum?.dataPoints || []
        
        for (const dp of dataPoints) {
          entries.push({
            timestamp: Math.floor(Number(dp.timeUnixNano || Date.now() * 1000000) / 1000000),
            name,
            value: dp.asDouble ?? dp.asInt ?? 0,
            labels: { ...baseAttrs, ...mapAttributes(dp.attributes) }
          })
        }
      }
    }
  }
  return entries
}

function formatId(id: any): string {
  if (id instanceof Buffer) return id.toString('hex')
  if (typeof id === 'string') return id
  return String(id || '')
}

export function mapOTLPTraces(body: any): Omit<TraceEntry, 'projectId'>[] {
  const entries: Omit<TraceEntry, 'projectId'>[] = []
  const resourceSpans = body.resourceSpans || body.resource_spans || []

  for (const resSpan of resourceSpans) {
    const baseAttrs = mapAttributes(resSpan.resource?.attributes)

    for (const scopeSpan of (resSpan.scopeSpans || resSpan.scope_spans || [])) {
      for (const span of (scopeSpan.spans || [])) {
        const start = Math.floor(Number(span.startTimeUnixNano || span.start_time_unix_nano) / 1000000)
        const end   = Math.floor(Number(span.endTimeUnixNano || span.end_time_unix_nano) / 1000000)
        
        entries.push({
          trace_id: formatId(span.traceId || span.trace_id),
          span_id: formatId(span.spanId || span.span_id),
          parent_id: span.parentSpanId || span.parent_span_id ? formatId(span.parentSpanId || span.parent_span_id) : null,
          start_time: start,
          duration: Math.max(0, end - start),
          name: span.name,
          attributes: { ...baseAttrs, ...mapAttributes(span.attributes) }
        })
      }
    }
  }
  return entries
}
