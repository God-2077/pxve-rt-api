import {
  BROWSER_UA,
  getMaxDownloadBytes,
  getPixivCookie,
  getRootAllowedHosts,
} from '../config.ts'
import { UpstreamError } from '../lib/errors.ts'
import { responseFromUpstream, safeFetch } from '../lib/http.ts'
import { assertSafeUrl, isHostAllowed } from '../lib/ssrf.ts'
import { targetFromRootPath } from '../lib/url.ts'

const FORWARD_REQUEST_HEADERS = ['accept', 'accept-language', 'user-agent']

export async function rootProxy(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const target = targetFromRootPath(url.pathname, url.search)
  if (!target) throw new UpstreamError('Invalid target URL', 400)

  let targetUrl: URL
  try {
    targetUrl = new URL(target)
  } catch {
    throw new UpstreamError('Invalid target URL', 400)
  }

  if (targetUrl.protocol !== 'https:') {
    throw new UpstreamError('Only https targets are allowed', 400)
  }

  const allowedHosts = getRootAllowedHosts()
  if (!isHostAllowed(targetUrl.hostname, allowedHosts)) {
    throw new UpstreamError('Host not allowed', 403)
  }

  targetUrl = await assertSafeUrl(targetUrl.href, { allowedHosts })

  const headers = new Headers()
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = req.headers.get(name)
    if (value) headers.set(name, value)
  }
  if (!headers.get('user-agent')) headers.set('user-agent', BROWSER_UA)
  headers.set('origin', targetUrl.origin)
  headers.set('referer', targetUrl.origin + '/')

  const cookie = getPixivCookie()
  const result = await safeFetch(targetUrl, {
    method: 'GET',
    headers,
    allowedHosts,
    cookieFor: nextUrl => {
      if (nextUrl.hostname === 'www.pixiv.net' && !nextUrl.search.includes('_anon=1') && cookie) {
        return cookie
      }
      return undefined
    },
  })

  return responseFromUpstream(result.response, {
    cacheControl: result.usedCookie ? 'no-store' : 'public, max-age=600',
    maxBytes: getMaxDownloadBytes(),
  })
}