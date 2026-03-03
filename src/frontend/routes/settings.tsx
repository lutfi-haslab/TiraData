import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../utils/api'
import { Shield, Plus, Key, Box, Trash2, Check, Copy, MoreVertical } from 'lucide-react'

export const Route = createFileRoute('/settings')({
  component: SettingsPage
})

function SettingsPage() {
  const queryClient = useQueryClient()
  const [apiKey, setApiKey] = useState(localStorage.getItem('tira_api_key') || '')
  const [newProjectName, setNewProjectName] = useState('')
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyRole, setNewKeyRole] = useState<'admin' | 'ingest'>('ingest')
  
  const currentPid = localStorage.getItem('tira_project_id') || 'default'

  // 1. Projects Query
  const { data: projects, isError: projectError } = useQuery({
    queryKey: ['projects'],
    queryFn: api.getProjects,
    retry: false
  })

  // 2. Keys Query
  const { data: keys } = useQuery({
    queryKey: ['keys', currentPid],
    queryFn: api.getKeys,
    retry: false
  })

  // 3. Create Project Mutation
  const createProject = useMutation({
    mutationFn: (name: string) => api.createProject(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setNewProjectName('')
    }
  })

  // 4. Create Key Mutation
  const createKey = useMutation({
    mutationFn: (data: { name: string, role: 'admin' | 'ingest' }) => api.createKey(data.name, data.role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['keys'] })
      setNewKeyName('')
    }
  })

  const handleSaveAuth = () => {
    localStorage.setItem('tira_api_key', apiKey)
    window.location.reload()
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    // Could add toast here
  }

  return (
    <div className="p-8 max-w-5xl mx-auto animate-in fade-in duration-500">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Settings</h1>
        <p className="text-slate-500 dark:text-slate-400">Manage projects, API keys, and authentication.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Auth & Projects */}
        <div className="lg:col-span-1 space-y-8">
          
          {/* Authentication Section */}
          <section className="bg-white dark:bg-[#1a1d27] rounded-2xl border border-slate-200 dark:border-white/[0.08] shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 dark:border-white/[0.05] flex items-center gap-2">
              <Shield size={18} className="text-indigo-500" />
              <h2 className="font-semibold text-slate-800 dark:text-slate-200">System Auth</h2>
            </div>
            <div className="p-5">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider mb-2">Master API Key</label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter MASTER_KEY"
                  className="flex-1 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/[0.1] rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  onClick={handleSaveAuth}
                  className="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Save
                </button>
              </div>
              <p className="mt-2 text-[11px] text-slate-400 leading-relaxed">
                Provide your Master Key to manage all projects. This is stored in your browser's local storage.
              </p>
            </div>
          </section>

          {/* Manage Projects Section */}
          <section className="bg-white dark:bg-[#1a1d27] rounded-2xl border border-slate-200 dark:border-white/[0.08] shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 dark:border-white/[0.05] flex items-center gap-2">
              <Box size={18} className="text-indigo-500" />
              <h2 className="font-semibold text-slate-800 dark:text-slate-200">Projects</h2>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="New project name"
                  className="flex-1 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/[0.1] rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  onClick={() => createProject.mutate(newProjectName)}
                  disabled={!newProjectName || projectError}
                  className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-white/[0.05] dark:hover:bg-white/[0.1] text-slate-600 dark:text-slate-300 rounded-lg transition-colors disabled:opacity-50"
                >
                  <Plus size={18} />
                </button>
              </div>

              <div className="space-y-1">
                {projects?.map((p) => (
                  <div key={p.id} className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${p.id === currentPid ? 'bg-indigo-500/5 border-indigo-200 dark:bg-indigo-500/10 dark:border-indigo-500/30' : 'border-transparent hover:bg-slate-50 dark:hover:bg-white/[0.02]'}`}>
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${p.id === currentPid ? 'bg-indigo-500' : 'bg-slate-100 dark:bg-white/[0.05]'}`}>
                        <Box size={14} className={p.id === currentPid ? 'text-white' : 'text-slate-400'} />
                      </div>
                      <div className="overflow-hidden">
                        <p className={`text-[13px] font-medium truncate ${p.id === currentPid ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-300'}`}>{p.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono truncate">{p.id}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: API Keys for current project */}
        <div className="lg:col-span-2 space-y-8">
          <section className="bg-white dark:bg-[#1a1d27] rounded-2xl border border-slate-200 dark:border-white/[0.08] shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-white/[0.05] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key size={18} className="text-indigo-500" />
                <h2 className="font-semibold text-slate-800 dark:text-slate-200">API Keys</h2>
                <span className="ml-2 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/[0.05] text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                  {currentPid}
                </span>
              </div>
            </div>

            <div className="p-6">
              <div className="mb-8 p-5 rounded-2xl bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/[0.05]">
                <h3 className="text-xs font-bold text-slate-500 dark:text-slate-500 uppercase tracking-widest mb-4">Generate New Key</h3>
                <div className="flex flex-wrap gap-3">
                  <input
                    type="text"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="Key name (e.g. Production Ingestion)"
                    className="flex-1 min-w-[200px] bg-white dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.1] rounded-xl px-4 py-2.5 text-[13px] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <select
                    value={newKeyRole}
                    onChange={(e) => setNewKeyRole(e.target.value as any)}
                    className="bg-white dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.1] rounded-xl px-3 py-2 text-[13px] text-slate-700 dark:text-slate-300 focus:outline-none"
                  >
                    <option value="ingest">Ingest Only</option>
                    <option value="admin">Project Admin</option>
                  </select>
                  <button
                    onClick={() => createKey.mutate({ name: newKeyName, role: newKeyRole })}
                    disabled={!newKeyName}
                    className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-[13px] font-semibold transition-all shadow-lg shadow-indigo-500/20"
                  >
                    <Plus size={16} />
                    Create Key
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {keys?.map((key) => (
                  <div key={key.key} className="p-4 rounded-xl border border-slate-100 dark:border-white/[0.05] hover:border-slate-200 dark:hover:border-white/10 transition-all flex items-center justify-between group">
                    <div className="flex items-center gap-4 overflow-hidden">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${key.role === 'admin' ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                        <Shield size={18} />
                      </div>
                      <div className="overflow-hidden">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-[14px] font-semibold text-slate-800 dark:text-slate-100">{key.name}</p>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest ${key.role === 'admin' ? 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400' : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400'}`}>
                            {key.role}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <code className="text-[11px] text-slate-500 dark:text-slate-500 font-mono">
                            {key.key.slice(0, 8)}...{key.key.slice(-4)}
                          </code>
                          <button onClick={() => copyToClipboard(key.key)} className="p-1 text-slate-400 hover:text-indigo-500 transition-colors opacity-0 group-hover:opacity-100">
                            <Copy size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                    
                    <button className="p-2 text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-all">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                
                {keys?.length === 0 && (
                  <div className="text-center py-10">
                    <div className="inline-flex w-12 h-12 items-center justify-center rounded-full bg-slate-50 dark:bg-white/[0.02] text-slate-300 dark:text-slate-700 mb-3">
                      <Key size={24} />
                    </div>
                    <p className="text-[13px] text-slate-500 dark:text-slate-500">No API keys found for this project.</p>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
