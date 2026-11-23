<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import InsightsBars from './InsightsBars.vue'
import type { ActivityReport } from '../core/activity-types'

const props = defineProps<{
  report: ActivityReport | null
  sessionGapMinutes: number
  unavailableReason?: string
}>()
const emit = defineEmits<{ 'session-gap-change': [minutes: number] }>()
const gapInput = ref(String(props.sessionGapMinutes))
const sessionPage = ref(0)
const edgePage = ref(0)
const pageSize = 12
const weekdays = ['일', '월', '화', '수', '목', '금', '토']
const hours = Array.from({ length: 24 }, (_, index) => `${index}시`)
const gapLabels = ['1분 미만', '1–5분', '5–30분', '30–60분', '60분 이상']
const number = (value: number) => value.toLocaleString('ko-KR')
const time = (value: number) => `${new Date(value).toISOString().slice(0, -8).replace('T', ' ')} UTC`
const duration = (value: number | null) => value === null ? '측정 가능한 간격 없음'
  : `${(value / 60_000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}분`
const validGap = computed(() => {
  const minutes = Number(gapInput.value)
  return Number.isInteger(minutes) && minutes >= 1 && minutes <= 1440
})
const hourly = computed(() => {
  const uniqueDomains = Array<number>(24).fill(0)
  const switches = Array<number>(24).fill(0)
  for (const bucket of props.report?.hourBuckets ?? []) {
    const hour = new Date(bucket.startMs).getUTCHours()
    uniqueDomains[hour] = (uniqueDomains[hour] ?? 0) + bucket.uniqueDomains
    switches[hour] = (switches[hour] ?? 0) + bucket.domainSwitches
  }
  return { uniqueDomains, switches }
})
const peak = computed(() => Math.max(1, ...(props.report?.weekdayHours.flat() ?? [])))
watch(() => props.sessionGapMinutes, value => { gapInput.value = String(value) })
watch(() => props.report, () => { sessionPage.value = 0; edgePage.value = 0 })
function applyGap() {
  if (validGap.value) emit('session-gap-change', Number(gapInput.value))
}
</script>

