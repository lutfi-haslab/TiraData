export type AuthRole = 'admin' | 'ingest' | 'readonly'

export interface APIKey {
  key: string
  role: AuthRole
  name: string
}
