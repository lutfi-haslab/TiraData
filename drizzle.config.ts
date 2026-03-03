import { defineConfig } from 'drizzle-kit'

// Bun auto-loads .env — no dotenv needed
const store = process.env.STORE ?? 'sqlite'

export default defineConfig(
  store === 'postgres'
    ? {
        dialect: 'postgresql',
        schema:  './src/backend/infrastructure/db/schema.pg.ts',
        out:     './drizzle/migrations',
        dbCredentials: {
          url: process.env.DATABASE_URL ?? 'postgres://localhost:5432/tiradata',
        },
      }
    : {
        dialect: 'sqlite',
        schema:  './src/backend/infrastructure/db/schema.sqlite.ts',
        out:     './drizzle/migrations',
        dbCredentials: {
          url: `file:${process.env.DB_PATH ?? 'tiradata.db'}`,
        },
      }
)
