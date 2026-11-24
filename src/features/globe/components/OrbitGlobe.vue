<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import {
  AmbientLight, Color, DirectionalLight, Mesh, MeshPhongMaterial, PerspectiveCamera,
  Raycaster, Scene, Vector2, Vector3, WebGLRenderer,
} from 'three'
import ThreeGlobe from 'three-globe'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { Marker, OrbitArc } from '../core/globe-data'
import { createCameraFlight, sampleAutomaticFlight, sampleCameraFlight } from '../core/camera-flight'
import type { CameraFlight } from '../core/camera-flight'
import { MotionClock, motionProgress } from '../core/motion-clock'
import type { CameraCommand, MotionStatus } from '../core/motion-clock'

const props = defineProps<{
  markers: readonly Marker[]
  arcs: readonly OrbitArc[]
  command: CameraCommand
  playing: boolean
  speed: number
  rotate: boolean
}>()
const emit = defineEmits<{
  select: [domain: string]; ready: []; unsupported: []; interact: []
  status: [status: MotionStatus]; completed: [key: number]
}>()
const root = ref<HTMLDivElement>()
const unavailable = ref(false)
const connection = 'connection' in navigator && typeof navigator.connection === 'object' && navigator.connection !== null
  ? navigator.connection : undefined
const reducedQuality = ref(navigator.hardwareConcurrency <= 4 || Boolean(connection && 'saveData' in connection && connection.saveData))
let renderer: WebGLRenderer | undefined
let globe: ThreeGlobe | undefined
let controls: OrbitControls | undefined
let camera: PerspectiveCamera | undefined
let observer: ResizeObserver | undefined
let visibilityObserver: IntersectionObserver | undefined
let frame = 0
let visible = true
let flight: CameraFlight | undefined
const clock = new MotionClock()
let hasTracked = false
let manuallyMoved = false
let arrivalRendered = false
const velocity = new Vector3()
let lastPublished = 0
let lastState = clock.state
let lastKey = -1
let renderedFrames = 0
let slowFrames = 0
let previousFrame = 0
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

function updateData() {
  globe?.pointsData([...props.markers])
  globe?.arcsData([...props.arcs])
  globe?.arcDashAnimateTime(props.playing && !reduced ? 1600 / props.speed : 0)
}

function applyQuality() {
  renderer?.setPixelRatio(Math.min(devicePixelRatio, reducedQuality.value ? 1 : 2))
  globe?.pointResolution(reducedQuality.value ? 6 : 10)
  globe?.arcCurveResolution(reducedQuality.value ? 32 : 64)
  globe?.arcCircularResolution(reducedQuality.value ? 4 : 6)
}
function updateActivity() {
  if (visible && !document.hidden) globe?.resumeAnimation()
  else globe?.pauseAnimation()
}

function publish(force = false) {
  const now = performance.now()
  const changed = clock.state !== lastState || clock.key !== lastKey
  if (!force && !changed && (clock.state === 'IDLE' || clock.state === 'MANUAL' || now - lastPublished < 100)) return
  lastPublished = now
  lastState = clock.state
  lastKey = clock.key
  emit('status', clock.status())
}

function manualControl() {
  flight = undefined
  velocity.set(0, 0, 0)
  manuallyMoved = true
  arrivalRendered = false
  clock.manual()
  previousFrame = 0
  publish(true)
  emit('interact')
}

