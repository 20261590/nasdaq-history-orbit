import { parse } from 'tldts'
import type { Visit } from '../model'
import { publicHostname } from './network'

export type Severity = 'priority' | 'caution' | 'reference' | 'none'
export type FindingType = 'authentication' | 'password' | 'session' | 'email' | 'phone' | 'identifier'
export type ExclusionScope = 'analysis' | 'share'
export type ExclusionChange = {
  readonly order: number
  readonly scope: ExclusionScope
  readonly excluded: boolean
}

export type SecurityFinding = {
  readonly type: FindingType
  readonly severity: Exclude<Severity, 'none'>
  readonly reason: string
}

export type MaskedSecurityRow = {
  readonly order: number
  readonly siteLabel: string
  readonly day: string
  readonly maskedUrl: string
  readonly severity: Severity
  readonly findings: readonly SecurityFinding[]
}

export type SecurityReport = {
  readonly rows: readonly MaskedSecurityRow[]
  readonly totals: {
    readonly inspected: number
    readonly unavailable: number
    readonly flagged: number
    readonly byType: Readonly<Record<FindingType, number>>
    readonly byLevel: Readonly<Record<Severity, number>>
  }
}

const credentialNames: Readonly<Record<string, FindingType>> = {
  accesstoken: 'authentication',
  refreshtoken: 'authentication',
  idtoken: 'authentication',
  apikey: 'authentication',
  auth: 'authentication',
  authorization: 'authentication',
  password: 'password',
  passwd: 'password',
  pwd: 'password',
  clientsecret: 'authentication',
  session: 'session',
  sessionid: 'session',
  sid: 'session',
}
const canonicalNames: Readonly<Record<string, string>> = {
  accesstoken: 'access_token',
  refreshtoken: 'refresh_token',
  idtoken: 'id_token',
  apikey: 'api_key',
  auth: 'auth',
  authorization: 'authorization',
  password: 'password',
  passwd: 'passwd',
  pwd: 'pwd',
  clientsecret: 'client_secret',
  session: 'session',
  sessionid: 'session',
  sid: 'sid',
}
const findingDetails: Readonly<Record<FindingType, SecurityFinding>> = {
  authentication: { type: 'authentication', severity: 'priority', reason: 'Possible authentication credential in URL' },
  password: { type: 'password', severity: 'priority', reason: 'Possible password in URL' },
  session: { type: 'session', severity: 'priority', reason: 'Possible session credential in URL' },
  email: { type: 'email', severity: 'caution', reason: 'Email address in URL' },
  phone: { type: 'phone', severity: 'caution', reason: 'Phone number in URL' },
  identifier: { type: 'identifier', severity: 'reference', reason: 'Possible opaque identifier in URL' },
}
const findingOrder: readonly FindingType[] = [
  'authentication', 'password', 'session', 'email', 'phone', 'identifier',
]
const emailDomain = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,63}$/iu
const jwtPart = /^[a-z0-9_-]{8,}$/iu
const opaquePattern = /^(?=.{24,}$)(?=.*[a-z])(?=.*\d)[a-z0-9_-]+$/iu
const emptyValue = /^(?:none|null|undefined|false|true|yes|no|active|inactive|login|logout|default|test|example|redacted|reset|change|forgot|\*+)$/iu

function normalizedKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/gu, '')
}

function plausibleCredential(value: string): boolean {
  const text = value.trim()
  return text.length > 0 && !emptyValue.test(text)
}

function containsEmail(value: string): boolean {
  if (!value.includes('@')) return false
  // Split once, then validate bounded candidates. Unanchored greedy searches
  // otherwise revisit a long non-email value quadratically.
  for (const candidate of value.split(/[^a-z0-9._%+@-]+/iu)) {
    const at = candidate.indexOf('@')
    if (at < 1 || at > 64 || at !== candidate.lastIndexOf('@')) continue
    const domain = candidate.slice(at + 1)
    if (domain.length <= 253 && emailDomain.test(domain)) return true
  }
  return false
}

