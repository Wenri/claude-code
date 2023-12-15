import { randomBytes } from 'crypto'

const URL_WILDCARD_SENTINEL = `zzwildcard${randomBytes(8).toString('hex')}zz`

/**
 * Match an absolute URL against the URL patterns accepted by managed MCP and
 * HTTP-hook allowlists. Wildcards are interpreted within URL components so a
 * hostname wildcard cannot consume a path or another URL delimiter.
 */
export function urlMatchesPattern(url: string, pattern: string): boolean {
  if (pattern === '*') return true

  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    return false
  }

  const substitutedPattern = pattern.replaceAll(
    '*',
    URL_WILDCARD_SENTINEL,
  )
  let wildcardPort = false
  let parsedPattern: URL | undefined

  try {
    parsedPattern = new URL(substitutedPattern)
  } catch {
    const portSubstitutedPattern = substitutedPattern.replace(
      new RegExp(`:${URL_WILDCARD_SENTINEL}(?=[/?#]|$)`),
      ':0',
    )
    if (portSubstitutedPattern !== substitutedPattern) {
      try {
        parsedPattern = new URL(portSubstitutedPattern)
        wildcardPort = true
      } catch {}
    }
  }

  if (!parsedPattern) {
    const comparableUrl = `${parsedUrl.protocol}//${parsedUrl.host}${parsedUrl.pathname}${parsedUrl.search}`
    const escapedPattern = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(
      `^${escapedPattern.replaceAll('*', '[^/]*')}$`,
    ).test(comparableUrl)
  }

  if (
    parsedPattern.protocol !== `${URL_WILDCARD_SENTINEL}:` &&
    parsedPattern.protocol !== parsedUrl.protocol
  ) {
    return false
  }

  const hostname = parsedUrl.hostname.replace(/\.$/, '')
  const hostnamePattern = parsedPattern.hostname
    .replace(/\.$/, '')
    .replaceAll(URL_WILDCARD_SENTINEL, '*')
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replaceAll('*', '[^/]*')
  if (!new RegExp(`^${hostnamePattern}$`).test(hostname)) return false

  if (
    parsedPattern.port === '' &&
    parsedPattern.hostname.includes(URL_WILDCARD_SENTINEL)
  ) {
    wildcardPort = true
  }
  if (!wildcardPort && parsedPattern.port !== parsedUrl.port) return false

  if (
    (parsedPattern.pathname === '/' || parsedPattern.pathname === '') &&
    parsedPattern.search === '' &&
    !substitutedPattern.endsWith('/')
  ) {
    return true
  }

  const pathAndQueryPattern = (parsedPattern.pathname + parsedPattern.search)
    .replaceAll(URL_WILDCARD_SENTINEL, '*')
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replaceAll('*', '.*')
  return new RegExp(`^${pathAndQueryPattern}$`).test(
    parsedUrl.pathname + parsedUrl.search,
  )
}
