import { describe, expect, it } from 'vitest'
import { MotionClock, dwellDurationMs, flightDurationMs, motionProgress } from '../src/features/globe'
import type { CameraCommand } from '../src/features/globe'

const command = (key = 1, kind: CameraCommand['kind'] = 'sequence', explicit = true): CameraCommand => ({
  key, kind, explicit, target: { lat: 37.5665, lng: 126.978, distance: 0.18 },
})

describe('distance and motion profile', () => {
  it.each([[250, 2500], [1250, 3500], [3500, 5000], [7500, 7000], [15007.55, 9000]])(
    'assigns continuous band time for %s km', (distance, expected) => {
      expect(flightDurationMs(distance)).toBeCloseTo(expected, 6)
    },
  )
  it.each([500, 2000, 5000, 10000])('does not jump at the %s km boundary', boundary => {
    expect(Math.abs(flightDurationMs(boundary + 0.0001) - flightDurationMs(boundary - 0.0001))).toBeLessThan(0.001)
  })
  it('skips a flight at identical coordinates but retains observation', () => {
    const clock = new MotionClock()
    clock.start(command(), 0)
    expect(clock.flightDuration).toBe(0)
    clock.confirmArrival()
    expect(clock.state).toBe('DWELLING')
    expect(clock.dwellDuration).toBe(2000)
  })
  it('has stable cruise and zero speed and acceleration at its endpoint joins', () => {
    expect(motionProgress(0)).toBe(0)
    expect(motionProgress(1)).toBe(1)
    expect(motionProgress(0.25)).toBeCloseTo(1 / 6, 10)
    expect(motionProgress(0.75)).toBeCloseTo(5 / 6, 10)
    for (const t of [0.3, 0.4, 0.5, 0.6]) {
      expect((motionProgress(t + 0.001) - motionProgress(t - 0.001)) / 0.002).toBeCloseTo(4 / 3, 8)
    }
    expect(motionProgress(0.001) / 0.001).toBeLessThan(0.00001)
    expect((1 - motionProgress(0.999)) / 0.001).toBeLessThan(0.00001)
    for (const join of [0.25, 0.75]) {
      const h = 0.0001
      const acceleration = (motionProgress(join + h) - 2 * motionProgress(join) + motionProgress(join - h)) / h ** 2
      expect(Math.abs(acceleration)).toBeLessThan(0.001)
    }
  })
  it('bounds jerk through both ramps instead of changing acceleration abruptly', () => {
    const h = 0.001
    for (let i = 2; i < 998; i++) {
      const t = i / 1000
      const jerk = (motionProgress(t + 2 * h) - 2 * motionProgress(t + h)
        + 2 * motionProgress(t - h) - motionProgress(t - 2 * h)) / (2 * h ** 3)
      expect(Math.abs(jerk)).toBeLessThan(140)
    }
  })
})

describe('arrival owned scheduling', () => {
  it('requires endpoint confirmation and a full dwell before one completion', () => {
    const clock = new MotionClock()
    clock.start(command(7), 250)
    clock.advance(100000, 4)
    expect(clock.state).toBe('DECELERATING')
    expect(clock.takeCompletion()).toBeUndefined()
    expect(clock.dwellElapsed).toBe(0)
    clock.confirmArrival()
    clock.advance(1999, 4)
    expect(clock.state).toBe('DWELLING')
    expect(clock.takeCompletion()).toBeUndefined()
    clock.advance(1, 4)
    expect(clock.state).toBe('IDLE')
    expect(clock.takeCompletion()).toBe(7)
    expect(clock.takeCompletion()).toBeUndefined()
  })
  it('rejects ordinary targets while a flight dwell or pause owns the camera', () => {
    const clock = new MotionClock()
    clock.start(command(1), 12000)
    clock.advance(400, 1)
    expect(clock.start(command(2, 'sequence', false), 250)).toBe(false)
    expect(clock.key).toBe(1)
    expect(clock.flightElapsed).toBe(400)
    clock.finishFlight()
    clock.confirmArrival()
    expect(clock.start(command(3, 'sequence', false), 250)).toBe(false)
    clock.pause()
    expect(clock.start(command(4, 'sequence', false), 250)).toBe(false)
    expect(clock.state).toBe('PAUSED')
  })
  it('freezes flight progress and resumes its exact elapsed value at the new speed', () => {
    const clock = new MotionClock()
    clock.start(command(), 7500)
    clock.advance(1000, 1)
    clock.pause()
    const paused = clock.status()
    clock.advance(10000, 4)
    expect(clock.status()).toEqual(paused)
    clock.resume()
    clock.advance(100, 2)
    expect(clock.flightElapsed).toBeCloseTo(1003.104, 6)
    clock.advance(400, 2)
    expect(clock.flightElapsed).toBeCloseTo(1500, 6)
    expect(clock.key).toBe(1)
  })
  it('ramps a speed change continuously without resetting current flight progress', () => {
    const clock = new MotionClock()
    clock.start(command(), 10000)
    clock.advance(3000, 1)
    clock.advance(100, 2)
    expect(clock.flightElapsed).toBeCloseTo(3101.552, 6)
    clock.advance(400, 2)
    expect(clock.flightElapsed).toBeCloseTo(3750, 6)
    clock.advance(100, 2)
    expect(clock.flightElapsed).toBeCloseTo(3950, 6)
  })
  it('freezes dwell independently of the flight speed multiplier', () => {
    const clock = new MotionClock()
    clock.start(command(), 12000)
    clock.finishFlight()
    clock.confirmArrival()
    clock.advance(900, 4)
    clock.pause()
    clock.advance(9000, 4)
    expect(clock.dwellElapsed).toBe(900)
    clock.resume()
    clock.advance(clock.dwellDuration - 901, 4)
    expect(clock.takeCompletion()).toBeUndefined()
    clock.advance(1, 4)
    expect(clock.takeCompletion()).toBe(1)
  })
  it('keeps long destination observation between 2.5 and 3 seconds', () => {
    for (const distance of [5000, 7500, 10000, 15000, 20015]) {
      expect(dwellDurationMs(distance)).toBeGreaterThanOrEqual(2500)
      expect(dwellDurationMs(distance)).toBeLessThanOrEqual(3000)
    }
  })
  it('leaves manual ownership only for an explicit command', () => {
    const clock = new MotionClock()
    clock.start(command(), 7500)
    clock.manual()
    clock.advance(100000, 4)
    clock.resume()
    expect(clock.state).toBe('MANUAL')
    expect(clock.start(command(2, 'sequence', false), 100)).toBe(false)
    expect(clock.start(command(3), 100)).toBe(true)
    expect(clock.state).toBe('ACCELERATING')
  })
  it('abandons a paused sequence for seek without emitting its stale completion', () => {
    const clock = new MotionClock()
    clock.start(command(), 12000)
    clock.advance(100, 1)
    clock.pause()
    clock.start(command(9, 'seek'), 1000)
    clock.advance(3500, 1)
    clock.confirmArrival()
    expect(clock.state).toBe('IDLE')
    expect(clock.key).toBe(9)
    expect(clock.takeCompletion()).toBeUndefined()
  })
  it('keeps unresolved visits visible without fabricating a destination', () => {
    const clock = new MotionClock()
    clock.start({ key: 3, kind: 'sequence', explicit: true }, 0)
    expect(clock.status().located).toBe(false)
    clock.confirmArrival()
    clock.advance(2000, 1)
    expect(clock.takeCompletion()).toBe(3)
  })
})
