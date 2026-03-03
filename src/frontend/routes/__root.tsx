import { createRootRoute, Outlet, useLocation, useNavigate } from '@tanstack/react-router'
import { Sidebar } from '../components/Sidebar'
import { useEffect } from 'react'

export const Route = createRootRoute({
  component: () => {
    const location = useLocation()
    const navigate = useNavigate()
    const isAuth = location.pathname === '/login' || location.pathname === '/signup'

    useEffect(() => {
      const jwt = localStorage.getItem('tira_jwt')
      const key = localStorage.getItem('tira_api_key')
      
      if (!jwt && !key && !isAuth) {
        navigate({ to: '/login', replace: true })
      }
    }, [isAuth, navigate])

    return (
      <div className="flex h-screen bg-slate-50 text-slate-900 dark:bg-[#0a0b0f] dark:text-slate-200 overflow-hidden transition-colors duration-200">
        {!isAuth && <Sidebar />}
        <main className="flex-1 overflow-y-auto w-full relative">
          <Outlet />
        </main>
      </div>
    )
  },
})
