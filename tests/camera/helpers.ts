import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { Vector3 } from 'three'
import { writeFile } from 'node:fs/promises'
import { cameraHistory, cameraStops, openCameraHistory } from './fixture'
import type { CameraFrame } from './main'

export async function openCamera(page: Page, repeats = 5) {
  const records = cameraHistory(repeats)
  await openCameraHistory(page, records, cameraStops)
  await expect(page.getByTestId('total-visits')).toHaveText(`${records.length}회`)
  await expect(page.getByTestId('globe').locator('canvas')).toBeVisible()
  await page.getByTestId('globe').evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
  await page.evaluate(() => window.cameraQA.capture(1))
}
export async function capture(page: Page, duration: number): Promise<readonly CameraFrame[]> {
  return page.evaluate(ms => window.cameraQA.capture(ms), duration)
}
export async function seek(page: Page, index: number) {
  await expect(page.getByTestId('globe').locator('canvas')).toBeVisible()
  const status = page.locator('[data-motion-state]')
  await expect(status).toHaveAttribute('data-motion-command', /^\d+$/)
  const before = await status.getAttribute('data-motion-command')
  if (before === null) throw new TypeError('Mounted camera command missing')
  const slider = page.getByRole('slider', { name: '방문 타임라인' })
  await slider.evaluate(element => {
    if (element instanceof HTMLInputElement) element.focus({ preventScroll: true })
  })
  await slider.fill(String(index))
  await expect(status).not.toHaveAttribute('data-motion-command', before)
  // Mobile focus scrolling can otherwise pull the range back into view after
  // our scroll and leave the globe offscreen, where its clock correctly freezes.
  await slider.blur()
  await page.getByTestId('globe').scrollIntoViewIfNeeded()
  await page.getByTestId('globe').evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
}
export function position(frame: CameraFrame): Vector3 {
  return new Vector3().fromArray(frame.position)
}
export function last(frames: readonly CameraFrame[]): CameraFrame {
  const result = frames.at(-1)
  if (!result) throw new TypeError('No actual camera render frames captured')
  return result
}
export function first(frames: readonly CameraFrame[]): CameraFrame {
  const result = frames[0]
  if (!result) throw new TypeError('No actual camera render frames captured')
  return result
}
export function destinationError(frame: CameraFrame, lat: number, lng: number): number {
  const phi = lat * Math.PI / 180
  const theta = lng * Math.PI / 180
  return position(frame).angleTo(new Vector3(Math.cos(phi) * Math.sin(theta), Math.sin(phi), Math.cos(phi) * Math.cos(theta)))
}
export function maximumRate(frames: readonly CameraFrame[]): number {
  let rate = 0
  for (let i = 1; i < frames.length; i++) {
    const previous = frames[i - 1]
    const current = frames[i]
    if (previous && current && current.time > previous.time) {
      rate = Math.max(rate, position(current).distanceTo(position(previous)) / (current.time - previous.time))
    }
  }
  return rate
}
export async function save(name: string, frames: readonly CameraFrame[]) {
  await writeFile(`docs/evidence/motion/${name}.json`, JSON.stringify({
    frames, minimumRadius: Math.min(...frames.map(frame => frame.radius)),
    maximumRadius: Math.max(...frames.map(frame => frame.radius)), maximumWorldUnitsPerMs: maximumRate(frames),
  }, null, 2))
}
