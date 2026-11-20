import assert from 'node:assert/strict'
import { test } from 'node:test'
import { appRequest, installFetch, jsonResponse, type FetchCall } from './helpers.ts'

test('pixiv-app-api proxies path, auth and strips cookies', async () => {
  let captured: FetchCall | undefined
  const restore = installFetch(call => {
    captured = call
    return jsonResponse(
      { ok: true },
      {
        headers: {
          'set-cookie': 'secret=1',
          'content-encoding': 'gzip',
          'content-length': '999',
        },
      }
    )
  })

  try {
    const res = await appRequest('/pixiv-app-api/v1/user/me', {
      headers: {
        authorization: 'Bearer pixiv-access-token',
        'x-client-time': '2026-01-01T00:00:00Z',
        'x-client-hash': 'abc123',
      },
    })

    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { ok: true })
    assert.equal(res.headers.get('cache-control'), 'no-store')
    assert.equal(res.headers.get('set-cookie'), null)
    assert.equal(res.headers.get('content-encoding'), null)

    assert.ok(captured)
    assert.equal(captured.url, 'https://app-api.pixiv.net/v1/user/me')
    assert.equal(captured.headers.get('authorization'), 'Bearer pixiv-access-token')
    assert.equal(captured.headers.get('x-client-time'), '2026-01-01T00:00:00Z')
    assert.equal(captured.headers.get('x-client-hash'), 'abc123')
    assert.match(captured.headers.get('user-agent') || '', /PixivAndroidApp/)
  } finally {
    restore()
  }
})

test('pixiv-oauth proxies POST body to oauth host', async () => {
  let captured: FetchCall | undefined
  const restore = installFetch(call => {
    captured = call
    return jsonResponse({ response: { access_token: 'new-token' } })
  })

  try {
    const res = await appRequest('/pixiv-oauth/auth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=refresh_token&refresh_token=secret',
    })

    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    assert.ok(captured)
    assert.equal(captured.url, 'https://oauth.secure.pixiv.net/auth/token')
    assert.equal(captured.method, 'POST')
    assert.equal(captured.headers.get('content-type'), 'application/x-www-form-urlencoded')
    assert.ok(captured.body)
  } finally {
    restore()
  }
})

test('pixiv-app-api upstream failure is 502', async () => {
  const restore = installFetch(() => {
    throw new TypeError('network unavailable')
  })

  try {
    const res = await appRequest('/pixiv-app-api/v1/user/me')
    assert.equal(res.status, 502)
    assert.deepEqual(await res.json(), { error: 'Upstream error' })
  } finally {
    restore()
  }
})