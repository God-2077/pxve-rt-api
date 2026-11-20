import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import { handleServiceError } from '../lib/route-errors.ts'
import { request } from '../services/pixiv-now.ts'

const RANK_MODES = new Set(['daily', 'weekly', 'monthly', 'rookie', 'daily_r18', 'weekly_r18'])
const RANK_CONTENTS = new Set(['all', 'illust', 'manga', 'ugoira'])

export const pixivNowRoute = new Hono()

pixivNowRoute.on(['GET', 'POST'], '/pixiv-now/http/*', async c => {
  const slug = c.req.path.replace('/api/pixiv-now/http', '')
  if (!slug || !/(^\/ajax)|(^\/rpc)|(\.php$)/i.test(slug)) return c.notFound()

  const token = getCookie(c, 'PHPSESSID') || c.req.header('x-auth')
  if (c.req.method === 'POST' && !token) {
    return c.json({ error: 'POST requests require user credentials (x-auth header or PHPSESSID cookie)' }, 401)
  }

  try {
    const { data, usedServerCookie } = await request({
      method: c.req.method,
      path: slug,
      params: c.req.query(),
      data: c.req.raw.body,
      headers: c.req.header(),
    })

    return c.json(data, 200, {
      'Cache-Control': token || usedServerCookie ? 'no-store' : 'max-age=3600',
    })
  } catch (err) {
    return handleServiceError(c, err)
  }
})

pixivNowRoute.get('/pixiv-now/ranking', async c => {
  const query = c.req.query()
  if (query.mode && !RANK_MODES.has(query.mode)) return c.json({ error: 'Invalid mode' }, 400)
  if (query.content && !RANK_CONTENTS.has(query.content)) return c.json({ error: 'Invalid content' }, 400)
  if (query.date && !/^\d{8}$/.test(query.date)) return c.json({ error: 'Invalid date' }, 400)
  if (query.p && !/^\d+$/.test(query.p)) return c.json({ error: 'Invalid page' }, 400)

  try {
    const { data, usedServerCookie } = await request({
      path: '/ranking.php',
      params: query,
      headers: c.req.header(),
      specHeaders: { referer: 'https://www.pixiv.net/ranking.php' },
    })

    if (Array.isArray(data?.contents)) {
      data.contents = data.contents.map((item: any) => {
        item.x_restrict = item?.illust_content_type?.sexual || 0
        return item
      })
    }

    return c.json(data, 200, {
      'Cache-Control': usedServerCookie ? 'no-store' : 'max-age=86400',
    })
  } catch (err) {
    return handleServiceError(c, err)
  }
})