import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import { Prisma } from '@prisma/client'
import { ApiError } from '../lib/errors.js'

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: { code: err.code ?? 'error', message: err.message } })
  }
  if (err instanceof ZodError) {
    return res.status(422).json({
      error: {
        code: 'validation_error',
        message: 'Request validation failed',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    })
  }
  if (err instanceof Prisma.PrismaClientInitializationError) {
    console.error('DATABASE UNREACHABLE:', err.message)
    return res.status(503).json({
      error: {
        code: 'db_unreachable',
        message:
          'The API cannot reach PostgreSQL. Check that the database is running ' +
          '(docker compose up -d, or your local PostgreSQL service) and that ' +
          'DATABASE_URL in server/.env is correct, then restart the server.',
      },
    })
  }
  console.error(err)
  return res.status(500).json({ error: { code: 'internal', message: 'Something went wrong' } })
}