function applyCommand(initial = false) {
  if (!globe || !camera) return
  const command = props.command
  if (command.kind === 'sequence' && !command.explicit && clock.state !== 'IDLE') return
  if (command.kind === 'cancel' || !command.target) {
    if (clock.start(command, 0, 0)) flight = undefined
    if (!props.playing) clock.pause()
    previousFrame = 0
    arrivalRendered = false
    publish(true)
    return
  }
  const target = command.target
  const fit = target.distance >= 2 ? Math.max(1, 1 / camera.aspect) : 1
  const altitude = (1 + target.distance) * fit - 1
  const coordinates = globe.getCoords(target.lat, target.lng, altitude)
  const destination = new Vector3(coordinates.x, coordinates.y, coordinates.z)
  if (initial && command.kind === 'view') camera.position.copy(destination)
  // Drain OrbitControls' residual deltas without moving the visible start transform.
  if (controls) {
    const position = camera.position.clone()
    controls.enableDamping = false
    controls.autoRotate = false
    controls.update()
    camera.position.copy(position)
    controls.update()
  }
  const playback = command.kind === 'sequence'
  const sameDirection = camera.position.clone().normalize().distanceTo(destination.clone().normalize()) < 1e-8
  if (playback && sameDirection) destination.setLength(camera.position.length())
  const nearRadius = hasTracked ? flight?.endRadius ?? camera.position.length() : undefined
  const nextFlight = createCameraFlight(camera.position, destination, {
    globeRadius: globe.getGlobeRadius(), adaptive: playback, velocity: playback ? new Vector3() : velocity,
    ...(playback && nearRadius !== undefined ? { nearRadius } : {}),
  })
  const previewDuration = camera.position.distanceTo(destination) < 1e-8 ? 0 : 3500
  if (!clock.start(command, nextFlight.distanceKm, previewDuration, props.speed)) return
  flight = nextFlight
  arrivalRendered = false
  hasTracked = playback
  manuallyMoved = false
  previousFrame = 0
  if (!props.playing) clock.pause()
  publish(true)
}

watch(() => [props.markers, props.arcs, props.playing, props.speed], updateData)
watch(() => props.command, () => applyCommand(), { flush: 'sync' })
watch(() => props.playing, playing => {
  previousFrame = 0
  if (playing) clock.resume()
  else { clock.pause(); velocity.set(0, 0, 0) }
  publish(true)
}, { flush: 'sync' })
watch(() => props.rotate, rotating => { if (rotating) manualControl() })

function pick(event: MouseEvent) {
  if (!renderer || !camera || !globe) return
  const rect = renderer.domElement.getBoundingClientRect()
  const pointer = new Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1)
  const ray = new Raycaster()
  ray.setFromCamera(pointer, camera)
  const hit = ray.intersectObject(globe, true).find(item => item.object instanceof Mesh)
  if (!hit) return
  let closest: Marker | undefined
  let distance = 12
  for (const marker of props.markers) {
    const point = globe.getCoords(marker.lat, marker.lng, 0.02)
    const d = hit.point.distanceTo(new Vector3(point.x, point.y, point.z))
    if (d < distance) { closest = marker; distance = d }
  }
  const domain = closest?.domains[0]
  if (domain) emit('select', domain)
}

