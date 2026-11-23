import { describe, expect, it } from 'vitest'
import { inspectSecurity } from '../src/core/security'
import type { FindingType } from '../src/core/security'
import type { Visit } from '../src/model'

const timestamp = Date.UTC(2025, 4, 12, 19, 45)
function visit(url?: string, order = 0): Visit {
  return {
    id: 'DEMO_TOKEN_123-supplied-id',
    hostname: 'private.news.example.com',
    domain: 'example.com',
    title: 'DEMO_TOKEN_123 private title',
    timestamp,
    order,
    ...(url === undefined ? {} : { url }),
  }
}

describe('local security inspection', () => {
  it.each([['password', 'abc'], ['pwd', '1']] as const)(
    'retains short explicit %s values as potential credentials', (key, value) => {
      const report = inspectSecurity([visit(`https://example.com/?${key}=${value}`)])
      expect(report.rows[0]?.severity).toBe('priority')
      expect(report.rows[0]?.findings.map(finding => finding.type)).toEqual(['password'])
    },
  )

  it('retains long explicit tokens without exposing their values', () => {
    const value = 'A'.repeat(64_000)
    const report = inspectSecurity([visit(`https://example.com/?access_token=${value}`)])
    expect(report.rows[0]?.severity).toBe('priority')
    expect(report.rows[0]?.findings.map(finding => finding.type)).toEqual(['authentication'])
    expect(JSON.stringify(report)).not.toContain(value)
  })

  it.each([
    ['access_token', 'authentication'],
    ['REFRESH-TOKEN', 'authentication'],
    ['%69d_token', 'authentication'],
    ['api.key', 'authentication'],
    ['AUTHORIZATION', 'authentication'],
    ['auth', 'authentication'],
    ['client_secret', 'authentication'],
    ['password', 'password'],
    ['passwd', 'password'],
    ['pwd', 'password'],
    ['session', 'session'],
    ['SID', 'session'],
  ] satisfies readonly (readonly [string, FindingType])[])(
    'flags plausible credential value under %s without disclosing it', (key, type) => {
      const report = inspectSecurity([visit(`https://private.news.example.com/?${key}=DEMO_TOKEN_123`)])
      expect(report.rows[0]?.findings.map((finding) => finding.type)).toContain(type)
      expect(report.rows[0]?.severity).toBe('priority')
      expect(JSON.stringify(report)).not.toContain('DEMO_TOKEN_123')
    },
  )

  it('recognizes credentials in fragments, paths and userinfo after decoding', () => {
    const report = inspectSecurity([
      visit('https://example.com/#/profile?ACCESS%5Ftoken=DEMO_TOKEN_123', 1),
      visit('https://example.com/password/DEMO_TOKEN_123', 2),
      visit('https://guest:DEMO_TOKEN_123@private.example.com:8443/secret', 3),
    ])
    expect(report.rows.map((row) => row.findings.map((finding) => finding.type)))
      .toEqual([['authentication'], ['password'], ['password']])
    expect(report.rows.map((row) => row.maskedUrl)).toEqual([
      'https://example.com/#access_token=***',
      'https://example.com/***',
      'https://example.com/***',
    ])
  })

  it('classifies emails and formatted, international and phone-keyed numbers as caution', () => {
    const report = inspectSecurity([
      visit('https://example.com/contact/alex%40private.example.org', 1),
      visit('https://example.com/?phone=%2B1-202-555-0142', 2),
      visit('https://example.com/#tel=010-1234-5678', 3),
      visit('https://alex%40private.example.org@example.com/?mobile=2025550142', 4),
    ])
    expect(report.rows.map((row) => row.findings.map((finding) => finding.type)))
      .toEqual([['email'], ['phone'], ['phone'], ['email', 'phone']])
    expect(report.totals.byType).toMatchObject({ email: 2, phone: 3 })
    expect(report.totals.byLevel.caution).toBe(4)
    const serialized = JSON.stringify(report)
    for (const privateValue of ['alex@private.example.org', '2025550142', '010-1234-5678', '+1-202-555-0142']) {
      expect(serialized).not.toContain(privateValue)
    }
  })

  it('keeps opaque identifiers as review hints and benign IDs unflagged', () => {
    const report = inspectSecurity([
      visit('https://example.com/?ref=abcdefgh12345678.ijklmnop12345678.qrstuvwx12345678', 1),
      visit('https://example.com/other/abcdefgh1234567890abcdef1234567890', 2),
      visit('http://example.com/order/123456789?code=welcome&key=default&id=42&date=2025-01-01&action=login', 3),
      visit('https://example.com/?access_token=none&password=login&session=active', 4),
    ])
    expect(report.rows.map((row) => row.severity)).toEqual(['reference', 'reference', 'none', 'none'])
    expect(report.totals).toMatchObject({
      inspected: 4, unavailable: 0, flagged: 2,
      byType: { identifier: 2, authentication: 0, password: 0, session: 0 },
      byLevel: { priority: 0, caution: 0, reference: 2, none: 2 },
    })
  })

  it('masks every original URL component including short userinfo credentials', () => {
    const report = inspectSecurity([
      visit('https://usrX:pwX@private.news.example.com:8443/secret/deep?campaign=DEMO_TOKEN_123&access_token=#private', 8),
    ])
    expect(report.rows[0]).toMatchObject({
      order: 8, siteLabel: 'example.com', day: '2025-05-12',
      maskedUrl: 'https://example.com/***?***=***&access_token=***#***',
      severity: 'priority', findings: [{
        type: 'password', severity: 'priority', reason: 'Possible password in URL',
      }],
    })
    const serialized = JSON.stringify(report)
    for (const privateValue of ['DEMO_TOKEN_123', 'private.news', 'secret', 'deep', 'campaign',
      'usrX', 'pwX', '8443', 'private title', 'supplied-id']) {
      expect(serialized).not.toContain(privateValue)
    }
  })

  it('retains distinct numeric orders despite duplicate supplied IDs', () => {
    const report = inspectSecurity([
      visit('https://a.example.com/?access_token=DEMO_TOKEN_123', 7),
      visit('https://b.example.com/', 9),
    ])
    expect(report.rows.map((row) => row.order)).toEqual([7, 9])
    expect(report.totals).toMatchObject({ inspected: 2, unavailable: 0, flagged: 1 })
  })

  it('counts missing, malformed and unsupported URLs as unavailable rather than clean', () => {
    const report = inspectSecurity([
      visit(undefined, 1), visit('not a url', 2), visit('file:///private/path', 3),
      visit('https://192.168.0.1/secret', 4), visit('https://example.com/', 5),
    ])
    expect(report.rows.map((row) => row.order)).toEqual([5])
    expect(report.totals).toMatchObject({
      inspected: 1, unavailable: 4, flagged: 0,
      byLevel: { none: 1, priority: 0, caution: 0, reference: 0 },
    })
  })

  it('inspects 100000 visits with counts independent of supplied identifiers', () => {
    const visits = Array.from({ length: 100_000 }, (_, index) =>
      visit(index % 100 === 0
        ? 'https://example.com/?access_token=DEMO_TOKEN_123'
        : 'https://example.com/?order=12345', index))
    const start = performance.now()
    const report = inspectSecurity(visits)
    const elapsedMs = Math.round(performance.now() - start)
    console.info(JSON.stringify({ securityVisits: visits.length, elapsedMs }))
    expect(report.totals).toMatchObject({
      inspected: 100_000, unavailable: 0, flagged: 1000,
      byType: { authentication: 1000 }, byLevel: { priority: 1000, none: 99_000 },
    })
    expect(report.rows.at(-1)?.order).toBe(99_999)
  }, 30_000)
})
