import assert from 'node:assert/strict'
import { test } from 'node:test'
import { appRequest, withEnv } from './helpers.ts'

test('health endpoint', async () => {
  const res = await appRequest('/')
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.name, 'pxve-api-vercel')
  assert.equal(body.status, 'ok')
})

test('missing user-agent is forbidden', async () => {
  const res = await appRequest('/', { headers: { 'user-agent': '' } })
  assert.equal(res.status, 403)
})

test('unknown route returns 404 JSON', async () => {
  const res = await appRequest('/not-found')
  assert.equal(res.status, 404)
  assert.deepEqual(await res.json(), { error: 'Not Found' })
})

test('CORS preflight', async () => {
  const res = await appRequest('/api/pixiv-now/ranking', {
    method: 'OPTIONS',
    headers: {
      'origin': 'https://pixiv.pictures',
      'access-control-request-method': 'GET',
      'access-control-request-headers': 'x-auth,x-csrf-token',
    },
  })
  assert.equal(res.status, 204)
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://pixiv.pictures')
  assert.match(res.headers.get('access-control-allow-headers') || '', /x-auth/i)
})

test('ACCEPT_DOMAINS rejects other origins', async () => {
  await withEnv({ ACCEPT_DOMAINS: 'pixiv.pictures,localhost' }, async () => {
    const allowed = await appRequest('/')
    assert.equal(allowed.status, 200)

    const denied = await appRequest('/', { headers: { origin: 'https://evil.example' } })
    assert.equal(denied.status, 403)
  })
})

test('API_TOKEN is enforced when configured', async () => {
  await withEnv({ API_TOKEN: 'secret-token' }, async () => {
    const denied = await appRequest('/')
    assert.equal(denied.status, 401)

    const allowed = await appRequest('/', { headers: { 'x-api-token': 'secret-token' } })
    assert.equal(allowed.status, 200)
  })
})