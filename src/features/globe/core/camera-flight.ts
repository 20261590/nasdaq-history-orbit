import { Quaternion } from 'three'
import type { Vector3 } from 'three'

export const CAMERA_FLIGHT_MS = 3500

export interface CameraFlight {
  readonly direction: Vector3
  readonly destination: Vector3
  readonly rotation: Quaternion
  readonly tangent: Vector3
  readonly radialTangent: number
  readonly startRadius: number
  readonly endRadius: number
  readonly lift: number
  readonly minimumRadius: number
  readonly distanceKm: number
}

export function createCameraFlight(
  from: Vector3,
  destination: Vector3,
  options: {
    readonly globeRadius: number
    readonly adaptive: boolean
    readonly nearRadius?: number
    readonly velocity: Vector3
  },
): CameraFlight {
  const startRadius = from.length()
  const direction = from.clone().normalize()
  const end = destination.clone().normalize()
  const angle = direction.distanceTo(end) < 1e-8 ? 0 : direction.angleTo(end)
  const endRadius = options.adaptive && angle < Math.PI / 9 && options.nearRadius !== undefined
    ? options.nearRadius : Math.min(500, destination.length())
  const radialSpeed = options.velocity.dot(direction)
  const radialLimit = 3 * Math.abs(endRadius - startRadius)
  return {
    direction, destination: end,
    rotation: new Quaternion().setFromUnitVectors(direction, end),
    tangent: options.velocity.clone().addScaledVector(direction, -radialSpeed)
      .multiplyScalar(CAMERA_FLIGHT_MS / startRadius),
    radialTangent: Math.max(-radialLimit, Math.min(radialLimit, radialSpeed * CAMERA_FLIGHT_MS)),
    startRadius, endRadius,
    lift: options.adaptive && angle >= Math.PI / 9
      ? Math.max(0, Math.min(500 - Math.max(startRadius, endRadius), options.globeRadius * 1.2 * Math.sin(angle / 2))) : 0,
    minimumRadius: options.globeRadius * 1.04,
    distanceKm: angle * 6371,
  }
}

export function sampleAutomaticFlight(flight: CameraFlight, progress: number, output: Vector3): Vector3 {
  const turn = new Quaternion().slerpQuaternions(new Quaternion(), flight.rotation, progress)
  const radius = flight.startRadius + (flight.endRadius - flight.startRadius) * progress
    + flight.lift * Math.sin(Math.PI * progress) ** 2
  return output.copy(flight.direction).applyQuaternion(turn).normalize()
    .multiplyScalar(Math.max(flight.minimumRadius, Math.min(500, radius)))
}

export function sampleCameraFlight(flight: CameraFlight, elapsed: number, output: Vector3): Vector3 {
  const t = Math.max(0, Math.min(1, elapsed / CAMERA_FLIGHT_MS))
  const ease = t * t * (3 - 2 * t)
  const momentum = t * (1 - t) ** 2
  const turn = new Quaternion().slerpQuaternions(new Quaternion(), flight.rotation, ease)
  const radius = flight.startRadius + (flight.endRadius - flight.startRadius) * ease
    + flight.lift * Math.sin(Math.PI * ease) ** 2 + flight.radialTangent * momentum
  return output.copy(flight.direction).applyQuaternion(turn)
    .addScaledVector(flight.tangent, momentum).normalize()
    .multiplyScalar(Math.max(flight.minimumRadius, Math.min(500, radius)))
}
