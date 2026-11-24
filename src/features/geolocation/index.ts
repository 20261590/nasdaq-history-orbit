import { defineAsyncComponent } from 'vue'

export const GeolocationPanel = defineAsyncComponent(() => import('./components/GeolocationPanel.vue'))
export { describeLocation } from './core/location-display'
export { LocationEngine } from './core/location-engine'
export { createMockHosts } from './core/mock-hosts'
export { isPublicIp, parseDns, parseGeo } from './core/geo'
export type { GeoLocation, HostLocation, LookupProgress } from './types'
