import { devices, expect, test } from '@playwright/test'
import { capture, destinationError, first, last, position, seek } from './helpers'
import { assertFrozen, ended, openJourney, pause, phase, saveTrace, start, verifyJourney } from './motion-helpers'
import type { Stop } from './motion-fixture'
import { expectedPoint } from './motion-fixture'

const journeys: readonly { name: string; route: readonly Stop[] }[] = [
  { name: 'seoul-busan-seoul', route: ['seoul', 'busan', 'seoul'] },
  { name: 'korea-japan', route: ['seoul', 'tokyo'] },
  { name: 'korea-america', route: ['seoul', 'america'] },
  { name: 'korea-america-japan-korea', route: ['seoul', 'america', 'tokyo', 'seoul'] },
]
for (const journey of journeys) {
  test(`${journey.name}: arrive stop observe then depart at normal speed`, async ({ page }) => {
    await openJourney(page, journey.route)
    await start(page)
    const frames = await ended(page, journey.route.length - 1)
    verifyJourney(frames, journey.route, 1)
    await saveTrace(page, `journey-${journey.name}`, frames)
    await page.screenshot({ path: `docs/evidence/motion/journey-${journey.name}.png` })
  })
}

test('same site repetition is disclosed and grouped without redundant camera flights', async ({ page }) => {
  await openJourney(page, ['seoul', 'seoul', 'seoul'])
  await start(page)
  const frames = await ended(page, 2)
  const sequence = frames.filter(frame => frame.kind === 'sequence')
  expect([...new Set(sequence.map(frame => frame.index))]).toEqual([2])
  expect(sequence.some(frame => frame.phase === 'ACCELERATING' || frame.phase === 'CRUISING')).toBe(false)
  expect(sequence.every(frame => frame.duration === 0)).toBe(true)
  expect(position(last(sequence)).distanceTo(position(first(sequence)))).toBeLessThan(0.00001)
  const dwell = sequence.filter(frame => frame.phase === 'DWELLING')
  const idle = sequence.find(frame => frame.phase === 'IDLE')
  if (!idle) throw new TypeError('Grouped final observation did not complete')
  expect(idle.rafTime - first(dwell).rafTime).toBeGreaterThanOrEqual(1999.99)
  await expect(page.getByText(/연속 방문 3건 묶음/)).toBeVisible()
  await expect(page.getByTestId('total-visits')).toHaveText('3회')
  await expect(page.getByTestId('globe')).toHaveAttribute('data-markers', '1')
  await saveTrace(page, 'same-site', frames)
})

test('fast playback preserves all eight arrivals and every real-time dwell', async ({ page }) => {
  const route: readonly Stop[] = ['seoul', 'busan', 'tokyo', 'seoul', 'america', 'seoul', 'busan', 'tokyo']
  await openJourney(page, route, 4)
  await start(page)
  const frames = await ended(page, 7)
  verifyJourney(frames, route, 4)
  expect(last(frames).rafTime - first(frames).rafTime).toBeGreaterThan(16000)
  await saveTrace(page, 'fast-eight-destinations', frames)
})

test('flight pause resume and speed change retain progress without retargeting', async ({ page }) => {
  await openJourney(page, ['seoul', 'america'])
  await start(page)
  await phase(page, 1, 'CRUISING')
  await pause(page)
  const frozen = await assertFrozen(page)
  const command = last(frozen).command
  const elapsed = last(frozen).flightMs
  await page.getByRole('combobox', { name: '재생 속도' }).selectOption('2')
  await assertFrozen(page)
  await start(page)
  const resumed = await phase(page, 1, 'DECELERATING')
  expect(last(resumed).command).toBe(command)
  expect(last(resumed).flightMs).toBeGreaterThan(elapsed ?? 0)
  const frames = await ended(page, 1)
  const destination = expectedPoint('america')
  expect(destinationError(last(frames), destination.latitude, destination.longitude)).toBeLessThan(0.00001)
  await saveTrace(page, 'flight-pause-resume-speed', frames)
})

