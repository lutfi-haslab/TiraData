import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type LogEntry, type LogLevel } from '../utils/api'
import { fmtTime, fmtAttrs } from '../utils/format'
import { RefreshCw, Search, ListFilter, ChevronLeft, ChevronRight, ScrollText } from 'lucide-react'

export const Route = createFileRoute('/logs')({ component: LogExplorer })

const LEVELS: Array<LogLevel | ''> = ['', 'debug', 'info', 'warn', 'error', 'fatal']
const PAGE_SIZE = 50

const LEVEL_STYLE: Record<LogLevel, string> = {
  debug: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  info:  'bg-sky-500/10 text-sky-400 border-sky-500/20',
  warn:  'bg-amber-500/10 text-amber-400 border-amber-500/20',
  error: 'bg-red-500/10 text-red-400 border-red-500/20',
  fatal: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
}

function LevelBadge({ level }: { level: LogLevel }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${LEVEL_STYLE[level]} dark:border-opacity-30`}>
      {level}
    </span>
  )
}

function LogExplorer() {
  const [service, setService] = useState('')
  const [level, setLevel] = useState<LogLevel | ''>('')
  const [page, setPage] = useState(0)

  const params = { 
    service: service || undefined, 
    level: level || undefined, 
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE
  }

  const { data, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['logs', params],
    queryFn: () => api.logs(params),
    refetchInterval: 10_000,
  })

  const logs: LogEntry[] = data?.data ?? []
  const totalCount = data?.count ?? 0
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  const inputCls = 'bg-slate-100 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500/50 transition-all dark:bg-white/5 dark:border-white/10 dark:text-slate-200 dark:placeholder-slate-600'

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#0a0b0f] transition-colors duration-200">
      <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/80 backdrop-blur-sm sticky top-0 z-10 dark:border-white/5 dark:bg-[#0f1118]/50">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
          <ScrollText size={18} className="text-indigo-600 dark:text-indigo-400" />
          Log Explorer
        </h1>
        
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative group">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-indigo-500 transition-colors" />
            <input
              className={`${inputCls} pl-9 w-48`}
              placeholder="Service..."
              value={service}
              onChange={e => {
                setService(e.target.value)
                setPage(0)
              }}
            />
          </div>

          <div className="relative group">
            <ListFilter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-indigo-500 transition-colors" />
            <select
              className={`${inputCls} pl-9 w-36 appearance-none`}
              value={level}
              onChange={e => {
                setLevel(e.target.value as LogLevel | '')
                setPage(0)
              }}
            >
              {LEVELS.map(l => (
                <option key={l} value={l} className="bg-[#1a1d2e]">{l === '' ? 'All Levels' : l}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-xs text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:border-white/20 transition-all disabled:opacity-50 ml-auto"
          >
            <RefreshCw size={13} className={isFetching ? 'animate-spin text-indigo-600 dark:text-indigo-400' : ''} />
            Refresh
          </button>
        </div>
      </div>

      <div className="p-6 overflow-y-auto flex-1 font-sans">
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="text-[11px] text-slate-600 uppercase tracking-widest font-bold">
            {isFetching ? 'Refreshing logs...' : `${totalCount} records matched`}
          </div>

          {/* Top Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1 px-2 rounded bg-slate-100 border border-slate-200 text-slate-400 disabled:opacity-20 hover:bg-slate-200 dark:bg-white/5 dark:border-white/10 dark:hover:bg-white/10 transition-all"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-[10px] text-slate-500 font-mono">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-1 px-2 rounded bg-slate-100 border border-slate-200 text-slate-400 disabled:opacity-20 hover:bg-slate-200 dark:bg-white/5 dark:border-white/10 dark:hover:bg-white/10 transition-all"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>

        {isError && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-6">
            {(error as Error).message}
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden animate-fade-in shadow-sm dark:border-white/10 dark:bg-[#12141c] dark:shadow-2xl transition-colors">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse border-spacing-0">
              <thead className="bg-slate-50 border-b border-slate-100 dark:bg-black/30 dark:border-white/5">
                <tr>
                  {['Timestamp', 'Level', 'Service', 'Message', 'Attributes'].map(h => (
                    <th key={h} className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                {logs.length === 0 && !isFetching && (
                  <tr>
                    <td colSpan={5} className="py-20 text-center">
                      <div className="flex flex-col items-center gap-2 text-slate-400 dark:text-slate-600 transition-colors">
                        <ScrollText size={32} opacity={0.2} />
                        <span className="text-sm">No matches found</span>
                      </div>
                    </td>
                  </tr>
                )}
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors group">
                    <td className="px-4 py-3 text-[11px] font-mono text-slate-400 dark:text-slate-500 whitespace-nowrap">
                      {fmtTime(log.timestamp)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <LevelBadge level={log.level} />
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-indigo-600 dark:text-indigo-400/80 whitespace-nowrap font-medium">
                      {log.service}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-200 max-w-lg truncate leading-relaxed transition-colors">
                      {log.message}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="max-w-[240px] truncate">
                         <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-400 transition-colors">
                           {fmtAttrs(log.attributes)}
                         </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-8 mb-4 flex items-center justify-center gap-4">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-400 shadow-sm disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10 transition-all duration-200"
            >
              <ChevronLeft size={16} />
            </button>
            
            <div className="text-xs text-slate-500 flex items-center gap-1 font-medium select-none">
              <span className="text-slate-900 dark:text-slate-200">Page {page + 1}</span>
              <span className="opacity-40">/</span>
              <span>{totalPages}</span>
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
