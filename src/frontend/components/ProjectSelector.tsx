import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../utils/api'
import { ChevronDown, Plus, Box } from 'lucide-react'

export function ProjectSelector() {
  const [isOpen, setIsOpen] = useState(false)
  const currentPid = localStorage.getItem('tira_project_id') || 'default'

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: api.getProjects,
    // Only try to fetch if we have a master key (indicated by being able to call this)
    retry: false,
  })

  // @ts-ignore - projects might be undefined
  const currentProject = projects?.find((p: any) => p.id === currentPid) || { id: currentPid, name: currentPid === 'default' ? 'Default Project' : currentPid }

  const selectProject = (id: string) => {
    localStorage.setItem('tira_project_id', id)
    setIsOpen(false)
    window.location.reload() // Simplest way to re-init all queries with new header
  }

  return (
    <div className="relative px-2 mb-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-white border border-slate-200 hover:border-indigo-300 dark:bg-white/[0.04] dark:border-white/[0.08] dark:hover:border-white/[0.2] transition-all group"
      >
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
            <Box size={16} className="text-indigo-600 dark:text-indigo-400" strokeWidth={2} />
          </div>
          <div className="flex flex-col items-start overflow-hidden">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-500 font-bold leading-none mb-1">Project</span>
            <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-200 truncate w-full">
              {currentProject.name}
            </span>
          </div>
        </div>
        <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute left-2 right-2 top-full mt-2 z-20 bg-white dark:bg-[#1a1d27] border border-slate-200 dark:border-white/[0.1] rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="max-h-64 overflow-y-auto py-1.5">
              {projects?.map(p => (
                <button
                  key={p.id}
                  onClick={() => selectProject(p.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-[13px] hover:bg-slate-100 dark:hover:bg-white/[0.05] transition-colors ${p.id === currentPid ? 'text-indigo-600 font-bold dark:text-indigo-400' : 'text-slate-600 dark:text-slate-400'}`}
                >
                  <Box size={14} strokeWidth={p.id === currentPid ? 2.5 : 1.8} />
                  <span className="truncate">{p.name}</span>
                </button>
              ))}
              
              {!projects && (
                <div className="px-4 py-3 text-[12px] text-slate-500 dark:text-slate-500 italic">
                  Run as system admin to see all projects
                </div>
              )}
            </div>
            
            <div className="border-t border-slate-100 dark:border-white/[0.05] p-1.5 bg-slate-50/50 dark:bg-black/20">
              <button 
                onClick={() => {
                  setIsOpen(false)
                  // Navigate to settings handled by parent or just reload
                  window.location.href = '/settings'
                }}
                className="w-full flex items-center gap-3 px-3 py-2 text-[12px] font-medium text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
              >
                <Plus size={14} />
                Manage Projects
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