<template>
  <section class="activity-insights-panel" aria-labelledby="activity-insights-title">
    <header class="panel-heading"><h2 id="activity-insights-title">활동 패턴</h2>
      <p class="muted">관찰된 방문 이벤트와 연결만 집계합니다. 주의력, 생산성, 체류시간, 건강 상태를 판단하지 않습니다.</p>
    </header>
    <form class="gap-control" @submit.prevent="applyGap">
      <label>세션 분리 간격 (분)<input v-model="gapInput" type="number" min="1" max="1440" step="1" inputmode="numeric" required></label>
      <button class="primary" type="submit" :disabled="!validGap">세션 기준 적용</button>
      <p v-if="!validGap" class="warning" role="status">1~1,440 사이의 정수를 입력해 주세요.</p>
    </form>
    <p v-if="!report" class="unavailable" role="status">{{ unavailableReason || '활동 분석을 사용할 수 없습니다. 원본 방문기록을 불러와 주세요.' }}</p>
    <template v-else>
      <dl class="activity-metrics">
        <div><dt>방문 이벤트</dt><dd>{{ number(report.total) }}건</dd></div>
        <div><dt>도메인 전환</dt><dd>{{ number(report.domainSwitches) }}건</dd></div>
        <div><dt>동일 도메인 내 이동</dt><dd>{{ number(report.sameDomainNavigation) }}건</dd></div>
        <div><dt>관찰 세션 조각</dt><dd>{{ number(report.sessions.length) }}개</dd></div>
        <div><dt>이전 이벤트가 확인된 연결</dt><dd>{{ number(report.knownPairs) }}건</dd></div>
        <div><dt>연결을 확인할 수 없는 경계</dt><dd>{{ number(report.unknownGaps) }}건</dd></div>
      </dl>
      <p class="small muted">세션 조각은 {{ number(report.sessionGapMinutes) }}분 기준의 관찰 이벤트 묶음이며 연속 사용 시간이나 체류시간이 아닙니다.</p>
      <section class="report-section">
        <h3>UTC 시간대별 이벤트</h3>
        <p class="small muted">고유 도메인은 각 날짜·시간 구간의 값을 같은 시각끼리 합한 수입니다. 도메인 전환은 도착 이벤트가 속한 시각에 집계합니다.</p>
        <InsightsBars title="UTC 시간대별 이벤트·고유 도메인·전환" :labels="hours"
          :series="[{ name: '방문 이벤트', values: report.hours }, { name: '시간 구간별 고유 도메인 합', values: hourly.uniqueDomains }, { name: '도메인 전환', values: hourly.switches }]" />
      </section>
      <section class="report-section">
        <h3>요일 × 시간대</h3>
        <p class="small muted">UTC · 각 칸은 방문 이벤트 수입니다. 표를 가로로 스크롤해 모든 시간과 정확한 값을 읽을 수 있습니다.</p>
        <div class="heatmap-wrap" role="region" aria-label="요일과 시간대별 방문 이벤트 표, 가로 스크롤 가능" tabindex="0">
          <table class="heatmap"><thead><tr><th scope="col">요일</th><th v-for="hour in hours" :key="hour" scope="col">{{ hour }}</th></tr></thead>
            <tbody><tr v-for="(row, index) in report.weekdayHours" :key="index">
              <th scope="row">{{ weekdays[index] }}요일</th>
              <td v-for="(count, hour) in row" :key="hour" :style="{ background: `color-mix(in srgb, var(--accent) ${Math.round(count / peak * 28)}%, var(--panel))` }"
                :aria-label="`${weekdays[index]}요일 ${hour}시 ${number(count)}건`">{{ number(count) }}</td>
            </tr></tbody>
          </table>
        </div>
      </section>
      <section class="report-section">
        <h3>관찰된 이벤트 간격</h3>
        <dl class="quantiles"><div><dt>중앙값</dt><dd>{{ duration(report.gapMedianMs) }}</dd></div><div><dt>90백분위</dt><dd>{{ duration(report.gapP90Ms) }}</dd></div></dl>
        <ul class="gap-list"><li v-for="(count, index) in report.gapBuckets" :key="index"><span>{{ gapLabels[index] }}</span><strong>{{ number(count) }}건</strong></li></ul>
        <p class="small muted">간격은 연결이 확인된 인접 이벤트 사이에서만 계산합니다. 기록 밖의 시간은 추정하지 않습니다.</p>
      </section>
      <section class="report-section">
        <h3>이벤트가 밀집한 시간</h3>
        <ol class="detail-list"><li v-for="hour in report.denseHours" :key="hour.startMs"><time :datetime="new Date(hour.startMs).toISOString()">{{ time(hour.startMs) }}</time><strong>{{ number(hour.count) }}건</strong></li></ol>
        <p v-if="!report.denseHours.length" class="muted">관찰된 시간 구간이 없습니다.</p>
      </section>
      <section class="report-section">
        <h3>관찰 세션 조각</h3>
        <p class="small muted">전체 {{ number(report.sessions.length) }}개 · 한 번에 {{ pageSize }}개 표시 · 경계를 넘는 연결은 조각별 전환 횟수에 포함하지 않습니다.</p>
        <ol class="fragment-list" :start="sessionPage * pageSize + 1">
          <li v-for="session in report.sessions.slice(sessionPage * pageSize, (sessionPage + 1) * pageSize)" :key="session.startOrder">
            <strong><time :datetime="new Date(session.startMs).toISOString()">{{ time(session.startMs) }}</time> – <time :datetime="new Date(session.endMs).toISOString()">{{ time(session.endMs) }}</time></strong>
            <span>이벤트 {{ number(session.eventCount) }}건 · 관찰 범위 {{ duration(session.observedSpanMs) }} · 도메인 전환 {{ number(session.domainSwitches) }}건 · 동일 도메인 이동 {{ number(session.sameDomainNavigation) }}건</span>
          </li>
        </ol>
        <p v-if="!report.sessions.length" class="muted">관찰된 세션 조각이 없습니다.</p>
        <nav v-if="report.sessions.length > pageSize" class="pager" aria-label="세션 조각 페이지"><button :disabled="sessionPage === 0" @click="sessionPage--">이전</button><span>{{ sessionPage + 1 }} / {{ Math.ceil(report.sessions.length / pageSize) }}</span><button :disabled="(sessionPage + 1) * pageSize >= report.sessions.length" @click="sessionPage++">다음</button></nav>
      </section>
      <section class="report-section">
        <h3>반복되는 도메인 전환</h3>
        <p class="small muted">방향이 있는 전환 · 전체 {{ number(report.domainTransitions.length) }}개 · 한 번에 {{ pageSize }}개 표시</p>
        <ol class="detail-list"><li v-for="edge in report.domainTransitions.slice(edgePage * pageSize, (edgePage + 1) * pageSize)" :key="`${edge.from}-${edge.to}`"><span>{{ edge.from }} → {{ edge.to }}</span><strong>{{ number(edge.count) }}건</strong></li></ol>
        <p v-if="!report.domainTransitions.length" class="muted">반복 전환이 관찰되지 않았습니다.</p>
        <nav v-if="report.domainTransitions.length > pageSize" class="pager" aria-label="도메인 전환 페이지"><button :disabled="edgePage === 0" @click="edgePage--">이전</button><span>{{ edgePage + 1 }} / {{ Math.ceil(report.domainTransitions.length / pageSize) }}</span><button :disabled="(edgePage + 1) * pageSize >= report.domainTransitions.length" @click="edgePage++">다음</button></nav>
      </section>
      <p class="small muted">UTC 00:00–05:59에 관찰된 이벤트 {{ number(report.lateNightEvents) }}건 ({{ (report.lateNightShare * 100).toFixed(1) }}%). 수면, 건강 또는 사용 시간에 관한 결론은 아닙니다.</p>
    </template>
  </section>
