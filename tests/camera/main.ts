import '../../src/app/adapters/validation-config'
import { createApp } from 'vue'
import { PerspectiveCamera, Scene } from 'three'
import App from '../../src/App.vue'
import '../../src/style.css'

export interface CameraFrame {
  readonly time: number
  readonly position: readonly number[]
  readonly radius: number
  readonly fov: number
  readonly aspect: number
  readonly index: number
  readonly phase: string
  readonly progress: number | null
  readonly flightMs: number | null
  readonly dwellMs: number | null
  readonly command: string | null
  readonly kind: string | null
  readonly duration: number | null
  readonly dwellDuration: number | null
  readonly rafTime: number
  readonly quaternion: readonly number[]
}
declare global {
  interface Window {
    cameraQA: {
      readonly frames: CameraFrame[]
      capture(milliseconds: number): Promise<readonly CameraFrame[]>
      until(predicate: (frame: CameraFrame) => boolean): Promise<readonly CameraFrame[]>
    }
  }
}
const frames: CameraFrame[] = []
let recording: { predicate: (frame: CameraFrame) => boolean; frames: CameraFrame[]; resolve: (frames: readonly CameraFrame[]) => void } | undefined
let rafTime = performance.now()
const nativeFrame = requestAnimationFrame.bind(window)
window.requestAnimationFrame = callback => nativeFrame(now => { rafTime = now; callback(now) })
Scene.prototype.onBeforeRender = function (_renderer, _scene, camera) {
  if (!(camera instanceof PerspectiveCamera)) throw new TypeError('Camera measurement requires the actual perspective camera')
  const transform = {
    time: performance.now(), rafTime, position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), radius: camera.position.length(),
    fov: camera.fov, aspect: camera.aspect,
  }
  queueMicrotask(() => queueMicrotask(() => {
    const status = document.querySelector('[data-motion-state]')
    const metric = (name: string) => {
      const value = status?.getAttribute(name)
      return value === null || value === undefined ? null : Number(value)
    }
    const slider = document.querySelector('input[aria-label="방문 타임라인"]')
    const frame: CameraFrame = {
      ...transform, index: slider instanceof HTMLInputElement ? Number(slider.value) : -1,
      phase: status?.getAttribute('data-motion-state') ?? 'LEGACY',
      progress: metric('data-motion-progress'), flightMs: metric('data-flight-elapsed'),
      dwellMs: metric('data-dwell-elapsed'), command: status?.getAttribute('data-motion-command') ?? null,
      kind: status?.getAttribute('data-motion-kind') ?? null,
      duration: metric('data-flight-duration'), dwellDuration: metric('data-dwell-duration'),
    }
    frames.push(frame)
    if (frames.length > 6000) frames.shift()
    if (recording) {
      recording.frames.push(frame)
      if (recording.predicate(frame)) {
        recording.resolve(recording.frames)
        recording = undefined
      }
    }
  }))
}
window.cameraQA = {
  frames,
  capture(milliseconds) {
    const start = performance.now()
    return new Promise(resolve => {
      recording = { predicate: frame => frame.time - start >= milliseconds, frames: [], resolve }
    })
  },
  until(predicate) {
    const last = frames.at(-1)
    if (last && predicate(last)) return Promise.resolve([last])
    return new Promise(resolve => { recording = { predicate, frames: [], resolve } })
  },
}
createApp(App).mount('#app')
