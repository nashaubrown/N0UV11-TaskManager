import { createServer } from 'node:http'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'
import { config } from './lib/config.js'
import { prisma } from './lib/prisma.js'
import { attachWebSocket } from './ws/hub.js'
import { startSyncWorker } from './services/gcal.js'

/** Loud warning when the database is behind the code. */
async function checkMigrations() {
  try {
    const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations')
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
    const applied = await prisma.$queryRaw<{ name: string }[]>`SELECT name FROM schema_migrations`
    const done = new Set(applied.map((r) => r.name))
    const pending = files.filter((f) => !done.has(f))
    if (pending.length) {
      console.warn('')
      console.warn('⚠️  DATABASE IS BEHIND THE CODE — pending migrations:', pending.join(', '))
      console.warn('   Fix: stop the server, then run  npm run db:apply  and  npm run db:generate')
      console.warn('   Until then, features that need those tables will fail.')
      console.warn('')
    }
  } catch {
    console.warn('⚠️  Could not verify migrations (is schema_migrations missing?) — run npm run db:apply')
  }
}

const server = createServer(createApp())
attachWebSocket(server)
startSyncWorker()
void checkMigrations()

server.listen(config.port, () => {
  console.log(`NOUVII API listening on http://localhost:${config.port}`)
  console.log(`Docs: http://localhost:${config.port}/api/docs · WS: ws://localhost:${config.port}/ws`)
})
