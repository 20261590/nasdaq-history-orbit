import { expect, test } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { observeReleasePage } from './observe'

test.afterEach(async ({ page }, info) => {
  const violations: unknown = page.isClosed() ? null : await page.evaluate(() => Reflect.get(window, '__rcCsp'))
  await writeFile(`docs/evidence/rc/journey-security-${info.project.name}.json`, JSON.stringify({
    engine: info.project.name, status: info.status, violations,
  }, null, 2))
})

test('supported files globe and timeline work at root and subpath under release CSP', async ({ page, baseURL }, info) => {
  if (!baseURL) throw new TypeError('RC baseURL missing')
  const errors = await observeReleasePage(page)
  const requests: string[] = []
  page.on('request', request => { if (/dns\.google|get\.geojs/.test(request.url())) requests.push(request.url()) })
  let release = () => {}
  const pending = new Promise<void>(resolve => { release = resolve })
  await page.route('https://dns.google/**', async route => {
    await pending
    const url = new URL(route.request().url())
    const name = url.searchParams.get('name') ?? ''
    const ip = name === 'github.com' ? '8.8.8.8' : name === 'www.naver.com' ? '223.130.200.104' : undefined
    await route.fulfill({ json: { Status: ip ? 0 : 3, Answer: ip && url.searchParams.get('type') === 'A' ? [{ name, type: 1, data: ip }] : [] } })
  })
  await page.route('https://get.geojs.io/**', async route => {
    const ip = route.request().url().split('/').pop()?.replace('.json', '')
    const korea = ip?.startsWith('223')
    await route.fulfill({ json: {
      ip, country: korea ? 'South Korea' : 'United States', country_code: korea ? 'KR' : 'US',
      latitude: korea ? '37.5' : '40', longitude: korea ? '127' : '-74',
      accuracy: korea ? 200 : 1000,
    } })
  })
  await page.goto('/')
  await expect(page.locator('.earth-preview')).toBeVisible()
  await page.getByTestId('file-upload').setInputFiles('tests/fixtures/takeout-rc.json')
  await expect(page.getByTestId('total-visits')).toHaveText('6회')
  await expect(page.getByTestId('unique-sites')).toHaveText('3개')
  expect(requests).toEqual([])
  await page.getByRole('checkbox', { name: '외부 위치 조회에 동의합니다' }).check()
  await page.getByRole('button', { name: '위치 조회', exact: true }).click()
  await expect(page.getByRole('button', { name: '조회 취소' })).toBeVisible()
  release()
  await expect(page.getByRole('button', { name: '조회 취소' })).toBeHidden()
  await expect(page.getByTestId('globe')).toHaveAttribute('data-markers', '2')
  await expect(page.getByText(/성공 2 · 실패 1/)).toBeVisible()
  const canvas = page.getByTestId('globe').locator('canvas')
  const webgl = await canvas.count() === 1
  const renderer = webgl ? await canvas.evaluate(element => {
    if (!(element instanceof HTMLCanvasElement)) return 'missing canvas'
    const gl = element.getContext('webgl2')
    if (!gl) return 'WebGL2 missing'
    const extension = gl.getExtension('WEBGL_debug_renderer_info')
    return String(gl.getParameter(extension ? extension.UNMASKED_RENDERER_WEBGL : gl.RENDERER))
  }) : 'unsupported in this browser environment'
  await page.getByRole('slider', { name: '방문 타임라인' }).fill('1')
  await expect(page.getByTestId('globe')).toHaveAttribute('data-arcs', '0')
  await page.getByRole('button', { name: '재생', exact: true }).click()
  await expect(page.getByRole('slider', { name: '방문 타임라인' })).not.toHaveValue('1')
  await page.getByRole('button', { name: '일시정지', exact: true }).click()
  await page.screenshot({ path: `docs/evidence/rc/analysis-${info.project.name}.png`, fullPage: true })
  const beforeSubpath = requests.length
  await page.goto(`${baseURL}/history-orbit`)
  expect(new URL(page.url()).pathname).toBe('/history-orbit/')
  await page.getByTestId('file-upload').setInputFiles('tests/fixtures/takeout-rc.json')
  await expect(page.getByTestId('total-visits')).toHaveText('6회')
  expect(requests.length).toBe(beforeSubpath)
  await page.getByRole('checkbox', { name: '외부 위치 조회에 동의합니다' }).check()
  await page.getByRole('button', { name: '위치 조회', exact: true }).click()
  await expect(page.getByTestId('globe')).toHaveAttribute('data-markers', '2')
  await page.screenshot({ path: `docs/evidence/rc/analysis-subpath-${info.project.name}.png`, fullPage: true })
  await page.goto('/')
  await page.getByTestId('file-upload').setInputFiles({
    name: 'generic.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([
      { url: 'https://github.com', timestamp: '2026-01-05T00:00:00Z' },
      { url: 'https://www.naver.com', timestamp: 1767574800000 },
    ])),
  })
  await expect(page.getByTestId('total-visits')).toHaveText('2회')
  const violations: unknown = await page.evaluate(() => Reflect.get(window, '__rcCsp'))
  await writeFile(`docs/evidence/rc/journey-${info.project.name}.json`, JSON.stringify({
    engine: info.project.name, formats: ['Takeout Browser History/time_usec', 'generic ISO/Unix-ms'],
    takeoutVisits: 6, sites: 3, resolvedHosts: 2, unresolvedHosts: 1, webgl, renderer,
    rootAndSubpathAnalyzed: true,
    wireFixtures: true, liveProviderProof: `providers-${info.project.name}.json`,
    violations, errors, mobileHardwareTested: false,
  }, null, 2))
  expect(violations).toEqual([])
  expect(errors).toEqual([])
  expect(webgl, 'Native WebGL2 must render; fallback alone is not globe PASS').toBe(true)
})
