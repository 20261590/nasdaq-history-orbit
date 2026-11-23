import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { integrationCanaries, integrationHosts } from '../fixtures/integration'

export async function wireProviders(page: Page) {
  await page.route('https://dns.google/**', async route => {
    const query = new URL(route.request().url()).searchParams
    const hostname = query.get('name')
    if (!hostname) throw new Error('Missing synthetic DNS question')
    const host = integrationHosts.find(value => value.hostname === hostname)
    const ip = host?.locations[0]?.ip
    await route.fulfill({ json: {
      Status: ip ? 0 : 3,
      Answer: ip && query.get('type') === 'A' ? [{ name: hostname, type: 1, data: ip }] : [],
    } })
  })
  await page.route('https://get.geojs.io/**', async route => {
    const ip = route.request().url().split('/').pop()?.replace('.json', '')
    const location = integrationHosts.flatMap(host => host.locations).find(value => value.ip === ip)
    if (!location) throw new Error('Unexpected synthetic provider address')
    await route.fulfill({ json: {
      ip, country: location.country, country_code: location.countryCode,
      latitude: String(location.latitude), longitude: String(location.longitude),
      region: location.region, accuracy: location.accuracyRadiusKm,
    } })
  })
}

export async function upload(page: Page, records: unknown) {
  await page.getByTestId('file-upload').setInputFiles({
    name: 'integration.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(records)),
  })
}

export async function assertPrivateSurfaces(page: Page, captured: readonly string[], extra: readonly string[] = []) {
  const local = await page.evaluate(async () => JSON.stringify({
    html: document.documentElement.outerHTML,
    local: { ...localStorage }, session: { ...sessionStorage }, cookies: document.cookie,
    databases: await indexedDB.databases(),
  }))
  for (const secret of [...integrationCanaries, ...extra]) {
    for (const representation of [secret, encodeURIComponent(secret)]) {
      expect(local).not.toContain(representation)
      expect(captured.join('\n')).not.toContain(representation)
    }
  }
}
