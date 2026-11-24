import { defineAsyncComponent } from 'vue'

export const SecurityPanel = defineAsyncComponent(() => import('./components/SecurityPanel.vue'))
export { useExclusions } from './composables/useExclusions'
export { inspectSecurity } from './core/security'
export type {
  ExclusionChange, ExclusionScope, FindingType, MaskedSecurityRow, SecurityFinding,
  SecurityReport, Severity,
} from './core/security'
