import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { api, type TraceEntry } from '../utils/api'
import { fmtTime, fmtDuration } from '../utils/format'
import { ChevronRight, ChevronDown, GitFork, Clock, Layers, Activity, ChevronLeft } from 'lucide-react'

export const Route = createFileRoute('/traces')({
  component: TraceViewer,
})

// ─── Constants ────────────────────────────────────────────────────────────────

const SPAN_COLORS = ['#818cf8', '#34d399', '#fbbf24', '#f87171', '#38bdf8', '#e879f9']
const spanColor = (depth: number) => SPAN_COLORS[Math.min(depth, SPAN_COLORS.length - 1)]
const PAGE_SIZE = 50

// ─── Span Row ─────────────────────────────────────────────────────────────────

function SpanRow({
  span,
  minStart,
  totalDuration,
  depth,
}: {
  span: TraceEntry
  minStart: number
  totalDuration: number
  depth: number
}) {
  const [open, setOpen] = useState(false)

  const offsetPct = totalDuration > 0 ? ((span.start_time - minStart) / totalDuration) * 100 : 0
  const widthPct = totalDuration > 0 ? Math.max((span.duration / totalDuration) * 100, 1) : 10
  const color = spanColor(depth)

  return (
    <>
      <tr
        onClick={() => setOpen(v => !v)}
        className="cursor-pointer border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors"
      >
        <td className="py-2.5 px-3" style={{ paddingLeft: 12 + depth * 20 }}>
          <div className="flex items-center gap-2">
            <div className="flex-shrink-0">
              {open
                ? <ChevronDown size={11} className="text-slate-500" />
                : <ChevronRight size={11} className="text-slate-500" />
              }
            </div>
            <span
              className="w-2 h-2 rounded-[2px] shrink-0 inline-block"
              style={{ background: color }}
            />
            <span className="text-xs font-mono text-slate-800 dark:text-slate-200 truncate">{span.name}</span>
          </div>
        </td>

        <td className="py-2.5 px-3 text-[11px] font-mono text-slate-500">
          {span.span_id.slice(0, 10)}
        </td>

        <td className="py-2.5 px-3 min-w-[200px]">
          <div className="relative h-2.5 bg-slate-100 dark:bg-white/5 rounded-sm overflow-hidden">
            <div
              className="absolute h-full rounded-sm opacity-80"
              style={{
                left: `${offsetPct}%`,
                width: `${widthPct}%`,
                background: color,
              }}
            />
          </div>
        </td>

        <td className="py-2.5 px-3 text-xs font-mono truncate" style={{ color }}>
          {fmtDuration(span.duration)}
        </td>

        <td className="py-2.5 px-3 text-[11px] text-slate-500 whitespace-nowrap">
          {fmtTime(span.start_time)}
        </td>
      </tr>

      {open && (
        <tr>
          <td colSpan={5} className="p-3 bg-slate-50 dark:bg-black/20">
            <pre className="text-[10px] font-mono text-slate-500 dark:text-slate-400 whitespace-pre-wrap break-all m-0">
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
  const minStart = sorted[0]?.start_time ?? 0
  const maxEnd = Math.max(...sorted.map(s => s.start_time + s.duration))
  const totalDuration = maxEnd - minStart
  const rootSpan = sorted.find(s => !s.parent_id) ?? sorted[0]

  return (
    <div className="rounded-lg border border-slate-200 bg-white dark:border-white/10 dark:bg-[#12141c] overflow-hidden mb-2 shadow-sm transition-colors duration-200">
      <div
        onClick={() => setExpanded(v => !v)}
        className={`flex items-center gap-3 px-4 py-3 cursor-pointer select-none transition-colors ${
          expanded ? 'bg-indigo-500/5 dark:bg-indigo-500/5 border-b border-slate-100 dark:border-white/5' : 'hover:bg-slate-50 dark:hover:bg-white/[0.02]'
        }`}
      >
        {expanded
          ? <ChevronDown size={14} className="text-indigo-400" />
          : <ChevronRight size={14} className="text-slate-500" />
        }
        <GitFork size={13} className="text-indigo-400 shrink-0" />
        
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 flex-1 min-w-0">
          <span className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 truncate">
            {rootSpan?.name ?? 'unknown'}
          </span>
          <span className="text-[10px] font-mono text-slate-500 bg-slate-100 dark:bg-white/5 px-1.5 py-0.5 rounded truncate max-w-[120px]">
            {traceId.slice(0, 16)}
          </span>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <span className="hidden md:flex items-center gap-1.5 text-xs text-slate-500">
            <Layers size={12} /> {spans.length}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-indigo-400 font-medium">
            <Clock size={12} /> {fmtDuration(totalDuration)}
          </span>
          <span className="hidden lg:inline text-[10px] text-slate-600">
            {fmtTime(minStart)}
          </span>
        </div>
      </div>

      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50/50 dark:bg-black/20 border-b border-slate-100 dark:border-white/5">
              <tr>
                {['Span Name', 'ID', 'Timeline', 'Duration', 'Start'].map(h => (
                  <th key={h} className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(span => (
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
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function TraceViewer() {
  const [traceIdFilter, setTraceIdFilter] = useState('')
  const [page, setPage] = useState(0)

  const { data, isFetching, isError } = useQuery({
    queryKey: ['traces', traceIdFilter, page],
    queryFn: () => api.traces({ 
      trace_id: traceIdFilter || undefined, 
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE
    }),
    refetchInterval: 15_000,
  })

  const groups = useMemo(() => {
    const map = new Map<string, TraceEntry[]>()
    for (const span of data?.data ?? []) {
      const arr = map.get(span.trace_id) ?? []
      arr.push(span)
      map.set(span.trace_id, arr)
    }
    return [...map.entries()].sort(([, a], [, b]) => {
      const aRoot = a.find(s => !s.parent_id) ?? a[0]
      const bRoot = b.find(s => !s.parent_id) ?? b[0]
      return (bRoot?.start_time ?? 0) - (aRoot?.start_time ?? 0)
    })
  }, [data])

  const totalCount = data?.count ?? 0
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#0a0b0f] transition-colors duration-200">
      <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/80 backdrop-blur-sm sticky top-0 z-10 dark:border-white/5 dark:bg-[#0f1118]/50">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Trace Viewer</h1>
        
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <input
              className="w-full bg-slate-100 border border-slate-200 dark:bg-white/5 dark:border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 transition-all font-mono"
              placeholder="Filter by trace ID..."
              value={traceIdFilter}
              onChange={e => {
                setTraceIdFilter(e.target.value)
                setPage(0)
              }}
            />
          </div>
          
          <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
            {isFetching ? (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 border border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <span>Loading...</span>
              </div>
            ) : (
              <span>{totalCount} total spans</span>
            )}
          </div>
        </div>
      </div>

      <div className="p-6 overflow-y-auto flex-1 font-sans">
        {isError && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-6 flex items-center gap-2">
            <Activity size={16} />
            <span>Failed to load traces. Please check your connection.</span>
          </div>
        )}

        <div className="flex items-center justify-between mb-3 px-1">
          <div className="text-[11px] text-slate-600 uppercase tracking-widest font-bold">
            {isFetching ? 'Loading traces...' : `${totalCount} records matched`}
          </div>

          {/* Top Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1 px-2 rounded bg-slate-100 border border-slate-200 text-slate-400 disabled:opacity-20 hover:bg-slate-200 dark:bg-white/5 dark:border-white/10 dark:hover:bg-white/10 transition-all font-mono"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-[10px] text-slate-500 font-mono">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-1 px-2 rounded bg-slate-100 border border-slate-200 text-slate-400 disabled:opacity-20 hover:bg-slate-200 dark:bg-white/5 dark:border-white/10 dark:hover:bg-white/10 transition-all font-mono"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>

        <div className="animate-fade-in space-y-2">
          {groups.map(([id, spans]) => (
            <TraceGroup key={id} traceId={id} spans={spans} />
          ))}
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="mt-8 mb-4 flex items-center justify-center gap-4">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-400 shadow-sm disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10 transition-all duration-200"
            >
              <ChevronLeft size={16} />
            </button>
            
            <div className="text-xs text-slate-500 flex items-center gap-1 select-none">
              <span className="text-slate-900 dark:text-slate-200 font-medium">Page {page + 1}</span>
              <span>of {totalPages}</span>
            </div>

            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-400 shadow-sm disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10 transition-all duration-200"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
