import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { actualRenderer } from './renderer'
import { mkdir, writeFile } from 'node:fs/promises'

const records = [
  { url: 'https://github.com/private?token=never-share', timestamp: '2026-11-10T09:12:34Z', title: '<img src=x onerror=alert(1)>' },
  { url: 'https://naver.com/search?q=private-query', timestamp: '2026-11-10T10:00:00Z' },
  { url: 'https://github.com/project', timestamp: '2026-11-10T11:00:00Z' },
  { url: 'https://wikipedia.org/wiki/History', timestamp: '2026-11-11T12:00:00Z' },
  { url: 'https://github.com/settings', timestamp: '2026-11-11T13:00:00Z' },
  { url: 'https://unresolved.example.com', timestamp: '2026-11-11T14:00:00Z' },
  { url: 'https://naver.com', timestamp: '2026-11-12T08:00:00Z' },
  { url: 'https://github.com', timestamp: '2026-11-12T09:00:00Z' },
]

async function upload(page: Page, input: unknown = records) {
  await page.getByTestId('file-upload').setInputFiles({
    name: 'history.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(input)),
  })
}

async function mockWire(page: Page) {
  await page.route('https://dns.google/**', async route => {
    const url = new URL(route.request().url())
    const host = url.searchParams.get('name')
    const address = host === 'naver.com' ? '223.130.200.104' : host === 'wikipedia.org' ? '208.80.154.224' : '8.8.8.8'
    await route.fulfill({ json: { Status: host?.startsWith('unresolved') ? 3 : 0, Answer: url.searchParams.get('type') === 'A' && !host?.startsWith('unresolved') ? [{ name: host, type: 1, data: address }] : [] } })
  })
  await page.route('https://get.geojs.io/**', async route => {
    const ip = route.request().url().split('/').pop()?.replace('.json', '') ?? ''
    const korean = ip.startsWith('223')
    await route.fulfill({ json: {
      ip, country: korean ? 'South Korea' : 'United States', country_code: korean ? 'KR' : 'US',
      region: korean ? 'Seoul' : 'California', city: korean ? 'Seoul' : 'Mountain View',
      latitude: korean ? '37.5665' : '37.386', longitude: korean ? '126.978' : '-122.0838',
      accuracy: 50, asn: 15169, organization_name: 'QA wire fixture',
    } })
  })
}

test.beforeAll(async () => { await mkdir('docs/evidence', { recursive: true }) })

