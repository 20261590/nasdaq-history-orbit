import { devices, expect, test } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { actualRenderer } from './renderer'

const visits = [
  { url: 'https://a.example.com/path?private=secret', timestamp: '2026-11-10T09:00:00+09:00' },
  { url: 'https://unknown.example.com', timestamp: '2026-11-10T01:00:00Z' },
  { url: 'https://b.example.com', timestamp: '2026-11-10T02:00:00Z' },
  { url: 'https://github.com', timestamp: '2026-11-10T03:00:00Z' },
  { url: 'https://www.naver.com', timestamp: '2026-11-11T04:00:00Z' },
  { url: 'https://a.example.com/again', timestamp: '2026-11-11T05:00:00Z' },
]
const phone = devices['iPhone 14']
const mobileOptions = {
  viewport: phone.viewport, deviceScaleFactor: phone.deviceScaleFactor,
  isMobile: phone.isMobile, hasTouch: phone.hasTouch, userAgent: phone.userAgent,
}

for (const mode of ['desktop', 'mobile'] as const) {
  test.describe(`${mode} new user`, () => {
    test.use(mode === 'mobile' ? mobileOptions : { viewport: { width: 1440, height: 1000 } })
    test('upload errors consent uncertainty and faithful local host locations', async ({ page, context }) => {
      const providerRequests: string[] = []
      page.on('request', request => { if (/dns\.google|get\.geojs/.test(request.url())) providerRequests.push(request.url()) })
      let release = () => {}
      const gate = new Promise<void>(resolve => { release = resolve })
      const addresses: Record<string, string> = {
        'a.example.com': '8.8.8.8', 'b.example.com': '168.126.63.1',
        'github.com': '8.8.4.4', 'www.naver.com': '223.130.200.104',
      }
      await page.route('https://dns.google/**', async route => {
        await gate
        const url = new URL(route.request().url())
        const hostname = url.searchParams.get('name') ?? ''
        const ip = addresses[hostname]
        const records = url.searchParams.get('type') === 'A' && ip ? [{ name: hostname, type: 1, data: ip }] : []
        await route.fulfill({ json: { Status: ip ? 0 : 3, Answer: records } })
      })
      await page.route('https://get.geojs.io/**', async route => {
        const ip = decodeURIComponent(route.request().url().split('/').pop()?.replace('.json', '') ?? '')
        const korean = ip.startsWith('168') || ip.startsWith('223')
        await route.fulfill({ json: {
          ip, country: korean ? 'South Korea' : 'United States', country_code: korean ? 'KR' : 'US',
          latitude: korean ? '37.5701' : '37.751', longitude: korean ? '127.0171' : '-97.822',
          ...(ip.startsWith('168') ? { region: 'Seoul', city: 'Jongno-gu', accuracy: 5 } : { accuracy: 200 }),
        } })
      })
      await page.goto('/')
      await expect(page.locator('.earth-preview')).toBeVisible()
      await expect(page.locator('canvas')).toHaveCount(0)
      await page.getByTestId('file-upload').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{') })
      await expect(page.getByRole('alert')).toContainText('올바른 JSON')
      await page.getByTestId('file-upload').setInputFiles({ name: 'history.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(visits)) })
      await expect(page.getByTestId('total-visits')).toHaveText('6회')
      await expect(page.getByTestId('unique-sites')).toHaveText('3개')
      expect(providerRequests).toEqual([])
      await expect(page.getByRole('button', { name: '위치 조회', exact: true })).toBeDisabled()
      await page.getByRole('checkbox', { name: '외부 위치 조회에 동의합니다' }).check()
      await page.getByRole('button', { name: '위치 조회', exact: true }).click()
      await expect(page.getByRole('button', { name: '조회 취소' })).toBeVisible()
      await expect(page.getByRole('progressbar', { name: '위치 조회 진행률' })).toBeVisible()
      release()
      await expect(page.getByRole('button', { name: '조회 취소' })).toBeHidden()
      await expect(page.getByTestId('globe')).toHaveAttribute('data-markers', '2')
      await expect(page.getByTestId('globe')).toHaveAttribute('data-arcs', '0')
      await page.getByRole('button', { name: /01 example.com/ }).click()
      await expect(page.locator('[data-location-precision="country"]')).toContainText('United States (추정)')
      await expect(page.locator('[data-location-precision="region"]')).toContainText('South Korea · Seoul (추정)')
      await expect(page.locator('[data-location-precision="region"]')).toContainText('공급자 도시(미검증): Jongno-gu')
      const renderer = await actualRenderer(page)
      await page.getByRole('button', { name: '대한민국 확대' }).click()
      await page.getByTestId('globe').scrollIntoViewIfNeeded()
      const canvasBox = await page.getByTestId('globe').locator('canvas').boundingBox()
      if (!canvasBox) throw new Error('Globe canvas has no visible bounds')
      const x = canvasBox.x + canvasBox.width / 2
      const y = canvasBox.y + canvasBox.height / 2
      if (mode === 'mobile') {
        const touch = await context.newCDPSession(page)
        await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
        await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 60, y: y + 20 }] })
        await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      } else {
        await page.mouse.move(x, y)
        await page.mouse.down()
        await page.mouse.move(x + 100, y + 20, { steps: 12 })
        await page.mouse.up()
        await page.mouse.wheel(0, -120)
      }
      await page.screenshot({ path: `docs/evidence/phase2/journey-${mode}.png`, fullPage: true })
      await page.getByRole('button', { name: '재생', exact: true }).click()
      await expect(page.getByRole('slider', { name: '방문 타임라인' })).not.toHaveValue('0')
      await page.getByRole('button', { name: '일시정지', exact: true }).click()
      await page.getByRole('slider', { name: '방문 타임라인' }).fill('0')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
      await writeFile(`docs/evidence/phase2/journey-${mode}.json`, JSON.stringify({
        mode, renderer, visits: 6, sites: 3, markers: 2, unknownGapArcs: 0,
      }, null, 2))
    })
  })
}

