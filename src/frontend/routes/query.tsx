import { createFileRoute } from '@tanstack/react-router'
import { useState, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import { api, type SqlQueryResult } from '../utils/api'
import { fmtDuration } from '../utils/format'
import { Play, Copy, CheckCheck, Terminal, AlertCircle, Database } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'

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
  { label: 'Errors by service', sql: "SELECT service, COUNT(*) AS errors FROM logs WHERE level = 'error' GROUP BY service ORDER BY errors DESC LIMIT 20;" },
  { label: 'Recent logs', sql: 'SELECT timestamp, level, service, message FROM logs ORDER BY timestamp DESC LIMIT 50;' },
  { label: 'Metric series', sql: 'SELECT DISTINCT name FROM metrics ORDER BY name;' },
  { label: 'Slowest spans', sql: 'SELECT name, trace_id, duration FROM traces ORDER BY duration DESC LIMIT 20;' },
  { label: 'Log volume / hr', sql: "SELECT (timestamp / 3600000) * 3600000 AS hour, COUNT(*) AS n FROM logs GROUP BY hour ORDER BY hour DESC LIMIT 24;" },
]

function SqlEditor() {
  const [sql, setSql] = useState(DEFAULT_SQL)
  const [result, setResult] = useState<SqlQueryResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const { theme } = useTheme()

  const runQuery = useCallback(async () => {
    if (!sql.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.sqlQuery(sql)
      if (res.error) {
        setError(res.error)
        setResult(null)
      } else {
        setResult(res)
      }
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
    const rows = result.rows.map(r => r.join('\t')).join('\n')
    navigator.clipboard.writeText(`${header}\n${rows}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [result])

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#0a0b0f] transition-colors duration-200">
      <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/80 backdrop-blur-sm sticky top-0 z-10 dark:border-white/5 dark:bg-[#0f1118]/50">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Terminal size={18} className="text-indigo-600 dark:text-indigo-400" />
          SQL Editor
        </h1>
      </div>

      <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-6 font-sans">
        {/* Example queries */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mr-2">Examples:</span>
          {EXAMPLE_QUERIES.map(ex => (
            <button
              key={ex.label}
              className="px-2.5 py-1 rounded bg-slate-100 border border-slate-200 text-[11px] text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition-all dark:bg-white/5 dark:border-white/5 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-200 shadow-sm dark:shadow-none"
              onClick={() => setSql(ex.sql)}
            >
              {ex.label}
            </button>
          ))}
        </div>

        {/* Editor Wrapper */}
        <div className="rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-[#12141c] overflow-hidden flex flex-col shadow-sm dark:shadow-none transition-colors">
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 dark:bg-white/5 dark:border-white/5 flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <Database size={12} /> SQLite Engine
            </span>
            <button
              id="sql-run-btn"
              onClick={runQuery}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              <Play size={12} className={loading ? 'hidden' : 'group-hover:translate-x-0.5 transition-transform'} />
              {loading ? (
                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : 'Run Query'}
              <span className="text-[10px] opacity-40 ml-1 font-mono hidden sm:inline">⌘↵</span>
            </button>
          </div>

          <div className="p-2 bg-white dark:bg-[#12141c]">
            <Editor
              height="200px"
              language="sql"
              value={sql}
              onChange={v => setSql(v ?? '')}
              theme={theme === 'dark' ? 'vs-dark' : 'light'}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                padding: { top: 8 },
                background: '#12141c',
                fontFamily: 'JetBrains Mono, Fira Code, monospace',
                automaticLayout: true,
              }}
              onMount={(editor, monaco) => {
                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
                  (document.getElementById('sql-run-btn') as HTMLElement)?.click()
                })
              }}
            />
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-start gap-3 animate-fade-in">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <div className="font-mono text-xs">{error}</div>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="flex flex-col gap-3 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">
                {result.rowCount} row{result.rowCount !== 1 ? 's' : ''} yielded in{' '}
                <span className="text-indigo-600 dark:text-indigo-400">{fmtDuration(result.durationMs)}</span>
              </span>
              <button
                id="sql-copy-btn"
                onClick={copyResult}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-[11px] text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition-all dark:bg-white/5 dark:border-white/5 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-200 shadow-sm dark:shadow-none"
              >
                {copied ? <CheckCheck size={12} className="text-emerald-500" /> : <Copy size={12} />}
                {copied ? 'Copied as TSV' : 'Copy Result'}
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm dark:border-white/10 dark:bg-[#12141c] dark:shadow-2xl transition-colors">
              <div className="overflow-x-auto max-h-[400px]">
                <table className="w-full text-left border-collapse border-spacing-0">
                  <thead className="bg-slate-50 border-b border-slate-100 sticky top-0 z-10 backdrop-blur-md dark:bg-black/30 dark:border-white/5 transition-colors">
                    <tr>
                      {result.columns.map(col => (
                        <th key={col} className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                    {result.rows.map((row, ri) => (
                      <tr key={ri} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-4 py-2.5 text-[12px] font-mono text-slate-700 dark:text-slate-300">
                            {cell == null ? (
                              <span className="text-slate-400 dark:text-slate-600 italic">NULL</span>
                            ) : (
                              String(cell)
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
