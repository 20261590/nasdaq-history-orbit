import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { CameraFrame } from './main'
import { capture, destinationError, first, last, maximumRate, position, seek } from './helpers'
import { openCameraHistory } from './fixture'
import { expectedPoint, motionHistory, stops } from './motion-fixture'
import type { Stop } from './motion-fixture'
import { writeFile } from 'node:fs/promises'
import { Quaternion, Vector3 } from 'three'

export async function openJourney(page: Page, route: readonly Stop[], speed = 1) {
  await openCameraHistory(page, motionHistory(route), [...new Set(route)].map(name => stops[name]))
  await expect(page.getByTestId('total-visits')).toHaveText(`${route.length}회`)
  await seek(page, 0)
  await expect(page.locator('[data-motion-state]')).toHaveAttribute('data-motion-kind', 'seek')
  const key = await page.locator('[data-motion-state]').getAttribute('data-motion-command')
  await page.evaluate(key => window.cameraQA.until(frame => frame.command === key && frame.kind === 'seek' && frame.phase === 'IDLE'), key)
  await page.getByRole('combobox', { name: '재생 속도' }).selectOption(String(speed))
  await page.evaluate(() => { window.cameraQA.frames.length = 0 })
}
export async function start(page: Page) {
  await page.getByRole('button', { name: '재생', exact: true }).click()
  await page.evaluate(() => document.querySelector('[data-testid="globe"]')?.scrollIntoView({ block: 'center', behavior: 'instant' }))
}
export async function phase(page: Page, index: number, phase: string) {
  return page.evaluate(({ index, phase }) => window.cameraQA.until(frame =>
    frame.kind === 'sequence' && frame.index === index && frame.phase === phase), { index, phase })
}
export async function ended(page: Page, index: number) {
  await phase(page, index, 'IDLE')
  await expect(page.getByRole('button', { name: '재생', exact: true })).toBeVisible()
  return page.evaluate(() => window.cameraQA.frames.slice())
}
export async function pause(page: Page) {
  await page.getByRole('button', { name: '일시정지', exact: true }).click()
  await page.evaluate(() => document.querySelector('[data-testid="globe"]')?.scrollIntoView({ block: 'center', behavior: 'instant' }))
  await page.evaluate(() => window.cameraQA.until(frame => frame.phase === 'PAUSED'))
}
export function kinematics(frames: readonly CameraFrame[]) {
  const rates: { time: number; value: number; cruise: boolean }[] = []
  let orientationRate = 0
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1]
    const b = frames[i]
    if (!a || !b || a.command !== b.command || b.rafTime <= a.rafTime) continue
    orientationRate = Math.max(orientationRate, new Quaternion().fromArray(a.quaternion)
      .angleTo(new Quaternion().fromArray(b.quaternion)) / (b.rafTime - a.rafTime))
    rates.push({
      time: (a.rafTime + b.rafTime) / 2,
      value: position(a).angleTo(position(b)) / (b.rafTime - a.rafTime),
      cruise: a.phase === 'CRUISING' && b.phase === 'CRUISING',
    })
  }
  const accelerations = rates.slice(1).map((rate, i) => {
    const before = rates[i]
    if (!before) throw new TypeError('Rate predecessor missing')
    return { time: (rate.time + before.time) / 2, value: (rate.value - before.value) / (rate.time - before.time) }
  })
  const jerks = accelerations.slice(1).map((acceleration, i) => {
    const before = accelerations[i]
    if (!before) throw new TypeError('Acceleration predecessor missing')
    return (acceleration.value - before.value) / (acceleration.time - before.time)
  })
  return {
    angularRate: Math.max(0, ...rates.map(rate => rate.value)),
    angularAcceleration: Math.max(0, ...accelerations.map(item => Math.abs(item.value))),
    angularJerk: Math.max(0, ...jerks.map(Math.abs)),
    orientationRate,
    cruiseRates: rates.filter(rate => rate.cruise).map(rate => rate.value),
  }
}
export function verifyJourney(frames: readonly CameraFrame[], route: readonly Stop[], speed: number) {
  const sequence = frames.filter(frame => frame.kind === 'sequence')
  const changes = sequence.filter((frame, i) => i === 0 || frame.index !== sequence[i - 1]?.index)
  const terminal = sequence.find(frame => frame.index === route.length - 1 && frame.phase === 'IDLE')
  if (!terminal) throw new TypeError('Final completion frame missing')
  expect(changes.map(frame => frame.index)).toEqual(route.map((_, index) => index))
  for (let index = 0; index < route.length; index++) {
    const name = route[index]
    if (!name) throw new TypeError('Fixture stop missing')
    const stop = expectedPoint(name)
    const leg = sequence.filter(frame => frame.index === index)
    const dwell = leg.filter(frame => frame.phase === 'DWELLING')
    const arrival = first(dwell)
    expect(destinationError(arrival, stop.latitude, stop.longitude)).toBeLessThan(0.00001)
    for (const frame of dwell) {
      expect(destinationError(frame, stop.latitude, stop.longitude)).toBeLessThan(0.00001)
      expect(position(frame).distanceTo(position(arrival))).toBeLessThan(0.00001)
    }
    for (const frame of leg) {
      const direction = new Vector3(0, 0, -1).applyQuaternion(new Quaternion().fromArray(frame.quaternion))
      expect(direction.angleTo(position(frame).negate())).toBeLessThan(0.000001)
    }
    const following = changes[index + 1] ?? terminal
    expect(following.rafTime - arrival.rafTime).toBeGreaterThanOrEqual((arrival.dwellDuration ?? 2000) - 0.01)
    expect(arrival.dwellDuration).toBeGreaterThanOrEqual(2000)
    // No new cursor while this command is flying or dwelling; each leg is one contiguous run.
    expect(leg.every(frame => frame.command === arrival.command)).toBe(true)
    expect(maximumRate(leg)).toBeLessThan(0.5 * speed)
    expect(last(leg).radius).toBeCloseTo(118, 1)
    const duration = arrival.duration
    if (duration === null) throw new TypeError('Flight duration missing')
    if (duration > 0) {
      const angle = position(first(leg)).angleTo(position(arrival))
      const realDuration = duration / speed
      const peak = angle * 4 / (3 * realDuration)
      const measured = kinematics(leg)
      expect(measured.angularRate).toBeLessThan(peak * 1.03 + 1e-8)
      expect(measured.angularAcceleration).toBeLessThan(10 * angle / realDuration ** 2 * 1.5 + 1e-9)
      expect(measured.angularJerk).toBeLessThan(124 * angle / realDuration ** 3 * 2 + 1e-10)
      expect(measured.orientationRate).toBeLessThan(0.003 * speed)
      expect(measured.cruiseRates.length).toBeGreaterThan(3)
      for (const rate of measured.cruiseRates) expect(Math.abs(rate - peak)).toBeLessThan(peak * 0.03 + 1e-8)
    }
    if (index > 0) {
      const previous = route[index - 1]
      if (!previous) throw new TypeError('Previous fixture stop missing')
      const origin = expectedPoint(previous)
      expect(destinationError(first(leg), origin.latitude, origin.longitude)).toBeLessThan(0.00001)
    }
  }
}
export async function saveTrace(page: Page, name: string, frames: readonly CameraFrame[]) {
  await writeFile(`docs/evidence/motion/${name}.json`, JSON.stringify({
    frames, elapsedMs: last(frames).rafTime - first(frames).rafTime,
    states: [...new Set(frames.map(frame => frame.phase))], maximumRate: maximumRate(frames),
    kinematics: kinematics(frames),
  }, null, 2))
  await page.screenshot({ path: `docs/evidence/motion/${name}.png` })
}
export async function assertFrozen(page: Page) {
  const frames = await capture(page, 800)
  expect(position(last(frames)).distanceTo(position(first(frames)))).toBeLessThan(0.00001)
  expect(last(frames).progress).toBe(first(frames).progress)
  expect(last(frames).flightMs).toBe(first(frames).flightMs)
  expect(last(frames).dwellMs).toBe(first(frames).dwellMs)
  return frames
}