test('upload consent globe analytics playback and filters remain local', async ({ page }) => {
  const providerRequests: string[] = []
  page.on('request', request => { if (/dns\.google|get\.geojs/.test(request.url())) providerRequests.push(request.url()) })
  await mockWire(page)
  await page.goto('/')
  await page.screenshot({ path: 'docs/evidence/initial-desktop.png', fullPage: true })
  await upload(page)
  await expect(page.getByTestId('total-visits')).toHaveText('8회')
  await expect(page.getByTestId('unique-sites')).toHaveText('4개')
  await expect(page.getByRole('button', { name: '위치 조회', exact: true })).toBeDisabled()
  expect(providerRequests).toEqual([])
  await page.getByRole('checkbox', { name: '외부 위치 조회에 동의합니다' }).check()
  await page.getByRole('button', { name: '위치 조회', exact: true }).click()
  await expect(page.getByTestId('globe')).toHaveAttribute('data-markers', '2')
  await expect(page.getByText(/성공 3 · 실패 1/)).toBeVisible()
  expect(providerRequests.filter(url => url.includes('dns.google'))).toHaveLength(8)
  for (const request of providerRequests.filter(url => url.includes('dns.google'))) {
    const url = new URL(request)
    expect(url.searchParams.get('name')).not.toMatch(/private|token|query|https|\/|\?/)
    expect(url.searchParams.get('edns_client_subnet')).toBe('0.0.0.0/0')
  }
  await page.getByRole('button', { name: /01 github.com/ }).click()
  await expect(page.getByRole('heading', { name: 'github.com', exact: true })).toBeVisible()
  await expect(page.getByText('QA wire fixture', { exact: false }).first()).toBeVisible()
  await page.getByRole('button', { name: '재생', exact: true }).click()
  await expect(page.getByRole('slider', { name: '방문 타임라인' })).not.toHaveValue('0')
  await page.getByRole('button', { name: '일시정지', exact: true }).click()
  await expect(page.getByRole('button', { name: '재생', exact: true })).toBeVisible()
  await page.getByRole('slider', { name: '방문 타임라인' }).fill('0')
  await expect(page.getByTestId('globe')).toHaveAttribute('data-arcs', '1')
  await page.getByLabel('시작일', { exact: true }).fill('2026-11-12')
  await expect(page.getByTestId('total-visits')).toHaveText('2회')
  await page.getByRole('button', { name: '필터 초기화' }).click()
  await expect(page.getByTestId('total-visits')).toHaveText('8회')
  await page.getByLabel('국가 필터').selectOption('South Korea')
  await expect(page.getByTestId('total-visits')).toHaveText('2회')
  await page.getByRole('button', { name: '필터 초기화' }).click()
  await page.screenshot({ path: 'docs/evidence/analysis-desktop.png', fullPage: true })
  await page.getByRole('button', { name: '대한민국 확대' }).click()
  await page.screenshot({ path: 'docs/evidence/korea-desktop.png', fullPage: true })
  await page.getByRole('button', { name: '결과 공유' }).click()
  const dialog = page.getByRole('dialog', { name: '나의 궤도 공유' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('status')).toContainText('결과 공유 기능은 팀원 개발 및 통합 예정입니다.')
  await expect(dialog).toContainText('NOT IMPLEMENTED')
  await expect(page.getByTestId('total-visits')).toHaveText('8회')
})

test('mobile demo responsive layout preserves chart and placeholder controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.screenshot({ path: 'docs/evidence/initial-mobile.png', fullPage: true })
  await page.getByRole('button', { name: /예제 데이터로 둘러보기/ }).click()
  await expect(page.getByText('MOCK · 예시 위치')).toBeVisible()
  await expect(page.getByTestId('globe')).not.toHaveAttribute('data-markers', '0')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'docs/evidence/analysis-mobile.png', fullPage: true })
  await page.getByRole('button', { name: '결과 공유' }).click()
  await expect(page.getByRole('dialog', { name: '나의 궤도 공유' })).toBeVisible()
  await page.screenshot({ path: 'docs/evidence/share-mobile.png', fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('legacy share fragment and malformed upload fail safely without provider calls', async ({ page }) => {
  const requests: string[] = []
  page.on('request', request => { if (/dns\.google|get\.geojs/.test(request.url())) requests.push(request.url()) })
  await page.goto('/#v=1&d=broken')
  await expect(page.getByRole('alert')).toContainText('공유 링크 복원은 NOT IMPLEMENTED 상태입니다.')
  await page.screenshot({ path: 'docs/evidence/error-desktop.png', fullPage: true })
  await page.getByRole('button', { name: '공유 닫기' }).click()
  await page.getByTestId('file-upload').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{') })
  await expect(page.getByRole('alert')).toContainText('올바른 JSON')
  expect(requests).toEqual([])
})

test('fifty thousand events retain statistics and bounded globe work', async ({ page }) => {
  const input = Array.from({ length: 50_000 }, (_, index) => ({ url: `https://${index % 2 ? 'github.com' : 'naver.com'}/item/${index}`, timestamp: 1_793_520_000_000 + index * 60_000 }))
  await page.goto('/')
  const start = Date.now()
  await upload(page, input)
  await expect(page.getByTestId('total-visits')).toHaveText('50,000회')
  const uploadMs = Date.now() - start
  await page.getByLabel('위치 공급자').selectOption('mock')
  await page.getByRole('button', { name: '위치 조회', exact: true }).click()
  await expect(page.getByTestId('globe')).not.toHaveAttribute('data-markers', '0')
  const frames = await page.evaluate(() => new Promise<number[]>(resolve => {
    const times: number[] = []
    let previous = performance.now()
    const tick = (now: number) => { times.push(now - previous); previous = now; if (times.length === 60) resolve(times); else requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  }))
  await writeFile('docs/evidence/browser-performance.json', JSON.stringify({ count: 50_000, uploadMs, frameMeanMs: frames.reduce((a, b) => a + b, 0) / frames.length, p95FrameMs: [...frames].sort((a, b) => a - b)[56], renderer: await actualRenderer(page), note: 'Renderer queried from the actual globe WebGL context; timings are environment-specific.' }, null, 2))
  await expect(page.getByText(/1 \/ (800|[1-7]\d\d)/)).toBeVisible()
})
