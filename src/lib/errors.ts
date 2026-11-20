export class UpstreamError extends Error {
  status: number

  constructor(message = 'Upstream error', status = 502) {
    super(message)
    this.name = 'UpstreamError'
    this.status = status
  }
}

export class PayloadTooLargeError extends Error {
  constructor() {
    super('Payload too large')
    this.name = 'PayloadTooLargeError'
  }
}

export function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')
}