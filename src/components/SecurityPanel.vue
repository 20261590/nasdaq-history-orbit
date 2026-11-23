<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ExclusionChange, FindingType, SecurityReport, Severity } from '../core/security'

const props = defineProps<{
  report: SecurityReport | null
  analysisExcludedOrders: readonly number[]
  shareExcludedOrders: readonly number[]
  unavailableReason?: string
}>()
const emit = defineEmits<{
  'exclusion-change': [change: ExclusionChange]
  'share-request': []
}>()
const levels: readonly Severity[] = ['priority', 'caution', 'reference', 'none']
const types: readonly FindingType[] = ['authentication', 'password', 'session', 'email', 'phone', 'identifier']
const levelLabels: Readonly<Record<Severity, string>> = {
  priority: '검토 우선', caution: '주의', reference: '참고', none: '탐지 항목 없음',
}
const typeLabels: Readonly<Record<FindingType, string>> = {
  authentication: '인증 정보', password: '비밀번호', session: '세션 정보',
  email: '이메일 주소', phone: '전화번호', identifier: '식별자',
}
const levelFilter = ref<Severity | ''>('')
const typeFilter = ref<FindingType | ''>('')
const page = ref(0)
const pageSize = 12
const number = (value: number) => value.toLocaleString('ko-KR')
const rows = computed(() => props.report?.rows.filter(row =>
  (!levelFilter.value || row.severity === levelFilter.value)
  && (!typeFilter.value || row.findings.some(finding => finding.type === typeFilter.value))) ?? [])
watch([levelFilter, typeFilter, () => props.report], () => { page.value = 0 })
</script>

<template>
  <section class="security-panel" aria-labelledby="security-title">
    <header class="panel-heading"><h2 id="security-title">공유 전 정보 검토</h2>
      <p class="muted">URL에서 민감한 정보로 보일 수 있는 형태를 기기 안에서 분류했습니다. 탐지는 확정 판정이나 악성 사이트 진단이 아닙니다.</p>
    </header>
    <p v-if="!report" class="unavailable" role="status">{{ unavailableReason || '보안 검토를 사용할 수 없습니다. 원본 방문기록을 불러와 주세요.' }}</p>
    <template v-else>
      <dl class="security-metrics">
        <div><dt>검토 가능</dt><dd>{{ number(report.totals.inspected) }}건</dd></div>
        <div><dt>검토 불가</dt><dd>{{ number(report.totals.unavailable) }}건</dd></div>
        <div><dt>탐지된 기록</dt><dd>{{ number(report.totals.flagged) }}건</dd></div>
      </dl>
      <p class="small muted">검토 불가는 URL이 없거나 검사할 수 없는 기록입니다. 탐지 0건은 검토 가능 기록에서 항목을 찾지 못했다는 뜻이며 안전을 보장하지 않습니다.</p>
      <div class="count-groups">
        <section><h3>검토 수준별 기록</h3>
          <dl class="counts"><div v-for="level in levels" :key="level"><dt>{{ levelLabels[level] }}</dt><dd>{{ number(report.totals.byLevel[level]) }}건</dd></div></dl>
        </section>
        <section><h3>탐지 항목별 기록</h3>
          <dl class="counts"><div v-for="type in types" :key="type"><dt>{{ typeLabels[type] }}</dt><dd>{{ number(report.totals.byType[type]) }}건</dd></div></dl>
        </section>
      </div>
      <p class="small muted">한 기록에 여러 종류가 탐지되면 항목별 건수에 각각 포함됩니다.</p>
      <div class="filters">
        <label>검토 수준
          <select v-model="levelFilter"><option value="">전체 수준</option><option v-for="level in levels" :key="level" :value="level">{{ levelLabels[level] }}</option></select>
        </label>
        <label>탐지 종류
          <select v-model="typeFilter"><option value="">전체 종류</option><option v-for="type in types" :key="type" :value="type">{{ typeLabels[type] }}</option></select>
        </label>
      </div>
      <p class="small muted" role="status">필터 결과 {{ number(rows.length) }}건 / 검토 가능 {{ number(report.totals.inspected) }}건 · 한 페이지에 {{ pageSize }}건 표시</p>
      <ol class="finding-list" :start="page * pageSize + 1">
        <li v-for="row in rows.slice(page * pageSize, (page + 1) * pageSize)" :key="row.order">
          <div class="finding-heading"><strong>{{ row.siteLabel }}</strong><span>{{ row.day }} UTC · {{ levelLabels[row.severity] }}</span></div>
          <p class="masked-preview">{{ row.maskedUrl }}</p>
          <p class="small">탐지 항목: {{ row.findings.length ? row.findings.map(finding => typeLabels[finding.type]).join(', ') : levelLabels.none }}</p>
          <div class="exclusions">
            <label class="check"><input type="checkbox" :checked="analysisExcludedOrders.includes(row.order)"
              @change="emit('exclusion-change', { order: row.order, scope: 'analysis', excluded: !analysisExcludedOrders.includes(row.order) })">
              분석에서 제외 (공유에도 적용)</label>
            <label class="check"><input type="checkbox" :checked="shareExcludedOrders.includes(row.order)"
              @change="emit('exclusion-change', { order: row.order, scope: 'share', excluded: !shareExcludedOrders.includes(row.order) })">
              공유에서만 제외</label>
          </div>
          <p v-if="analysisExcludedOrders.includes(row.order)" class="small muted">현재 분석 제외로 공유에서도 제외됩니다.</p>
        </li>
      </ol>
      <p v-if="!rows.length" class="muted">선택한 조건에 해당하는 검토 기록이 없습니다.</p>
      <nav v-if="rows.length > pageSize" class="pager" aria-label="검토 기록 페이지"><button :disabled="page === 0" @click="page--">이전</button><span>{{ page + 1 }} / {{ Math.ceil(rows.length / pageSize) }}</span><button :disabled="(page + 1) * pageSize >= rows.length" @click="page++">다음</button></nav>
      <p class="exclusion-note small muted">분석에서 제외하면 로컬 분석과 공유 모두에서 제외됩니다. 공유에서만 제외하면 로컬 분석에는 남습니다. 각 체크를 다시 해제하면 선택을 되돌릴 수 있습니다. 가린 미리보기만 표시하며 원본 URL과 제목은 보여 주지 않습니다.</p>
      <button class="primary" @click="emit('share-request')">공유 전 검토</button>
    </template>
  </section>
