import { expect, test } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { actualRenderer } from './renderer'

for (const size of [100, 1000, 10_000]) {
  test(`${size} visits retain exact totals with bounded rendering`, async ({ page }) => {
    const input = Array.from({ length: size }, (_, index) => ({
      url: `https://${index % 2 ? 'github.com' : 'naver.com'}/${index}`,
      timestamp: 1_793_520_000_000 + index * 60_000,
    }))
    await page.goto('/')
    const start = Date.now()
    await page.getByTestId('file-upload').setInputFiles({
      name: 'scale.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(input)),
    })
    await expect(page.getByTestId('total-visits')).toHaveText(`${size.toLocaleString('ko-KR')}회`)
    const uploadMs = Date.now() - start
    await page.getByLabel('위치 공급자').selectOption('mock')
    await page.getByRole('button', { name: '위치 조회', exact: true }).click()
    await expect(page.getByTestId('globe')).not.toHaveAttribute('data-markers', '0')
    await page.getByTestId('globe').scrollIntoViewIfNeeded()
    const times = await page.evaluate(() => new Promise<number[]>(resolve => {
      const frames: number[] = []
      let previous = performance.now()
      const frame = (time: number) => {
        frames.push(time - previous)
        previous = time
        if (frames.length === 60) resolve(frames)
        else requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
    }))
    const sorted = [...times].sort((a, b) => a - b)
    await writeFile(`docs/evidence/browser-performance-${size}.json`, JSON.stringify({
      count: size, uploadMs, markers: Number(await page.getByTestId('globe').getAttribute('data-markers')),
      frameMeanMs: times.reduce((a, b) => a + b, 0) / times.length,
      p95FrameMs: sorted[56], renderer: await actualRenderer(page),
    }, null, 2))
    const slider = page.getByRole('slider', { name: '방문 타임라인' })
    await expect(slider).toHaveAttribute('max', String(Math.min(size, 800) - 1))
  })
}
