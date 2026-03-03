import type { Context, Next } from 'hono'

/**
 * API Key Middleware
 * 
 * Rules:
 * 1. If MASTER_KEY is set in env, all requests must have a valid X-API-Key.
 * 2. ADMIN routes (/api/admin/*) require the MASTER_KEY.
 * 3. INGEST routes (/api/ingest/*, /v1/*) allow either MASTER_KEY or INGEST_KEY.
 * 4. General QUERY routes require at least READONLY access (if enabled).
 */
export const authMiddleware = async (c: Context, next: Next) => {
  const masterKey = Bun.env.MASTER_KEY
  const ingestKey = Bun.env.INGEST_KEY

  // If no auth is configured, allow all (Phase 1/2 behavior)
  if (!masterKey && !ingestKey) {
    return next()
  }

  const providedKey = c.req.header('X-API-Key') || c.req.query('key')

  if (!providedKey) {
    return c.json({ error: 'Unauthorized: X-API-Key header or ?key= query param required' }, 401)
  }

  const path = c.req.path

  // Admin routes: ONLY Master Key
  if (path.startsWith('/api/admin')) {
    if (masterKey && providedKey === masterKey) {
      return next()
    }
    return c.json({ error: 'Forbidden: Admin access required' }, 403)
  }

  // Ingest routes: Master or Ingest Key
  if (path.startsWith('/api/ingest') || path.startsWith('/v1/')) {
    if ((masterKey && providedKey === masterKey) || (ingestKey && providedKey === ingestKey)) {
      return next()
    }
    return c.json({ error: 'Forbidden: Ingest permission required' }, 403)
  }

  // All other API routes: Master Key (simplification for Phase 3 start)
  if (path.startsWith('/api/')) {
    if (masterKey && providedKey === masterKey) {
      return next()
    }
    return c.json({ error: 'Forbidden: API access required' }, 403)
  }

  return next()
}
