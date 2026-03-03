import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { api } from '../utils/api'
import { fmtTimeShort, fmtCount } from '../utils/format'

export const Route = createFileRoute('/metrics')({
  component: MetricsPage,
})

// Distinct chart colours for up to 8 series
const PALETTE = [
  '#6366f1', '#22c55e', '#f59e0b', '#ef4444',
  '#38bdf8', '#a78bfa', '#f97316', '#e879f9',
]

function MetricsPage() {
  const [selectedName, setSelectedName] = useState('')

  const { data: namesData } = useQuery({
    queryKey: ['metric-names'],
    queryFn: api.metricNames,
    refetchInterval: 15_000,
  })

  const names: string[] = namesData?.data ?? []

  const { data, isFetching, isError } = useQuery({
    queryKey: ['metrics', selectedName],
    queryFn: () => api.metrics({
      name: selectedName || undefined,
      limit: 1000,
    }),
    refetchInterval: 10_000,
  })

  // Group by series name, build recharts-friendly data
  const chartData = useMemo(() => {
    const raw = data?.data ?? []
    if (raw.length === 0) return { points: [], seriesNames: [] }

    // Determine unique series (name + label key)
    const seriesNameSet = new Set(raw.map((m) => m.name))
    const seriesNames = [...seriesNameSet]

    // Build time-indexed map
    const byTs: Record<number, Record<string, number>> = {}
    for (const m of raw) {
      if (!byTs[m.timestamp]) byTs[m.timestamp] = { ts: m.timestamp }
      byTs[m.timestamp][m.name] = m.value
    }

    const points = Object.values(byTs).sort((a, b) => (a.ts as number) - (b.ts as number))
    return { points, seriesNames }
  }, [data])

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Metrics</h1>
      </div>

      <div className="page-body fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Filter */}
        <div className="filter-row">
          <select
            id="metric-name-select"
            className="input select"
            value={selectedName}
            onChange={(e) => setSelectedName(e.target.value)}
            style={{ maxWidth: 260 }}
          >
            <option value="">All series</option>
            {names.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>

          <span style={{ fontSize: 12, color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
            {isFetching ? 'Refreshing…' : `${fmtCount(data?.count ?? 0)} data points`}
          </span>
        </div>

        {isError && (
          <div className="error-box">Failed to load metrics.</div>
        )}

        {/* Chart */}
        {chartData.points.length > 0 ? (
          <div className="card">
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={chartData.points} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="ts"
                  tickFormatter={(ts: number) => fmtTimeShort(ts)}
                  tick={{ fontSize: 11 }}
                  minTickGap={60}
                />
                <YAxis tick={{ fontSize: 11 }} width={60} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    return (
                      <div style={{
                        background: 'var(--color-bg-elevated)',
                        border: '1px solid var(--color-border-strong)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '8px 12px',
                        fontSize: 12,
                      }}>
                        <div style={{ color: 'var(--color-text-muted)', marginBottom: 6 }}>
                          {fmtTimeShort(Number(label))}
                        </div>
                        {payload.map((p) => (
                          <div key={p.name} style={{ color: p.color as string }}>
                            {p.name}: {Number(p.value).toFixed(3)}
                          </div>
                        ))}
                      </div>
                    )
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {chartData.seriesNames.map((name, i) => (
                  <Line
                    key={name}
                    type="monotone"
                    dataKey={name}
                    stroke={PALETTE[i % PALETTE.length]}
                    dot={false}
                    strokeWidth={1.8}
                    isAnimationActive={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          !isFetching && (
            <div className="empty-state">
              <BarChartIcon />
              <div>No metric data yet.</div>
              <div style={{ fontSize: 11 }}>
                POST to <code style={{ fontFamily: 'var(--font-mono)' }}>/api/ingest/metric</code>
              </div>
            </div>
          )
        )}

        {/* Raw table */}
        {(data?.data?.length ?? 0) > 0 && (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Name</th>
                  <th>Value</th>
                  <th>Labels</th>
                </tr>
              </thead>
              <tbody>
                {(data?.data ?? []).slice(0, 200).map((m, i) => (
                  <tr key={i}>
                    <td>{new Date(m.timestamp).toISOString()}</td>
                    <td style={{ color: 'var(--color-accent-hover)' }}>{m.name}</td>
                    <td style={{ color: 'var(--color-success)' }}>{m.value}</td>
                    <td>{JSON.stringify(m.labels)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

function BarChartIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
    </svg>
  )
}
