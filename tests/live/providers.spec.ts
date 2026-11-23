import { expect, test } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

test('real providers connect uploaded visits to globe and local playback', async ({ page }) => {
  const providers: { url: string; status: number }[] = []
  page.on('response', response => { if (/dns\.google|get\.geojs/.test(response.url())) providers.push({ url: response.url(), status: response.status() }) })
  await page.goto('/')
  await page.getByTestId('file-upload').setInputFiles('tests/fixtures/history.json')
  await expect(page.getByTestId('total-visits')).toHaveText('6회')
  await page.getByRole('checkbox', { name: '외부 위치 조회에 동의합니다' }).check()
  await page.getByRole('button', { name: '위치 조회', exact: true }).click()
  await expect(page.getByRole('button', { name: '조회 취소' })).toBeHidden({ timeout: 100_000 })
  await expect(page.getByTestId('globe')).not.toHaveAttribute('data-markers', '0')
  await expect(page.getByText('현재 DNS · GeoIP 추정', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '재생', exact: true }).click()
  await expect(page.getByRole('slider', { name: '방문 타임라인' })).not.toHaveValue('0')
  await page.getByRole('button', { name: '일시정지', exact: true }).click()
  await page.getByRole('button', { name: /01.*github.com/ }).click()
  await page.screenshot({ path: 'docs/evidence/live-analysis.png', fullPage: true })
  await writeFile('docs/evidence/live-flow.json', JSON.stringify({
    status: 'PASS', providers, markers: await page.getByTestId('globe').getAttribute('data-markers'),
  }, null, 2))
})
