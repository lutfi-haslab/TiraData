import { createRootRoute, Outlet } from '@tanstack/react-router'
import { Sidebar } from '../components/Sidebar'

export const Route = createRootRoute({
  component: () => (
    <div className="flex h-screen bg-slate-50 text-slate-900 dark:bg-[#0a0b0f] dark:text-slate-200 overflow-hidden transition-colors duration-200">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  ),
})
