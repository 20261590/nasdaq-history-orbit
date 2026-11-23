import { devices, expect, test } from '@playwright/test'
import { capture, destinationError, first, last, maximumRate, openCamera, position, save, seek } from './helpers'

test('overview still fits the sphere when mobile resize interrupts its transition', async ({ page }) => {
  await openCamera(page)
  await seek(page, 0)
  await capture(page, 3650)
  await page.getByRole('button', { name: '전체 지구', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => document.querySelector('[data-testid="globe"]')?.scrollIntoView({ block: 'center', behavior: 'instant' }))
  const frames = await capture(page, 3700)
  const end = last(frames)
  const projectedRadius = 100 / Math.sqrt(end.radius ** 2 - 100 ** 2)
    / (Math.tan(end.fov * Math.PI / 360) * Math.min(1, end.aspect))
  await save('overview-resize', frames)
  expect(projectedRadius).toBeLessThan(1)
})

test('rapid playback ends at its final destination instead of freezing mid flight', async ({ page }) => {
  await openCamera(page, 1)
  await expect(page.getByTestId('total-visits')).toHaveText('8회')
  await page.getByRole('combobox', { name: '재생 속도' }).selectOption('4')
  await page.getByRole('button', { name: '재생', exact: true }).click()
  await page.evaluate(() => document.querySelector('[data-testid="globe"]')?.scrollIntoView({ block: 'center', behavior: 'instant' }))
  const frames = await page.evaluate(() => window.cameraQA.until(frame =>
    frame.kind === 'sequence' && frame.index === 7 && frame.phase === 'IDLE'))
  await save('rapid-playback-final', frames)
  expect(destinationError(last(frames), 35.6762, 139.6503)).toBeLessThan(0.003)
  await expect(page.getByRole('button', { name: '재생', exact: true })).toBeVisible()
  expect(last(frames).radius).toBeCloseTo(118, 1)
})

test('Korean local, Japan and American playback travels remain regional and continuous', async ({ page }) => {
  await openCamera(page)
  for (const trip of [
    { name: 'korea-local', index: 4, arrival: 9, lat: 37.4563, lng: 126.7052, far: false },
    { name: 'korea-japan', index: 9, arrival: 14, lat: 35.6762, lng: 139.6503, far: false },
    { name: 'korea-america', index: 19, arrival: 24, lat: 40.7128, lng: -74.006, far: true },
  ]) {
    await seek(page, trip.index)
    await capture(page, 3650)
    await page.getByRole('button', { name: '재생', exact: true }).click()
    await page.getByTestId('globe').scrollIntoViewIfNeeded()
    const frames = await page.evaluate(index => window.cameraQA.until(frame =>
      frame.kind === 'sequence' && frame.index === index && frame.phase === 'DWELLING'), trip.arrival)
    await page.getByRole('button', { name: '일시정지', exact: true }).click()
    await save(trip.name, frames)
    expect(last(frames).radius).toBeCloseTo(118, 1)
    expect(destinationError(last(frames), trip.lat, trip.lng)).toBeLessThan(0.003)
    expect(maximumRate(frames)).toBeLessThan(0.5)
    if (trip.far) expect(Math.max(...frames.map(frame => frame.radius))).toBeGreaterThan(160)
    else expect(Math.max(...frames.map(frame => frame.radius))).toBeLessThan(119)
    await page.screenshot({ path: `docs/evidence/camera/${trip.name}.png` })
  }
})

test('rapid seeks replace a single flight and land on the latest destination', async ({ page }) => {
  await openCamera(page)
  await seek(page, 0)
  await capture(page, 3650)
  const all = []
  for (const index of [20, 5, 10, 0, 20]) {
    await seek(page, index)
    all.push(...await capture(page, 180))
  }
  all.push(...await capture(page, 3650))
  expect(destinationError(last(all), 40.7128, -74.006)).toBeLessThan(0.003)
  expect(maximumRate(all)).toBeLessThan(0.5)
  expect(Math.min(...all.map(frame => frame.radius))).toBeGreaterThan(103.9)
  await save('rapid-seeks', all)
})

test('pause holds camera while resume speed and paused seek use the same state', async ({ page }) => {
  await openCamera(page)
  await seek(page, 19)
  await capture(page, 3650)
  await page.getByRole('button', { name: '재생', exact: true }).click()
  await page.getByTestId('globe').scrollIntoViewIfNeeded()
  await page.evaluate(() => window.cameraQA.until(frame =>
    frame.index === 24 && frame.phase === 'CRUISING' && frame.kind === 'sequence'))
  await page.getByRole('button', { name: '일시정지', exact: true }).click()
  const paused = await capture(page, 600)
  expect(position(last(paused)).distanceTo(position(first(paused)))).toBeLessThan(0.0001)
  await page.getByRole('combobox', { name: '재생 속도' }).selectOption('2')
  await page.getByRole('button', { name: '재생', exact: true }).click()
  await page.getByTestId('globe').scrollIntoViewIfNeeded()
  const resumed = await page.evaluate(() => window.cameraQA.until(frame =>
    frame.index === 24 && frame.phase === 'DWELLING' && frame.kind === 'sequence'))
  expect(destinationError(last(resumed), 40.7128, -74.006)).toBeLessThan(0.003)
  await page.getByRole('button', { name: '일시정지', exact: true }).click()
  await seek(page, 10)
  const sought = await capture(page, 3650)
  expect(destinationError(last(sought), 35.6762, 139.6503)).toBeLessThan(0.003)
  await save('paused', paused)
  await save('resumed-speed2', resumed)
  await save('paused-seek', sought)
})

for (const mode of ['mouse', 'touch'] as const) {
  test.describe(`${mode} manual override`, () => {
    if (mode === 'touch') {
      const phone = devices['iPhone 14']
      test.use({ viewport: phone.viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 3 })
    }
    test('manual gesture suspends following through later visits until explicit seek', async ({ page, context }) => {
      await openCamera(page)
      await seek(page, 9)
      await capture(page, 3650)
      await page.getByRole('button', { name: '재생', exact: true }).click()
      await page.getByTestId('globe').scrollIntoViewIfNeeded()
      const box = await page.getByTestId('globe').locator('canvas').boundingBox()
      if (!box) throw new TypeError('Globe bounds missing')
      const x = box.x + box.width * 0.5
      const y = box.y + box.height * 0.5
      if (mode === 'touch') {
        const cdp = await context.newCDPSession(page)
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 70, y: y + 35 }] })
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      } else {
        await page.mouse.move(x, y)
        await page.mouse.down()
        await page.mouse.move(x + 120, y + 35, { steps: 12 })
        await page.mouse.up()
        await page.mouse.wheel(0, -100)
      }
      await expect(page.getByText('자동 카메라 추적이 중지되었습니다.', { exact: false })).toBeVisible()
      await capture(page, 2000)
      const held = await capture(page, 1500)
      expect(position(last(held)).distanceTo(position(first(held)))).toBeLessThan(0.5)
      await save(`manual-${mode}`, held)
      await page.screenshot({ path: `docs/evidence/camera/manual-${mode}.png` })
      await seek(page, 10)
      const restored = await capture(page, 3650)
      expect(destinationError(last(restored), 35.6762, 139.6503)).toBeLessThan(0.003)
    })
  })
}
