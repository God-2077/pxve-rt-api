import type { MiddlewareHandler } from 'hono'
import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'
import { getApiToken } from '../config.ts'

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export function optionalAuth(): MiddlewareHandler {
  return async (c, next) => {
    const token = getApiToken()
    if (!token) return next()

    const auth = c.req.header('authorization') ?? ''
    const apiToken = (c.req.header('x-api-token') ?? '').replace(/^Bearer\s+/i, '').trim()
    if (safeEqual(auth, `Bearer ${token}`) || safeEqual(apiToken, token)) {
      return next()
    }
    return c.json({ error: 'Unauthorized' }, 401)
  }
}