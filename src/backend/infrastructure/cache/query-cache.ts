export class QueryCache {
  private cache = new Map<string, { result: any; expiresAt: number }>()

  constructor(private readonly defaultTtlMs = 5000) {}

  get(key: string): any | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return null
    }

    return entry.result
  }

  set(key: string, result: any, ttlMs?: number): void {
    this.cache.set(key, {
      result,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs)
    })
  }

  clear(): void {
    this.cache.clear()
  }

  /** Background task to prune expired entries */
  prune(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key)
      }
    }
  }
}

export const queryCache = new QueryCache()
