import { Hono } from 'hono'
import { handleServiceError } from '../lib/route-errors.ts'
import {
  fetchPixivisionDetail,
  fetchPixivisionDetailContent,
  fetchPixivisionList,
} from '../services/pixivision.ts'

const LIST_TYPES = new Set([
  'illustration',
  'manga',
  'novels',
  'column',
  'recommend',
  'interview',
  'news',
  'cosplay',
  'music',
  'goods',
  'how-to-draw',
  'draw-step-by-step',
  'textures',
  'art-references',
  'how-to-make',
  'deskwatch',
  'try-out',
])

function validateListQuery(query: Record<string, string>) {
  if (query.page && !/^\d+$/.test(query.page)) return 'Invalid page'
  if (query.type && !LIST_TYPES.has(query.type)) return 'Invalid type'
  return null
}

export const pixivisionRoute = new Hono()

pixivisionRoute.get('/pixivision', async c => {
  const query = c.req.query()
  const invalid = validateListQuery(query)
  if (invalid) return c.json({ error: invalid }, 400)

  try {
    const data = await fetchPixivisionList(query)
    return c.json(data, 200, { 'Cache-Control': 'max-age=21600' })
  } catch (err) {
    return handleServiceError(c, err)
  }
})

pixivisionRoute.get('/pixivision/list', async c => {
  const query = c.req.query()
  const invalid = validateListQuery(query)
  if (invalid) return c.json({ error: invalid }, 400)

  try {
    const data = await fetchPixivisionList(query)
    return c.json(data, 200, { 'Cache-Control': 'max-age=21600' })
  } catch (err) {
    return handleServiceError(c, err)
  }
})

pixivisionRoute.get('/pixivision/detail', async c => {
  const query = c.req.query()
  if (!query.id || !/^\d+$/.test(query.id)) return c.json({ error: 'Invalid id' }, 400)

  try {
    const data = await fetchPixivisionDetailContent(query)
    return c.json(data, 200, { 'Cache-Control': 'max-age=21600' })
  } catch (err) {
    return handleServiceError(c, err)
  }
})

pixivisionRoute.get('/pixivision/:id', async c => {
  const id = c.req.param('id')
  if (!/^\d+$/.test(id)) return c.json({ error: 'Invalid id' }, 400)

  try {
    const data = await fetchPixivisionDetail(id, c.req.query())
    return c.json(data, 200, { 'Cache-Control': 'max-age=21600' })
  } catch (err) {
    return handleServiceError(c, err)
  }
})