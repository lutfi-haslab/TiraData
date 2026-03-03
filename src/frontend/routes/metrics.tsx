import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { api } from '../utils/api'
import { fmtTimeShort } from '../utils/format'
import { BarChart, ChevronLeft, ChevronRight, Activity, Search } from 'lucide-react'

export const Route = createFileRoute('/metrics')({ component: MetricsPage })

const PALETTE = ['#818cf8', '#34d399', '#fbbf24', '#f87171', '#38bdf8', '#e879f9', '#fb923c', '#a3e635']
const PAGE_SIZE = 50

function MetricsPage() {
  const [selectedName, setSelectedName] = useState('')
  const [page, setPage] = useState(0)

  const { data: namesData } = useQuery({
    queryKey: ['metric-names'],
    queryFn: api.metricNames,
    refetchInterval: 15_000,
  })
  const names: string[] = namesData?.data ?? []

  const { data, isFetching, isError } = useQuery({
    queryKey: ['metrics', selectedName, page],
    queryFn: () => api.metrics({ 
      name: selectedName || undefined, 
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE
    }),
    refetchInterval: 10_000,
  })

  // We fetch a larger batch for the chart if no specific name is selected, 
  // or we just use the current page's data for simplicity in this MVP.
  // Ideally, a separate query would fetch "all recent" for the chart.
  // For now, let's keep the chart showing what's in the current view.
  
  const chartData = useMemo(() => {
    const raw = data?.data ?? []
    if (raw.length === 0) return { points: [], seriesNames: [] }
    const seriesNames = [...new Set(raw.map(m => m.name))]
    const byTs: Record<number, Record<string, number>> = {}
    for (const m of raw) {
      if (!byTs[m.timestamp]) byTs[m.timestamp] = { ts: m.timestamp }
      byTs[m.timestamp][m.name] = m.value
    }
    const points = Object.values(byTs).sort((a, b) => (a.ts as number) - (b.ts as number))
    return { points, seriesNames }
  }, [data])

  const totalCount = data?.count ?? 0
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  const inputCls = 'bg-slate-100 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500/50 transition-all dark:bg-white/5 dark:border-white/10 dark:text-slate-200 dark:placeholder-slate-600'

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#0a0b0f] transition-colors duration-200">
      <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/80 backdrop-blur-sm sticky top-0 z-10 dark:border-white/5 dark:bg-[#0f1118]/50">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
          <BarChart size={18} className="text-indigo-600 dark:text-indigo-400" />
          Metrics
        </h1>
        
        <div className="flex items-center gap-3">
          <div className="relative group flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-indigo-500 transition-colors" />
            <select
              id="metric-name-select"
              className={`${inputCls} pl-9 w-full appearance-none`}
              value={selectedName}
              onChange={e => {
                setSelectedName(e.target.value)
                setPage(0)
              }}
            >
              <option value="" className="bg-white dark:bg-[#1a1d2e]">All metric series</option>
              {names.map(n => <option key={n} value={n} className="bg-white dark:bg-[#1a1d2e]">{n}</option>)}
            </select>
          </div>
          
          <span className="ml-auto text-xs text-slate-500">
            {isFetching ? 'Refreshing...' : `${totalCount} points available`}
          </span>
        </div>
      </div>

      <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-6 font-sans animate-fade-in">
        {isError && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
            <Activity size={16} />
            <span>Failed to load metrics.</span>
          </div>
        )}

        {/* Chart Card */}
        {chartData.points.length > 0 ? (
          <div className="rounded-xl bg-white border border-slate-200 p-5 shadow-sm dark:bg-[#13151f] dark:border-white/10 dark:shadow-2xl transition-colors">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Time Series Visualization</h2>
              <div className="flex items-center gap-4">
                {chartData.seriesNames.map((name, i) => (
                   <div key={name} className="flex items-center gap-1.5 grayscale opacity-70">
                      <div className="w-2 h-2 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">{name}</span>
                   </div>
                ))}
              </div>
            </div>
            
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData.points} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} className="dark:stroke-white/[0.03]" />
                  <XAxis
                    dataKey="ts"
                    tickFormatter={(ts: number) => fmtTimeShort(ts)}
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    minTickGap={60}
                    axisLine={{ stroke: 'rgba(0,0,0,0.05)' }}
                    className="dark:axis-line-white/[0.05]"
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null
                      return (
                        <div className="bg-white/90 backdrop-blur-md border border-slate-200 rounded-lg px-3 py-2 text-[11px] shadow-xl dark:bg-[#1e212e]/90 dark:border-white/10 dark:shadow-2xl ring-1 ring-black/5 dark:ring-black">
                          <div className="text-slate-500 mb-2 border-b border-slate-100 dark:border-white/5 pb-1 font-mono">{fmtTimeShort(Number(label))}</div>
                          <div className="flex flex-col gap-1">
                            {payload.map(p => (
                              <div key={p.name} className="flex items-center justify-between gap-6" style={{ color: p.color as string }}>
                                <span className="font-medium">{p.name}</span>
                                <span className="font-mono font-bold text-slate-700 dark:text-inherit">{Number(p.value).toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    }}
                  />
                  {chartData.seriesNames.map((name, i) => (
                    <Line
                      key={name}
                      type="monotone"
                      dataKey={name}
                      stroke={PALETTE[i % PALETTE.length]}
                      dot={false}
                      strokeWidth={2}
                      isAnimationActive={false}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          !isFetching && (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-slate-600 gap-4 border border-slate-200 dark:border-white/5 rounded-xl border-dashed">
              <BarChart size={32} opacity={0.2} />
              <div className="text-center text-xs">No data for chart. Check filters.</div>
            </div>
          )
        )}

        {(data?.data?.length ?? 0) > 0 && (
          <div className="flex flex-col gap-4 animate-fade-in">
             <div className="flex items-center justify-between px-1">
                <h2 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Recent Data Points</h2>
                
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

             <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm dark:border-white/10 dark:bg-[#12141c] dark:shadow-2xl transition-colors">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse border-spacing-0">
                    <thead className="bg-slate-50 border-b border-slate-100 dark:bg-black/30 dark:border-white/10">
                      <tr>
                        {['Timestamp', 'Metric Name', 'Value', 'Labels'].map(h => (
                          <th key={h} className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                      {(data?.data ?? []).map((m, i) => (
                        <tr key={i} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors group">
                          <td className="px-4 py-2.5 text-[11px] font-mono text-slate-400 dark:text-slate-500 whitespace-nowrap">
                            {new Date(m.timestamp).toISOString().replace('T', ' ').slice(0, 19)}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-indigo-600 dark:text-indigo-300 font-mono font-medium">
                            {m.name}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-emerald-600 dark:text-emerald-400 font-mono font-bold uppercase transition-colors">
                            {m.value}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="max-w-[200px] truncate">
                               <span className="text-[10px] font-mono text-slate-400 dark:text-slate-600 group-hover:text-slate-600 dark:group-hover:text-slate-500 transition-colors">
                                 {JSON.stringify(m.labels)}
                               </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
             </div>

             {/* Pagination Footer */}
             {totalPages > 1 && (
                <div className="mt-2 mb-4 flex items-center justify-center gap-4">
                  <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-400 shadow-sm disabled:opacity-30 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10 transition-colors duration-200"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  
                  <div className="text-[11px] text-slate-500 flex items-center gap-1 font-medium select-none">
                    <span className="text-slate-900 dark:text-slate-200 uppercase tracking-tighter">Page {page + 1}</span>
                    <span className="opacity-40">OF</span>
                    <span>{totalPages}</span>
                  </div>

                  <button
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-400 shadow-sm disabled:opacity-30 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10 transition-colors duration-200"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
             )}
          </div>
        )}
      </div>
    </div>
  )
}
