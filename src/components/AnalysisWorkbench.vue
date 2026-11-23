<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { HostLocation } from '../model'
import { computeComparison, resolveComparisonPeriods } from '../core/comparison'
import type { AnalyticsVisit, ComparisonPeriods, ComparisonSelection, DayRange } from '../core/comparison'
import { computeActivity } from '../core/activity'
import type { SecurityReport, ExclusionChange } from '../core/security'
import ComparisonPanel from './ComparisonPanel.vue'
import ActivityInsightsPanel from './ActivityInsightsPanel.vue'
import SecurityPanel from './SecurityPanel.vue'

const props = defineProps<{
  comparisonVisits: readonly AnalyticsVisit[]
  viewVisits: readonly AnalyticsVisit[]
  hosts: readonly HostLocation[]
  security: SecurityReport | null
  analysisExcludedOrders: readonly number[]
  shareExcludedOrders: readonly number[]
}>()
const emit = defineEmits<{
  'configuration-change': [configuration: { periods: ComparisonPeriods | null; sessionGapMinutes: number }]
  'view-period': [period: DayRange]
  'exclusion-change': [change: ExclusionChange]
  'share-request': []
}>()
const tab = ref<'comparison' | 'activity' | 'security'>('comparison')
const selection = ref<ComparisonSelection>({ kind: 'days', days: 7 })
const gap = ref(30)
const resolved = computed(() => resolveComparisonPeriods(props.comparisonVisits, selection.value))
const comparison = computed(() => resolved.value.ok
  ? computeComparison(props.comparisonVisits, props.hosts, resolved.value.periods) : null)
const activity = computed(() => computeActivity(props.viewVisits, { sessionGapMinutes: gap.value }))
watch([resolved, gap], () => emit('configuration-change', {
  periods: resolved.value.ok ? resolved.value.periods : null, sessionGapMinutes: gap.value,
}), { immediate: true })
</script>

<template>
  <section id="analysis-workbench" class="analysis-workbench" aria-label="통합 분석과 개인정보 점검">
      <h2>분석과 개인정보 점검</h2>
      <p class="small muted">비교는 분석 포함 기록의 사이트·국가 조건과 독립 A/B 기간을 사용합니다. 활동은 상단 기간·사이트·국가 필터를 모두 적용합니다. 보안 검사는 제외 전 원본 유효 기록 전체를 로컬에서 검사합니다.</p>
      <div class="workbench-tabs" role="tablist" aria-label="분석 기능">
        <button id="tab-comparison" role="tab" :aria-selected="tab === 'comparison'" aria-controls="workbench-panel" @click="tab = 'comparison'">기간 비교</button>
        <button id="tab-activity" role="tab" :aria-selected="tab === 'activity'" aria-controls="workbench-panel" @click="tab = 'activity'">디지털 활동 패턴</button>
        <button id="tab-security" role="tab" :aria-selected="tab === 'security'" aria-controls="workbench-panel" @click="tab = 'security'">개인정보 점검</button>
      </div>
      <div id="workbench-panel" role="tabpanel" :aria-labelledby="'tab-' + tab">
        <ComparisonPanel v-if="tab === 'comparison'" :report="comparison" :selection="selection" :unavailable-reason="resolved.ok ? undefined : '선택 범위에 비교할 기록이 없거나 날짜가 올바르지 않습니다.'" @selection-change="selection = $event" @view-period="emit('view-period', $event)" />
        <ActivityInsightsPanel v-else-if="tab === 'activity'" :report="activity" :session-gap-minutes="gap" @session-gap-change="gap = $event" />
        <SecurityPanel v-else :report="security" :analysis-excluded-orders="analysisExcludedOrders" :share-excluded-orders="shareExcludedOrders" @exclusion-change="emit('exclusion-change', $event)" @share-request="emit('share-request')" />
      </div>
  </section>
</template>

<style scoped>
.analysis-workbench { display: grid; gap: 24px; margin-block: 48px; min-inline-size: 0; }
.workbench-tabs { display: flex; flex-wrap: wrap; gap: 8px; }
[role="tab"][aria-selected="true"] { background: var(--elevated); font-weight: 650; }
[role="tabpanel"] { min-inline-size: 0; }
</style>
