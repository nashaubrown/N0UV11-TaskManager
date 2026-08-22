import type { Request } from 'express'
import { badRequest } from './errors.js'

/** First value of a route param, guaranteed string. */
export function param(req: Request, name: string): string {
  const v = req.params[name]
  const s = Array.isArray(v) ? v[0] : v
  if (!s) throw badRequest(`Missing route param ${name}`)
  return s
}
