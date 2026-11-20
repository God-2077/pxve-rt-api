import { app } from '../src/app.ts'

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'

export interface FetchCall {
  url: string
  method: string
  headers: Headers
  body: BodyInit | null | undefined
}

export type FetchHandler = (call: FetchCall) => Response | Promise<Response>

export function installFetch(handler: FetchHandler) {
  const original = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(input instanceof Request ? input.headers : init?.headers)
    const call: FetchCall = {
      url: input instanceof Request ? input.url : input.toString(),
      method: (input instanceof Request ? input.method : init?.method || 'GET').toUpperCase(),
      headers,
      body: init?.body,
    }
    return await handler(call)
  }) as typeof fetch
  return () => {
    globalThis.fetch = original
  }
}

export function appRequest(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  if (!headers.has('user-agent')) headers.set('user-agent', UA)
  if (!headers.has('origin')) headers.set('origin', 'https://pixiv.pictures')
  return app.request(path, { ...init, headers })
}

export async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T> | T): Promise<T> {
  const previous = new Map<string, string | undefined>()
  for (const [key, value] of Object.entries(vars)) {
    previous.set(key, process.env[key])
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  try {
    return await fn()
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

export function jsonResponse(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    status: 200,
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    },
  })
}