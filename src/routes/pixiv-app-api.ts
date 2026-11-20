import { Hono } from 'hono'
import { handleServiceError } from '../lib/route-errors.ts'
import { proxyPixivAppApi } from '../services/pixiv-app-api.ts'

export const pixivAppApiRoute = new Hono().on(
  ['GET', 'POST'],
  ['/pixiv-oauth/*', '/pixiv-app-api/*'],
  async c => {
    try {
      return await proxyPixivAppApi(c.req.url, c.req.raw)
    } catch (err) {
      return handleServiceError(c, err)
    }
  }
)