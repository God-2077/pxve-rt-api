import assert from 'node:assert/strict'
import { test } from 'node:test'
import { appRequest, installFetch, withEnv, type FetchCall } from './helpers.ts'

test('proxy forwards public targets and strips sensitive headers', async () => {
  let captured: FetchCall | undefined
  const restore = installFetch(call => {
    captured = call
    return new Response('proxied content', {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    })
  })

  try {
    const res = await appRequest('/proxy/https://93.184.216.34/target?x=1', {
      headers: {
        authorization: 'Bearer should-not-forward',
        cookie: 'PHPSESSID=should-not-forward',
        'x-forwarded-for': '203.0.113.9',
        'x-real-ip': '203.0.113.9',
        'x-auth': 'PHPSESSID=should-not-forward',
      },
    })

    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'proxied content')
    assert.equal(res.headers.get('cache-control'), 'no-store')

    assert.ok(captured)
    assert.equal(captured.url, 'https://93.184.216.34/target?x=1')
    assert.equal(captured.headers.get('authorization'), null)
    assert.equal(captured.headers.get('cookie'), null)
    assert.equal(captured.headers.get('x-forwarded-for'), null)
    assert.equal(captured.headers.get('x-real-ip'), null)
    assert.equal(captured.headers.get('x-auth'), null)
  } finally {
    restore()
  }
})

test('proxy blocks private, metadata, file and ip-echo targets', async () => {
  for (const path of [
    '/proxy/http://127.0.0.1/',
    '/proxy/http://169.254.169.254/latest/meta-data/',
    '/proxy/file:///etc/passwd',
    '/proxy/https://httpbin.org/ip',
  ]) {
    const res = await appRequest(path)
    assert.equal(res.status, 400, path)
  }
})

test('proxy injects PIXIV_COOKIE for pixiv GET only', async () => {
  const calls: FetchCall[] = []
  const restore = installFetch(call => {
    calls.push(call)
    return new Response('ok', { status: 200 })
  })

  await withEnv({ PIXIV_COOKIE: 'PHPSESSID=server-session', PROXY_DNS_CHECK: '0' }, async () => {
    try {
      const res = await appRequest('/proxy/https://www.pixiv.net/ajax/test?x=1')
      assert.equal(res.status, 200)
      assert.equal(calls[0]?.headers.get('cookie'), 'PHPSESSID=server-session')

      const anon = await appRequest('/proxy/https://www.pixiv.net/ajax/test?_anon=1')
      assert.equal(anon.status, 200)
      assert.equal(calls[1]?.headers.get('cookie'), null)
    } finally {
      restore()
    }
  })
})

test('proxy honors PROXY_ALLOW_DOMAINS', async () => {
  await withEnv({ PROXY_ALLOW_DOMAINS: 'example.com', PROXY_DNS_CHECK: '0' }, async () => {
    const res = await appRequest('/proxy/https://93.184.216.34/target')
    assert.equal(res.status, 400)
  })
})

test('proxy repairs a normalized https target path', async () => {
  let captured: FetchCall | undefined
  const restore = installFetch(call => {
    captured = call
    return new Response('ok', { status: 200 })
  })

  try {
    const res = await appRequest('/proxy/https:/93.184.216.34/repair')
    assert.equal(res.status, 200)
    assert.equal(captured?.url, 'https://93.184.216.34/repair')
  } finally {
    restore()
  }
})

test('proxy forwards POST body', async () => {
  let captured: FetchCall | undefined
  const restore = installFetch(call => {
    captured = call
    return new Response('ok', { status: 200 })
  })

  try {
    const res = await appRequest('/proxy/https://93.184.216.34/post', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hello: 'world' }),
    })
    assert.equal(res.status, 200)
    assert.equal(captured?.method, 'POST')
    assert.equal(captured?.headers.get('content-type'), 'application/json')
    assert.ok(captured?.body)
  } finally {
    restore()
  }
})