</template>

<style scoped>
.security-panel { min-width: 0; padding: 32px 0; border-top: 1px solid var(--border); }
.panel-heading { margin-bottom: 24px; }
.panel-heading p, .count-groups + p { margin-top: 8px; }
.unavailable { padding: 16px; background: var(--panel); border: 1px solid var(--border); border-radius: 12px; }
.security-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(160px, 100%), 1fr)); gap: 16px; margin: 0 0 16px; }
.security-metrics dt { color: var(--muted); font-size: 14px; }
.security-metrics dd { margin: 4px 0 0; font-size: 20px; font-variant-numeric: tabular-nums; }
.count-groups { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr)); gap: 32px; margin-top: 32px; }
.counts { margin-top: 16px; }
.counts div { display: flex; justify-content: space-between; gap: 16px; padding: 8px 0; border-bottom: 1px solid var(--border); }
.counts dd { margin: 0; font-variant-numeric: tabular-nums; }
.filters { display: flex; flex-wrap: wrap; gap: 12px; margin: 32px 0 16px; }
.finding-list { display: grid; gap: 16px; margin: 16px 0; }
.finding-list li { min-width: 0; padding: 24px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); }
.finding-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; }
.finding-heading strong { overflow-wrap: anywhere; }
.finding-heading span { color: var(--muted); font-size: 14px; }
.masked-preview { overflow-wrap: anywhere; margin: 12px 0; color: var(--muted); font-size: 14px; }
.exclusions { display: flex; flex-wrap: wrap; gap: 8px 24px; margin-top: 16px; }
.check { display: inline-flex; min-height: 44px; align-items: center; gap: 8px; cursor: pointer; }
.pager { display: flex; gap: 12px; align-items: center; margin: 16px 0; font-variant-numeric: tabular-nums; }
.exclusion-note { margin: 24px 0 16px; }
.small { font-size: 14px; }
</style>
