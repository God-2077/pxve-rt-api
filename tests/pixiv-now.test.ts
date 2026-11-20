import assert from 'node:assert/strict'
import { test } from 'node:test'
import { appRequest, installFetch, jsonResponse, withEnv, type FetchCall } from './helpers.ts'

test('pixiv-now forwards x-auth and csrf token', async () => {
  let captured: FetchCall | undefined
  const restore = installFetch(call => {
    captured = call
    return jsonResponse({ body: { illustId: '1' } })
  })

  try {
    const res = await appRequest('/api/pixiv-now/http/ajax/illust/1?full=1&lang=zh', {
      headers: {
        'x-auth': 'PHPSESSID=user-session',
        'x-csrf-token': 'csrf-token',
      },
    })

    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { illustId: '1' })
    assert.equal(res.headers.get('cache-control'), 'no-store')

    assert.ok(captured)
    assert.equal(captured.url, 'https://www.pixiv.net/ajax/illust/1?full=1&lang=zh')
    assert.equal(captured.headers.get('cookie'), 'PHPSESSID=user-session')
    assert.equal(captured.headers.get('x-csrf-token'), 'csrf-token')
    assert.equal(captured.headers.get('referer'), 'https://www.pixiv.net/')
  } finally {
    restore()
  }
})

test('pixiv-now falls back to server cookie for GET but not for _anon', async () => {
  const calls: FetchCall[] = []
  const restore = installFetch(call => {
    calls.push(call)
    return jsonResponse({ body: { ok: true } })
  })

  await withEnv({ PIXIV_COOKIE: 'PHPSESSID=server-session', PROXY_DNS_CHECK: '0' }, async () => {
    try {
      const res = await appRequest('/api/pixiv-now/http/ajax/discovery/artworks?mode=all')
      assert.equal(res.status, 200)
      assert.equal(res.headers.get('cache-control'), 'no-store')
      assert.equal(calls[0]?.headers.get('cookie'), 'PHPSESSID=server-session')

      const anon = await appRequest('/api/pixiv-now/http/ajax/illust/discovery?_anon=1')
      assert.equal(anon.status, 200)
      assert.equal(anon.headers.get('cache-control'), 'max-age=3600')
      assert.equal(calls[1]?.headers.get('cookie'), null)
      assert.ok(!calls[1]?.url.includes('_anon=1'))
    } finally {
      restore()
    }
  })
})

test('pixiv-now POST requires user credentials', async () => {
  let called = false
  const restore = installFetch(() => {
    called = true
    return jsonResponse({ ok: true })
  })

  try {
    const res = await appRequest('/api/pixiv-now/http/rpc/index.php', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    assert.equal(res.status, 401)
    assert.equal(called, false)
  } finally {
    restore()
  }
})

test('pixiv-now POST forwards client credentials and method', async () => {
  let captured: FetchCall | undefined
  const restore = installFetch(call => {
    captured = call
    return jsonResponse({ body: { ok: true } })
  })

  try {
    const res = await appRequest('/api/pixiv-now/http/ajax/illust/1/bookmark', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-auth': 'PHPSESSID=user-session',
      },
      body: JSON.stringify({ mode: 'add' }),
    })
    assert.equal(res.status, 200)
    assert.equal(captured?.method, 'POST')
    assert.equal(captured?.headers.get('cookie'), 'PHPSESSID=user-session')
    assert.equal(captured?.headers.get('content-type'), 'application/json')
  } finally {
    restore()
  }
})

test('pixiv-now ranking maps x_restrict and caching', async () => {
  let captured: FetchCall | undefined
  const restore = installFetch(call => {
    captured = call
    return jsonResponse({
      contents: [{ illust_id: 1, illust_content_type: { sexual: 2 } }],
    })
  })

  try {
    const res = await appRequest('/api/pixiv-now/ranking?mode=daily&date=20260101&p=1&format=json')
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'max-age=86400')

    const body = await res.json()
    assert.equal(body.contents[0].x_restrict, 2)
    assert.ok(captured?.url.startsWith('https://www.pixiv.net/ranking.php?'))
    assert.equal(captured?.headers.get('referer'), 'https://www.pixiv.net/ranking.php')
  } finally {
    restore()
  }
})

test('pixiv-now ranking validates mode and upstream status', async () => {
  const invalid = await appRequest('/api/pixiv-now/ranking?mode=nope')
  assert.equal(invalid.status, 400)

  const restore = installFetch(() => new Response('bad', { status: 500 }))
  try {
    const res = await appRequest('/api/pixiv-now/ranking?mode=daily')
    assert.equal(res.status, 502)
  } finally {
    restore()
  }
})