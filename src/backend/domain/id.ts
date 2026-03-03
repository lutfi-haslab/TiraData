/**
 * Generates a URL-safe unique ID using crypto.randomUUID.
 * Falls back to a time+random hybrid when crypto is unavailable.
 */
export const generateId = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Minimal fallback
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}
