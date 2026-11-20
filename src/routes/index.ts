import { Hono } from 'hono'
import { pixivAppApiRoute } from './pixiv-app-api.ts'
import { pixivNowRoute } from './pixiv-now.ts'
import { pixivisionRoute } from './pixivision.ts'
import { proxyRoute } from './proxy.ts'

export const routes = new Hono()
  .get('/', c =>
    c.json({
      name: 'pxve-api-vercel',
      status: 'ok',
      mode: 'refresh-token',
      routes: [
        '/pixiv-oauth/*',
        '/pixiv-app-api/*',
        '/api/pixiv-now/http/*',
        '/api/pixiv-now/ranking',
        '/api/pixivision',
        '/api/pixivision/list',
        '/api/pixivision/detail',
        '/api/pixivision/:id',
        '/proxy/*',
        '/https://www.pixiv.net/*',
        '/https://www.pixivision.net/*',
      ],
    })
  )
  .route('/', pixivAppApiRoute)
  .route('/api', pixivNowRoute)
  .route('/api', pixivisionRoute)
  .route('/', proxyRoute)