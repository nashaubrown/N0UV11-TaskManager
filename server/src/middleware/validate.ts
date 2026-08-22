import type { NextFunction, Request, Response } from 'express'
import type { ZodType } from 'zod'

/** Parses req.body (or query) against a zod schema; 422s on failure. */
export const validate = (schema: ZodType, where: 'body' | 'query' = 'body') =>
  (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.parse(where === 'body' ? req.body : req.query)
    if (where === 'body') req.body = parsed
    else Object.assign(req.query as Record<string, unknown>, parsed)
    next()
  }
