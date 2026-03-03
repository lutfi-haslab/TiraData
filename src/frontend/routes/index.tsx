import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { api, type SystemStats } from '../utils/api'
import { fmtCount, fmtUptime } from '../utils/format'
import { ScrollText, BarChart2, GitFork, Clock, Layers, TrendingUp, Activity } from 'lucide-react'

export const Route = createFileRoute('/')(({ component: Dashboard }))

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, Icon, accent = false }: {
  label: string; value: string; sub?: string
  Icon: React.ElementType; accent?: boolean
}) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-white border border-slate-200 p-5 dark:bg-[#13151f] dark:border-white/[0.08] transition-colors duration-200 shadow-sm dark:shadow-none">
      {accent && (
        <div className="absolute top-0 right-0 w-16 h-16 rounded-bl-full bg-indigo-500/5 dark:bg-indigo-500/10" />
      )}
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0 dark:bg-indigo-500/15">
          <Icon size={15} className="text-indigo-600 dark:text-indigo-400" strokeWidth={2} />
        </div>
        <span className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold">{label}</span>
      </div>
      <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">{value}</div>
      {sub && <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">{sub}</div>}
    </div>
  )
}

// ─── Queue Card ───────────────────────────────────────────────────────────────

function QueueCard({ stats }: { stats: SystemStats }) {
  const pct = Math.round(stats.queue.utilization * 100)
  return (
    <div className="rounded-xl bg-white border border-slate-200 p-5 dark:bg-[#13151f] dark:border-white/[0.08] transition-colors duration-200 shadow-sm dark:shadow-none">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0 dark:bg-indigo-500/15">
            <Layers size={15} className="text-indigo-600 dark:text-indigo-400" strokeWidth={2} />
          </div>
          <span className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold">Queue</span>
        </div>
        <span className="text-xs text-slate-400 dark:text-slate-500">{pct}% full</span>
      </div>
      <div className="flex items-end justify-between mb-3">
        <span className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">{fmtCount(stats.queue.size)}</span>
        <span className="text-xs text-slate-400 dark:text-slate-500">/ {fmtCount(stats.queue.capacity)} cap</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-white/[0.06] overflow-hidden">
        <div
          className="h-full rounded-full bg-indigo-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard() {
  const { data: stats, isLoading, isError } = useQuery({
    queryKey: ['stats'],
    queryFn: api.stats,
    refetchInterval: 5_000,
  })

  return (
    <>
      <div className="px-6 pt-6 pb-4 border-b border-slate-200 dark:border-white/[0.06] transition-colors duration-200">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Dashboard</h1>
      </div>

      <div className="p-6 animate-fade-in flex flex-col gap-5">
        {isLoading && (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full" style={{ animation: 'spin 0.7s linear infinite' }} />
          </div>
        )}

        {isError && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3">
            Unable to reach backend. Start it with <code className="font-mono">bun run dev:backend</code>
          </div>
        )}

        {stats && (
          <div className="flex flex-col gap-5">
            {/* Stat grid */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <StatCard label="Total Logs"    value={fmtCount(stats.logs.total)}    sub={`${fmtCount(stats.logs.last_1h)} in last hour`} Icon={ScrollText} accent />
              <StatCard label="Total Metrics" value={fmtCount(stats.metrics.total)} sub={`${stats.metrics.series} unique series`}         Icon={BarChart2} />
              <StatCard label="Total Traces"  value={fmtCount(stats.traces.total)}  Icon={GitFork} />
              <StatCard label="Uptime"        value={fmtUptime(stats.uptime_s)}     Icon={Clock} />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <QueueCard stats={stats} />

              {/* Quick ingest */}
              <div className="rounded-xl bg-white border border-slate-200 p-5 dark:bg-[#13151f] dark:border-white/[0.08] transition-colors duration-200 shadow-sm dark:shadow-none">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0 dark:bg-indigo-500/15">
                    <TrendingUp size={15} className="text-indigo-600 dark:text-indigo-400" strokeWidth={2} />
                  </div>
                  <span className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold">Quick Ingest</span>
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">Send data via the HTTP API:</p>
                <pre className="text-[11px] font-mono text-slate-700 bg-slate-50 rounded-lg px-3 py-2.5 leading-relaxed overflow-x-auto border border-slate-200 dark:text-slate-300 dark:bg-black/30 dark:border-white/[0.05]">
{`curl -X POST http://localhost:3000/api/ingest/log \\
  -H 'Content-Type: application/json' \\
  -d '{"level":"info","service":"web","message":"hello"}'`}
                </pre>
              </div>
            </div>

            {/* System status */}
            <div className="rounded-xl bg-white border border-slate-200 p-5 dark:bg-[#13151f] dark:border-white/[0.08] transition-colors duration-200 shadow-sm dark:shadow-none">
              <div className="flex items-center gap-2 mb-4">
                <Activity size={14} className="text-indigo-600 dark:text-indigo-400" />
                <span className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold">System Status</span>
              </div>
              <div className="flex gap-8">
                {[
                  { label: 'Storage',    value: 'SQLite (WAL)' },
                  { label: 'Queue',      value: 'In-Memory Ring Buffer' },
                  { label: 'API',        value: 'Hono (Bun)' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center gap-2.5">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 shrink-0" />
                    <div>
                      <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wide">{label}</div>
                      <div className="text-[12px] text-slate-900 dark:text-slate-200 font-mono transition-colors">{value}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
