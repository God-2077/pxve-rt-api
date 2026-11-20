import { PIXIV_API_HEADERS, getMaxDownloadBytes, getUpstreamTimeoutMs } from '../config.ts'
import { responseFromUpstream } from '../lib/http.ts'

const FORWARDED_HEADERS = ['Authorization', 'Content-Type', 'X-Client-Time', 'X-Client-Hash']

export async function proxyPixivAppApi(reqUrl: string, req: Request): Promise<Response> {
  const url = new URL(reqUrl)
  url.protocol = 'https:'
  url.port = ''

  if (url.pathname.startsWith('/pixiv-app-api/')) {
    url.host = 'app-api.pixiv.net'
    url.pathname = url.pathname.replace('/pixiv-app-api', '')
  } else if (url.pathname.startsWith('/pixiv-oauth/')) {
    url.host = 'oauth.secure.pixiv.net'
    url.pathname = url.pathname.replace('/pixiv-oauth', '')
  } else {
    throw new Error('Not found')
  }

  const headers = new Headers(PIXIV_API_HEADERS)
  for (const key of FORWARDED_HEADERS) {
    const value = req.headers.get(key)
    if (value) headers.set(key, value)
  }

  const method = req.method.toUpperCase()
  const upstream = await fetch(url, {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : req.body,
    signal: AbortSignal.timeout(getUpstreamTimeoutMs()),
    duplex: 'half',
  } as RequestInit & { duplex: 'half' })

  return responseFromUpstream(upstream, {
    cacheControl: 'no-store',
    maxBytes: getMaxDownloadBytes(),
  })
}