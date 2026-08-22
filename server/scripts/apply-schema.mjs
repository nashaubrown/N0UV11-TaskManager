/* Applies ../database-schema.sql plus any pending files in migrations/ to
 * DATABASE_URL. Cross-platform (no psql needed): node scripts/apply-schema.mjs
 * - Fresh database: applies the full base schema (which already includes all
 *   migrations) and records every migration as applied.
 * - Existing database: applies only migrations not yet recorded. */
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import 'dotenv/config'
import pg from 'pg'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set — copy .env.example to .env first.')
  process.exit(1)
}

const here = path.dirname(fileURLToPath(import.meta.url))
const baseSql = readFileSync(path.resolve(here, '../../database-schema.sql'), 'utf8')
const migrationsDir = path.resolve(here, '../migrations')
const migrations = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()

const client = new pg.Client({ connectionString: url })
try {
  await client.connect()
} catch (e) {
  console.error(`Cannot connect to the database at ${url.replace(/:[^:@/]+@/, ':****@')}`)
  console.error(`  → ${e.message}`)
  console.error('Is PostgreSQL running? (docker compose up -d, or your local service)')
  process.exit(1)
}

try {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`)

  const base = await client.query("SELECT to_regclass('public.organizations') AS t")
  if (!base.rows[0].t) {
    await client.query(baseSql)
    for (const m of migrations) {
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [m])
    }
    console.log(`Schema applied ✔ (base + ${migrations.length} migrations included)`)
    console.log('Next: npm run db:generate, then npm run db:seed')
  } else {
    const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name))
    const pending = migrations.filter((m) => !done.has(m))
    if (!pending.length) {
      console.log('Schema is up to date — nothing to do.')
    } else {
      for (const m of pending) {
        const sql = readFileSync(path.join(migrationsDir, m), 'utf8')
        await client.query('BEGIN')
        try {
          await client.query(sql)
          await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [m])
          await client.query('COMMIT')
          console.log(`Applied migration ${m} ✔`)
        } catch (e) {
          await client.query('ROLLBACK')
          throw new Error(`Migration ${m} failed: ${e.message}`)
        }
      }
      console.log('Next: npm run db:generate to refresh the Prisma client')
    }
  }
} catch (e) {
  console.error(e.message)
  process.exitCode = 1
} finally {
  await client.end()
}
