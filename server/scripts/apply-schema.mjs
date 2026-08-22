/* Applies ../database-schema.sql to DATABASE_URL. Cross-platform (no psql
 * needed): node scripts/apply-schema.mjs */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import 'dotenv/config'
import pg from 'pg'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set — copy .env.example to .env first.')
  process.exit(1)
}

const sqlPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../database-schema.sql')
const sql = readFileSync(sqlPath, 'utf8')

const client = new pg.Client({ connectionString: url })
try {
  await client.connect()
} catch (e) {
  console.error(`Cannot connect to the database at ${url.replace(/:[^:@/]+@/, ':****@')}`)
  console.error(`  → ${e.message}`)
  console.error('Is PostgreSQL running? (docker compose up -d, or your local service)')
  process.exit(1)
}

// idempotence check: bail politely if the schema is already applied
const existing = await client.query(
  "SELECT to_regclass('public.organizations') AS t",
)
if (existing.rows[0].t) {
  console.log('Schema is already applied — nothing to do.')
  console.log('(To start over: drop and recreate the database, then re-run this.)')
  await client.end()
  process.exit(0)
}

try {
  await client.query(sql)
  console.log('Schema applied ✔  Next: npm run db:generate, then npm run db:seed')
} catch (e) {
  console.error('Schema apply failed:', e.message)
  process.exitCode = 1
} finally {
  await client.end()
}
