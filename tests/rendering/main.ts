import { createApp, h, nextTick, ref } from 'vue'
import OrbitGlobe from '../../src/components/OrbitGlobe.vue'
import type { Marker, OrbitArc } from '../../src/globe-data'
import '../../src/style.css'

const params = new URLSearchParams(location.search)
const markerCount = Math.min(1500, Math.max(1, Number(params.get('markers') ?? 1500)))
const arcCount = Math.min(800, Math.max(1, Number(params.get('arcs') ?? 400)))
const markers: Marker[] = Array.from({ length: markerCount }, (_, index) => ({
  lat: -70 + index % 29 * 5, lng: -175 + Math.floor(index / 29) % 70 * 5,
  domains: [`synthetic-${index}`], count: 1, radius: .35, color: '#63dbd4',
}))
const arcs: OrbitArc[] = Array.from({ length: arcCount }, (_, index) => ({
  startLat: -60 + index % 25 * 5, startLng: -175 + index % 70 * 5,
  endLat: -55 + (index * 3) % 23 * 5, endLng: -170 + (index * 11) % 68 * 5,
}))
const mounted = ref(true)
const ready = ref(false)
const lost = ref(false)
createApp({
  setup() {
    return () => h('main', { style: 'max-width:1200px;margin:auto;padding:16px' }, [
      h('h1', 'Synthetic GPU workload'),
      h('p', `${markerCount} marker groups / ${arcCount} arcs. Synthetic positions, no network provider.`),
      h('button', { onClick: async () => {
        const canvas = document.querySelector('.globe-canvas canvas')
        const gl = canvas instanceof HTMLCanvasElement ? canvas.getContext('webgl2') : null
        mounted.value = false
        await nextTick()
        lost.value = gl?.isContextLost() ?? false
      } }, 'Unmount globe'),
      h('output', { id: 'ready' }, ready.value ? 'ready' : 'loading'),
      h('output', { id: 'context-lost' }, String(lost.value)),
      mounted.value ? h(OrbitGlobe, {
        markers, arcs, command: { key: 0, kind: 'view', explicit: true, target: { lat: 25, lng: 110, distance: 2.1 } },
        playing: true, speed: 1, rotate: true,
        onReady: () => { ready.value = true },
      }) : h('p', 'Globe disposed'),
    ])
  },
}).mount('#app')
