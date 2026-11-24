<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import InsightsBars from './InsightsBars.vue'
import type { ComparisonReport, ComparisonSelection, CoverageWarning, DayRange, NumericChange } from '../core/comparison-types'

const props = defineProps<{
  report: ComparisonReport | null
  selection: ComparisonSelection
  unavailableReason?: string
}>()
const emit = defineEmits<{
  'selection-change': [selection: ComparisonSelection]
  'view-period': [range: DayRange]
}>()
type Preset = '7' | '30' | 'month' | 'custom'
const DAY_MS = 86_400_000
const preset = ref<Preset>('7')
const customDates = ref({ aStart: '', aEnd: '', bStart: '', bEnd: '' })
const sitePage = ref(0)
const countryPage = ref(0)
const pageSize = 20
const weekdays = ['일', '월', '화', '수', '목', '금', '토']
const hours = Array.from({ length: 24 }, (_, index) => `${index}시`)
const warnings: Readonly<Record<CoverageWarning, string>> = {
  'history-completeness-unknown': '원본 기록의 전체 기간과 누락 여부는 확인할 수 없습니다.',
  'no-observed-events': '이 기간에 관찰된 방문 이벤트가 없습니다.',
  'before-input': '선택 기간이 입력 기록의 첫 관찰일보다 앞섭니다.',
  'after-input': '선택 기간이 입력 기록의 마지막 관찰일보다 뒤입니다.',
  'unobserved-days': '방문 이벤트가 관찰되지 않은 날짜가 있습니다.',
}
const date = (day: number) => new Date(day * DAY_MS).toISOString().split('T')[0]
const days = (range: DayRange) => range.endDayExclusive - range.startDay
const number = (value: number) => value.toLocaleString('ko-KR', { maximumFractionDigits: 2 })
const percent = (value: number) => `${(value * 100).toFixed(1)}%`
const signed = (value: number) => `${value > 0 ? '+' : ''}${number(value)}`
const points = (value: number) => `${value > 0 ? '+' : ''}${(value * 100).toFixed(1)}%p`
const relative = (change: NumericChange) => change.relative === null ? '기준 B 0건 · 비율 계산 불가'
  : `${change.relative > 0 ? '+' : ''}${percent(change.relative)} (B 대비)`
const periodText = (range: DayRange) => `${date(range.startDay)} – ${date(range.endDayExclusive - 1)} UTC`

watch(() => props.selection, selection => {
  preset.value = selection.kind === 'days' ? String(selection.days) === '7' ? '7' : '30' : selection.kind
  if (selection.kind === 'custom') customDates.value = {
    aStart: date(selection.a.startDay), aEnd: date(selection.a.endDayExclusive - 1),
    bStart: date(selection.b.startDay), bEnd: date(selection.b.endDayExclusive - 1),
  }
}, { immediate: true })
watch(() => props.report, () => { sitePage.value = 0; countryPage.value = 0 })

function day(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null
  const parsed = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(parsed) && date(parsed / DAY_MS) === value ? parsed / DAY_MS : null
}
const customSelection = computed<ComparisonSelection | null>(() => {
  const aStart = day(customDates.value.aStart)
  const aEnd = day(customDates.value.aEnd)
  const bStart = day(customDates.value.bStart)
  const bEnd = day(customDates.value.bEnd)
  if (aStart === null || aEnd === null || bStart === null || bEnd === null
    || aStart < 0 || bStart < 0
    || aStart > aEnd || bStart > bEnd) return null
  return { kind: 'custom', a: { startDay: aStart, endDayExclusive: aEnd + 1 },
    b: { startDay: bStart, endDayExclusive: bEnd + 1 } }
})
function compare() {
  if (preset.value === 'custom') {
    if (customSelection.value) emit('selection-change', customSelection.value)
    return
  }
  emit('selection-change', preset.value === 'month'
    ? { kind: 'month' } : { kind: 'days', days: preset.value === '7' ? 7 : 30 })
}
</script>

