import ipaddr from 'ipaddr.js'
import { parse } from 'tldts'

/** Accept only routable literals, excluding transition, special-use and scoped addresses. */
export function isPublicIp(ip: string): boolean {
  if (ip.includes('%') || !ipaddr.isValid(ip)) return false
  const address = ipaddr.parse(ip)
  if (address instanceof ipaddr.IPv4) {
    return ipaddr.IPv4.isValidFourPartDecimal(ip) && address.range() === 'unicast'
  }
  // Only global unicast space is eligible. This also excludes mapped private IPv4.
  return address.match(ipaddr.IPv6.parse('2000::'), 3) && address.range() === 'unicast'
}

/** URL's IDNA implementation normalizes hostnames; no path/credentials/port is accepted here. */
export function publicHostname(input: string): string | null {
  if (!input || /[\s/@?#\\]/u.test(input)) return null
  const literal = input.replace(/^\[|\]$/gu, '')
  if (ipaddr.isValid(literal)) {
    return isPublicIp(literal) ? ipaddr.parse(literal).toString() : null
  }
  if (input.includes(':')) return null
  let hostname: string
  try {
    const url = new URL(`https://${input}`)
    if (url.port || url.pathname !== '/') return null
    hostname = url.hostname.toLowerCase().replace(/\.$/u, '').replace(/^\[|\]$/gu, '')
  } catch (error) {
    if (error instanceof TypeError) return null
    throw error
  }
  if (ipaddr.isValid(hostname)) return isPublicIp(hostname) ? hostname : null
  if (hostname.length > 253 || !hostname.split('.').every(
    (label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label),
  )) return null
  if (/(?:^|\.)(?:localhost|local|internal|intranet|lan|home|corp|test|invalid|example|onion|alt)$/u.test(hostname)
    || /(?:^|\.)home\.arpa$/u.test(hostname)) return null
  const result = parse(hostname, { allowPrivateDomains: true })
  return result.domain && (result.isIcann || result.isPrivate) ? hostname : null
}

export function registrableDomain(hostname: string): string {
  return parse(hostname, { allowPrivateDomains: true }).domain ?? hostname
}
