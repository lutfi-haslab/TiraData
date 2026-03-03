import { useState, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { 
  BookOpen, Code, Copy, Check, Terminal,
  Database, Shield, Zap, ArrowRight, Play, Loader2, Key, Info
} from 'lucide-react'

export const Route = createFileRoute('/api-docs')({
  component: ApiDocs,
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function CodeBlock({ code, title }: { code: string; title?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative group rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-black/40 overflow-hidden my-4">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-100 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/[0.08]">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5 mr-2">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400/20" />
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400/20" />
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400/20" />
          </div>
          {title && <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{title}</span>}
        </div>
        <button 
          onClick={copy}
          className="p-1 px-2 rounded-md hover:bg-slate-200 dark:hover:bg-white/5 transition-colors flex items-center gap-1.5"
        >
          {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} className="text-slate-400" />}
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="p-5 overflow-x-auto text-[13px] font-mono leading-relaxed text-slate-700 dark:text-slate-300">
        <code>{code}</code>
      </pre>
    </div>
  )
}

function SectionHeading({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-9 h-9 rounded-xl bg-indigo-500/10 flex items-center justify-center">
          <Icon size={18} className="text-indigo-500" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight">{title}</h2>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-2xl">{desc}</p>
    </div>
  )
}

function TryItOut({ method, path, defaultBody }: { method: string; path: string; defaultBody?: object }) {
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [bodyText, setBodyText] = useState(defaultBody ? JSON.stringify(defaultBody, null, 2) : '')
  const [activePlaygroundTab, setActivePlaygroundTab] = useState<'payload' | 'curl'>(method === 'POST' ? 'payload' : 'curl')

  // Generate dynamic curl command
  const generateCurl = () => {
    const apiKey = localStorage.getItem('tira_api_key') || 'YOUR_API_KEY'
    const projectId = localStorage.getItem('tira_project_id') || 'YOUR_PROJECT_ID'
    const jwt = localStorage.getItem('tira_jwt') || ''
    
    let curl = `curl -X ${method} "${window.location.origin}${path}" \\\n`
    curl += `  -H "Content-Type: application/json" \\\n`
    if (apiKey) curl += `  -H "X-API-Key: ${apiKey}" \\\n`
    if (projectId) curl += `  -H "X-Project-Id: ${projectId}" \\\n`
    if (jwt) curl += `  -H "Authorization: Bearer ${jwt.substring(0, 15)}..." \\\n`
    
    if (method === 'POST' && bodyText) {
      curl += `  -d '${bodyText.replace(/'/g, "'\\''")}'`
    }
    
    return curl.replace(/ \\\n$/, '')
  }

  const execute = async () => {
    setLoading(true)
    setResult(null)
    try {
      const apiKey = localStorage.getItem('tira_api_key') || ''
      const projectId = localStorage.getItem('tira_project_id') || ''
      const jwt = localStorage.getItem('tira_jwt') || ''
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      }
      if (apiKey) headers['X-API-Key'] = apiKey
      if (projectId) headers['X-Project-Id'] = projectId
      if (jwt) headers['Authorization'] = `Bearer ${jwt}`

      const options: RequestInit = {
        method,
        headers
      }

      if (method === 'POST' && bodyText) {
        options.body = bodyText
      }

      const res = await fetch(path, options)
      const data = await res.json().catch(() => ({ error: 'Failed to parse JSON response' }))
      setResult({ status: res.status, data })
    } catch (err: any) {
      setResult({ status: 'Error', data: err.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-6 p-5 rounded-2xl bg-white dark:bg-white/[0.01] border border-slate-200 dark:border-white/[0.08] shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-white/[0.05] rounded-xl border border-slate-200 dark:border-white/[0.08]">
          {method === 'POST' && (
            <button
              onClick={() => setActivePlaygroundTab('payload')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                activePlaygroundTab === 'payload' 
                  ? 'bg-white dark:bg-indigo-600 text-indigo-600 dark:text-white shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              Payload
            </button>
          )}
          <button
            onClick={() => setActivePlaygroundTab('curl')}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
              activePlaygroundTab === 'curl' 
                ? 'bg-white dark:bg-indigo-600 text-indigo-600 dark:text-white shadow-sm' 
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            cURL
          </button>
        </div>
        <button
          onClick={execute}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white text-[11px] font-bold transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} fill="currentColor" />}
          {loading ? 'Executing...' : 'Run Request'}
        </button>
      </div>

      <div className="mb-6 min-h-[140px]">
        {activePlaygroundTab === 'payload' && method === 'POST' && (
          <div className="animate-in fade-in duration-300">
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-widest pl-1">JSON Body</label>
            <textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              spellCheck={false}
              className="w-full h-32 p-4 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/[0.08] font-mono text-[12px] text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all resize-none shadow-inner"
            />
          </div>
        )}
        
        {activePlaygroundTab === 'curl' && (
          <div className="animate-in fade-in duration-300">
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-widest pl-1">Command Preview</label>
            <CodeBlock code={generateCurl()} title="CURL EXAMPLE" />
          </div>
        )}
      </div>

      {result && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-300 border-t border-slate-200 dark:border-white/[0.08] pt-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Response Status:</span>
            <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full border ${
              typeof result.status === 'number' && result.status < 300 
                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
                : 'bg-red-500/10 text-red-500 border-red-500/20'
            }`}>
              {result.status}
            </span>
          </div>
          <CodeBlock 
            code={JSON.stringify(result.data, null, 2)} 
            title="Response Payload"
          />
        </div>
      )}
    </div>
  )
}

function EndpointInfo({ method, path, desc, tryIt }: { method: 'GET' | 'POST'; path: string; desc: string; tryIt?: { body?: object } }) {
  const methodColors = {
    GET: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    POST: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
  }

  return (
    <div className="mb-10 last:mb-0">
      <div className="flex items-center gap-3 mb-3">
        <span className={`px-2 py-0.5 rounded font-mono text-xs font-bold border ${methodColors[method]}`}>{method}</span>
        <span className="font-mono text-sm font-semibold tracking-tight text-slate-800 dark:text-slate-100">{path}</span>
      </div>
      <p className="text-[14px] text-slate-600 dark:text-slate-400 mb-4 leading-relaxed">{desc}</p>
      {tryIt && <TryItOut method={method} path={path} defaultBody={tryIt.body} />}
    </div>
  )
}

function ParamTable({ params }: { params: { name: string; type: string; req?: boolean; desc: string }[] }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] overflow-hidden mb-6 bg-white dark:bg-black/20 shadow-sm">
      <table className="w-full text-left border-collapse">
        <thead className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/[0.08]">
          <tr>
            <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest w-1/4">Name</th>
            <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest w-1/4">Type</th>
            <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Description</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-white/[0.05]">
          {params.map(p => (
            <tr key={p.name} className="group/row">
              <td className="px-5 py-4 font-mono text-[12px] font-bold text-indigo-500 dark:text-indigo-400">
                {p.name}{p.req && <span className="text-red-500 ml-1 opacity-50">*</span>}
              </td>
              <td className="px-5 py-4 font-mono text-[11px] text-slate-500 uppercase">{p.type}</td>
              <td className="px-5 py-4 text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed group-hover/row:text-slate-900 dark:group-hover/row:text-slate-200 transition-colors">
                {p.desc}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ApiDocs() {
  const [activeTab, setActiveTab] = useState('ingestion')
  const [apiKey, setApiKey] = useState(localStorage.getItem('tira_api_key') || '')
  const [projectId, setProjectId] = useState(localStorage.getItem('tira_project_id') || '')
  const [jwt, setJwt] = useState(localStorage.getItem('tira_jwt') || '')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (saved) {
      const timer = setTimeout(() => setSaved(false), 2000)
      return () => clearTimeout(timer)
    }
  }, [saved])

  const saveConfig = () => {
    localStorage.setItem('tira_api_key', apiKey)
    localStorage.setItem('tira_project_id', projectId)
    localStorage.setItem('tira_jwt', jwt)
    setSaved(true)
  }

  const SECTIONS = [
    { id: 'auth',      label: 'Authentication', icon: Shield },
    { id: 'ingestion', label: 'Data Ingestion', icon: Code },
    { id: 'querying',  label: 'Query API',       icon: Database },
  ]

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0a0b0f] transition-colors duration-200">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-white/90 dark:bg-[#0f1117]/95 backdrop-blur border-b border-slate-200 dark:border-white/[0.06] px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <BookOpen size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white leading-tight tracking-tight">API Documentation</h1>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">Build native integrations with TiraData</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-white/[0.05] rounded-xl border border-slate-200 dark:border-white/[0.08]">
          {SECTIONS.map(s => {
            const active = activeTab === s.id
            const Icon = s.icon
            return (
              <button
                key={s.id}
                onClick={() => setActiveTab(s.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 ${
                  active 
                    ? 'bg-white dark:bg-indigo-600 text-indigo-600 dark:text-white shadow-sm ring-1 ring-slate-900/5 dark:ring-white/10' 
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <Icon size={14} />
                {s.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="p-8 flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto">
          {/* ── Configuration Sidebar/Panel ─────────────────────────── */}
          <div className="mb-10 p-6 rounded-2xl bg-indigo-500/[0.03] border border-indigo-500/10 backdrop-blur-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity">
              <Key size={140} className="text-indigo-500" />
            </div>
            
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                  <Key size={18} className="text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">API Credentials</h3>
                  <p className="text-[11px] text-slate-500 font-medium tracking-tight">Your session parameters for interactive playground</p>
                </div>
              </div>
              <button
                onClick={saveConfig}
                className={`px-6 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border ${
                  saved 
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' 
                    : 'bg-indigo-500 border-indigo-600 text-white hover:bg-indigo-600 shadow-lg shadow-indigo-500/20'
                }`}
              >
                {saved ? <Check size={14} /> : <Terminal size={14} />}
                {saved ? 'Settings Updated' : 'Update Session'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">
                  X-API-Key <Shield size={10} className="opacity-50" />
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Insert Project API Key"
                  className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-black/40 border border-slate-200 dark:border-white/[0.08] text-sm font-mono focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">
                  X-Project-Id <Database size={10} className="opacity-50" />
                </label>
                <input
                  type="text"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  placeholder="Target Project ID"
                  className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-black/40 border border-slate-200 dark:border-white/[0.08] text-sm font-mono focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">
                  JWT Token <Key size={10} className="opacity-50" />
                </label>
                <input
                  type="password"
                  value={jwt}
                  onChange={(e) => setJwt(e.target.value)}
                  placeholder="User Session JWT"
                  className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-black/40 border border-slate-200 dark:border-white/[0.08] text-sm font-mono focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition-all"
                />
              </div>
            </div>

            <div className="mt-5 flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/10 backdrop-blur-sm">
              <Info className="text-amber-500 shrink-0 mt-0.5" size={16} />
              <p className="text-[11px] text-amber-600/80 dark:text-amber-400/70 leading-relaxed italic">
                <b>Precedence:</b> The <code className="bg-amber-500/10 px-1 rounded font-mono">Authorization</code> header (JWT) takes priority. If valid, the <code className="bg-amber-500/10 px-1 rounded font-mono">X-API-Key</code> is ignored. If you want to test specific API key permissions, clear the JWT field first.
              </p>
            </div>
          </div>

          {activeTab === 'auth' && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <SectionHeading 
                icon={Shield} 
                title="Authentication" 
                desc="TiraData implements flexible authentication strategies for both frontend and backend communication." 
              />

              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-4 mt-8">API Key Authentication</h3>
              <p className="text-[14px] text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
                Inject your API key into the <code className="bg-slate-100 dark:bg-white/5 py-0.5 px-1.5 rounded font-mono text-indigo-500">X-API-Key</code> request header. 
                API keys can be managed in the <span className="font-bold underline decoration-indigo-500 decoration-2 underline-offset-4">Settings</span> page.
              </p>
              
              <EndpointInfo 
                method="GET" 
                path="/api/health" 
                desc="Check the health of the TiraData backend and verify your API keys."
                tryIt={{}}
              />

              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-4 mt-12">JWT Authentication</h3>
              <p className="text-[14px] text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
                For user-specific sessions, use standard Bearer authentication with a JWT token obtained from login.
              </p>
              <EndpointInfo 
                method="GET" 
                path="/api/auth/me" 
                desc="Get details about the currently authenticated user session." 
                tryIt={{}}
              />
            </div>
          )}

          {activeTab === 'ingestion' && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <SectionHeading 
                icon={Zap} 
                title="Data Ingestion" 
                desc="Ingestion is handled using an asynchronous ring-buffer queue to ensure maximum throughput." 
              />

              <EndpointInfo 
                method="POST" 
                path="/api/ingest/log" 
                desc="Ship structured application logs with custom attributes."
                tryIt={{
                  body: { message: "Test log message", level: "info", service: "api-docs", attributes: { source: "web-ui" } }
                }}
              />
              <ParamTable params={[
                { name: 'message',   type: 'string', req: true, desc: 'The log message content.' },
                { name: 'level',     type: 'string', desc: 'debug, info, warn, error, fatal.' },
                { name: 'service',   type: 'string', desc: 'Source service name.' },
                { name: 'attributes',type: 'object', desc: 'Contextual key-value pairs.' },
              ]} />

              <div className="h-10" />

              <EndpointInfo 
                method="POST" 
                path="/api/ingest/metric" 
                desc="Record high-resolution time-series data points."
                tryIt={{
                  body: { name: "test.metric", value: Math.random() * 100, labels: { source: "api-docs" } }
                }}
              />
              <ParamTable params={[
                { name: 'name',      type: 'string', req: true, desc: 'Measurement key.' },
                { name: 'value',     type: 'number', req: true, desc: 'Numerical measurement.' },
                { name: 'labels',    type: 'object', desc: 'String dimensions.' },
              ]} />
            </div>
          )}

          {activeTab === 'querying' && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <SectionHeading 
                icon={Terminal} 
                title="Query API" 
                desc="Advanced query endpoints for data extraction." 
              />

              <EndpointInfo 
                method="GET" 
                path="/api/logs" 
                desc="Search through normalized logs with filtering." 
                tryIt={{}}
              />
              <ParamTable params={[
                { name: 'service', type: 'string', desc: 'Filter by source service.' },
                { name: 'level',   type: 'string', desc: 'Filter by severity.' },
                { name: 'limit',   type: 'number', desc: 'Max items. Default 200.' },
              ]} />

              <div className="h-10" />

              <EndpointInfo 
                method="POST" 
                path="/api/query/sql" 
                desc="Execute raw read-only SQL against your observability dataset."
                tryIt={{
                  body: { sql: "SELECT level, COUNT(*) as count FROM logs GROUP BY level" }
                }}
              />
            </div>
          )}

          {/* ── Footer ─────────────────────────────────────────────────── */}
          <div className="mt-16 pt-8 border-t border-slate-200 dark:border-white/[0.05] flex justify-between items-center bg-slate-100/30 dark:bg-black/20 p-6 rounded-2xl">
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">Credential Auto-sync</p>
              <p className="text-xs text-slate-500">
                All requests in this session automatically inherit your updated configuration above.
              </p>
            </div>
            <button className="flex items-center gap-2 text-indigo-500 text-xs font-bold hover:underline">
              Manage API Keys <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