<template>
  <section class="comparison-panel" aria-labelledby="comparison-title">
    <header class="panel-heading">
      <h2 id="comparison-title">기간 비교</h2>
      <p class="muted">A − B 기준 · 기간은 UTC 날짜이며 지구본 날짜 필터와 별개입니다.</p>
    </header>
    <div class="compare-controls">
      <label>비교 기간
        <select v-model="preset">
          <option value="7">최근 7일과 이전 7일</option>
          <option value="30">최근 30일과 이전 30일</option>
          <option value="month">최근 관찰 월과 이전 월</option>
          <option value="custom">직접 지정</option>
        </select>
      </label>
      <div v-if="preset === 'custom'" class="date-fields">
        <label>A 시작일<input v-model="customDates.aStart" type="date"></label>
        <label>A 종료일<input v-model="customDates.aEnd" type="date" :min="customDates.aStart"></label>
        <label>B 시작일<input v-model="customDates.bStart" type="date"></label>
        <label>B 종료일<input v-model="customDates.bEnd" type="date" :min="customDates.bStart"></label>
        <p v-if="!customSelection" class="warning" role="status">A와 B에 유효한 시작일과 종료일을 입력해 주세요.</p>
      </div>
      <button class="primary" :disabled="preset === 'custom' && !customSelection" @click="compare">비교하기</button>
    </div>
    <p v-if="!report" class="unavailable" role="status">{{ unavailableReason || '기간 비교를 사용할 수 없습니다. 원본 방문기록을 불러와 주세요.' }}</p>
    <template v-else>
      <p v-if="days(report.a.range) !== days(report.b.range)" class="notice" role="status">기간의 길이가 다릅니다: A {{ days(report.a.range) }}일 · B {{ days(report.b.range) }}일. 총 횟수와 함께 일평균 이벤트를 비교해 주세요.</p>
      <div class="periods">
        <section v-for="period in [{ label: 'A', data: report.a }, { label: 'B', data: report.b }]" :key="period.label" class="period">
          <div class="period-heading">
            <div><h3>{{ period.label }} 기간</h3><p class="muted small">{{ periodText(period.data.range) }}</p></div>
            <button @click="emit('view-period', period.data.range)">{{ period.label }} 지구본에서 보기</button>
          </div>
          <dl class="period-metrics">
            <div><dt>방문 이벤트</dt><dd>{{ number(period.data.total) }}회</dd></div>
            <div><dt>일평균 이벤트</dt><dd>{{ number(period.data.dailyAverage) }}회</dd></div>
            <div><dt>고유 사이트</dt><dd>{{ number(period.data.uniqueSites) }}개</dd></div>
          </dl>
          <p class="small muted">방문 관찰일 {{ number(period.data.coverage.observedDays) }}일 · 위치 확인 {{ number(period.data.locatedEvents) }}건 · 미확인 {{ number(period.data.unlocatedEvents) }}건</p>
          <ul class="coverage"><li v-for="warning in period.data.coverage.warnings" :key="warning">{{ warnings[warning] }}</li></ul>
        </section>
      </div>
      <section class="report-section">
        <h3>기간 변화</h3>
        <p class="small muted">절대 변화와 B 대비 비율입니다. 기준값이 0이면 상대 변화는 표시하지 않습니다.</p>
        <dl class="change-list">
          <div v-for="metric in [
            { label: '방문 이벤트', change: report.changes.total, unit: '회' },
            { label: '일평균 이벤트', change: report.changes.dailyAverage, unit: '회' },
            { label: '고유 사이트', change: report.changes.uniqueSites, unit: '개' },
          ]" :key="metric.label">
            <dt>{{ metric.label }}</dt><dd>{{ signed(metric.change.absolute) }}{{ metric.unit }} · {{ relative(metric.change) }}</dd>
          </div>
        </dl>
      </section>
      <section class="report-section">
        <h3>사이트 순위와 점유율</h3>
        <p class="small muted">새로 관찰된 사이트와 관찰되지 않은 사이트를 포함합니다. 순위 변화 양수는 A의 순위 상승입니다. 전체 {{ number(report.siteChanges.length) }}개 · {{ report.siteChanges.length ? sitePage * pageSize + 1 : 0 }}–{{ Math.min((sitePage + 1) * pageSize, report.siteChanges.length) }}개 표시</p>
        <div v-if="report.siteChanges.length" class="table-wrap" role="region" aria-label="사이트 비교 표, 가로 스크롤 가능" tabindex="0">
          <table><thead><tr><th scope="col">사이트</th><th scope="col">상태</th><th scope="col">순위 A / B</th><th scope="col">순위 변화</th><th scope="col">횟수 A / B</th><th scope="col">횟수 변화</th><th scope="col">점유율 A / B</th><th scope="col">점유율 변화</th></tr></thead>
            <tbody><tr v-for="site in report.siteChanges.slice(sitePage * pageSize, (sitePage + 1) * pageSize)" :key="site.domain">
              <th scope="row">{{ site.domain }}</th>
              <td>{{ site.rankB === null ? '새로 관찰' : site.rankA === null ? '관찰되지 않음' : '양쪽 관찰' }}</td>
              <td>A {{ site.rankA ?? '—' }} · B {{ site.rankB ?? '—' }}</td><td>{{ site.rankDelta === null ? '—' : signed(site.rankDelta) }}</td>
              <td>A {{ number(site.countA) }} · B {{ number(site.countB) }}</td><td>{{ signed(site.countDelta) }}</td>
              <td>A {{ percent(site.shareA) }} · B {{ percent(site.shareB) }}</td><td>{{ points(site.shareDelta) }}</td>
            </tr></tbody></table>
        </div>
        <p v-else class="muted">두 기간에 관찰된 사이트가 없습니다.</p>
        <nav v-if="report.siteChanges.length > pageSize" class="pager" aria-label="사이트 페이지"><button :disabled="sitePage === 0" @click="sitePage--">이전</button><span>{{ sitePage + 1 }} / {{ Math.ceil(report.siteChanges.length / pageSize) }}</span><button :disabled="(sitePage + 1) * pageSize >= report.siteChanges.length" @click="sitePage++">다음</button></nav>
      </section>
      <section class="report-section">
        <h3>시간과 요일 분포</h3>
        <p class="small muted">방문 이벤트 수 · A − B 차이는 아래 표에서 확인할 수 있습니다.</p>
        <InsightsBars title="시간대별 방문" :labels="hours" :series="[{ name: 'A 이벤트', values: report.a.hours24 }, { name: 'B 이벤트', values: report.b.hours24 }]" />
        <InsightsBars title="요일별 방문" :labels="weekdays" :series="[{ name: 'A 이벤트', values: report.a.weekdays7 }, { name: 'B 이벤트', values: report.b.weekdays7 }]" />
        <details><summary>시간과 요일의 횟수·점유율 변화</summary>
          <div class="table-wrap" role="region" aria-label="분포 변화 표, 가로 스크롤 가능" tabindex="0"><table>
            <thead><tr><th scope="col">구간</th><th scope="col">A − B 횟수</th><th scope="col">A − B 점유율</th></tr></thead>
            <tbody><tr v-for="(change, index) in report.changes.hours24" :key="`hour-${index}`"><th scope="row">{{ hours[index] }}</th><td>{{ signed(change.countDelta) }}</td><td>{{ points(change.shareDelta) }}</td></tr>
              <tr v-for="(change, index) in report.changes.weekdays7" :key="`weekday-${index}`"><th scope="row">{{ weekdays[index] }}요일</th><td>{{ signed(change.countDelta) }}</td><td>{{ points(change.shareDelta) }}</td></tr></tbody>
          </table></div>
        </details>
      </section>
      <section class="report-section">
        <h3>대표 국가 비교</h3>
        <p class="small muted">각 방문의 대표 위치 기준입니다. 전체 이벤트와 위치 확인 이벤트를 서로 다른 분모로 계산합니다. 전체 {{ number(report.changes.countries.length) }}개 국가.</p>
        <div v-if="report.changes.countries.length" class="table-wrap" role="region" aria-label="국가 비교 표, 가로 스크롤 가능" tabindex="0"><table>
          <thead><tr><th scope="col">국가</th><th scope="col">횟수 A / B</th><th scope="col">횟수 변화</th><th scope="col">전체 이벤트 중 A / B</th><th scope="col">전체 점유율 변화</th><th scope="col">위치 확인 이벤트 중 A / B</th><th scope="col">위치 확인 점유율 변화</th></tr></thead>
          <tbody><tr v-for="country in report.changes.countries.slice(countryPage * pageSize, (countryPage + 1) * pageSize)" :key="country.code">
            <th scope="row">{{ country.label }}</th>
            <td>A {{ number(report.a.countries.find(item => item.code === country.code)?.count ?? 0) }} · B {{ number(report.b.countries.find(item => item.code === country.code)?.count ?? 0) }}</td>
            <td>{{ signed(country.countDelta) }}</td>
            <td>A {{ percent(report.a.countries.find(item => item.code === country.code)?.shareAllEvents ?? 0) }} · B {{ percent(report.b.countries.find(item => item.code === country.code)?.shareAllEvents ?? 0) }}</td>
            <td>{{ points(country.shareAllEventsDelta) }}</td>
            <td>A {{ percent(report.a.countries.find(item => item.code === country.code)?.shareLocatedEvents ?? 0) }} · B {{ percent(report.b.countries.find(item => item.code === country.code)?.shareLocatedEvents ?? 0) }}</td>
            <td>{{ points(country.shareLocatedEventsDelta) }}</td>
          </tr></tbody></table></div>
        <p v-else class="muted">대표 위치가 확인된 방문 이벤트가 없습니다.</p>
        <nav v-if="report.changes.countries.length > pageSize" class="pager" aria-label="국가 페이지"><button :disabled="countryPage === 0" @click="countryPage--">이전</button><span>{{ countryPage + 1 }} / {{ Math.ceil(report.changes.countries.length / pageSize) }}</span><button :disabled="(countryPage + 1) * pageSize >= report.changes.countries.length" @click="countryPage++">다음</button></nav>
      </section>
    </template>
  </section>
