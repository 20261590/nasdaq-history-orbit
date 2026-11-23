import { expect, test } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { observeReleasePage } from './observe'

test('native browser reads actual HTTPS DNS and GeoIP under release CSP', async ({ page }, info) => {
  const errors = await observeReleasePage(page)
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const urls = [
      'https://dns.google/resolve?name=example.com&type=A&edns_client_subnet=0.0.0.0%2F0',
      'https://dns.google/resolve?name=example.com&type=AAAA&edns_client_subnet=0.0.0.0%2F0',
      'https://get.geojs.io/v1/ip/geo/8.8.8.8.json',
      'https://get.geojs.io/v1/ip/geo/2001%3A4860%3A4860%3A%3A8888.json',
    ]
    const rows = []
    for (const url of urls) {
      const started = performance.now()
      try {
        const response = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(12000) })
        rows.push({ url, status: response.status, headers: Object.fromEntries(response.headers), body: await response.text(), ms: Math.round(performance.now() - started), readable: true })
      } catch (error) {
        rows.push({ url, error: error instanceof Error ? error.message : String(error), readable: false })
      }
    }
    return { origin: location.origin, secureContext: isSecureContext, userAgent: navigator.userAgent, rows }
  })
  const violations: unknown = await page.evaluate(() => Reflect.get(window, '__rcCsp'))
  await writeFile(`docs/evidence/rc/providers-${info.project.name}.json`, JSON.stringify({
    engine: info.project.name, tls: 'local self-signed certificate ignored for QA; not remote CA/deployment proof',
    ...result, violations, errors,
  }, null, 2))
  expect(result.secureContext).toBe(true)
  expect(result.rows.every(row => row.readable && row.status === 200)).toBe(true)
  expect(violations).toEqual([])
  expect(errors).toEqual([])
})
