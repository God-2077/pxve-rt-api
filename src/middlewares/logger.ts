import type { MiddlewareHandler } from 'hono'
import { sanitizeUrl } from '../lib/sanitize.ts'

export function logger(): MiddlewareHandler {
  return async (c, next) => {
    const start = Date.now()
    await next()
    const duration = `${Date.now() - start}ms`
    c.res.headers.set('x-response-time', duration)
    console.log(
      new Date().toLocaleString('zh'),
      c.req.method,
      c.res.status,
      duration,
      sanitizeUrl(c.req.url).slice(0, 200),
      c.req.header('user-agent'),
      c.req.header('origin')
    )
  }
}