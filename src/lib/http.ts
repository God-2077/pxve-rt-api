import { getMaxDownloadBytes, getUpstreamTimeoutMs } from '../config.ts'
import { PayloadTooLargeError } from './errors.ts'
import { assertSafeUrl } from './ssrf.ts'

const DROP_RESPONSE_HEADERS = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-encoding',
  'content-length',
  'set-cookie',
  'etag',
  'last-modified',
  'alt-svc',
  'server',
  'x-powered-by',
  'x-vercel-id',
  'x-vercel-cache',
  'x-vercel-execution-region',
  'x-vercel-proxied-for',
  'x-vercel-proxy-signature',
  'x-vercel-proxy-signature-ts',
  'x-vercel-deployment-url',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-forwarded-port',
  'x-real-ip',
]

export async function readLimitedBody(response: Response, maxBytes = getMaxDownloadBytes()): Promise<Uint8Array> {
  const contentLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new PayloadTooLargeError()
  }

  if (!response.body) return new Uint8Array()

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        throw new PayloadTooLargeError()
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  if (chunks.length === 1) return chunks[0]
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return merged
}

export function filterResponseHeaders(source: Headers, bodyLength: number): Headers {
  const headers = new Headers(source)
  for (const name of DROP_RESPONSE_HEADERS) headers.delete(name)
  if (bodyLength > 0) headers.set('content-length', String(bodyLength))
  return headers
}

export interface UpstreamResponseOptions {
  cacheControl: string
  maxBytes?: number
}

export async function responseFromUpstream(
  upstream: Response,
  opts: UpstreamResponseOptions
): Promise<Response> {
  const body = await readLimitedBody(upstream, opts.maxBytes)
  const headers = filterResponseHeaders(upstream.headers, body.byteLength)
  headers.set('cache-control', opts.cacheControl)
  if (opts.cacheControl.includes('no-store')) {
    headers.set('cdn-cache-control', 'no-store')
  }

  return new Response(body.byteLength ? (body as unknown as BodyInit) : null, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  })
}

type NodeRequestInit = RequestInit & { duplex?: 'half' }

export async function fetchUpstream(url: URL | string, init: NodeRequestInit, timeoutMs = getUpstreamTimeoutMs()) {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  } as RequestInit)
}

export interface SafeFetchOptions {
  method?: string
  headers?: HeadersInit
  body?: BodyInit | null
  allowedHosts?: string[]
  maxRedirects?: number
  timeoutMs?: number
  cookieFor?: (url: URL) => string | undefined
  skipDns?: boolean
}

export interface SafeFetchResult {
  response: Response
  finalUrl: URL
  usedCookie: boolean
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

export async function safeFetch(startUrl: URL, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const maxRedirects = opts.maxRedirects ?? 3
  const timeoutMs = opts.timeoutMs ?? getUpstreamTimeoutMs()
  let current = startUrl
  let method = (opts.method ?? 'GET').toUpperCase()
  let body = opts.body ?? undefined
  let usedCookie = false

  for (let redirects = 0; ; redirects++) {
    const checked = await assertSafeUrl(current.href, {
      allowedHosts: opts.allowedHosts,
      skipDns: opts.skipDns,
    })

    const headers = new Headers(opts.headers)
    headers.delete('cookie')
    const cookie = opts.cookieFor?.(checked)
    if (cookie) {
      headers.set('cookie', cookie)
      usedCookie = true
    }

    const response = await fetch(checked, {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : body,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      duplex: 'half',
    } as NodeRequestInit)

    if (!REDIRECT_STATUSES.has(response.status)) {
      return { response, finalUrl: checked, usedCookie }
    }

    const location = response.headers.get('location')
    if (!location || redirects >= maxRedirects) {
      return { response, finalUrl: checked, usedCookie }
    }

    if (body && response.status !== 303) {
      return { response, finalUrl: checked, usedCookie }
    }

    await response.body?.cancel()

    const next = new URL(location, checked)
    if (!['http:', 'https:'].includes(next.protocol)) {
      throw new Error(`blocked redirect protocol: ${next.protocol}`)
    }

    if (response.status === 303 || ((response.status === 301 || response.status === 302) && method !== 'GET' && method !== 'HEAD')) {
      method = 'GET'
      body = undefined
    }

    current = next
  }
}