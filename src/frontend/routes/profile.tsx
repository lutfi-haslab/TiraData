import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../utils/api'
import { Users, UserPlus } from 'lucide-react'

export const Route = createFileRoute('/profile')({
  component: ProfilePage
})

function ProfilePage() {
  const queryClient = useQueryClient()
  const [newShareEmail, setNewShareEmail] = useState('')
  const [newShareRole, setNewShareRole] = useState<'admin' | 'viewer'>('viewer')
  
  const currentPid = localStorage.getItem('tira_project_id') || 'default'

  // 1. Current User
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: api.getMe,
    retry: false
  })

  // 2. Project Users Query
  const { data: users, refetch: refetchUsers } = useQuery({
    queryKey: ['project_users', currentPid],
    queryFn: () => api.getProjectUsers(currentPid),
    enabled: currentPid !== 'default',
    retry: false
  })

  // 3. Share Project Mutation
  const shareProject = useMutation({
    mutationFn: (data: { email: string, role: 'admin' | 'viewer' }) => api.shareProject(currentPid, data.email, data.role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project_users', currentPid] })
      setNewShareEmail('')
      refetchUsers()
    }
  })

  const logout = () => {
    localStorage.removeItem('tira_jwt')
    localStorage.removeItem('tira_api_key')
    window.location.href = '/login'
  }

  return (
    <div className="max-w-4xl mx-auto py-10 px-6 sm:px-10 animate-fade-in">
      {/* Header */}
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
        <Users className="text-indigo-500" size={28} strokeWidth={2.5} />
        Profile & Team
      </h1>
      <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
        Manage your personal profile and project access control.
      </p>

      {/* Grid */}
      <div className="mt-8 flex flex-col gap-6">

        {/* User Card */}
        <section className="bg-white dark:bg-[#1a1d27] rounded-2xl border border-slate-200 dark:border-white/[0.08] shadow-sm p-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-indigo-500/10 dark:bg-indigo-500/20 flex items-center justify-center shrink-0">
              <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                {me?.user?.email?.charAt(0).toUpperCase() || 'U'}
              </span>
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">{me?.user?.email || 'Logged In'}</h2>
              <p className="text-sm text-slate-500 font-mono mt-1">ID: {me?.user?.id}</p>
            </div>
            <button
              onClick={logout}
              className="px-4 py-2 border border-red-500/20 text-red-600 hover:bg-red-500/10 rounded-lg text-sm font-medium transition-colors"
            >
              Sign out
            </button>
          </div>
        </section>

        {/* Team Section */}
        {currentPid !== 'default' ? (
          <section className="bg-white dark:bg-[#1a1d27] rounded-2xl border border-slate-200 dark:border-white/[0.08] shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 dark:border-white/[0.05] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users size={18} className="text-indigo-500" />
                <h2 className="font-semibold text-slate-800 dark:text-slate-200">Project Members</h2>
              </div>
              <span className="text-xs bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-2 py-1 rounded font-medium">Current Project: {currentPid}</span>
            </div>
            
            <div className="p-5 space-y-4">
              <div className="flex gap-2">
                <input
                  type="email"
                  value={newShareEmail}
                  onChange={(e) => setNewShareEmail(e.target.value)}
                  placeholder="Invite user by email"
                  className="flex-1 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/[0.1] rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <select
                  value={newShareRole}
                  onChange={(e) => setNewShareRole(e.target.value as 'admin' | 'viewer')}
                  className="bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/[0.1] rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="viewer">Viewer</option>
                  <option value="admin">Admin</option>
                </select>
                <button
                  onClick={() => shareProject.mutate({ email: newShareEmail, role: newShareRole })}
                  disabled={!newShareEmail || shareProject.isPending}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50 text-sm font-medium flex items-center gap-2"
                >
                  <UserPlus size={16} />
                  Invite
                </button>
              </div>

              {shareProject.isError && (
                <div className="text-xs text-red-500 px-2 mt-1">
                  Could not invite user. Make sure the email is registered and you have admin access.
                </div>
              )}

              <div className="mt-6">
                <div className="grid grid-cols-1 gap-2">
                  {users?.length === 0 && (
                    <div className="text-center py-6 text-slate-400 text-sm">
                      Only the master user has access to this project currently.
                    </div>
                  )}
                  {users?.map((u) => (
                    <div key={u.userId} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-white/[0.05] bg-slate-50 dark:bg-black/10">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center">
                          <span className="text-xs font-bold text-indigo-500">U</span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">User ID: {u.userId}</p>
                          <p className="text-xs text-slate-500 font-mono mt-0.5">Joined: {new Date(u.createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <span className={`text-[11px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full ${u.role === 'admin' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300' : 'bg-slate-200 text-slate-600 dark:bg-white/[0.1] dark:text-slate-300'}`}>
                        {u.role}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-slate-500 dark:text-slate-400">
            Select a specific project from the sidebar to manage its members.
          </div>
        )}
      </div>
    </div>
  )
}
