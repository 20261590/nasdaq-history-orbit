import { expect, test } from '@playwright/test'
import { resolve } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { observeReleasePage } from './observe'

test('HTTPS security policy and cached deployment version update', async ({ page, request }, info) => {
  const temp = process.env.RC_TMP
  if (!temp) throw new TypeError('RC_TMP missing')
  const errors = await observeReleasePage(page)
  const response = await page.goto('/')
  if (!response) throw new TypeError('Static document response missing')
  const headers = response.headers()
  expect(headers['content-security-policy']).toContain("script-src 'self'")
  expect(headers['content-security-policy']).not.toContain('unsafe-eval')
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['referrer-policy']).toBe('no-referrer')
  expect(headers['x-frame-options']).toBe('DENY')
  expect(headers['cache-control']).toBe('no-cache')
  expect(await page.evaluate(() => location.protocol === 'https:' && isSecureContext)).toBe(true)
  const mainScript = await page.locator('script[type=module]').getAttribute('src')
  if (!mainScript) throw new TypeError('Hashed entry missing')
  const asset = await request.get(mainScript.replace('./', '/'))
  expect(asset.status()).toBe(200)
  expect(asset.headers()['cache-control']).toBe('public, max-age=31536000, immutable')
  const image = await request.get('/earth.webp')
  expect(image.headers()['cache-control']).toBe('no-cache')
  const unchanged = await request.get('/earth.webp', { headers: { 'If-None-Match': image.headers().etag ?? '' } })
  expect(unchanged.status()).toBe(304)
  await writeFile(resolve(temp, 'active-version'), 'A')
  await page.goto('/versioned/')
  await expect(page.locator('html')).toHaveAttribute('data-rc-version', 'A')
  const entryA = await page.locator('script[type=module]').getAttribute('src')
  await writeFile(resolve(temp, 'active-version'), 'B')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-rc-version', 'B')
  const entryB = await page.locator('script[type=module]').getAttribute('src')
  expect(entryB).not.toBe(entryA)
  const violations: unknown = await page.evaluate(() => Reflect.get(window, '__rcCsp'))
  await writeFile(`docs/evidence/rc/cache-${info.project.name}.json`, JSON.stringify({
    engine: info.project.name, localSelfSignedHttps: true, productionDeploymentPerformed: false,
    headers, assetCache: asset.headers()['cache-control'], imageCache: image.headers()['cache-control'],
    imageRevalidation: unchanged.status(), entryA, entryB, versionUpdated: true, violations, errors,
  }, null, 2))
  expect(violations).toEqual([])
  expect(errors).toEqual([])
})
