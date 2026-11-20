import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { isAbortError, PayloadTooLargeError, UpstreamError } from '../lib/errors.ts'
import { sanitizeError } from '../lib/sanitize.ts'

export function handleServiceError(c: Context, err: unknown) {
  if (err instanceof PayloadTooLargeError) {
    return c.json({ error: 'Payload Too Large' }, 413)
  }
  if (isAbortError(err)) {
    return c.json({ error: 'Upstream timeout' }, 504)
  }
  if (err instanceof UpstreamError) {
    return c.json({ error: err.message }, err.status as ContentfulStatusCode)
  }

  const message = err instanceof Error ? err.message : String(err)
  if (message.startsWith('blocked ')) {
    return c.json({ error: message }, 400)
  }

  console.error('[upstream]:', new Date().toLocaleString('zh'), sanitizeError(err))
  return c.json({ error: 'Upstream error' }, 502)
}