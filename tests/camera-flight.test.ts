import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { createCameraFlight, sampleAutomaticFlight, sampleCameraFlight } from '../src/camera-flight'
import { motionProgress } from '../src/motion-clock'

describe('camera travel', () => {
  const from = new Vector3(118, 0, 0)
  const to = new Vector3(0, 118, 0)
  const options = { globeRadius: 100, adaptive: false, velocity: new Vector3() }

  it('takes 3.5 seconds with eased departure and arrival', () => {
    const flight = createCameraFlight(from, to, options)
    const quarter = sampleCameraFlight(flight, 875, new Vector3())
    expect(quarter.angleTo(from)).toBeCloseTo(Math.PI / 2 * 0.15625, 8)
    expect(sampleCameraFlight(flight, 3500, new Vector3()).distanceTo(to)).toBeLessThan(1e-8)
    expect(sampleCameraFlight(flight, 0, new Vector3()).distanceTo(from)).toBeLessThan(1e-8)
  })

  it('follows the sphere rather than cutting through the globe', () => {
    const flight = createCameraFlight(from, to, options)
    for (const elapsed of [400, 1200, 1750, 2600, 3200]) {
      expect(sampleCameraFlight(flight, elapsed, new Vector3()).length()).toBeCloseTo(118, 8)
    }
  })

  it('keeps a nearby settled zoom instead of the default destination zoom', () => {
    const start = new Vector3(137, 0, 0)
    const destination = new Vector3(118, 1, 0).setLength(118)
    const flight = createCameraFlight(start, destination, { ...options, adaptive: true, nearRadius: 137 })
    for (const elapsed of [0, 875, 1750, 2625, 3500]) {
      expect(sampleCameraFlight(flight, elapsed, new Vector3()).length()).toBeCloseTo(137, 8)
    }
  })

  it('widens a distant trip and returns to its regional arrival radius', () => {
    const flight = createCameraFlight(from, to, { ...options, adaptive: true, nearRadius: 137 })
    expect(sampleCameraFlight(flight, 1750, new Vector3()).length()).toBeGreaterThan(200)
    expect(sampleCameraFlight(flight, 3500, new Vector3()).length()).toBeCloseTo(118, 8)
  })

  it('starts a replacement flight from the actual transform and incoming tangent', () => {
    const velocity = new Vector3(0, 0, 0.04)
    const flight = createCameraFlight(from, to, { ...options, velocity })
    const start = sampleCameraFlight(flight, 0, new Vector3())
    const next = sampleCameraFlight(flight, 0.1, new Vector3())
    expect(start.distanceTo(from)).toBeLessThan(1e-8)
    expect(next.sub(start).divideScalar(0.1).distanceTo(velocity)).toBeLessThan(0.0001)
  })

  it('takes the short route across the date line', () => {
    const west = new Vector3(1, 0, -118).setLength(118)
    const east = new Vector3(-1, 0, -118).setLength(118)
    const middle = sampleCameraFlight(createCameraFlight(west, east, options), 1750, new Vector3())
    expect(middle.z).toBeLessThan(-117)
    expect(Math.abs(middle.x)).toBeLessThan(1e-8)
  })

  it('keeps antipodal travel finite and outside the surface', () => {
    const flight = createCameraFlight(from, from.clone().negate(), { ...options, adaptive: true })
    for (const elapsed of [0, 875, 1750, 2625, 3500]) {
      const point = sampleCameraFlight(flight, elapsed, new Vector3())
      expect(point.toArray().every(Number.isFinite)).toBe(true)
      expect(point.length()).toBeGreaterThanOrEqual(118 - 1e-8)
    }
  })

  it('uses the automatic clock progress directly without a second easing curve', () => {
    const flight = createCameraFlight(from, to, options)
    for (const time of [0, 0.25, 0.4, 0.6, 0.75, 1]) {
      const point = sampleAutomaticFlight(flight, motionProgress(time), new Vector3())
      expect(point.angleTo(from)).toBeCloseTo(Math.PI / 2 * motionProgress(time), 8)
      expect(point.length()).toBeCloseTo(118, 8)
    }
    expect(flight.distanceKm).toBeCloseTo(6371 * Math.PI / 2, 8)
  })

  it('treats floating-point copies of the same direction as zero geographic distance', () => {
    const start = new Vector3(0.12345, 0.87654, -0.45678).setLength(137)
    const end = start.clone().setLength(118)
    const flight = createCameraFlight(start, end, { ...options, adaptive: true, nearRadius: 137 })
    expect(flight.distanceKm).toBe(0)
    expect(sampleAutomaticFlight(flight, 1, new Vector3()).distanceTo(start)).toBeLessThan(1e-8)
  })
})