test('dwell pause at the last stop freezes observation and resumes instead of restarting', async ({ page }) => {
  await openJourney(page, ['seoul', 'tokyo'], 4)
  await start(page)
  await phase(page, 1, 'DWELLING')
  await capture(page, 400)
  await pause(page)
  const frozen = await assertFrozen(page)
  expect(last(frozen).dwellMs).toBeGreaterThan(0)
  expect(last(frozen).dwellMs).toBeLessThan(2000)
  const key = last(frozen).command
  await start(page)
  const frames = await ended(page, 1)
  expect(last(frames).command).toBe(key)
  expect(last(frames).index).toBe(1)
  const destination = expectedPoint('tokyo')
  expect(destinationError(last(frames), destination.latitude, destination.longitude)).toBeLessThan(0.00001)
  await saveTrace(page, 'dwell-pause-resume-last', frames)
})

test('explicit seek during flight cancels the old command without a stale auto advance', async ({ page }) => {
  await openJourney(page, ['seoul', 'america', 'tokyo'])
  await start(page)
  const flight = await phase(page, 1, 'CRUISING')
  const oldKey = last(flight).command
  await seek(page, 2)
  const key = await page.locator('[data-motion-state]').getAttribute('data-motion-command')
  const sought = await page.evaluate(key => window.cameraQA.until(frame =>
    frame.command === key && frame.kind === 'seek' && frame.phase === 'IDLE'), key)
  expect(last(sought).command).not.toBe(oldKey)
  const destination = expectedPoint('tokyo')
  expect(destinationError(last(sought), destination.latitude, destination.longitude)).toBeLessThan(0.00001)
  const held = await capture(page, 2200)
  expect(held.every(frame => frame.index === 2 && frame.kind === 'seek')).toBe(true)
  expect(position(last(held)).distanceTo(position(first(held)))).toBeLessThan(0.00001)
  await expect(page.getByRole('button', { name: '재생', exact: true })).toBeVisible()
  await saveTrace(page, 'explicit-seek-stale-command', [...sought, ...held])
})

test('last destination remains stationary for its full long dwell before playback stops', async ({ page }) => {
  await openJourney(page, ['seoul', 'america'], 4)
  await start(page)
  const frames = await ended(page, 1)
  verifyJourney(frames, ['seoul', 'america'], 4)
  const dwell = frames.filter(frame => frame.index === 1 && frame.phase === 'DWELLING')
  expect(first(dwell).dwellDuration).toBeGreaterThanOrEqual(2500)
  expect(last(frames).dwellMs).toBe(last(frames).dwellDuration)
  expect(last(frames).progress).toBe(1)
  await saveTrace(page, 'final-long-dwell', frames)
})

for (const mode of ['mouse', 'touch'] as const) {
  test.describe(`${mode} explicit ownership`, () => {
    if (mode === 'touch') {
      const phone = devices['iPhone 14']
      test.use({ viewport: phone.viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 3 })
    }
    test('manual control holds location and only deliberate play returns tracking', async ({ page, context }) => {
      await openJourney(page, ['seoul', 'tokyo'], 4)
      await start(page)
      await phase(page, 0, 'DWELLING')
      const box = await page.getByTestId('globe').locator('canvas').boundingBox()
      if (!box) throw new TypeError('Manual globe viewport missing')
      const x = box.x + box.width / 2
      const y = box.y + box.height / 2
      if (mode === 'touch') {
        const cdp = await context.newCDPSession(page)
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 65, y: y + 25 }] })
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      } else {
        await page.mouse.move(x, y)
        await page.mouse.down()
        await page.mouse.move(x + 90, y + 25, { steps: 12 })
        await page.mouse.up()
        await page.mouse.wheel(0, -100)
      }
      await page.evaluate(() => window.cameraQA.until(frame => frame.phase === 'MANUAL'))
      await capture(page, 1800)
      const held = await capture(page, 2500)
      expect(held.every(frame => frame.phase === 'MANUAL' && frame.index === 0)).toBe(true)
      expect(position(last(held)).distanceTo(position(first(held)))).toBeLessThan(0.5)
      await expect(page.getByRole('button', { name: '재생', exact: true })).toBeVisible()
      await page.screenshot({ path: `docs/evidence/motion/manual-${mode}.png` })
      await start(page)
      const returned = await phase(page, 0, 'DWELLING')
      const destination = expectedPoint('seoul')
      expect(destinationError(last(returned), destination.latitude, destination.longitude)).toBeLessThan(0.00001)
      await pause(page)
      await saveTrace(page, `manual-${mode}-return`, [...held, ...returned])
      if (mode === 'touch') {
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      }
    })
  })
}
