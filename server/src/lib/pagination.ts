import type { Request } from 'express'

export interface Page { limit: number; offset: number }

/** limit/offset pagination with sane caps: ?limit=25&offset=0 */
export function pageParams(req: Request, defaultLimit = 25, maxLimit = 100): Page {
  const limit = Math.min(maxLimit, Math.max(1, Number(req.query.limit ?? defaultLimit) || defaultLimit))
  const offset = Math.max(0, Number(req.query.offset ?? 0) || 0)
  return { limit, offset }
}

export const paged = <T>(items: T[], total: number, page: Page) => ({
  items,
  total,
  limit: page.limit,
  offset: page.offset,
})