</template>

<style scoped>
.activity-insights-panel { min-width: 0; padding: 32px 0; border-top: 1px solid var(--border); container-type: inline-size; }
.panel-heading { margin-bottom: 24px; }
.panel-heading p, .report-section > p { margin-top: 8px; }
.gap-control { display: flex; align-items: end; flex-wrap: wrap; gap: 16px; margin-bottom: 32px; }
.gap-control input { width: 160px; }
.gap-control p { flex-basis: 100%; }
.unavailable { padding: 16px; background: var(--panel); border: 1px solid var(--border); border-radius: 12px; }
.activity-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(160px, 100%), 1fr)); gap: 16px; margin: 0 0 16px; }
.activity-metrics dt, .quantiles dt { color: var(--muted); font-size: 14px; }
.activity-metrics dd, .quantiles dd { margin: 4px 0 0; font-size: 20px; font-variant-numeric: tabular-nums; }
.report-section { min-width: 0; margin-top: 32px; }
.report-section > .insights-bars { margin-top: 24px; }
.heatmap-wrap { max-width: 100%; overflow-x: auto; margin-top: 16px; }
.heatmap { border-collapse: separate; border-spacing: 4px; font-size: 12px; font-variant-numeric: tabular-nums; }
.heatmap th, .heatmap td { min-width: 44px; height: 44px; text-align: center; white-space: nowrap; }
.heatmap th:first-child { position: sticky; left: 0; background: var(--panel); z-index: 1; }
.heatmap td { border: 1px solid var(--border); border-radius: 6px; }
.quantiles { display: flex; gap: 24px; margin: 16px 0; flex-wrap: wrap; }
.gap-list, .detail-list, .fragment-list { display: grid; gap: 8px; margin-top: 16px; }
.gap-list li, .detail-list li { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; border-bottom: 1px solid var(--border); padding: 8px 0; overflow-wrap: anywhere; }
.fragment-list { list-style: decimal; padding-inline-start: 24px; }
.fragment-list li { padding: 8px 0; border-bottom: 1px solid var(--border); overflow-wrap: anywhere; }
.fragment-list strong, .fragment-list span { display: block; }
.fragment-list strong { font-weight: 600; }
.fragment-list span { font-size: 14px; color: var(--muted); }
.pager { display: flex; gap: 12px; align-items: center; margin-top: 16px; font-variant-numeric: tabular-nums; }
.small { font-size: 14px; }
</style>
