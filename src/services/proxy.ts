import { BROWSER_UA, getMaxDownloadBytes, getPixivCookie } from '../config.ts'
import { responseFromUpstream, safeFetch } from '../lib/http.ts'
import { assertSafeUrl } from '../lib/ssrf.ts'
import { targetFromProxyPath } from '../lib/url.ts'

const FORWARD_REQUEST_HEADERS = [
  'accept',
  'accept-language',
  'content-type',
  'user-agent',
  'range',
  'if-none-match',
  'if-modified-since',
]

export async function commonProxy(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const target = targetFromProxyPath(url.pathname, url.search)
  if (!target) throw new Error('blocked protocol: empty target')
  const reqUrl = await assertSafeUrl(target)

  const headers = new Headers()
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = req.headers.get(name)
    if (value) headers.set(name, value)
  }
  if (!headers.get('user-agent')) headers.set('user-agent', BROWSER_UA)

  if (reqUrl.hostname !== 'yande.re') {
    headers.set('origin', reqUrl.origin)
    headers.set('referer', reqUrl.origin + '/')
  }

  const cookie = getPixivCookie()
  const result = await safeFetch(reqUrl, {
    method: req.method,
    headers,
    body: req.body,
    cookieFor: targetUrl => {
      if (
        req.method.toUpperCase() === 'GET' &&
        targetUrl.hostname === 'www.pixiv.net' &&
        !targetUrl.search.includes('_anon=1') &&
        cookie
      ) {
        return cookie
      }
      return undefined
    },
  })

  return responseFromUpstream(result.response, {
    cacheControl: 'no-store',
    maxBytes: getMaxDownloadBytes(),
  })
}