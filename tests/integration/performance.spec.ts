import { expect, test } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { upload } from './helpers'

test('complete analyses retain all accepted events at each supported input scale', async ({ page }, info) => {
  const results: { count: number; bytes: number; uploadMs: number; activityMs: number; securityMs: number }[] = []
  for (const count of [100, 1000, 10_000, 50_000, 100_000]) {
    await page.goto('/')
    const rows = Array.from({ length: count }, (_, index) => ({
      url: `https://${index % 2 ? 'github.com' : 'naver.com'}/item/${index}`,
      timestamp: Date.UTC(2026, 9, 1) + index * 60_000,
    }))
    const bytes = Buffer.byteLength(JSON.stringify(rows))
    expect(bytes).toBeLessThan(20 * 1024 * 1024)
    const start = Date.now()
    await upload(page, rows)
    await expect(page.getByTestId('total-visits')).toHaveText(`${count.toLocaleString('ko-KR')}회`)
    const uploadMs = Date.now() - start
    const activityStart = Date.now()
    await page.getByRole('tab', { name: '디지털 활동 패턴' }).click()
    await expect(page.locator('.activity-metrics > div').filter({ hasText: '방문 이벤트' }).locator('dd')).toHaveText(`${count.toLocaleString('ko-KR')}건`)
    const activityMs = Date.now() - activityStart
    const securityStart = Date.now()
    await page.getByRole('tab', { name: '개인정보 점검' }).click()
    await expect(page.locator('.security-metrics > div').filter({ hasText: '검토 가능' }).locator('dd')).toHaveText(`${count.toLocaleString('ko-KR')}건`)
    await expect(page.locator('.security-metrics > div').filter({ hasText: '탐지된 기록' }).locator('dd')).toHaveText('0건')
    results.push({ count, bytes, uploadMs, activityMs, securityMs: Date.now() - securityStart })
  }
  await writeFile(info.outputPath('scales.json'), JSON.stringify({ browser: info.project.name, results }, null, 2))
})
