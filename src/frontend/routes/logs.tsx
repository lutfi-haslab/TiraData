import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type LogEntry, type LogLevel } from '../utils/api'
import { fmtTime, fmtAttrs } from '../utils/format'
import { RefreshCw } from 'lucide-react'

export const Route = createFileRoute('/logs')({
  component: LogExplorer,
})

const LEVELS: Array<LogLevel | ''> = ['', 'debug', 'info', 'warn', 'error', 'fatal']

const LEVEL_BADGE: Record<LogLevel, string> = {
  debug: 'badge-debug',
  info:  'badge-info',
  warn:  'badge-warn',
  error: 'badge-error',
  fatal: 'badge-fatal',
}

function LevelBadge({ level }: { level: LogLevel }) {
  return (
    <span className={`badge ${LEVEL_BADGE[level]}`}>{level}</span>
  )
}

function LogExplorer() {
  const [service, setService] = useState('')
  const [level,   setLevel]   = useState<LogLevel | ''>('')
  const [limit,   setLimit]   = useState(100)

  // Current filter params; keyed so a refetch is triggered when they change
  const params = { service: service || undefined, level: level || undefined, limit }

  const { data, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['logs', params],
    queryFn: () => api.logs(params),
    refetchInterval: 10_000,
  })

  const logs: LogEntry[] = data?.data ?? []

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Log Explorer</h1>
      </div>

      <div className="page-body fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Filters */}
        <div className="filter-row">
          <input
            id="log-filter-service"
            className="input"
            placeholder="Service name…"
            value={service}
            onChange={(e) => setService(e.target.value)}
            style={{ maxWidth: 200 }}
          />

          <select
            id="log-filter-level"
            className="input select"
            value={level}
            onChange={(e) => setLevel(e.target.value as LogLevel | '')}
            style={{ maxWidth: 130 }}
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>{l === '' ? 'All levels' : l}</option>
            ))}
          </select>

          <select
            id="log-filter-limit"
            className="input select"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            style={{ maxWidth: 110 }}
          >
            {[50, 100, 200, 500].map((n) => (
              <option key={n} value={n}>{n} rows</option>
            ))}
          </select>

          <button
            id="log-refresh-btn"
            className="btn btn-ghost"
            onClick={() => refetch()}
            disabled={isFetching}
            style={{ marginLeft: 'auto' }}
          >
            <RefreshCw size={13} className={isFetching ? 'spinner' : ''} style={isFetching ? { border: 'none', background: 'none', animation: 'spin 0.7s linear infinite' } : {}} />
            Refresh
          </button>
        </div>

        {/* Results summary */}
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
          {isFetching ? 'Loading…' : `${logs.length} records`}
        </div>

        {isError && (
          <div className="error-box">{(error as Error).message}</div>
        )}

        {/* Table */}
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Level</th>
                <th>Service</th>
                <th>Message</th>
                <th>Attributes</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && !isFetching && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>
                    No logs found. Try adjusting filters or ingest some data.
                  </td>
                </tr>
              )}
              {logs.map((log) => (
                <tr key={log.id}>
                  <td style={{ color: 'var(--color-text-muted)' }}>{fmtTime(log.timestamp)}</td>
                  <td><LevelBadge level={log.level} /></td>
                  <td style={{ color: 'var(--color-info)' }}>{log.service}</td>
                  <td style={{ maxWidth: 500, color: 'var(--color-text-primary)' }}>{log.message}</td>
                  <td style={{ color: 'var(--color-text-muted)' }}>{fmtAttrs(log.attributes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
