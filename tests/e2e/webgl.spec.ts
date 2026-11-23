import { chromium, expect, test } from '@playwright/test'

test('without WebGL the real page retains analytics', async () => {
  const browser = await chromium.launch({ channel: 'chromium', args: ['--disable-webgl'] })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    await page.goto('http://127.0.0.1:5173/')
    await page.getByRole('button', { name: /예제 데이터로 둘러보기/ }).click()
    await expect(page.getByRole('heading', { name: '3D 지구본을 시작할 수 없습니다' })).toBeVisible()
    await expect(page.getByTestId('total-visits')).toHaveText('420회')
    await page.screenshot({ path: 'docs/evidence/webgl-unavailable.png', fullPage: true })
  } finally {
    await browser.close()
  }
})
