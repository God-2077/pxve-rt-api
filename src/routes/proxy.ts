import { Hono } from 'hono'
import { handleServiceError } from '../lib/route-errors.ts'
import { commonProxy } from '../services/proxy.ts'

export const proxyRoute = new Hono().on(['GET', 'POST'], '/proxy/*', async c => {
  try {
    return await commonProxy(c.req.raw)
  } catch (err) {
    return handleServiceError(c, err)
  }
})