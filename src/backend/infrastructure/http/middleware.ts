import type { Context, Next } from 'hono'
import type { IStore } from '../../domain/store.interface'

/**
 * API Key Middleware Factory
 * 
 * Rules:
 * 1. If MASTER_KEY is set, it allows full access to all projects.
 * 2. Project-specific API Keys only allow access to their assigned project.
 * 3. ADMIN routes require either the MASTER_KEY or a Project ADMIN key.
 */
export const createAuthMiddleware = (store: IStore) => {
  return async (c: Context, next: Next) => {
    const masterKey = Bun.env.MASTER_KEY
    const providedKey = c.req.header('X-API-Key') || c.req.query('key')

    // If no master key is set and we're in early dev, maybe allow all?
    // But for Phase 5, we should expect a key if at least one project exists.
    if (!providedKey && !masterKey) {
      // Fallback for Phase 1/2 if no security configured
      return next()
    }

    if (!providedKey) {
      return c.json({ error: 'Unauthorized: X-API-Key header or ?key= query param required' }, 401)
    }

    // 1. Check Master Key
    if (masterKey && providedKey === masterKey) {
      c.set('projectId', 'master')
      c.set('role', 'admin')
      return next()
    }

    // 2. Check Database for Project API Key
    const apiKey = await store.getApiKey(String(providedKey))
    if (!apiKey) {
      return c.json({ error: 'Forbidden: Invalid API Key' }, 403)
    }

    // Inject into context
    c.set('projectId', apiKey.projectId)
    c.set('role', apiKey.role)

    const path = c.req.path
    
    // Authorization Logic
    if (path.startsWith('/api/admin') && apiKey.role !== 'admin') {
      return c.json({ error: 'Forbidden: Admin role required' }, 403)
    }

    // Query routes also require 'admin' role, ingest-only keys should not query
    const isQueryRoute = path.startsWith('/api/logs') || 
                         path.startsWith('/api/metrics') || 
                         path.startsWith('/api/traces') ||
                         path.startsWith('/api/query/') ||
                         path.startsWith('/api/alerts/') ||
                         path.startsWith('/api/stats')

    if (isQueryRoute && apiKey.role !== 'admin') {
      return c.json({ error: 'Forbidden: Query access requires admin role' }, 403)
    }

    return next()
  }
}
