import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import swaggerUi from 'swagger-ui-express'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { config } from './lib/config.js'
import { prisma } from './lib/prisma.js'
import { errorHandler } from './middleware/error.js'
import { authRouter } from './routes/auth.js'
import { projectsRouter } from './routes/projects.js'
import { tasksRouter } from './routes/tasks.js'
import { photosRouter } from './routes/photos.js'
import { uploadsRouter } from './routes/uploads.js'
import { approvalsRouter } from './routes/approvals.js'
import { merchantsRouter } from './routes/merchants.js'
import { contactsRouter, dealsRouter } from './routes/crm.js'
import { orgRouter } from './routes/org.js'
import { calendarRouter } from './routes/calendar.js'
import { shootsRouter } from './routes/shoots.js'

export function createApp() {
  const app = express()
  app.set('trust proxy', 1)
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
  app.use(cors({ origin: config.corsOrigin.split(','), credentials: false }))
  app.use(express.json({ limit: '2mb' }))
  app.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }))

  app.get('/api/health', async (_req, res) => {
    let db = 'ok'
    try {
      await prisma.$queryRaw`SELECT 1`
    } catch {
      db = 'unreachable — check that PostgreSQL is running and DATABASE_URL in server/.env is correct'
    }
    res.status(db === 'ok' ? 200 : 503).json({ ok: db === 'ok', env: config.env, database: db })
  })

  app.use('/api/auth', authRouter)
  app.use('/api/projects', projectsRouter)
  app.use('/api/tasks', tasksRouter)
  app.use('/api/photos', photosRouter)
  app.use('/api/uploads', uploadsRouter)
  app.use('/api/approvals', approvalsRouter)
  app.use('/api/merchants', merchantsRouter)
  app.use('/api/contacts', contactsRouter)
  app.use('/api/deals', dealsRouter)
  app.use('/api/org', orgRouter)
  app.use('/api/calendar', calendarRouter)
  app.use('/api/shoots', shootsRouter)

  // API docs at /api/docs
  try {
    const spec = parse(readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8'))
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec))
  } catch {
    // spec missing in some builds — docs are optional
  }

  app.use(errorHandler)
  return app
}
