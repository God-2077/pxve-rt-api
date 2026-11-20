import assert from 'node:assert/strict'
import { test } from 'node:test'
import { appRequest, installFetch, withEnv, type FetchCall } from './helpers.ts'

test('root proxy forwards pixiv HTML and sanitizes response headers', async () => {
  let captured: FetchCall | undefined
  const restore = installFetch(call => {
    captured = call
    return new Response('<html>stories</html>', {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'set-cookie': 'secret=1',
        'content-encoding': 'gzip',
        'content-length': '999',
      },
    })
  })

  await withEnv({ ROOT_PROXY_ALLOW_DOMAINS: 'www.pixiv.net', PROXY_DNS_CHECK: '0' }, async () => {
    try {
      const res = await appRequest('/https://www.pixiv.net/stories/tags/test/artworks/2026-01-01')
      assert.equal(res.status, 200)
      assert.equal(await res.text(), '<html>stories</html>')
      assert.equal(res.headers.get('cache-control'), 'public, max-age=600')
      assert.equal(res.headers.get('set-cookie'), null)
      assert.equal(res.headers.get('content-encoding'), null)

      assert.ok(captured)
      assert.equal(captured.url, 'https://www.pixiv.net/stories/tags/test/artworks/2026-01-01')
      assert.equal(captured.headers.get('origin'), 'https://www.pixiv.net')
      assert.equal(captured.headers.get('referer'), 'https://www.pixiv.net/')
    } finally {
      restore()
    }
  })
})

test('root proxy injects server cookie and disables caching', async () => {
  const calls: FetchCall[] = []
  const restore = installFetch(call => {
    calls.push(call)
    return new Response('{"ok":true}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })

  await withEnv(
    {
      ROOT_PROXY_ALLOW_DOMAINS: 'www.pixiv.net',
      PROXY_DNS_CHECK: '0',
      PIXIV_COOKIE: 'PHPSESSID=server-session',
    },
    async () => {
      try {
        const res = await appRequest('/https://www.pixiv.net/ajax/stories/tag_stories/details/many?lang=zh')
        assert.equal(res.status, 200)
        assert.equal(res.headers.get('cache-control'), 'no-store')
        assert.equal(res.headers.get('cdn-cache-control'), 'no-store')
        assert.equal(calls[0]?.headers.get('cookie'), 'PHPSESSID=server-session')

        const anon = await appRequest('/https://www.pixiv.net/ajax/stories?_anon=1')
        assert.equal(anon.status, 200)
        assert.equal(anon.headers.get('cache-control'), 'public, max-age=600')
        assert.equal(calls[1]?.headers.get('cookie'), null)
      } finally {
        restore()
      }
    }
  )
})

test('root proxy follows allowed redirects and drops cookie on host change', async () => {
  const calls: FetchCall[] = []
  const restore = installFetch(call => {
    calls.push(call)
    if (call.url.includes('www.pixiv.net')) {
      return new Response(null, {
        status: 302,
        headers: { location: 'https://www.pixivision.net/zh/stories/1' },
      })
    }
    return new Response('final page', { status: 200, headers: { 'content-type': 'text/html' } })
  })

  await withEnv({ PROXY_DNS_CHECK: '0', PIXIV_COOKIE: 'PHPSESSID=server-session' }, async () => {
    try {
      const res = await appRequest('/https://www.pixiv.net/stories/tags/a/2026-01-01')
      assert.equal(res.status, 200)
      assert.equal(await res.text(), 'final page')
      assert.equal(res.headers.get('cache-control'), 'no-store')
      assert.equal(calls.length, 2)
      assert.equal(calls[0].headers.get('cookie'), 'PHPSESSID=server-session')
      assert.equal(calls[1].headers.get('cookie'), null)
    } finally {
      restore()
    }
  })
})

test('root proxy rejects hosts outside the allowlist', async () => {
  const res = await appRequest('/https://evil.example/path')
  assert.equal(res.status, 403)
  assert.deepEqual(await res.json(), { error: 'Host not allowed' })
})

test('root proxy rejects redirects outside the allowlist', async () => {
  const restore = installFetch(() => {
    return new Response(null, {
      status: 302,
      headers: { location: 'https://evil.example/path' },
    })
  })

  await withEnv({ PROXY_DNS_CHECK: '0' }, async () => {
    try {
      const res = await appRequest('/https://www.pixiv.net/redirect')
      assert.equal(res.status, 400)
    } finally {
      restore()
    }
  })
})

test('root proxy only accepts GET and normalized paths', async () => {
  const post = await appRequest('/https://www.pixiv.net/stories', { method: 'POST' })
  assert.equal(post.status, 405)
  assert.equal(post.headers.get('allow'), 'GET')

  const restore = installFetch(() => new Response('ok', { status: 200 }))
  await withEnv({ ROOT_PROXY_ALLOW_DOMAINS: 'www.pixiv.net', PROXY_DNS_CHECK: '0' }, async () => {
    try {
      const res = await appRequest('/https:/www.pixiv.net/stories/tags/a/2026-01-01')
      assert.equal(res.status, 200)
    } finally {
      restore()
    }
  })
})