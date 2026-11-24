import { defineAsyncComponent } from 'vue'

export const HistoryUploadPanel = defineAsyncComponent(() => import('./components/HistoryUploadPanel.vue'))
export { createDemoHistory } from './core/demo'
export { filterVisits, parseHistory, sampleTimeline } from './core/history'
export type { ParseResult, Visit } from './types'
