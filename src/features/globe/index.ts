import { defineAsyncComponent } from 'vue'

export const OrbitGlobe = defineAsyncComponent(() => import('./components/OrbitGlobe.vue'))
export { createCameraFlight, sampleAutomaticFlight, sampleCameraFlight } from './core/camera-flight'
export { makeArcs, makeMarkers } from './core/globe-data'
export { MotionClock, dwellDurationMs, flightDurationMs, motionProgress } from './core/motion-clock'
export { playbackGroup } from './core/playback-groups'
export type { CameraFlight } from './core/camera-flight'
export type { CameraCommand, Marker, MotionKind, MotionState, MotionStatus, OrbitArc, PlaybackGroup } from './types'
