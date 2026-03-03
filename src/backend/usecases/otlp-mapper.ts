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

export function mapOTLPLogs(body: any): LogEntry[] {
  const entries: LogEntry[] = []
  const resourceLogs = body.resourceLogs || []

  for (const resLog of resourceLogs) {
    const baseAttrs = mapAttributes(resLog.resource?.attributes)
    const serviceName = baseAttrs['service.name'] || 'unknown'

    for (const scopeLog of (resLog.scopeLogs || [])) {
      for (const record of (scopeLog.logRecords || [])) {
        entries.push({
          id: generateId(),
          timestamp: Math.floor(Number(record.timeUnixNano || Date.now() * 1000000) / 1000000),
          level: (record.severityText || 'INFO').toLowerCase(),
          service: serviceName,
          message: record.body?.stringValue || JSON.stringify(record.body) || '',
          attributes: { ...baseAttrs, ...mapAttributes(record.attributes) }
        })
      }
    }
  }
  return entries
}

export function mapOTLPMetrics(body: any): MetricEntry[] {
  const entries: MetricEntry[] = []
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

export function mapOTLPTraces(body: any): TraceEntry[] {
  const entries: TraceEntry[] = []
  const resourceSpans = body.resourceSpans || []

  for (const resSpan of resourceSpans) {
    const baseAttrs = mapAttributes(resSpan.resource?.attributes)

    for (const scopeSpan of (resSpan.scopeSpans || [])) {
      for (const span of (scopeSpan.spans || [])) {
        const start = Math.floor(Number(span.startTimeUnixNano) / 1000000)
        const end   = Math.floor(Number(span.endTimeUnixNano) / 1000000)
        
        entries.push({
          trace_id: span.traceId,
          span_id: span.spanId,
          parent_id: span.parentSpanId || null,
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
