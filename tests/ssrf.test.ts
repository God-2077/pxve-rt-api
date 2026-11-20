import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertSafeUrl } from '../src/lib/ssrf.ts'
import { withEnv } from './helpers.ts'

test('ssrf blocks private, metadata, localhost and non-http protocols', async () => {
  await assert.rejects(() => assertSafeUrl('https://127.0.0.1/'), /blocked private/)
  await assert.rejects(() => assertSafeUrl('http://192.168.1.1/'), /blocked private/)
  await assert.rejects(() => assertSafeUrl('http://169.254.169.254/latest/meta-data/'), /blocked/)
  await assert.rejects(() => assertSafeUrl('http://localhost/'), /blocked private/)
  await assert.rejects(() => assertSafeUrl('file:///etc/passwd'), /blocked protocol/)
})

test('ssrf blocks ip-echo hosts by default', async () => {
  await assert.rejects(() => assertSafeUrl('https://httpbin.org/ip'), /blocked bad request/)
  await assert.rejects(() => assertSafeUrl('https://api.ipify.org?format=json'), /blocked bad request/)
})

test('ssrf allowlist and blocklist', async () => {
  await withEnv({ PROXY_ALLOW_DOMAINS: 'www.pixiv.net,*.pixivision.net', PROXY_DNS_CHECK: '0' }, async () => {
    assert.equal((await assertSafeUrl('https://www.pixiv.net/')).hostname, 'www.pixiv.net')
    assert.equal((await assertSafeUrl('https://en.pixivision.net/zh/')).hostname, 'en.pixivision.net')
    await assert.rejects(() => assertSafeUrl('https://93.184.216.34/'), /blocked allowlist/)
  })

  await withEnv({ PROXY_BLOCK_DOMAINS: '*.example.com', PROXY_DNS_CHECK: '0' }, async () => {
    await assert.rejects(() => assertSafeUrl('https://api.example.com/'), /blocked domain/)
    assert.equal((await assertSafeUrl('https://93.184.216.34/')).hostname, '93.184.216.34')
  })
})

test('ssrf can disable DNS checks only explicitly', async () => {
  await withEnv({ PROXY_DNS_CHECK: '0' }, async () => {
    assert.equal((await assertSafeUrl('https://www.pixiv.net/')).hostname, 'www.pixiv.net')
  })

  await assert.rejects(() => assertSafeUrl('http://127.0.0.1/'), /blocked private/)
})

test('ssrf allows ip-echo hosts when explicitly enabled', async () => {
  await withEnv({ PROXY_DNS_CHECK: '0', PROXY_ALLOW_IP_ECHO: '1' }, async () => {
    assert.equal((await assertSafeUrl('https://httpbin.org/ip')).hostname, 'httpbin.org')
  })
})