</template>

<style scoped>
.comparison-panel { min-width: 0; padding: 32px 0; border-top: 1px solid var(--border); container-type: inline-size; }
.panel-heading { margin-bottom: 24px; }
.panel-heading p, .report-section > p { margin-top: 8px; }
.compare-controls { display: flex; align-items: end; flex-wrap: wrap; gap: 16px; margin-bottom: 32px; }
.date-fields { display: flex; flex-wrap: wrap; gap: 12px; align-items: end; width: 100%; }
.date-fields label { flex: 1 1 160px; min-width: 0; }
.date-fields input { width: 100%; }
.date-fields p { width: 100%; }
.unavailable { padding: 16px; background: var(--panel); border: 1px solid var(--border); border-radius: 12px; }
.periods { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 1fr)); gap: 16px; }
.period { padding: 24px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); min-width: 0; }
.period-heading { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 16px; align-items: start; }
.period-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(120px, 100%), 1fr)); gap: 16px; margin: 24px 0 16px; }
.period-metrics dt, .change-list dt { font-size: 14px; color: var(--muted); }
.period-metrics dd, .change-list dd { margin: 4px 0 0; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.period-metrics dd { font-size: 20px; }
.coverage { display: grid; gap: 4px; margin-top: 12px; color: var(--warning); font-size: 14px; }
.report-section { margin-top: 32px; min-width: 0; }
.report-section > .insights-bars { margin-top: 24px; }
.change-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr)); gap: 16px; margin-top: 16px; }
.table-wrap { overflow-x: auto; max-width: 100%; margin-top: 16px; }
table { width: 100%; border-collapse: collapse; font-size: 14px; font-variant-numeric: tabular-nums; }
th, td { padding: 12px; border-bottom: 1px solid var(--border); text-align: right; white-space: nowrap; }
th:first-child, td:first-child { text-align: left; overflow-wrap: anywhere; white-space: normal; min-width: 120px; }
thead { color: var(--muted); }
.pager { display: flex; gap: 12px; align-items: center; margin-top: 16px; font-variant-numeric: tabular-nums; }
.small { font-size: 14px; }
</style>
