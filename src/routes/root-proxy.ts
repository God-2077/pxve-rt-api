import type { Context } from 'hono'
import { handleServiceError } from '../lib/route-errors.ts'
import { rootProxy } from '../services/root-proxy.ts'

function isRootProxyPath(pathname: string): boolean {
  return pathname.startsWith('/https://') || pathname.startsWith('/https:/')
}

export async function rootProxyHandler(c: Context) {
  if (!isRootProxyPath(c.req.path)) return c.notFound()
  if (c.req.method !== 'GET') {
    return c.json({ error: 'Method Not Allowed' }, 405, { Allow: 'GET' })
  }

  try {
    return await rootProxy(c.req.raw)
  } catch (err) {
    return handleServiceError(c, err)
  }
}