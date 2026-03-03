import type { Context, Next } from 'hono'
import { verify } from 'hono/jwt'
import type { IStore } from '../../domain/store.interface'

/**
 * API Key Middleware Factory
 * 
 * Rules:
 * 1. If MASTER_KEY is set, it allows full access to all projects.
 * 2. Project-specific API Keys only allow access to their assigned project.
 * 3. ADMIN routes require either the MASTER_KEY or a Project ADMIN key.
 * 4. User JWT tokens act as a global admin (for simplicity).
 */
export const createAuthMiddleware = (store: IStore) => {
  return async (c: Context, next: Next) => {
    const path = c.req.path
    if (path === '/api/auth/login' || path === '/api/auth/signup' || path.startsWith('/api/docs') || path.startsWith('/api/openapi')) {
      return next()
    }

    const authHeader = c.req.header('Authorization')
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      try {
        const payload = await verify(token, Bun.env.JWT_SECRET || 'super-secret-tira-key', 'HS256')
        if (payload.userId) {
           c.set('userId', payload.userId)
           c.set('projectId', 'master') // Users currently get master access
           c.set('role', 'admin')
           return next()
        }
      } catch (err) {
        // Fall back to checking API Key
      }
    }

    const masterKey = Bun.env.MASTER_KEY
    const providedKey = c.req.header('X-API-Key') || c.req.query('key')

    // If no master key is set and we're in early dev, maybe allow all?
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
    
    // Authorization Logic
    if (path.startsWith('/api/admin') && apiKey.role !== 'admin') {
      return c.json({ error: 'Forbidden: Admin role required' }, 403)
    }

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
