import { useState, useMemo } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { api, type ApmService, type ApmOperation } from '../utils/api'
import {
  Activity, AlertTriangle, Clock, Zap, ChevronRight, ChevronDown,
  TrendingUp, Server, ArrowRight, RefreshCw, ChevronLeft, Hash,
  Layers
} from 'lucide-react'

export const Route = createFileRoute('/apm')({
  component: ApmPage,
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtMs = (ms: number) => ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`
const fmtNum = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
const fmtPct = (r: number) => `${(r * 100).toFixed(1)}%`
const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

const TIME_RANGES = [
  { label: '1h',  ms: 3_600_000 },
  { label: '6h',  ms: 6 * 3_600_000 },
  { label: '24h', ms: 24 * 3_600_000 },
  { label: '7d',  ms: 7 * 24 * 3_600_000 },
]

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = 'indigo', icon: Icon }: {
  label: string; value: string; sub?: string; color?: string; icon: any
}) {
  const colors: Record<string, string> = {
    indigo: 'from-indigo-500/10 to-indigo-500/5 border-indigo-500/20 text-indigo-400',
    emerald: 'from-emerald-500/10 to-emerald-500/5 border-emerald-500/20 text-emerald-400',
    red: 'from-red-500/10 to-red-500/5 border-red-500/20 text-red-400',
    amber: 'from-amber-500/10 to-amber-500/5 border-amber-500/20 text-amber-400',
  }
  return (
    <div className={`rounded-xl border bg-gradient-to-br ${colors[color]} p-5 flex flex-col gap-2`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">{label}</span>
        <Icon size={16} className={colors[color].split(' ')[3]} />
      </div>
      <div className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  )
}

const fmtDateTime = (ts: number) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`
}

function TraceTimeline({ traceId }: { traceId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['trace_full', traceId],
    queryFn: () => api.traces({ trace_id: traceId }),
  })

  const spans = useMemo(() => {
    if (!data?.data) return []
    return [...data.data].sort((a, b) => a.start_time - b.start_time)
  }, [data])

  if (isLoading) return <div className="py-6 text-center text-[10px] text-slate-400 font-medium tracking-wide">Fetching distributed spans...</div>
  if (spans.length === 0) return null

  const minStart = Math.min(...spans.map(s => s.start_time))
  const maxEnd = Math.max(...spans.map(s => s.start_time + s.duration))
  const totalDuration = maxEnd - minStart

  return (
    <div className="bg-slate-50/30 dark:bg-black/20 border-t border-slate-100 dark:border-white/[0.05] overflow-x-auto">
      <table className="w-full text-left border-collapse min-w-[700px]">
        <thead>
          <tr className="text-[9px] uppercase tracking-widest text-slate-400 font-bold border-b border-slate-100 dark:border-white/[0.05]">
            <th className="pl-10 pr-4 py-2 font-bold bg-slate-100/20 dark:bg-white/[0.01]">SPAN NAME</th>
            <th className="px-3 py-2 font-bold">ID</th>
            <th className="px-3 py-2 font-bold w-[200px]">TIMELINE</th>
            <th className="px-3 py-2 font-bold text-right">DUR</th>
            <th className="px-3 py-2 font-bold text-right">START</th>
          </tr>
        </thead>
        <tbody>
          {spans.map((span) => {
            const left = ((span.start_time - minStart) / Math.max(1, totalDuration)) * 100
            const width = Math.max(0.5, (span.duration / Math.max(1, totalDuration)) * 100)
            const isError = !!span.attributes['error'] || Number(span.attributes['http.status_code']) >= 500
            const svcName = String(span.attributes['service.name'] || 'unknown')
            
            const isDb = !!span.attributes['db.system'] || !!span.attributes['db.statement'] || svcName.includes('db')
            const barColor = isError ? 'bg-red-500' : isDb ? 'bg-emerald-400' : 'bg-indigo-400'

            return (
              <tr key={span.span_id} className="border-b border-slate-100 dark:border-white/[0.03] last:border-0 hover:bg-slate-400/5 group/row">
                <td className="pl-10 pr-4 py-2">
                  <div className="flex items-center gap-2.5">
                    <ChevronRight size={8} className="text-slate-300 group-hover/row:text-slate-400" />
                    <div className={`w-2 h-2 rounded-sm ${barColor} shadow-sm ${isError ? 'anim-pulse' : 'opacity-80'}`} />
                    <span className={`text-[10px] font-mono font-bold truncate max-w-[200px] ${isError ? 'text-red-500' : 'text-slate-600 dark:text-slate-300'}`}>
                      {span.name}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <span className="text-[9px] font-mono text-slate-400">{span.span_id.substring(0, 8)}</span>
                </td>
                <td className="px-3 py-2">
                  <div className="w-full h-1.5 bg-slate-200/40 dark:bg-white/[0.03] rounded-sm relative overflow-hidden">
                    <div 
                      className={`absolute top-0 bottom-0 ${barColor} rounded-sm opacity-50`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                    />
                  </div>
                </td>
                <td className="px-3 py-2 text-right">
                  <span className={`text-[9px] font-mono font-bold ${isError ? 'text-red-500' : isDb ? 'text-emerald-500/80' : 'text-slate-500'}`}>
                    {fmtMs(span.duration)}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <span className="text-[9px] font-mono text-slate-400 uppercase">
                    {fmtDateTime(span.start_time).split(' ')[1]}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function TracePreviewList({ service, name, from, to }: { service: string, name: string, from: number, to: number }) {
  const [offset, setOffset] = useState(0)
  const [expandedTrace, setExpandedTrace] = useState<string | null>(null)
  const LIMIT = 5

  const { data, isFetching } = useQuery({
    queryKey: ['apm_trace_list', service, name, from, to, offset],
    queryFn: () => api.traces({ service, name, from, to, limit: LIMIT, offset }),
    refetchInterval: 60_000,
  })

  const results = data?.data ?? []
  const count = data?.count ?? 0

  return (
    <div>
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <Layers size={12} className="text-slate-400" />
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Trace Samples</h4>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tight">{count} samples</span>
          <div className="flex items-center gap-0.5">
            <button
              disabled={offset === 0}
              onClick={(e) => { e.stopPropagation(); setOffset(Math.max(0, offset - LIMIT)) }}
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-white/[0.05] disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={12} />
            </button>
            <button
              disabled={offset + LIMIT >= count}
              onClick={(e) => { e.stopPropagation(); setOffset(offset + LIMIT) }}
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-white/[0.05] disabled:opacity-30 transition-colors"
            >
              <ChevronRight size={12} />
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {isFetching && results.length === 0 ? (
          <div className="p-6 text-center text-[10px] text-slate-400 bg-white dark:bg-black/10 rounded-lg border border-slate-100 dark:border-white/[0.05]">Loading traces...</div>
        ) : results.length === 0 ? (
          <div className="p-6 text-center text-[10px] text-slate-400 rounded-lg border border-dashed border-slate-200 dark:border-white/[0.1]">
            No trace samples found.
          </div>
        ) : (
          (results as any[]).map((trace: any) => {
            const isExpanded = expandedTrace === trace.trace_id
            return (
              <div
                key={trace.trace_id + trace.span_id}
                className={`group rounded-lg border transition-all ${
                  isExpanded 
                    ? 'border-indigo-400/50 bg-indigo-500/[0.01] shadow-sm' 
                    : 'border-slate-100 dark:border-white/[0.04] bg-white dark:bg-black/20 hover:border-indigo-200 dark:hover:border-indigo-500/20'
                }`}
              >
                <div 
                  className="flex items-center justify-between p-3 cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); setExpandedTrace(isExpanded ? null : trace.trace_id) }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex items-center gap-1 font-mono">
                      {isExpanded ? <ChevronDown size={10} className="text-indigo-500" strokeWidth={3} /> : <ChevronRight size={10} className="text-slate-400" />}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <span className="text-[10px] font-mono font-bold text-slate-500 tracking-tighter uppercase px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/[0.04]">
                          {String(trace.trace_id).substring(0, 16)}...
                        </span>
                        {(trace.attributes?.['error'] || Number(trace.attributes?.['http.status_code']) >= 500) && (
                          <span className="absolute -top-1.5 -right-1.5 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-white dark:border-[#1a1d27] shadow-sm shadow-red-500/50 anim-pulse" />
                        )}
                      </div>
                      {trace.attributes?.['http.method'] && (
                        <span className="text-[9px] font-bold text-slate-400 bg-slate-50 dark:bg-black/20 px-1 py-0.5 rounded border border-slate-100 dark:border-white/[0.02]">
                          {String(trace.attributes['http.method'])}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="hidden sm:flex items-center gap-6 shrink-0">
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <Hash size={10} className="opacity-40" />
                      <span className="text-[10px] font-bold">?</span>
                    </div>
                    <div className="flex items-center gap-1.5 min-w-[60px] justify-end">
                       <Clock size={10} className="text-indigo-400 opacity-60" />
                       <span className="text-xs font-mono font-bold text-indigo-500/80">{fmtMs(trace.duration)}</span>
                    </div>
                    <div className="text-[9px] font-mono text-slate-400 min-w-[140px] text-right uppercase">
                      {fmtDateTime(trace.start_time).split(' ')[1]}
                    </div>
                  </div>
                </div>
                {isExpanded && <TraceTimeline traceId={trace.trace_id} />}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function OperationRow({ op, isSelected, onClick, from, to, service }: {
  op: ApmOperation; isSelected: boolean; onClick: () => void; from: number; to: number; service: string
}) {
  const errColor = op.errorRate > 0.1 ? 'text-red-500' : op.errorRate > 0 ? 'text-amber-500' : 'text-emerald-500'
  return (
    <>
      <tr
        onClick={onClick}
        className={`cursor-pointer border-b transition-colors ${
          isSelected
            ? 'bg-indigo-500/5 border-indigo-200 dark:border-indigo-500/30'
            : 'border-slate-100 dark:border-white/[0.04] hover:bg-slate-50 dark:hover:bg-white/[0.02]'
        }`}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 shrink-0">
              {isSelected ? <ChevronDown size={11} className="text-indigo-400" /> : <ChevronRight size={11} className="text-slate-400" />}
              <div className={`w-2 h-2 rounded-full ${op.errorRate > 0.1 ? 'bg-red-500 shadow-sm shadow-red-500/30 anim-pulse' : op.errorRate > 0 ? 'bg-amber-400' : 'bg-emerald-500/80 shadow-sm shadow-emerald-500/20'}`} />
            </div>
            <span className={`text-[11px] font-mono font-bold truncate max-w-[240px] transition-colors ${isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-800 dark:text-slate-200'}`}>
              {op.name}
            </span>
          </div>
        </td>
        <td className="px-4 py-3 text-right text-xs font-medium text-slate-700 dark:text-slate-300">{fmtNum(op.requests)}</td>
        <td className={`px-4 py-3 text-right text-xs font-medium ${errColor}`}>{fmtPct(op.errorRate)}</td>
        <td className="px-4 py-3 text-right text-xs font-mono text-slate-500">{fmtMs(op.p50)}</td>
        <td className="px-4 py-3 text-right text-xs font-mono text-slate-500">{fmtMs(op.p95)}</td>
        <td className="px-4 py-3 text-right text-xs font-mono text-amber-500 font-semibold">{fmtMs(op.p99)}</td>
        <td className="px-4 py-3 text-right text-xs font-mono text-slate-400">{fmtMs(op.avgLatency)}</td>
      </tr>
      {isSelected && (
        <tr className="bg-slate-50/50 dark:bg-white/[0.01]">
          <td colSpan={7} className="px-8 py-6 border-b border-indigo-100 dark:border-indigo-500/10">
            <div className="animate-in slide-in-from-top-2 duration-300">
              <TracePreviewList service={service} name={op.name} from={from} to={to} />
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function ServiceCard({ svc, isSelected, onSelect }: {
  svc: ApmService; isSelected: boolean; onSelect: () => void
}) {
  const errPct = svc.errorRate * 100
  const errColor = errPct > 10 ? 'text-red-500' : errPct > 0 ? 'text-amber-500' : 'text-emerald-500'
  const errBg = errPct > 10 ? 'bg-red-500' : errPct > 0 ? 'bg-amber-500' : 'bg-emerald-500'

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-xl border transition-all duration-200 p-4 ${
        isSelected
          ? 'border-indigo-400 bg-indigo-500/10 shadow-indigo-500/10 shadow-lg'
          : 'border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1a1d27] hover:border-indigo-300 dark:hover:border-indigo-500/40 hover:shadow-md'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${errBg} shrink-0 mt-0.5`} />
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{svc.service}</span>
        </div>
        {isSelected && <ArrowRight size={14} className="text-indigo-400 shrink-0" />}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">Requests</p>
          <p className="text-sm font-bold text-slate-900 dark:text-white">{fmtNum(svc.requests)}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">Error Rate</p>
          <p className={`text-sm font-bold ${errColor}`}>{fmtPct(svc.errorRate)}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">p99</p>
          <p className="text-sm font-bold text-amber-500">{fmtMs(svc.p99)}</p>
        </div>
      </div>
    </button>
  )
}

const customTooltipStyle = {
  backgroundColor: '#1a1d27',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 8,
  fontSize: 11,
  color: '#cbd5e1',
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function ApmPage() {
  const [rangeIdx, setRangeIdx] = useState(0)
  const [selectedSvc, setSelectedSvc] = useState<ApmService | null>(null)
  const [selectedOp, setSelectedOp] = useState<string | null>(null)

  const range = TIME_RANGES[rangeIdx]
  
  // Quantize "now" to the nearest 10 seconds to prevent the infinite loop 
  // caused by millisecond-accuracy query keys
  const nowQuantized = Math.floor(Date.now() / 10000) * 10000
  const from = nowQuantized - range.ms
  const to   = nowQuantized

  const { data: svcData, isFetching: svcFetching, refetch: refetchSvc } = useQuery({
    queryKey: ['apm_services', rangeIdx, from, to],
    queryFn: () => api.apmServices({ from, to }),
    refetchInterval: 30_000,
    retry: false,
  })

  const { data: histData, isFetching: histFetching } = useQuery({
    queryKey: ['apm_histogram', selectedSvc?.service, from, to],
    queryFn: () => api.apmHistogram({ service: selectedSvc?.service, from, to }),
    refetchInterval: 30_000,
    retry: false,
  })

  const services = svcData?.services ?? []
  const displaySvc = selectedSvc ?? services[0] ?? null

  // Totals
  const totalRequests = services.reduce((s, v) => s + v.requests, 0)
  const totalErrors   = services.reduce((s, v) => s + v.errors, 0)
  const overallP99    = services.length > 0 ? Math.max(...services.map(s => s.p99)) : 0
  const overallAvg    = services.length > 0 ? services.reduce((s, v) => s + v.avgLatency * v.requests, 0) / Math.max(1, totalRequests) : 0

  // Request/error time series
  const timeSeriesData = useMemo(() => {
    if (!histData) return []
    return histData.times.map((t, i) => ({
      time: fmtTime(t),
      requests: histData.requests[i],
      errors: histData.errors[i],
    }))
  }, [histData])

  const latencyHistData = useMemo(() => histData?.latencyHistogram ?? [], [histData])

  const operations = displaySvc?.operations ?? []

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0a0b0f] overflow-y-auto transition-colors duration-200">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-white/90 dark:bg-[#0f1117]/95 backdrop-blur border-b border-slate-200 dark:border-white/[0.06] px-6 py-4 flex items-center gap-4">
        <div className="flex items-center gap-3 flex-1">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
            <Activity size={16} className="text-indigo-500" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 dark:text-white leading-tight">APM</h1>
            <p className="text-xs text-slate-500">Application Performance Monitoring</p>
          </div>
        </div>

        {/* Time range */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-white/[0.06] rounded-lg p-1">
          {TIME_RANGES.map((r, i) => (
            <button
              key={r.label}
              onClick={() => setRangeIdx(i)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                rangeIdx === i
                  ? 'bg-white dark:bg-indigo-600 text-indigo-600 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => refetchSvc()}
          disabled={svcFetching}
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors text-slate-500"
        >
          <RefreshCw size={14} className={svcFetching ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="p-6 space-y-6">

        {/* ── Top Stats ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Requests" value={fmtNum(totalRequests)} sub={`Last ${range.label}`} color="indigo" icon={TrendingUp} />
          <StatCard label="Total Errors" value={fmtNum(totalErrors)}
            sub={totalRequests > 0 ? `${fmtPct(totalErrors / totalRequests)} error rate` : 'No errors'}
            color={totalErrors > 0 ? 'red' : 'emerald'} icon={AlertTriangle} />
          <StatCard label="Avg Latency" value={fmtMs(overallAvg)} sub="Across all services" color="amber" icon={Clock} />
          <StatCard label="p99 Latency" value={fmtMs(overallP99)} sub="Worst-case response" color="indigo" icon={Zap} />
        </div>

        {/* ── Charts Row ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Requests + Errors timeline */}
          <div className="lg:col-span-2 bg-white dark:bg-[#1a1d27] rounded-xl border border-slate-200 dark:border-white/[0.08] shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Requests over Time</p>
                {displaySvc && <p className="text-xs text-indigo-400 mt-0.5">{displaySvc.service}</p>}
              </div>
              {histFetching && <div className="w-3 h-3 border border-indigo-500 border-t-transparent rounded-full animate-spin" />}
            </div>
            {timeSeriesData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={timeSeriesData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                  <defs>
                    <linearGradient id="reqGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="errGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={customTooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="requests" name="Requests" stroke="#6366f1" fill="url(#reqGrad)" strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="errors" name="Errors" stroke="#ef4444" fill="url(#errGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[180px] flex items-center justify-center text-slate-400 text-sm">
                No trace data in this time range. Send traces to see APM data.
              </div>
            )}
          </div>

          {/* Latency Distribution */}
          <div className="bg-white dark:bg-[#1a1d27] rounded-xl border border-slate-200 dark:border-white/[0.08] shadow-sm p-5">
            <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-4">Latency Distribution</p>
            {latencyHistData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={latencyHistData} margin={{ top: 4, right: 0, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="bucket" tickFormatter={v => `${v}ms`} tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false} interval={4} />
                  <YAxis tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={customTooltipStyle}
                    formatter={(v, _, props) => [v, `${props.payload.bucket}–${props.payload.bucket + 50}ms`]}
                  />
                  <Bar dataKey="count" name="Spans" fill="#6366f1" radius={[2, 2, 0, 0]} opacity={0.85} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[180px] flex items-center justify-center text-slate-400 text-sm">No data</div>
            )}
          </div>
        </div>

        {/* ── Services + Operations ─────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">

          {/* Service List */}
          <div className="lg:col-span-1 space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <Server size={14} className="text-slate-500" />
              <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Services</span>
              <span className="ml-auto text-xs text-slate-400">{services.length}</span>
            </div>
            {services.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-6 text-center text-slate-400 text-xs">
                No services detected. Send traces with a <code className="font-mono">service.name</code> attribute.
              </div>
            ) : (
              services.map(svc => (
                <ServiceCard
                  key={svc.service}
                  svc={svc}
                  isSelected={displaySvc?.service === svc.service}
                  onSelect={() => { setSelectedSvc(svc); setSelectedOp(null) }}
                />
              ))
            )}
          </div>

          {/* Operations Table */}
          <div className="lg:col-span-3 bg-white dark:bg-[#1a1d27] rounded-xl border border-slate-200 dark:border-white/[0.08] shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-white/[0.05] flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {displaySvc ? displaySvc.service : 'Operations'}
                </p>
                {displaySvc && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    {displaySvc.requests} requests · {fmtPct(displaySvc.errorRate)} error rate · avg {fmtMs(displaySvc.avgLatency)}
                  </p>
                )}
              </div>
              {displaySvc && (
                <div className="flex items-center gap-3">
                  {[
                    { label: 'p50', value: displaySvc.p50, color: 'text-emerald-500' },
                    { label: 'p95', value: displaySvc.p95, color: 'text-amber-500' },
                    { label: 'p99', value: displaySvc.p99, color: 'text-red-500' },
                  ].map(p => (
                    <div key={p.label} className="text-center">
                      <p className="text-[10px] text-slate-500 uppercase">{p.label}</p>
                      <p className={`text-sm font-bold font-mono ${p.color}`}>{fmtMs(p.value)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {operations.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-white/[0.05] bg-slate-50/60 dark:bg-black/20">
                      {['Operation', 'Requests', 'Error Rate', 'p50', 'p95', 'p99', 'Avg'].map(h => (
                        <th key={h} className={`px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest ${h !== 'Operation' ? 'text-right' : ''}`}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {operations.map(op => (
                      <OperationRow
                        key={op.name}
                        op={op}
                        isSelected={selectedOp === op.name}
                        onClick={() => setSelectedOp(o => o === op.name ? null : op.name)}
                        from={from}
                        to={to}
                        service={displaySvc?.service || 'unknown'}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-10 text-center text-slate-400 text-sm">
                {services.length === 0
                  ? 'Send traces from your services to populate this view.'
                  : 'Select a service to view its operation breakdown.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
