import { defineAsyncComponent } from 'vue'

export const ActivityChart = defineAsyncComponent(() => import('./components/ActivityChart.vue'))
export const ActivityInsightsPanel = defineAsyncComponent(() => import('./components/ActivityInsightsPanel.vue'))
export const ComparisonPanel = defineAsyncComponent(() => import('./components/ComparisonPanel.vue'))
export { ActivityConfigurationError, computeActivity } from './core/activity'
export { computeComparison, resolveComparisonPeriods } from './core/comparison'
export { computeStatistics } from './core/stats'
export type * from './types'
export type * from './core/comparison-types'
