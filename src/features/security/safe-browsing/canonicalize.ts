import ipaddr from 'ipaddr.js'
import { SafeBrowsingError } from './types'

export interface CanonicalUrl {
  readonly url: string
  readonly host: string
  readonly path: string
  readonly query: string | null
  readonly isIp: boolean
}
/** Keep decoded octets intact, including invalid UTF-8 and literal percent signs. */
function unescapeBytes(value: string): string {
  let current = Array.from(value, (character) => {
    // C1 controls in the legacy fixtures represent single raw octets.
    if (character.charCodeAt(0) <= 0x9f) return character
    return Array.from(new TextEncoder().encode(character), (byte) => String.fromCharCode(byte)).join('')
  }).join('')
  while (/%[0-9a-f]{2}/iu.test(current)) {
    current = current.replace(/%([0-9a-f]{2})/giu, (_, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)))
  }
  return current
}

function escapeBytes(value: string): string {
  return Array.from(value, (character) => {
    const byte = character.charCodeAt(0)
    return byte <= 32 || byte >= 127 || character === '#' || character === '%'
      ? `%${byte.toString(16).toUpperCase().padStart(2, '0')}` : character
  }).join('')
}

function canonicalHost(raw: string): { readonly host: string; readonly isIp: boolean } {
  const host = raw.replace(/^\.+|\.+$/gu, '').replace(/\.{2,}/gu, '.')
    .replace(/[A-Z]/gu, (letter) => letter.toLowerCase())
  if (!host) throw new SafeBrowsingError('INVALID_URL')
  if (host.startsWith('[')) {
    const literal = host.slice(1, -1)
    if (!host.endsWith(']') || literal.includes('%') || !ipaddr.IPv6.isValid(literal)) {
      throw new SafeBrowsingError('INVALID_URL')
    }
    const address = ipaddr.IPv6.parse(literal)
    if (address.isIPv4MappedAddress()
      || address.match(ipaddr.IPv6.parse('64:ff9b::'), 96)) {
      return { host: address.toByteArray().slice(12).join('.'), isIp: true }
    }
    return { host: `[${address.toRFC5952String()}]`, isIp: true }
  }
  if (/[:[\]\\]/u.test(host)) throw new SafeBrowsingError('INVALID_URL')
  if (ipaddr.IPv4.isValid(host)) {
    return { host: ipaddr.IPv4.parse(host).toString(), isIp: true }
  }
  // Only IDNA uses URL: feeding it the whole URL would lose decoded # and bytes.
  if (/[\xc2-\xf4]/u.test(host)) {
    let unicode: string
    try {
      unicode = new TextDecoder('utf-8', { fatal: true })
        .decode(Uint8Array.from(host, (character) => character.charCodeAt(0)))
    } catch (error) {
      // Invalid UTF-8 remains raw octets, just as it does in the path and query.
      if (error instanceof TypeError) return { host: escapeBytes(host), isIp: false }
      throw error
    }
    try {
      return canonicalHost(new URL(`http://${unicode}`).hostname)
    } catch (error) {
      if (error instanceof TypeError) throw new SafeBrowsingError('INVALID_URL')
      throw error
    }
  }
  return { host: escapeBytes(host), isIp: false }
}

export function canonicalizeUrl(raw: string): CanonicalUrl {
  // A decoded # is data. Only the original fragment delimiter removes a suffix.
  const stripped = raw.replace(/[\t\r\n]/gu, '').trim().split('#', 1)[0] ?? ''
  const decoded = unescapeBytes(stripped)
  const explicitScheme = /^([a-z][a-z0-9+.-]*):\/\//iu.exec(decoded)
  const scheme = explicitScheme?.[1]?.toLowerCase() ?? 'http'
  if (scheme !== 'http' && scheme !== 'https') throw new SafeBrowsingError('INVALID_URL')
  const rest = explicitScheme ? decoded.slice(explicitScheme[0].length) : decoded
  const authorityEnd = rest.search(/[/?]/u)
  const authority = authorityEnd < 0 ? rest : rest.slice(0, authorityEnd)
  const tail = authorityEnd < 0 ? '' : rest.slice(authorityEnd)
  const server = authority.slice(authority.lastIndexOf('@') + 1)
  const hostPort = /^(\[[^\]]*\]|[^:]*)(?::([0-9]+))?$/u.exec(server)
  if (!hostPort?.[1] || (hostPort[2] !== undefined && Number(hostPort[2]) > 65535)) {
    throw new SafeBrowsingError('INVALID_URL')
  }
  const { host, isIp } = canonicalHost(hostPort[1])
  const queryIndex = tail.indexOf('?')
  const rawPath = (queryIndex < 0 ? tail : tail.slice(0, queryIndex)) || '/'
  const query = queryIndex < 0 ? null : escapeBytes(tail.slice(queryIndex + 1))
  const components: string[] = []
  // Resolve dot segments before collapsing empty slash segments.
  for (const component of rawPath.split('/').slice(1)) {
    if (component === '..') components.pop()
    else if (component !== '.') components.push(component)
  }
  if (/(?:^|\/)\.{1,2}$/u.test(rawPath)) components.push('')
  const path = escapeBytes(`/${components.join('/')}`.replace(/\/{2,}/gu, '/'))
  return { url: `${scheme}://${host}${path}${query === null ? '' : `?${query}`}`, host, path, query, isIp }
}
