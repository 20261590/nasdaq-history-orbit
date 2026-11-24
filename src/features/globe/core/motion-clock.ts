export type MotionState = 'IDLE' | 'ACCELERATING' | 'CRUISING' | 'DECELERATING' | 'DWELLING' | 'PAUSED' | 'MANUAL'
export type MotionKind = 'sequence' | 'seek' | 'view' | 'cancel'

export interface CameraCommand {
  readonly key: number
  readonly kind: MotionKind
  readonly explicit: boolean
  readonly target?: { readonly lat: number; readonly lng: number; readonly distance: number }
}

export interface MotionStatus {
  readonly key: number
  readonly kind: MotionKind
  readonly state: MotionState
  readonly activeState: MotionState
  readonly progress: number
  readonly pathProgress: number
  readonly flightElapsed: number
  readonly flightDuration: number
  readonly dwellElapsed: number
  readonly dwellDuration: number
  readonly distanceKm: number
  readonly located: boolean
}

export function flightDurationMs(distanceKm: number): number {
  if (distanceKm < 0.0001) return 0
  const knots = [[0, 2000], [500, 3000], [2000, 4000], [5000, 6000], [10000, 8000], [20015.1, 10000]] as const
  for (let i = 1; i < knots.length; i++) {
    const from = knots[i - 1]
    const to = knots[i]
    if (from && to && distanceKm <= to[0]) {
      return from[1] + (to[1] - from[1]) * (distanceKm - from[0]) / (to[0] - from[0])
    }
  }
  return 10000
}

export function dwellDurationMs(distanceKm: number): number {
  if (distanceKm <= 2000) return 2000
  if (distanceKm <= 5000) return 2000 + (distanceKm - 2000) / 6
  if (distanceKm <= 10000) return 2500 + (distanceKm - 5000) / 20
  return Math.min(3000, 2750 + (distanceKm - 10000) / 40)
}

// Integrate quintic velocity ramps around a constant-speed middle half.
// Velocity, acceleration and jerk all meet continuously at the phase joins.
export function motionProgress(fraction: number): number {
  const t = Math.max(0, Math.min(1, fraction))
  if (t <= 0.25) return velocityIntegral(4 * t) / 3
  if (t < 0.75) return (t - 0.125) / 0.75
  return 1 - velocityIntegral(4 * (1 - t)) / 3
}

function velocityIntegral(x: number): number { return x ** 6 - 3 * x ** 5 + 2.5 * x ** 4 }

export class MotionClock {
  state: MotionState = 'IDLE'
  key = 0
  kind: MotionKind = 'view'
  flightElapsed = 0
  flightDuration = 0
  dwellElapsed = 0
  dwellDuration = 0
  distanceKm = 0
  located = false
  private held: MotionState = 'IDLE'
  private completion = false
  private rate = 1
  private rateFrom = 1
  private rateTarget = 1
  private rateElapsed = 500

  start(command: CameraCommand, distanceKm: number, previewDuration = 3500, speed = 1): boolean {
    if (command.kind === 'sequence' && !command.explicit && this.state !== 'IDLE') return false
    this.key = command.key
    this.kind = command.kind
    this.distanceKm = distanceKm
    this.located = command.target !== undefined
    this.flightElapsed = 0
    this.dwellElapsed = 0
    this.completion = false
    this.rate = this.rateFrom = this.rateTarget = speed
    this.rateElapsed = 500
    this.flightDuration = command.kind === 'sequence'
      ? (this.located ? flightDurationMs(distanceKm) : 0)
      : (this.located ? previewDuration : 0)
    this.dwellDuration = command.kind === 'sequence' ? dwellDurationMs(distanceKm) : 0
    this.state = command.kind === 'cancel' ? 'IDLE' : this.flightDuration ? 'ACCELERATING' : 'DECELERATING'
    return true
  }

  get progress(): number {
    return this.flightDuration ? Math.min(1, this.flightElapsed / this.flightDuration) : 1
  }

  advance(deltaMs: number, speed: number): void {
    switch (this.state) {
      case 'IDLE': case 'MANUAL': case 'PAUSED': return
      case 'DWELLING':
        // Observation is real active time, never shortened below two seconds by speed.
        this.dwellElapsed = Math.min(this.dwellDuration, this.dwellElapsed + deltaMs)
        if (this.dwellElapsed >= this.dwellDuration) { this.state = 'IDLE'; this.completion = true }
        return
      case 'ACCELERATING': case 'CRUISING': case 'DECELERATING':
        this.flightElapsed = Math.min(this.flightDuration, this.flightElapsed
          + (this.kind === 'sequence' ? this.scaledDelta(deltaMs, speed) : deltaMs))
        this.state = this.progress < 0.25 ? 'ACCELERATING' : this.progress < 0.75 ? 'CRUISING' : 'DECELERATING'
        return
      default: {
        const impossible: never = this.state
        return impossible
      }
    }
  }

  confirmArrival(): void {
    if (this.state !== 'DECELERATING' || this.progress !== 1) return
    this.state = this.kind === 'sequence' ? 'DWELLING' : 'IDLE'
  }

  finishFlight(): void {
    if (this.state === 'ACCELERATING' || this.state === 'CRUISING' || this.state === 'DECELERATING') {
      this.flightElapsed = this.flightDuration
      this.state = 'DECELERATING'
    }
  }

  pause(): void {
    if (this.kind !== 'sequence' || this.state === 'IDLE' || this.state === 'MANUAL' || this.state === 'PAUSED') return
    this.held = this.state
    this.state = 'PAUSED'
  }

  resume(): void {
    if (this.state === 'PAUSED') {
      this.state = this.held
      this.rate = this.rateFrom = 0
      this.rateElapsed = 0
    }
  }

  manual(): void {
    this.state = 'MANUAL'
    this.completion = false
  }

  takeCompletion(): number | undefined {
    if (!this.completion) return undefined
    this.completion = false
    return this.key
  }

  private scaledDelta(deltaMs: number, speed: number): number {
    if (speed !== this.rateTarget) {
      this.rateFrom = this.rate
      this.rateTarget = speed
      this.rateElapsed = 0
    }
    const before = this.rateElapsed
    const after = Math.min(500, before + deltaMs)
    const rampDelta = after - before
    const virtualDelta = this.rateFrom * rampDelta + (this.rateTarget - this.rateFrom) * 500
      * (velocityIntegral(after / 500) - velocityIntegral(before / 500))
      + this.rateTarget * (deltaMs - rampDelta)
    const t = after / 500
    this.rate = this.rateFrom + (this.rateTarget - this.rateFrom) * (6 * t ** 5 - 15 * t ** 4 + 10 * t ** 3)
    this.rateElapsed = after
    return virtualDelta
  }

  status(): MotionStatus {
    return {
      key: this.key, kind: this.kind, state: this.state, progress: this.progress,
      activeState: this.state === 'PAUSED' ? this.held : this.state,
      pathProgress: this.kind === 'sequence' ? motionProgress(this.progress) : this.progress ** 2 * (3 - 2 * this.progress),
      flightElapsed: this.flightElapsed,
      flightDuration: this.flightDuration, dwellElapsed: this.dwellElapsed,
      dwellDuration: this.dwellDuration, distanceKm: this.distanceKm, located: this.located,
    }
  }
}
