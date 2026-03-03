import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { api, type SystemStats } from '../utils/api'
import { fmtCount, fmtUptime } from '../utils/format'
import {
  ScrollText, BarChart2, GitFork, Activity,
  Clock, Layers, TrendingUp,
} from 'lucide-react'

export const Route = createFileRoute('/')({
  component: Dashboard,
})

function StatCard({
  label,
  value,
  sub,
  Icon,
  accent = false,
}: {
  label: string
  value: string
  sub?: string
  Icon: React.ElementType
  accent?: boolean
}) {
  return (
    <div className="card" style={{ position: 'relative', overflow: 'hidden' }}>
      {accent && (
        <div style={{
          position: 'absolute', top: 0, right: 0,
          width: 64, height: 64, borderRadius: '0 0 0 64px',
          background: 'var(--color-accent-glow)',
        }} />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 'var(--radius-sm)',
          background: 'var(--color-accent-muted)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={14} color="var(--color-accent-hover)" strokeWidth={2} />
        </div>
        <span className="card-title" style={{ margin: 0 }}>{label}</span>
      </div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

function QueueCard({ stats }: { stats: SystemStats }) {
  const pct = Math.round(stats.queue.utilization * 100)
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 'var(--radius-sm)',
            background: 'var(--color-accent-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Layers size={14} color="var(--color-accent-hover)" strokeWidth={2} />
          </div>
          <span className="card-title" style={{ margin: 0 }}>Queue</span>
        </div>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
          {pct}% full
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="stat-value">{fmtCount(stats.queue.size)}</span>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)', alignSelf: 'flex-end' }}>
          / {fmtCount(stats.queue.capacity)} cap
        </span>
      </div>
      <div className="progress-track">
        <div
          className="progress-fill"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function Dashboard() {
  const { data: stats, isLoading, isError } = useQuery({
    queryKey: ['stats'],
    queryFn: api.stats,
    refetchInterval: 5_000,
  })

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
      </div>

      <div className="page-body fade-in">
        {isLoading && (
          <div className="empty-state"><div className="spinner" /></div>
        )}

        {isError && (
          <div className="error-box">
            Unable to reach backend. Start it with <code>bun run dev:backend</code>
          </div>
        )}

        {stats && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Stat grid */}
            <div className="grid-stats">
              <StatCard
                label="Total Logs"
                value={fmtCount(stats.logs.total)}
                sub={`${fmtCount(stats.logs.last_1h)} in last hour`}
                Icon={ScrollText}
                accent
              />
              <StatCard
                label="Total Metrics"
                value={fmtCount(stats.metrics.total)}
                sub={`${stats.metrics.series} unique series`}
                Icon={BarChart2}
              />
              <StatCard
                label="Total Traces"
                value={fmtCount(stats.traces.total)}
                Icon={GitFork}
              />
              <StatCard
                label="Uptime"
                value={fmtUptime(stats.uptime_s)}
                Icon={Clock}
              />
            </div>

            <div className="grid-2">
              <QueueCard stats={stats} />

              {/* Tips card */}
              <div className="card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-accent-muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <TrendingUp size={14} color="var(--color-accent-hover)" strokeWidth={2} />
                  </div>
                  <span className="card-title" style={{ margin: 0 }}>Quick Ingest</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 10 }}>
                  Send data via the HTTP API:
                </p>
                <pre style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--color-text-secondary)',
                  background: 'var(--color-bg-elevated)',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  lineHeight: 1.8,
                  overflowX: 'auto',
                }}>
{`curl -s -X POST http://localhost:3000/api/ingest/log \\
  -H 'Content-Type: application/json' \\
  -d '{"level":"info","service":"web","message":"hello"}'`}
                </pre>
              </div>
            </div>

            {/* Status row */}
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Activity size={14} color="var(--color-accent-hover)" />
                <span className="card-title" style={{ margin: 0 }}>System Status</span>
              </div>
              <div style={{ display: 'flex', gap: 32 }}>
                {[
                  { label: 'Storage', value: 'SQLite (WAL)', status: 'ok' },
                  { label: 'Queue Mode', value: 'In-Memory Ring Buffer', status: 'ok' },
                  { label: 'API', value: 'Hono (Bun)', status: 'ok' },
                ].map(({ label, value, status }) => (
                  <div key={label} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div className={`status-dot status-dot-${status === 'ok' ? 'green' : 'red'}`} />
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{label}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>
                        {value}
                      </div>
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
