import { getCommaEnv, getBoolEnv, getProxyBlockPrivate, getProxyDnsCheck } from '../config.ts'

const PRIVATE_RE =
  /^(10\.|100\.(6[4-9]|[7-9]\d|1[0-2][0-7])\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|127\.|0\.0\.0\.0|169\.254\.)/

const METADATA_HOSTS = ['169.254.169.254', 'metadata.google.internal', '100.100.100.200']

const IP_ECHO_BLOCKLIST = [
  'httpbin.org',
  'httpstat.us',
  'postman-echo.com',
  'webhook.site',
  'canhazip.com',
  'checkip.amazonaws.com',
  'checkip.dyndns.com',
  'checkip.dyndns.org',
  'cip.cc',
  'geojs.io',
  'icanhazip.com',
  'ident.me',
  'ifconfig.co',
  'ifconfig.me',
  'ip-api.com',
  'ip.3322.net',
  'ip111.cn',
  'ip138.com',
  'ip.cn',
  'ip.sb',
  'ip.im',
  'ipshu.com',
  'ip2location.io',
  'ipapi.co',
  'ipapi.com',
  'ipcheck.ing',
  'ipdata.co',
  'ipgeolocation.io',
  'ipify.org',
  'ipinfo.io',
  'ipinfo.tw',
  'ipip.net',
  'ipecho.net',
  'ipwho.is',
  'ipwhois.app',
  'myexternalip.com',
  'myip.com',
  'seeip.org',
  'whatismyip.com',
  'whatismyipaddress.com',
  'wtfismyip.com',
]

function isIpEchoHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  return IP_ECHO_BLOCKLIST.some(d => h === d || h.endsWith(`.${d}`))
}

function hostAllowed(hostname: string, allowlist: string[]): boolean {
  return allowlist.some(d => {
    const entry = d.toLowerCase()
    const host = hostname.toLowerCase()
    return entry.startsWith('*.') ? host === entry.slice(2) || host.endsWith(entry.slice(1)) : host === entry
  })
}

function isPrivateHost(hostname: string): boolean {
  const h = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname
  if (h === 'localhost' || h.endsWith('.localhost')) return true

  if (PRIVATE_RE.test(h)) return true
  if (!h.includes(':')) return false
  if (h === '::1' || h === '::') return true
  if (/^fd/i.test(h) || /^fc/i.test(h)) return true
  if (/^fe[89ab]/i.test(h)) return true

  const ffffMatch = h.match(/^::ffff:(?:0+:)*([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i)
  if (ffffMatch) {
    const high = parseInt(ffffMatch[1], 16)
    const low = parseInt(ffffMatch[2], 16)
    const ipv4 = `${(high >> 8) & 0xff}.${(high >> 0) & 0xff}.${(low >> 8) & 0xff}.${(low >> 0) & 0xff}`
    return PRIVATE_RE.test(ipv4)
  }

  const legacyMatch = h.match(/^::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i)
  if (legacyMatch) {
    const high = parseInt(legacyMatch[1], 16)
    const low = parseInt(legacyMatch[2], 16)
    const ipv4 = `${(high >> 8) & 0xff}.${(high >> 0) & 0xff}.${(low >> 8) & 0xff}.${(low >> 0) & 0xff}`
    return PRIVATE_RE.test(ipv4)
  }

  return false
}

function isPrivateIp(ip: string): boolean {
  if (PRIVATE_RE.test(ip)) return true
  if (METADATA_HOSTS.includes(ip)) return true
  if (ip.includes(':')) {
    if (ip === '::1' || ip === '::') return true
    if (/^fd/i.test(ip) || /^fc/i.test(ip)) return true
    if (/^fe[89ab]/i.test(ip)) return true
  }
  return false
}

function isLiteralIp(hostname: string): boolean {
  const h = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true
  return h.includes(':')
}

const DNS_CACHE_TTL_MS = 60_000
const DNS_TIMEOUT_MS = 2_000
const DNS_CACHE_MAX_SIZE = 1000
const dnsCache = new Map<string, { ips: string[]; expiresAt: number }>()

async function resolveHost(host: string, timeoutMs: number): Promise<string[]> {
  const { Resolver } = await import('node:dns/promises')
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      (async () => {
        const resolver = new Resolver({ timeout: timeoutMs, tries: 2 })
        try {
          const [v4, v6] = await Promise.all([
            resolver.resolve4(host).catch(() => [] as string[]),
            resolver.resolve6(host).catch(() => [] as string[]),
          ])
          return [...v4, ...v6]
        } finally {
          try {
            resolver.cancel()
          } catch {
            // ignore
          }
        }
      })(),
      new Promise<string[]>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`DNS resolution timed out: ${host}`)), timeoutMs)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

