import { parseCookie } from 'cookie'
import { stringify } from 'qs'
import { PIXIV_WEB_HEADERS, getPixivCookie, getUpstreamTimeoutMs } from '../config.ts'
import { UpstreamError } from '../lib/errors.ts'

export function objectToQueryString(params?: Record<string, any>): string {
  if (!params) return ''
  return '?' + stringify(params, { arrayFormat: 'repeat' })
}

export interface PixivNowRequestOptions {
  method?: string
  path?: string
  params?: Record<string, any>
  data?: BodyInit | null
  headers?: Record<string, string>
  specHeaders?: Record<string, string>
}

export interface PixivNowResult {
  data: any
  usedServerCookie: boolean
}

export async function request({
  method = 'GET',
  path = '/',
  params,
  data,
  headers = {},
  specHeaders = {},
}: PixivNowRequestOptions): Promise<PixivNowResult> {
  const url = new URL(path, 'https://www.pixiv.net')
  const query = { ...(params ?? {}) }
  const isAnon = query._anon === '1'
  if (isAnon) delete query._anon

  const clientCookies = parseCookie(headers.cookie || '')
  const xAuth = headers['x-auth'] || ''
  const serverCookie = getPixivCookie()

  let cookie = ''
  let usedServerCookie = false
  if (xAuth) {
    cookie = xAuth
  } else if (clientCookies.PHPSESSID) {
    cookie = headers.cookie || ''
  } else if (!isAnon && serverCookie) {
    cookie = serverCookie
    usedServerCookie = true
  }

  const requestHeaders: Record<string, string> = {
    ...PIXIV_WEB_HEADERS,
    ...specHeaders,
  }

  if (cookie) requestHeaders.cookie = cookie
  if (headers['content-type']) requestHeaders['content-type'] = headers['content-type']

  let csrfToken = headers['x-csrf-token'] || clientCookies.CSRFTOKEN
  if (!csrfToken && usedServerCookie) {
    csrfToken = parseCookie(serverCookie || '').CSRFTOKEN
  }
  if (csrfToken) requestHeaders['x-csrf-token'] = csrfToken

  const reqUrl = url.href + objectToQueryString(query)
  const upperMethod = method.toUpperCase()
  const response = await fetch(reqUrl, {
    method: upperMethod,
    headers: requestHeaders,
    body: upperMethod === 'GET' || upperMethod === 'HEAD' ? undefined : data,
    signal: AbortSignal.timeout(getUpstreamTimeoutMs()),
    duplex: 'half',
  } as RequestInit & { duplex: 'half' })

  if (!response.ok) {
    throw new UpstreamError(
      `Upstream responded ${response.status}`,
      response.status >= 400 && response.status < 500 ? response.status : 502
    )
  }

  let parsed: any
  try {
    parsed = await response.json()
  } catch {
    throw new UpstreamError('Upstream returned invalid JSON')
  }

  return {
    data: parsed?.body || parsed,
    usedServerCookie,
  }
}