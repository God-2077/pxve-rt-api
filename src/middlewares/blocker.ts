import type { MiddlewareHandler } from 'hono'
import { getCommaEnv } from '../config.ts'

export function isAllowedOrigin(origin: string): boolean {
  const list = getCommaEnv('ACCEPT_DOMAINS')
  if (!list.length) return true
  try {
    const hostname = new URL(origin).hostname
    return list.some(d =>
      d.startsWith('*.')
        ? hostname === d.slice(2) || hostname.endsWith(d.slice(1))
        : hostname.toLowerCase() === d.toLowerCase()
    )
  } catch {
    return false
  }
}

function isAccepted(path: string, ua?: string, origin?: string, referer?: string): boolean {
  if (path === '/favicon.ico' || path === '/robots.txt') return true
  if (!ua) return false

  const blacklist = getCommaEnv('UA_BLACKLIST')
  if (blacklist.length) {
    const lower = ua.toLowerCase()
    if (blacklist.some(entry => lower.includes(entry.toLowerCase()))) return false
  }

  const originOk = !origin || isAllowedOrigin(origin)
  const refererOk = !referer || isAllowedOrigin(referer)
  return originOk && refererOk
}

export function blocker(): MiddlewareHandler {
  return async (c, next) => {
    const ua = c.req.header('user-agent')
    const origin = c.req.header('origin')
    const referer = c.req.header('referer')

    if (isAccepted(c.req.path, ua, origin, referer)) {
      await next()
      return
    }
    return c.json({ error: 'Forbidden' }, 403)
  }
}