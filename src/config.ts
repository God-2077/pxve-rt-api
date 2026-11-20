export function getEnv(name: string, fallback?: string): string | undefined {
  return process.env[name] ?? fallback
}

export function getCommaEnv(name: string): string[] {
  const raw = getEnv(name)
  return (
    raw
      ?.trim()
      ?.split(',')
      ?.map(s => s.trim())
      ?.filter(Boolean) || []
  )
}

export function getNumberEnv(name: string, fallback: number): number {
  const raw = getEnv(name)
  if (raw === undefined || raw.trim() === '') return fallback
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function getBoolEnv(name: string, fallback: boolean): boolean {
  const raw = getEnv(name)
  if (raw === undefined || raw.trim() === '') return fallback
  return !['0', 'false', 'no', 'off'].includes(raw.trim().toLowerCase())
}

export function getApiToken(): string | undefined {
  return getEnv('API_TOKEN')?.trim() || undefined
}

export function getPixivCookie(): string | undefined {
  return getEnv('PIXIV_COOKIE')?.trim() || undefined
}

export function getMaxDownloadBytes(): number {
  return getNumberEnv('MAX_DOWNLOAD_BYTES', 20 * 1024 * 1024)
}

export function getUpstreamTimeoutMs(): number {
  return getNumberEnv('UPSTREAM_TIMEOUT_MS', 25_000)
}

export function getRootAllowedHosts(): string[] {
  const configured = getCommaEnv('ROOT_PROXY_ALLOW_DOMAINS')
  return configured.length ? configured : ['www.pixiv.net', 'www.pixivision.net']
}

export const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'

export const PIXIV_API_HEADERS: Record<string, string> = {
  'App-OS': 'Android',
  'App-OS-Version': 'Android 16.0',
  'App-Version': '6.194.0',
  'Accept-Language': 'zh-CN',
  'User-Agent': 'PixivAndroidApp/6.194.0 (Android 16.0; Pixel 9)',
}

export const PIXIV_WEB_HEADERS: Record<string, string> = {
  'accept': 'application/json',
  'accept-language': 'zh-CN,zh;q=0.9',
  'accept-charset': 'UTF-8',
  'user-agent': BROWSER_UA,
  'origin': 'https://www.pixiv.net',
  'referer': 'https://www.pixiv.net/',
}

export function getProxyBlockPrivate(): boolean {
  return getBoolEnv('PROXY_BLOCK_PRIVATE', true)
}

export function getProxyDnsCheck(): boolean {
  return getBoolEnv('PROXY_DNS_CHECK', true)
}