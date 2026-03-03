import { Link, useRouterState } from '@tanstack/react-router'
import {
  LayoutDashboard,
  ScrollText,
  BarChart2,
  GitFork,
  TerminalSquare,
  Zap,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../utils/api'

const NAV = [
  { to: '/',        label: 'Dashboard',     Icon: LayoutDashboard },
  { to: '/logs',    label: 'Log Explorer',  Icon: ScrollText },
  { to: '/metrics', label: 'Metrics',       Icon: BarChart2 },
  { to: '/traces',  label: 'Trace Viewer',  Icon: GitFork },
  { to: '/query',   label: 'SQL Editor',    Icon: TerminalSquare },
]

export function Sidebar() {
  const state    = useRouterState()
  const pathname = state.location.pathname

  // Health pulse every 10 s
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: api.health,
    refetchInterval: 10_000,
    retry: false,
  })

  const online = health?.status === 'ok'

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <Zap size={16} color="#fff" strokeWidth={2.5} />
        </div>
        <span className="sidebar-logo-text">tiradata</span>
      </div>

      {/* Navigation */}
      <div className="sidebar-section">
        <div className="sidebar-label">Navigation</div>

        {NAV.map(({ to, label, Icon }) => (
          <Link
            key={to}
            to={to}
            className={`nav-item ${pathname === to ? 'active' : ''}`}
          >
            <Icon size={15} strokeWidth={1.8} />
            {label}
          </Link>
        ))}
      </div>

      {/* Footer: backend status */}
      <div className="sidebar-footer">
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 10px',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--color-bg-elevated)',
        }}>
          <div className={`status-dot ${online ? 'status-dot-green' : 'status-dot-red'}`} />
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
            {online ? 'Backend online' : 'Backend offline'}
          </span>
        </div>
      </div>
    </aside>
  )
}