onMounted(() => {
  if (!root.value) return
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: false })
  } catch (error) {
    if (!(error instanceof Error)) throw error
    unavailable.value = true
    emit('unsupported')
    return
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.setClearColor(new Color('#080e18'))
  renderer.domElement.setAttribute('aria-label', '방문 사이트의 추정 IP 위치를 보여 주는 3D 지구본. 드래그로 회전하고 스크롤로 확대합니다.')
  renderer.domElement.setAttribute('role', 'img')
  root.value.append(renderer.domElement)
  const scene = new Scene()
  camera = new PerspectiveCamera(40, 1, 0.1, 2000)
  camera.position.set(0, 90, 330)
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.minDistance = 104
  controls.maxDistance = 500
  controls.enablePan = false
  controls.autoRotateSpeed = 0.3
  controls.addEventListener('start', manualControl)
  globe = new ThreeGlobe({ animateIn: false })
    .globeImageUrl(`${import.meta.env.BASE_URL}earth.webp`)
    .atmosphereColor('#438ca8').atmosphereAltitude(0.14)
    .pointLat('lat').pointLng('lng').pointColor('color').pointRadius('radius')
    .pointAltitude(0.015).pointResolution(10).pointsMerge(true).pointsTransitionDuration(0)
    .arcColor(() => '#63dbd4').arcAltitudeAutoScale(0.35).arcStroke(0.45)
    .arcDashLength(0.45).arcDashGap(0.25).arcsTransitionDuration(0)
  globe.globeMaterial(new MeshPhongMaterial({ color: '#8daecb', shininess: 6 }))
  scene.add(globe, new AmbientLight(0xffffff, 2))
  const light = new DirectionalLight(0xc7e8ff, 2)
  light.position.set(-150, 100, 250)
  scene.add(light)
  applyQuality()
  globe.onGlobeReady(() => emit('ready'))
  updateData()
  applyCommand(true)
  observer = new ResizeObserver(([entry]) => {
    if (!entry || !camera || !renderer) return
    const { width, height } = entry.contentRect
    renderer.setSize(width, height)
    camera.aspect = width / Math.max(height, 1)
    camera.updateProjectionMatrix()
    applyQuality()
    if (!manuallyMoved && props.command.kind === 'view' && props.command.target && props.command.target.distance >= 2) applyCommand()
  })
  observer.observe(root.value)
  visibilityObserver = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? false
    previousFrame = 0
    updateActivity()
  })
  visibilityObserver.observe(root.value)
  document.addEventListener('visibilitychange', updateActivity)
  renderer.domElement.addEventListener('click', pick)
  const render = (now: number) => {
    frame = requestAnimationFrame(render)
    if (!visible || document.hidden || !camera || !renderer || !controls) { previousFrame = 0; return }
    if (previousFrame && !reducedQuality.value) {
      renderedFrames++
      if (now - previousFrame > 1000 / 30) slowFrames++
      if (renderedFrames === 90) {
        if (slowFrames >= 45) { reducedQuality.value = true; applyQuality() }
        renderedFrames = 0
        slowFrames = 0
      }
    }
    let delta = previousFrame ? now - previousFrame : 0
    previousFrame = now
    if (arrivalRendered && clock.state === 'DECELERATING' && clock.progress === 1) {
      clock.confirmArrival()
      arrivalRendered = false
      delta = 0
    }
    clock.advance(delta, props.speed)
    const moving = clock.state === 'ACCELERATING' || clock.state === 'CRUISING' || clock.state === 'DECELERATING'
    if (flight && moving) {
      const before = camera.position.clone()
      if (reduced) clock.finishFlight()
      if (clock.kind === 'sequence') sampleAutomaticFlight(flight, motionProgress(clock.progress), camera.position)
      else sampleCameraFlight(flight, clock.flightElapsed, camera.position)
      if (delta > 0) velocity.copy(camera.position).sub(before).divideScalar(delta)
    }
    const controlled = moving || clock.state === 'DWELLING' || clock.state === 'PAUSED'
      || (clock.kind === 'sequence' && clock.state === 'IDLE')
    controls.enableDamping = !controlled
    controls.autoRotate = props.rotate && !reduced && !controlled
    if (controlled) camera.lookAt(0, 0, 0)
    else controls.update()
    renderer.render(scene, camera)
    // Dwell begins only after the exact endpoint has actually been rendered.
    if (clock.state === 'DECELERATING' && clock.progress === 1) {
      const arrived = !flight || camera.position.distanceTo(flight.destination.clone().multiplyScalar(flight.endRadius)) < 1e-5
      if (arrived) {
        velocity.set(0, 0, 0)
        if (clock.kind === 'sequence') arrivalRendered = true
        else clock.confirmArrival()
      }
    }
    publish()
    const completed = clock.takeCompletion()
    if (completed !== undefined) emit('completed', completed)
  }
  frame = requestAnimationFrame(render)
})

onUnmounted(() => {
  cancelAnimationFrame(frame)
  observer?.disconnect()
  visibilityObserver?.disconnect()
  document.removeEventListener('visibilitychange', updateActivity)
  renderer?.domElement.removeEventListener('click', pick)
  controls?.dispose()
  globe?._destructor()
  globe?.traverse(object => {
    if (!(object instanceof Mesh)) return
    object.geometry.dispose()
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material instanceof MeshPhongMaterial) material.map?.dispose()
      material.dispose()
    }
  })
  renderer?.dispose()
  renderer?.forceContextLoss()
})
</script>

<template>
  <div ref="root" class="globe-canvas" data-testid="globe" :data-markers="markers.length" :data-arcs="arcs.length" :data-quality="reducedQuality ? 'reduced' : 'standard'">
    <p v-if="reducedQuality && !unavailable" class="render-quality-note" role="status">기기 성능에 맞춰 표시 해상도를 낮췄습니다.</p>
    <div v-if="unavailable" role="status" class="webgl-error">
      <h2>3D 지구본을 시작할 수 없습니다</h2>
      <p>WebGL을 지원하는 브라우저에서 하드웨어 가속을 켜 주세요. 아래 통계와 위치 목록, 공유 기능은 계속 사용할 수 있습니다.</p>
    </div>
  </div>
</template>