test('epoch zero and empty date periods are displayed accurately', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('file-upload').setInputFiles('tests/fixtures/epoch.json')
  await expect(page.getByText('1970-01-01 — 1970-01-01 · UTC', { exact: true })).toBeVisible()
  await page.getByLabel('시작일', { exact: true }).fill('2026-01-01')
  await expect(page.getByTestId('total-visits')).toHaveText('0회')
  await expect(page.getByText('— — — · UTC', { exact: true })).toBeVisible()
})

test('unplaceable timestamps preserve valid statistics and disclose suppressed paths', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('file-upload').setInputFiles({
    name: 'partial.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([
      { url: 'https://www.naver.com', timestamp: '2026-11-10T00:00:00Z' },
      { url: 'https://example.com', timestamp: 'not-a-timestamp' },
      { url: 'https://github.com', timestamp: '2026-11-10T01:00:00Z' },
    ])),
  })
  await expect(page.getByTestId('total-visits')).toHaveText('2회')
  await expect(page.getByText(/시각을 배치할 수 없는 기록/)).toBeVisible()
  await page.getByLabel('위치 공급자').selectOption('mock')
  await page.getByRole('button', { name: '위치 조회', exact: true }).click()
  await expect(page.getByTestId('globe')).not.toHaveAttribute('data-markers', '0')
  await expect(page.getByTestId('globe')).toHaveAttribute('data-arcs', '0')
})

test('capped imports never bridge an omitted tail event in the production globe', async ({ page }) => {
  const rows = Array.from({ length: 100_000 }, (_, index) => ({
    url: `https://${index % 2 ? 'github.com' : 'www.naver.com'}/${index}`,
    timestamp: 1_700_000_000_000 + index * 1000,
  }))
  rows.push({ url: 'https://www.daum.net/omitted', timestamp: 1_700_000_000_500 })
  const input = Buffer.from(JSON.stringify(rows))
  expect(input.length).toBeLessThan(20 * 1024 * 1024)
  await page.goto('/')
  await page.getByTestId('file-upload').setInputFiles({ name: 'capped.json', mimeType: 'application/json', buffer: input })
  await expect(page.getByTestId('total-visits')).toHaveText('100,000회')
  await expect(page.getByText(/처리 상한을 넘어 확인하지 못한 기록/)).toBeVisible()
  await page.getByLabel('위치 공급자').selectOption('mock')
  await page.getByRole('button', { name: '위치 조회', exact: true }).click()
  await expect(page.getByTestId('globe')).toHaveAttribute('data-markers', '2')
  await expect(page.getByTestId('globe')).toHaveAttribute('data-arcs', '0')
  await page.screenshot({ path: 'docs/evidence/phase2/cap-ui.png', fullPage: true })
  await writeFile('docs/evidence/phase2/cap-ui.json', JSON.stringify({
    inputRows: rows.length, inputBytes: input.length, validVisits: 100_000, rejected: 1,
    retainedMarkers: 2, unsupportedArcs: 0, skippedTimestamp: 1_700_000_000_500,
  }, null, 2))
})