function phoneValue(value: string, named: boolean): boolean {
  const text = value.trim()
  const digits = text.replace(/\D/gu, '')
  if (digits.length < 10 || digits.length > 15) return false
  if (named && /^\+?\d{10,15}$/u.test(text)) return true
  return /^\+?\d[\d .()-]*\d$/u.test(text)
    && (text.startsWith('+') || /[ .()-]/u.test(text))
}

function decodedSegment(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch (error) {
    if (error instanceof URIError) return ''
    throw error
  }
}

function maskedParameters(parameters: URLSearchParams): string {
  return [...parameters].map(([key]) => `${canonicalNames[normalizedKey(key)] ?? '***'}=***`).join('&')
}

/** The only output is a newly built, masked DTO; Visit fields never leave this boundary. */
export function inspectSecurity(visits: readonly Visit[]): SecurityReport {
  const rows: MaskedSecurityRow[] = []
  const byType: Record<FindingType, number> = {
    authentication: 0, password: 0, session: 0, email: 0, phone: 0, identifier: 0,
  }
  const byLevel: Record<Severity, number> = { priority: 0, caution: 0, reference: 0, none: 0 }
  let unavailable = 0
  let flagged = 0

  for (const visit of visits) {
    if (!visit.url) { unavailable++; continue }
    let url: URL
    try {
      url = new URL(visit.url)
    } catch (error) {
      if (error instanceof TypeError) { unavailable++; continue }
      throw error
    }
    const hostname = publicHostname(url.hostname)
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !hostname) {
      unavailable++
      continue
    }
    const siteLabel = parse(hostname, { allowPrivateDomains: true }).domain ?? 'IP address'
    const found = new Set<FindingType>()
    const inspectValue = (value: string, key = ''): void => {
      const normalized = normalizedKey(key)
      const credential = credentialNames[normalized]
      if (credential && plausibleCredential(value)) found.add(credential)
      if (containsEmail(value)) found.add('email')
      if (phoneValue(value, normalized === 'phone' || normalized === 'telephone'
        || normalized === 'mobile' || normalized === 'phonenumber' || normalized === 'tel')) found.add('phone')
      const jwt = value.trim().replace(/^Bearer\s+/iu, '').split('.')
      if (!credential && ((jwt.length === 3 && jwt.every(part => jwtPart.test(part)))
        || opaquePattern.test(value))) found.add('identifier')
    }

    if (url.username) inspectValue(decodedSegment(url.username))
    if (url.password) {
      inspectValue(decodedSegment(url.password), 'password')
    }
    const segments = url.pathname.split('/').map(decodedSegment)
    for (let index = 1; index < segments.length; index++) {
      const segment = segments[index] ?? ''
      const [key, ...value] = segment.split('=')
      if (value.length) inspectValue(value.join('='), key)
      else inspectValue(segment, segments[index - 1])
    }
    for (const [key, value] of url.searchParams) inspectValue(value, key)
    const fragment = decodedSegment(url.hash.slice(1))
    if (fragment) {
      inspectValue(fragment)
      const fragmentParameters = new URLSearchParams(fragment.split('?').at(-1))
      for (const [key, value] of fragmentParameters) inspectValue(value, key)
    }

    const findings = findingOrder.filter((type) => found.has(type)).map((type) => findingDetails[type])
    for (const finding of findings) byType[finding.type]++
    const severity: Severity = findings.some((finding) => finding.severity === 'priority') ? 'priority'
      : findings.some((finding) => finding.severity === 'caution') ? 'caution'
        : findings.length ? 'reference' : 'none'
    byLevel[severity]++
    if (severity !== 'none') flagged++
    const maskedFragment = fragment && fragment.includes('=')
      ? maskedParameters(new URLSearchParams(fragment.split('?').at(-1))) : ''
    rows.push({
      order: visit.order,
      siteLabel,
      day: new Date(visit.timestamp).toISOString().split('T')[0],
      maskedUrl: `${url.protocol}//${siteLabel}${url.pathname === '/' ? '/' : '/***'}`
        + `${url.search ? `?${maskedParameters(url.searchParams)}` : ''}`
        + `${url.hash ? `#${maskedFragment || '***'}` : ''}`,
      severity,
      findings,
    })
  }
  return { rows, totals: { inspected: rows.length, unavailable, flagged, byType, byLevel } }
}
