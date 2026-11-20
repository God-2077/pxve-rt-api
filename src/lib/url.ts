export function repairTargetUrl(raw: string): string {
  let target = raw
  if (/^https?%3A/i.test(target)) {
    try {
      target = decodeURIComponent(target)
    } catch {
      // keep raw
    }
  }

  const match = target.match(/^(https?):(\/*)(.*)$/i)
  if (match) {
    return `${match[1].toLowerCase()}://${match[3]}`
  }
  return target
}

export function targetFromRootPath(pathname: string, search: string): string {
  return repairTargetUrl(pathname.replace(/^\//, '') + search)
}

export function targetFromProxyPath(pathname: string, search: string): string {
  const prefix = '/proxy/'
  if (!pathname.startsWith(prefix)) return ''
  return repairTargetUrl(pathname.slice(prefix.length) + search)
}