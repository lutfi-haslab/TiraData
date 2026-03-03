import { createFileRoute } from '@tanstack/react-router'
import { useState, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import { api, type SqlQueryResult } from '../utils/api'
import { fmtDuration } from '../utils/format'
import { Play, Copy, CheckCheck } from 'lucide-react'

export const Route = createFileRoute('/query')({
  component: SqlEditor,
})

const DEFAULT_SQL = `-- Query any table: logs, metrics, traces
SELECT level, service, COUNT(*) AS count
FROM   logs
GROUP  BY level, service
ORDER  BY count DESC
LIMIT  20;`

const EXAMPLE_QUERIES = [
  { label: 'Error counts by service', sql: "SELECT service, COUNT(*) AS errors FROM logs WHERE level = 'error' GROUP BY service ORDER BY errors DESC LIMIT 20;" },
  { label: 'Recent logs',             sql: 'SELECT timestamp, level, service, message FROM logs ORDER BY timestamp DESC LIMIT 50;' },
  { label: 'Metric series',           sql: 'SELECT DISTINCT name FROM metrics ORDER BY name;' },
  { label: 'Slowest spans',           sql: 'SELECT name, trace_id, duration FROM traces ORDER BY duration DESC LIMIT 20;' },
  { label: 'Log volume per hour',     sql: "SELECT (timestamp / 3600000) * 3600000 AS hour, COUNT(*) AS n FROM logs GROUP BY hour ORDER BY hour DESC LIMIT 24;" },
]

function SqlEditor() {
  const [sql,       setSql]       = useState(DEFAULT_SQL)
  const [result,    setResult]    = useState<SqlQueryResult | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [copied,    setCopied]    = useState(false)

  const runQuery = useCallback(async () => {
    if (!sql.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.sqlQuery(sql)
      if (res.error) { setError(res.error); setResult(null) }
      else            setResult(res)
    } catch (err) {
      setError((err as Error).message)
      setResult(null)
    } finally {
      setLoading(false)
    }
  }, [sql])

  const copyResult = useCallback(() => {
    if (!result) return
    const header = result.columns.join('\t')
    const rows   = result.rows.map((r) => r.join('\t')).join('\n')
    navigator.clipboard.writeText(`${header}\n${rows}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [result])

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">SQL Editor</h1>
      </div>

      <div className="page-body fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Example queries */}
        <div className="filter-row">
          {EXAMPLE_QUERIES.map((ex) => (
            <button
              key={ex.label}
              className="btn btn-ghost"
              style={{ fontSize: 11 }}
              onClick={() => setSql(ex.sql)}
            >
              {ex.label}
            </button>
          ))}
        </div>

        {/* Editor */}
        <div className="editor-wrap">
          <div className="editor-toolbar">
            <span className="editor-label">SQL</span>
            <button
              id="sql-run-btn"
              className="btn btn-primary"
              onClick={runQuery}
              disabled={loading}
              style={{ fontSize: 12, padding: '5px 12px' }}
            >
              <Play size={12} />
              {loading ? 'Running…' : 'Run  ⌘↵'}
            </button>
          </div>

          <Editor
            height="220px"
            language="sql"
            value={sql}
            onChange={(v) => setSql(v ?? '')}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              padding: { top: 12 },
              fontFamily: 'JetBrains Mono, Fira Code, monospace',
            }}
            onMount={(editor, monaco) => {
              // Ctrl/Cmd+Enter → run
              editor.addCommand(
                monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
                () => runQuery()
              )
            }}
          />
        </div>

        {/* Error */}
        {error && <div className="error-box">{error}</div>}

        {/* Results */}
        {result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Result meta */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                {result.rowCount} row{result.rowCount !== 1 ? 's' : ''} · {fmtDuration(result.durationMs)}
              </span>
              <button
                id="sql-copy-btn"
                className="btn btn-ghost"
                style={{ marginLeft: 'auto', fontSize: 11 }}
                onClick={copyResult}
              >
                {copied ? <CheckCheck size={12} color="var(--color-success)" /> : <Copy size={12} />}
                {copied ? 'Copied!' : 'Copy TSV'}
              </button>
            </div>

            {/* Table */}
            <div className="data-table-wrap" style={{ maxHeight: 420, overflow: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    {result.columns.map((col) => (
                      <th key={col}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci}>
                          {cell == null
                            ? <span style={{ color: 'var(--color-text-muted)' }}>NULL</span>
                            : String(cell)
                          }
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
