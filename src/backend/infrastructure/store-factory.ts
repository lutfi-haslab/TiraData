import type { IStore } from '../domain/store.interface'
import { SqliteStore }  from './sqlite/store'
import { PostgresStore } from './postgres/store'

/**
 * createStore – selects and initialises the correct storage adapter.
 *
 * Controlled by environment variables:
 *   STORE=sqlite | postgres   (default: sqlite)
 *   DB_PATH=./tiradata.db     (sqlite only)
 *   DATABASE_URL=postgres://  (postgres only)
 */
export async function createStore(): Promise<IStore> {
  const adapter = (Bun.env.STORE ?? 'sqlite').toLowerCase()

  if (adapter === 'postgres') {
    const store = new PostgresStore()
    await store.init()  // apply DDL
    console.log('[tiradata] storage: PostgreSQL')
    return store
  }

  // Default: SQLite
  const store = new SqliteStore()
  console.log(`[tiradata] storage: SQLite (${Bun.env.DB_PATH ?? 'tiradata.db'})`)
  return store
}
