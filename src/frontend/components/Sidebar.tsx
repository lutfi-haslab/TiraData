import { Link, useRouterState } from '@tanstack/react-router'
import { LayoutDashboard, ScrollText, BarChart2, GitFork, TerminalSquare, Zap, Sun, Moon, Settings, BookOpen, Users, Activity } from 'lucide-react'
import { ProjectSelector } from './ProjectSelector'
import { useQuery } from '@tanstack/react-query'
import { api } from '../utils/api'
import { useTheme } from '../context/ThemeContext'

const NAV = [
  { to: '/',        label: 'Dashboard',    Icon: LayoutDashboard },
  { to: '/logs',    label: 'Log Explorer', Icon: ScrollText },
  { to: '/metrics', label: 'Metrics',      Icon: BarChart2 },
  { to: '/traces',  label: 'Trace Viewer', Icon: GitFork },
  { to: '/apm',     label: 'APM',          Icon: Activity },
  { to: '/query',   label: 'SQL Editor',   Icon: TerminalSquare },
  { to: '/api-docs',label: 'API Docs',     Icon: BookOpen },
  { to: '/settings', label: 'Settings',      Icon: Settings },
  { to: '/profile', label: 'Profile',        Icon: Users },
]

export function Sidebar() {
  const pathname = useRouterState({ select: s => s.location.pathname })
  const { theme, toggleTheme } = useTheme()

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: api.health,
    refetchInterval: 10_000,
    retry: false,
  })
  const online = health?.status === 'ok'

  return (
    <aside className="w-56 shrink-0 flex flex-col bg-slate-100 border-r border-slate-200 dark:bg-[#0f1117] dark:border-white/[0.07] h-screen transition-colors duration-200">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-5 border-b border-slate-200 dark:border-white/[0.06]">
        <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center shrink-0">
          <Zap size={14} color="#fff" strokeWidth={2.5} />
        </div>
        <span className="text-sm font-semibold tracking-wide text-slate-800 dark:text-slate-100">TiraData</span>
      </div>

      {/* Project Selector */}
      <div className="pt-4">
        <ProjectSelector />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 flex flex-col gap-0.5">
        <p className="text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-600 px-2 py-1 mb-1">Navigation</p>
        {NAV.map(({ to, label, Icon }) => {
          const active = pathname === to
          return (
            <Link
              key={to}
              to={to}
              className={[
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-all duration-200',
                active
                  ? 'bg-indigo-500/10 text-indigo-600 font-semibold dark:bg-indigo-500/20 dark:text-indigo-300 dark:font-medium'
                  : 'text-slate-600 hover:bg-slate-200 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.05] dark:hover:text-slate-200',
              ].join(' ')}
            >
              <Icon size={15} strokeWidth={1.8} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Footer Actions */}
      <div className="px-3 pb-4 flex flex-col gap-2">
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] text-slate-600 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-white/[0.05] transition-all duration-200"
        >
          {theme === 'light' ? <Moon size={14} strokeWidth={2} /> : <Sun size={14} strokeWidth={2} />}
          <span>{theme === 'light' ? 'Switch to Dark' : 'Switch to Light'}</span>
        </button>

        {/* Backend status */}
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-white/50 border border-slate-200 dark:bg-white/[0.04] dark:border-white/[0.06]">
          <div className={`w-2 h-2 rounded-full shrink-0 ${online ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-red-500 dark:bg-red-400'}`} />
          <span className="text-[12px] text-slate-500 dark:text-slate-400">
            {online ? 'Backend online' : 'Backend offline'}
          </span>
        </div>
      </div>
    </aside>
  )
}
