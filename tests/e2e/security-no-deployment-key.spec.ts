import { expect, test } from '@playwright/test'

const personalKey = 'SYNTHETIC_PERSONAL_SAFE_BROWSING_KEY_742'

test('missing deployment key is explicit and optional personal key remains usable', async ({ page }) => {
  const calls: string[] = []
  await page.route('https://safebrowsing.googleapis.com/**', async route => {
    calls.push(route.request().url())
    expect(route.request().headers()['x-goog-api-key']).toBe(personalKey)
    await route.fulfill({ json: { cacheDuration: '60s', fullHashes: [] } })
  })
  await page.goto('/')
  await page.getByTestId('file-upload').setInputFiles({
    name: 'no-deployment-key.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify([
      { url: 'https://example.com/path', timestamp: '2026-11-10T09:00:00Z' },
    ])),
  })
  await page.getByRole('tab', { name: '개인정보 점검', exact: true }).click()
  const panel = page.getByRole('region', { name: 'Google 사이트 위험 점검' })
  const start = panel.getByRole('button', { name: '위험 점검 시작', exact: true })

  await expect(page.getByTestId('safe-browsing-key-status')).toContainText('배포 키 미설정')
  await expect(page.getByLabel('개인 Safe Browsing API 키', { exact: true })).toBeVisible()
  await page.getByRole('checkbox', { name: /Google 외부 평판 조회에 동의합니다/ }).check()
  await expect(start).toBeDisabled()
  expect(calls).toEqual([])

  await page.getByLabel('개인 Safe Browsing API 키', { exact: true }).fill(personalKey)
  await expect(start).toBeEnabled()
  await start.click()
  await expect(panel.locator('[data-reputation-status="NO_KNOWN_THREAT"]')).toHaveCount(1)
  expect(calls).toHaveLength(1)

  const dom = await page.locator('html').evaluate(element => element.outerHTML)
  expect(dom).not.toContain(personalKey)
  expect(calls[0]).not.toContain(personalKey)
})
