import { expect, test } from '@playwright/test'
import { assertPrivateSurfaces, upload } from './helpers'

test('security email filtering keeps raw credentials out of local surfaces', async ({ page }) => {
  const captured: string[] = []
  page.on('console', event => captured.push(event.text()))
  page.on('pageerror', error => captured.push(error.message))
  page.on('request', request => captured.push(request.url(), request.postData() ?? ''))
  await page.goto('/')
  await upload(page, [
    { url: 'https://example.com/?access_token=DEMO_TOKEN_123&email=demo%40example.com', timestamp: '2026-11-11T10:00:00Z', title: 'DEMO_PRIVATE_TITLE_785' },
    { url: 'https://github.com/?id=42&code=200&key=layout', timestamp: '2026-11-11T10:05:00Z' },
  ])
  await page.getByRole('tab', { name: '개인정보 점검' }).click()
  await expect(page.locator('.security-metrics > div').filter({ hasText: '탐지된 기록' }).locator('dd')).toHaveText('1건')
  await page.getByRole('combobox', { name: '탐지 종류', exact: true }).selectOption('email')
  await expect(page.locator('.finding-list > li')).toHaveCount(1)
  await assertPrivateSurfaces(page, captured, ['demo@example.com'])
})