async function resolveAndCheck(hostname: string): Promise<string[]> {
  const now = Date.now()
  const cached = dnsCache.get(hostname)
  if (cached && now < cached.expiresAt) return cached.ips

  try {
    const ips = await resolveHost(hostname, DNS_TIMEOUT_MS)
    if (ips.length === 0) throw new Error(`DNS resolution returned no records: ${hostname}`)
    dnsCache.set(hostname, { ips, expiresAt: now + DNS_CACHE_TTL_MS })
    if (dnsCache.size > DNS_CACHE_MAX_SIZE) {
      const oldestKey = dnsCache.keys().next().value
      if (oldestKey !== undefined) dnsCache.delete(oldestKey)
    }
    return ips
  } catch (err: unknown) {
    if (err instanceof Error && /timed out/i.test(err.message)) {
      throw new Error(`DNS resolution timed out: ${hostname}`)
    }
    throw err
  }
}

export interface SafeUrlOptions {
  allowPrivate?: boolean
  allowedHosts?: string[]
  skipDns?: boolean
}

export async function assertSafeUrl(input: string, opts?: SafeUrlOptions): Promise<URL> {
  const u = new URL(input)
  if (!['http:', 'https:'].includes(u.protocol)) {
    throw new Error(`blocked protocol: ${u.protocol}`)
  }

  const blockPrivate = getProxyBlockPrivate()
  if (!opts?.allowPrivate && blockPrivate && isPrivateHost(u.hostname)) {
    throw new Error(`blocked private: ${u.hostname}`)
  }
  if (METADATA_HOSTS.includes(u.hostname)) {
    throw new Error('blocked metadata')
  }

  const allowedHosts = opts?.allowedHosts
  if (allowedHosts?.length && !hostAllowed(u.hostname, allowedHosts)) {
    throw new Error(`blocked allowlist: ${u.hostname}`)
  }

  const allow = getCommaEnv('PROXY_ALLOW_DOMAINS')
  if (!allowedHosts?.length && allow.length && !hostAllowed(u.hostname, allow)) {
    throw new Error(`blocked allowlist: ${u.hostname}`)
  }

  const block = getCommaEnv('PROXY_BLOCK_DOMAINS')
  if (block.length && hostAllowed(u.hostname, block)) {
    throw new Error(`blocked domain: ${u.hostname}`)
  }

  if (getBoolEnv('PROXY_ALLOW_IP_ECHO', false) === false && isIpEchoHost(u.hostname)) {
    throw new Error('blocked bad request')
  }

  if (!opts?.skipDns && getProxyDnsCheck() && !isLiteralIp(u.hostname)) {
    const resolvedIps = await resolveAndCheck(u.hostname)
    if (!opts?.allowPrivate && blockPrivate) {
      for (const ip of resolvedIps) {
        if (isPrivateIp(ip)) {
          throw new Error(`blocked resolved private: ${ip} (via ${u.hostname})`)
        }
      }
    }
  }

  return u
}

export function isHostAllowed(hostname: string, allowlist: string[]): boolean {
  return hostAllowed(hostname, allowlist)
}

export { isIpEchoHost }