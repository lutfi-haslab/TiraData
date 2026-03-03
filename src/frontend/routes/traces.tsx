import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { api, type TraceEntry } from '../utils/api'
import { fmtTime, fmtDuration } from '../utils/format'
import { ChevronRight, ChevronDown, GitFork } from 'lucide-react'

export const Route = createFileRoute('/traces')({
  component: TraceViewer,
})

// ─── Span Flame Row ───────────────────────────────────────────────────────────

interface SpanRowProps {
  span: TraceEntry
  minStart: number
  totalDuration: number
  depth: number
}

function SpanRow({ span, minStart, totalDuration, depth }: SpanRowProps) {
  const [open, setOpen] = useState(false)

  const offsetPct = totalDuration > 0
    ? ((span.start_time - minStart) / totalDuration) * 100
    : 0
  const widthPct = totalDuration > 0
    ? Math.max((span.duration / totalDuration) * 100, 0.3)
    : 4

  return (
    <>
      <tr
        style={{ cursor: 'pointer' }}
        onClick={() => setOpen((v) => !v)}
      >
        <td style={{ paddingLeft: 14 + depth * 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {open
              ? <ChevronDown size={12} style={{ flexShrink: 0, opacity: 0.5 }} />
              : <ChevronRight size={12} style={{ flexShrink: 0, opacity: 0.5 }} />
            }
            <span style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>
              {span.name}
            </span>
          </div>
        </td>
        <td>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-muted)' }}>
            {span.span_id.slice(0, 8)}
          </span>
        </td>
        <td>
          {/* Flame bar */}
          <div style={{ position: 'relative', height: 16, background: 'var(--color-bg-overlay)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              position: 'absolute',
              left: `${offsetPct}%`,
              width: `${widthPct}%`,
              height: '100%',
              background: 'linear-gradient(90deg, var(--color-accent), var(--color-accent-hover))',
              borderRadius: 3,
              opacity: 0.85,
            }} />
          </div>
        </td>
        <td style={{ color: 'var(--color-success)', fontFamily: 'var(--font-mono)' }}>
          {fmtDuration(span.duration)}
        </td>
        <td style={{ color: 'var(--color-text-muted)' }}>
          {fmtTime(span.start_time)}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5} style={{ padding: '0 14px 12px', background: 'var(--color-bg-elevated)' }}>
            <pre style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--color-text-secondary)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}>
              {JSON.stringify(span.attributes, null, 2)}
            </pre>
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Trace Group ──────────────────────────────────────────────────────────────

function TraceGroup({ traceId, spans }: { traceId: string; spans: TraceEntry[] }) {
  const [expanded, setExpanded] = useState(false)

  const sorted = useMemo(
    () => [...spans].sort((a, b) => a.start_time - b.start_time),
    [spans]
  )
  const minStart   = sorted[0]?.start_time ?? 0
  const maxEnd     = Math.max(...sorted.map((s) => s.start_time + s.duration))
  const totalDuration = maxEnd - minStart

  const rootSpan = sorted.find((s) => !s.parent_id) ?? sorted[0]

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 8 }}>
      {/* Trace header */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 14px', cursor: 'pointer',
          background: 'var(--color-bg-elevated)',
          borderBottom: expanded ? '1px solid var(--color-border)' : 'none',
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded
          ? <ChevronDown size={14} color="var(--color-text-muted)" />
          : <ChevronRight size={14} color="var(--color-text-muted)" />
        }
        <GitFork size={13} color="var(--color-accent-hover)" />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text-secondary)' }}>
          {traceId}
        </span>
        <span style={{ color: 'var(--color-text-primary)', fontSize: 13, fontWeight: 600 }}>
          {rootSpan?.name ?? 'unnamed'}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-muted)' }}>
          {spans.length} span{spans.length !== 1 ? 's' : ''} · {fmtDuration(totalDuration)}
        </span>
      </div>

      {expanded && (
        <table className="data-table" style={{ borderRadius: 0 }}>
          <thead>
            <tr>
              <th>Span Name</th>
              <th>Span ID</th>
              <th style={{ minWidth: 200 }}>Timeline</th>
              <th>Duration</th>
              <th>Start</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((span, i) => (
              <SpanRow
                key={span.span_id}
                span={span}
                minStart={minStart}
                totalDuration={totalDuration}
                depth={span.parent_id ? 1 : 0}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function TraceViewer() {
  const [traceId, setTraceId] = useState('')

  const { data, isFetching, isError } = useQuery({
    queryKey: ['traces', traceId],
    queryFn: () => api.traces({ trace_id: traceId || undefined, limit: 300 }),
    refetchInterval: 15_000,
  })

  // Group spans by trace_id
  const groups = useMemo(() => {
    const map = new Map<string, TraceEntry[]>()
    for (const span of data?.data ?? []) {
      const arr = map.get(span.trace_id) ?? []
      arr.push(span)
      map.set(span.trace_id, arr)
    }
    return [...map.entries()] // [traceId, spans[]]
  }, [data])

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Trace Viewer</h1>
      </div>

      <div className="page-body fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="filter-row">
          <input
            id="trace-id-input"
            className="input"
            placeholder="Filter by trace ID…"
            value={traceId}
            onChange={(e) => setTraceId(e.target.value)}
            style={{ maxWidth: 340, fontFamily: 'var(--font-mono)', fontSize: 12 }}
          />
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
            {isFetching ? 'Loading…' : `${groups.length} trace${groups.length !== 1 ? 's' : ''}`}
          </span>
        </div>

        {isError && <div className="error-box">Failed to load traces.</div>}

        {groups.length === 0 && !isFetching && (
          <div className="empty-state">
            <GitFork size={32} opacity={0.3} />
            <div>No traces yet.</div>
            <div style={{ fontSize: 11 }}>
              POST to <code style={{ fontFamily: 'var(--font-mono)' }}>/api/ingest/trace</code>
            </div>
          </div>
        )}

        {groups.map(([id, spans]) => (
          <TraceGroup key={id} traceId={id} spans={spans} />
        ))}
      </div>
    </>
  )
}
