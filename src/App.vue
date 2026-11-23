<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import type { GeoLocation, HostLocation, LookupProgress, ParseResult, Visit } from './model'
import { parseHistory, filterVisits, sampleTimeline } from './core/history'
import { computeStatistics } from './core/stats'
import { createDemoHistory, createMockHosts } from './core/demo'
import { LocationEngine } from './core/geo'
import { describeLocation } from './core/location-display'
import { makeArcs, makeMarkers } from './globe-data'
import type { CameraCommand, MotionState, MotionStatus } from './motion-clock'
import { playbackGroup } from './playback-groups'
import type { PlaybackGroup } from './playback-groups'
import { useExclusions } from './useExclusions'
import type { ExclusionChange } from './core/security'
import { buildShareInput } from './core/share-input'
import { SharePanel } from './features/share'
import type { ComparisonPeriods, DayRange } from './core/comparison'

const OrbitGlobe = defineAsyncComponent(() => import('./components/OrbitGlobe.vue'))
const ActivityChart = defineAsyncComponent(() => import('./components/ActivityChart.vue'))
const AnalysisWorkbench = defineAsyncComponent(() => import('./components/AnalysisWorkbench.vue'))
const earthPreview = `${import.meta.env.BASE_URL}earth-preview.webp`
const visits = shallowRef<readonly Visit[]>([])
const { analysisVisits, analysisExcluded, shareExcluded, report: securityReport, change: changeExclusion, shareAllowed } = useExclusions(visits)
const hosts = shallowRef<readonly HostLocation[]>([])
const parseInfo = shallowRef<ParseResult>()
const error = ref('')
const fileName = ref('')
const reading = ref(false)
const fileProgress = ref(0)
const dragging = ref(false)
const consent = ref(false)
const provider = ref<'live' | 'mock'>('live')
const source = ref<'live' | 'mock'>('live')
const querying = ref(false)
const progress = ref<LookupProgress>({ total: 0, completed: 0, resolved: 0, failed: 0 })
const canceled = ref(false)
const startDate = ref('')
const endDate = ref('')
const country = ref('')
const siteFilter = ref('')
const selected = ref('')
const cursor = ref(0)
const playing = ref(false)
const followCamera = ref(true)
const motion = shallowRef<MotionStatus>()
const finished = ref(false)
const globeAvailable = ref(true)
const group = shallowRef<PlaybackGroup>()
const playbackLocation = shallowRef<GeoLocation>()
const speed = ref(1)
const allTrails = ref(false)
const rotate = ref(false)
const ready = ref(false)
const light = ref(false)
const jumpTime = ref('')
const shareDialog = ref<HTMLDialogElement>()
const shareOpen = ref(false)
const integrationConfiguration = shallowRef<{ periods: ComparisonPeriods | null; sessionGapMinutes: number }>({ periods: null, sessionGapMinutes: 30 })
const cameraCommand = shallowRef<CameraCommand>({ key: 0, kind: 'view', explicit: true, target: { lat: 25, lng: 110, distance: 2.1 } })
let engine = new LocationEngine()
let abort: AbortController | undefined
let generation = 0
const active = computed(() => visits.value.length > 0)
const periodVisits = computed(() => filterVisits(analysisVisits.value,
  startDate.value ? Date.parse(`${startDate.value}T00:00:00Z`) : undefined,
  endDate.value ? Date.parse(`${endDate.value}T23:59:59.999Z`) : undefined))
const baseStats = computed(() => computeStatistics(periodVisits.value, hosts.value))
const allowedHosts = computed(() => new Set(hosts.value.filter(host => !country.value || host.locations.some(location => location.country === country.value)).map(host => host.hostname)))
const comparisonVisits = computed(() => analysisVisits.value.filter(visit =>
  (!country.value || allowedHosts.value.has(visit.hostname))
  && (!siteFilter.value.trim() || visit.domain === siteFilter.value.trim().toLowerCase())))
const filtered = computed(() => periodVisits.value.filter(visit =>
  (!country.value || allowedHosts.value.has(visit.hostname))
  && (!siteFilter.value.trim() || visit.domain === siteFilter.value.trim().toLowerCase())))
const comparisonAnalytics = computed(() => comparisonVisits.value.map(({ order, hostname, domain, timestamp }) => ({ order, hostname, domain, timestamp })))
const viewAnalytics = computed(() => filtered.value.map(({ order, hostname, domain, timestamp }) => ({ order, hostname, domain, timestamp })))
const statistics = computed(() => computeStatistics(filtered.value, hosts.value))
const timeline = computed(() => sampleTimeline(filtered.value, 800))
const current = computed(() => group.value?.representative ?? timeline.value[cursor.value])
const currentGeo = computed(() => cameraCommand.value.kind === 'sequence'
  ? playbackLocation.value : hosts.value.find(host => host.hostname === current.value?.hostname)?.locations[0])
const currentGeoDisplay = computed(() => currentGeo.value ? describeLocation(currentGeo.value) : undefined)
const stateLabels: Readonly<Record<MotionState, string>> = {
  IDLE: '대기', ACCELERATING: '가속', CRUISING: '순항', DECELERATING: '감속',
  DWELLING: '목적지 관찰', PAUSED: '일시정지', MANUAL: '수동 조작',
}
const selectedSite = computed(() => statistics.value.sites.find(site => site.domain === selected.value))
const selectedHosts = computed(() => hosts.value.filter(host => selectedSite.value?.hostnames.includes(host.hostname))
  .map(host => ({ ...host, locations: host.locations.map(location => ({ ...location, display: describeLocation(location) })) })))
const selectedVisits = computed(() => filtered.value.filter(visit => visit.domain === selected.value))
const markers = computed(() => makeMarkers(hosts.value, statistics.value.sites, selected.value || current.value?.domain || ''))
const completeArcs = computed(() => {
  const arcs = makeArcs(filtered.value, hosts.value)
  const step = Math.max(1, Math.ceil(arcs.length / 400))
  return arcs.filter((_, index) => index % step === 0)
})
const arcs = computed(() => allTrails.value ? completeArcs.value : makeArcs(timeline.value.slice(cursor.value, cursor.value + 2), hosts.value))
const shareInput = computed(() => shareOpen.value && active.value ? buildShareInput(shareAllowed(filtered.value), hosts.value, {
  source: source.value, comparisonVisits: shareAllowed(comparisonVisits.value),
  periods: integrationConfiguration.value.periods,
  sessionGapMinutes: integrationConfiguration.value.sessionGapMinutes,
  analysisExcludedCount: analysisExcluded.value.size,
  shareExcludedCount: filtered.value.length - shareAllowed(filtered.value).length,
}) : null)
const dateText = (time: number | undefined) => time === undefined ? '—' : new Date(time).toISOString().split('T')[0]
const timeText = (time: number) => new Date(time).toLocaleString('ko-KR', { timeZone: 'UTC', hour12: false })
const number = (value: number) => value.toLocaleString('ko-KR')
const weekdays = ['일', '월', '화', '수', '목', '금', '토']
const hours = Array.from({ length: 24 }, (_, index) => `${index}시`)

function dismissError() {
  error.value = ''
  history.replaceState(null, '', location.pathname)
}
function focus(lat: number, lng: number, distance = 1.7) {
  playing.value = false
  followCamera.value = false
  cameraCommand.value = { key: cameraCommand.value.key + 1, kind: 'view', explicit: true, target: { lat, lng, distance } }
}
function selectVisit(index: number, explicit: boolean, reuseGroup = false) {
  const selectedGroup = reuseGroup ? group.value : playbackGroup(filtered.value, timeline.value, index)
  if (!selectedGroup) { playing.value = false; return }
  group.value = selectedGroup
  cursor.value = selectedGroup.sampleEnd
  const location = hosts.value.find(host => host.hostname === selectedGroup.representative.hostname)?.locations[0]
  playbackLocation.value = location
  cameraCommand.value = {
    key: cameraCommand.value.key + 1, kind: 'sequence', explicit,
    ...(location ? { target: { lat: location.latitude, lng: location.longitude, distance: 0.18 } } : {}),
  }
}
function cancelPlayback() {
  playing.value = false
  finished.value = false
  followCamera.value = true
  group.value = undefined
  cameraCommand.value = { key: cameraCommand.value.key + 1, kind: 'cancel', explicit: true }
}
function motionStatus(status: MotionStatus) {
  if (status.key === cameraCommand.value.key) motion.value = status
}
function completed(key: number) {
  if (!playing.value || key !== cameraCommand.value.key || cameraCommand.value.kind !== 'sequence') return
  if (cursor.value >= timeline.value.length - 1) { playing.value = false; finished.value = true; return }
  selectVisit(cursor.value + 1, false)
}
function manualCamera() {
  playing.value = false
  followCamera.value = false
}
function seekCamera() {
  playing.value = false
  finished.value = false
  followCamera.value = true
  rotate.value = false
  group.value = undefined
  const location = hosts.value.find(host => host.hostname === current.value?.hostname)?.locations[0]
  cameraCommand.value = {
    key: cameraCommand.value.key + 1, kind: 'seek', explicit: true,
    ...(location ? { target: { lat: location.latitude, lng: location.longitude, distance: 0.18 } } : {}),
  }
}
function selectSite(domain: string) {
  selected.value = domain
  const site = statistics.value.sites.find(item => item.domain === domain)
  const location = hosts.value.find(host => site?.hostnames.includes(host.hostname) && host.locations.length)?.locations[0]
  if (location) { followCamera.value = false; focus(location.latitude, location.longitude, 1.2) }
}
function reset() {
  generation++
  abort?.abort()
  playing.value = false
  followCamera.value = true
  finished.value = false
  group.value = undefined
  playbackLocation.value = undefined
  querying.value = false
  visits.value = []
  hosts.value = []
  parseInfo.value = undefined
  error.value = ''
  selected.value = ''
  country.value = ''
  siteFilter.value = ''
  startDate.value = ''
  endDate.value = ''
  cursor.value = 0
  consent.value = false
  canceled.value = false
  shareDialog.value?.close()
  shareOpen.value = false
  engine = new LocationEngine()
  progress.value = { total: 0, completed: 0, resolved: 0, failed: 0 }
  history.replaceState(null, '', location.pathname + location.search)
}
function load(input: unknown, demo = false) {
  reset()
  try {
    const result = parseHistory(input)
    if (result.visits.length === 0) throw new Error('분석할 수 있는 공용 웹 방문기록이 없습니다. URL과 방문 시각을 확인해 주세요.')
    visits.value = result.visits
    parseInfo.value = result
    source.value = demo ? 'mock' : 'live'
    provider.value = demo ? 'mock' : 'live'
    if (demo) {
      hosts.value = createMockHosts(result.visits)
      fileName.value = '예제 방문기록 · 합성 데이터'
    }
    ready.value = false
    focus(25, 110, 2.1)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '방문기록을 읽을 수 없습니다.'
  }
}
async function readFile(file?: File) {
  if (!file) return
  error.value = ''
  if (file.size > 20 * 1024 * 1024) { error.value = '파일 크기 제한은 20 MB입니다.'; return }
  if (!file.name.toLowerCase().endsWith('.json')) { error.value = 'JSON 파일을 선택해 주세요.'; return }
  reading.value = true
  fileProgress.value = 0
  try {
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onprogress = event => { if (event.lengthComputable) fileProgress.value = Math.round(event.loaded / event.total * 90) }
      reader.onerror = () => reject(new Error('파일 읽기에 실패했습니다.'))
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('파일 형식 오류'))
      reader.readAsText(file)
    })
    fileProgress.value = 95
    await nextTick()
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    load(JSON.parse(text))
    fileName.value = file.name
    fileProgress.value = 100
  } catch (reason) {
    error.value = reason instanceof SyntaxError ? '올바른 JSON이 아닙니다. 파일의 구문을 확인해 주세요.' : reason instanceof Error ? reason.message : '파일 읽기 실패'
  } finally { reading.value = false }
}
function chooseFile(event: Event) {
  if (event.target instanceof HTMLInputElement) void readFile(event.target.files?.[0])
}
function drop(event: DragEvent) {
  dragging.value = false
  void readFile(event.dataTransfer?.files[0])
}
async function lookup(retryFailed = false) {
  if (querying.value || (provider.value === 'live' && !consent.value)) return
  source.value = provider.value
  canceled.value = false
  if (provider.value === 'mock') {
    hosts.value = createMockHosts(analysisVisits.value)
    return
  }
  const run = generation
  querying.value = true
  abort = new AbortController()
  const pending = new Map(hosts.value.filter(host => host.source === 'live').map(host => [host.hostname, host]))
  hosts.value = [...pending.values()]
  try {
    const results = await engine.resolve(analysisVisits.value, {
      signal: abort.signal, retryFailed,
      onProgress: value => { if (run === generation) progress.value = value },
      onHost: value => {
        if (run !== generation) return
        pending.set(value.hostname, value)
        hosts.value = [...pending.values()]
      },
    })
    if (run === generation) hosts.value = results
  } catch (reason) {
    if (run === generation) error.value = reason instanceof Error ? reason.message : '외부 조회에 실패했습니다.'
  } finally { if (run === generation) querying.value = false }
}
function cancelLookup() { canceled.value = true; abort?.abort() }
function togglePlay() {
  if (playing.value) { playing.value = false; return }
  if (!globeAvailable.value || !ready.value) return
  rotate.value = false
  followCamera.value = true
  if (motion.value?.state === 'PAUSED' && cameraCommand.value.kind === 'sequence') {
    playing.value = true
    return
  }
  if (finished.value) { cursor.value = 0; group.value = undefined }
  finished.value = false
  playing.value = true
  selectVisit(cursor.value, true, group.value !== undefined)
}
watch([startDate, endDate, country], () => { cursor.value = 0; selected.value = ''; cancelPlayback() })
watch(siteFilter, () => { cursor.value = 0; selected.value = ''; cancelPlayback() })
function excludeRecord(change: ExclusionChange) {
  changeExclusion(change)
  if (change.scope === 'analysis') { cursor.value = 0; cancelPlayback() }
}
function viewComparisonPeriod(period: DayRange) {
  startDate.value = dateText(period.startDay * 86400000) ?? ''
  endDate.value = dateText((period.endDayExclusive - 1) * 86400000) ?? ''
  document.querySelector('[aria-label="방문 궤적"]')?.scrollIntoView({ block: 'start', behavior: 'instant' })
}
function jump() {
  const timestamp = Date.parse(`${jumpTime.value}Z`)
  const index = timeline.value.findIndex(visit => visit.timestamp >= timestamp)
  if (index >= 0) { cursor.value = index; seekCamera() }
}
function openShare() {
  shareOpen.value = true
  shareDialog.value?.showModal()
}
watch(light, value => { document.documentElement.dataset.theme = value ? 'light' : 'dark' })
onMounted(() => {
  const fragment = new URLSearchParams(location.hash.slice(1))
  if (fragment.has('v') || fragment.has('d')) {
    openShare()
  }
})
onUnmounted(() => { abort?.abort() })
</script>

<template>
  <a class="skip-link" href="#main">본문으로 이동</a>
  <div class="app-shell">
    <header class="header">
      <a class="brand" href="./" aria-label="History Orbit 처음으로"><span class="orbit-logo" aria-hidden="true">◎</span> History <strong>Orbit</strong></a>
      <div class="header-actions">
        <span class="local-label">브라우저 안에서만 분석</span>
        <button :aria-label="light ? '어두운 테마' : '밝은 테마'" @click="light = !light">{{ light ? 'Dark' : 'Light' }}</button>
        <button v-if="active" @click="reset">새 분석</button>
        <button v-if="active" class="primary" @click="openShare">결과 공유</button>
      </div>
    </header>

    <main id="main">
      <div v-if="error" class="notice error" role="alert"><span>{{ error }}</span><button @click="dismissError">닫기</button></div>
      <section v-if="!active" class="welcome">
        <div class="welcome-copy">
          <p class="intro-label">당신이 탐색한 웹의 지리</p>
          <h1>방문기록을 따라,<br>새로운 궤도를 발견하세요.</h1>
          <p class="lead">익숙한 웹사이트는 세계 어디에 있을까요?<br>나의 브라우저 기록을 지구본 위에서 다시 만나보세요.</p>
          <div class="upload-area" :class="{ dragging }" @dragover.prevent="dragging = true" @dragleave.prevent="dragging = false" @drop.prevent="drop">
            <span class="upload-symbol" aria-hidden="true">↥</span>
            <p>JSON 파일을 여기에 놓으세요</p>
            <label class="button primary file-button">JSON 선택<input data-testid="file-upload" type="file" accept=".json,application/json" :disabled="reading" @change="chooseFile"></label>
            <span class="small muted">최대 20 MB · 최대 100,000건</span>
          </div>
          <progress v-if="reading" :value="fileProgress" max="100" aria-label="파일 읽기 진행률" />
          <p v-if="reading" role="status">파일 읽기와 로컬 파싱·개인정보 검사를 처리합니다. 원본 URL은 전송하지 않습니다.</p>
          <button class="demo-button" @click="load(createDemoHistory(), true)">예제 데이터로 둘러보기 <span aria-hidden="true">↗</span></button>
          <details class="format-help">
            <summary>지원하는 JSON 형식</summary>
            <p>Google Takeout의 Chrome <code>Browser History</code>, 또는 <code>url</code>과 <code>timestamp</code>, <code>lastVisitTime</code>, <code>visitTime</code>을 가진 배열을 지원합니다. 시각은 ISO 문자열 또는 Unix 초·밀리초입니다. Takeout은 <code>time_usec</code>를 사용합니다.</p>
            <code>[{"url":"https://example.com","timestamp":"2026-11-10T09:00:00Z"}]</code>
          </details>
          <p class="privacy-note">원본 파일은 기기를 떠나지 않습니다. 위치 조회는 별도의 동의를 받은 뒤 진행합니다. 결과 공유 기능은 팀원 개발 및 통합 예정입니다.</p>
        </div>
        <div class="welcome-orbit" aria-hidden="true">
          <img class="earth-preview" :src="earthPreview" width="684" height="640" alt="" fetchpriority="high">
          <div class="orbit-caption">나의 탐색이 하나의 궤도가 되는 곳.</div>
        </div>
      </section>

      <template v-else>
        <div class="analysis-heading">
          <div><h1>나의 웹 궤도</h1><p class="muted small">{{ fileName }} <span v-if="parseInfo">· 제외 {{ parseInfo.rejected }}건 · 중복 {{ parseInfo.duplicates }}건</span></p></div>
          <div class="source-tag" :class="{ mock: source === 'mock' }">{{ source === 'mock' ? 'MOCK · 예시 위치' : '현재 DNS · GeoIP 추정' }}</div>
        </div>
        <p v-if="parseInfo" class="small muted" data-testid="import-summary">원본 유효 {{ number(parseInfo.visits.length) }}건 · 제외 {{ number(parseInfo.rejected) }}건 · 중복 {{ number(parseInfo.duplicates) }}건 · 분석 제외 {{ analysisExcluded.size }}건 · 현재 필터 {{ number(filtered.length) }}건</p>
        <p class="small muted">로컬 URL 검사 {{ securityReport.totals.inspected }}건 · 잠재 항목 {{ securityReport.totals.flagged }}건. <a href="#analysis-workbench">분석·개인정보 점검으로 이동</a></p>
        <div v-if="parseInfo?.rejected" class="notice warning" role="status">제외된 기록이 있습니다. 시각을 배치할 수 없는 기록이나 처리 상한을 넘어 확인하지 못한 기록이 있으면 잘못된 이동을 피하기 위해 전체 아크 연결을 생략합니다. 유효한 방문 통계와 위치는 유지합니다.</div>
        <section class="lookup-bar" aria-label="위치 조회">
          <div class="lookup-explanation"><strong>웹사이트의 현재 서버 위치 찾기</strong><span class="small muted">Google에 hostname만, GeoJS에 공용 IP만 보냅니다. 공급자는 요청자의 IP도 볼 수 있습니다.</span></div>
          <div class="lookup-controls">
            <label class="small">위치 공급자<select v-model="provider" :disabled="querying"><option value="live">실제 DNS / GeoJS</option><option value="mock">MOCK 예시 위치 (외부 요청 없음)</option></select></label>
            <label v-if="provider === 'live'" class="check"><input v-model="consent" type="checkbox" :disabled="querying"> 외부 위치 조회에 동의합니다</label>
            <button v-if="querying" @click="cancelLookup">조회 취소</button>
            <button v-else class="primary" :disabled="provider === 'live' && !consent" @click="lookup(progress.failed > 0 || canceled)">{{ progress.failed > 0 || canceled ? '미확인 재시도' : '위치 조회' }}</button>
          </div>
          <div v-if="querying || progress.completed" class="lookup-progress" role="status" aria-live="polite">
            <progress :value="progress.completed" :max="progress.total || 1" aria-label="위치 조회 진행률" />
            {{ progress.completed }} / {{ progress.total }} hostname · 성공 {{ progress.resolved }} · 실패 {{ progress.failed }} <span v-if="canceled">· 취소됨</span>
          </div>
        </section>
        <div class="filter-bar">
          <span class="small muted">{{ dateText(statistics.total ? statistics.start : undefined) }} — {{ dateText(statistics.total ? statistics.end : undefined) }} · UTC</span>
          <div class="filters">
            <label>시작일<input v-model="startDate" aria-label="시작일" type="date"></label>
            <label>종료일<input v-model="endDate" aria-label="종료일" type="date" :min="startDate"></label>
            <label>국가<select v-model="country" aria-label="국가 필터"><option value="">전체 국가</option><option v-for="item in baseStats.countries" :key="item.label" :value="item.label">{{ item.label }}</option></select></label>
            <label>사이트<input v-model="siteFilter" aria-label="사이트 필터" placeholder="등록 도메인 전체" maxlength="253"></label>
            <button @click="startDate = ''; endDate = ''; country = ''; siteFilter = ''">필터 초기화</button>
          </div>
        </div>
        <dl class="metrics" aria-label="방문 통계">
          <div><dt>방문 이벤트</dt><dd data-testid="total-visits">{{ number(statistics.total) }}<small>회</small></dd></div>
          <div><dt>고유 사이트</dt><dd data-testid="unique-sites">{{ number(statistics.uniqueSites) }}<small>개</small></dd></div>
          <div><dt>위치 확인 사이트</dt><dd>{{ number(statistics.locatedSites) }}<small>개</small></dd></div>
          <div><dt>사이트 위치 확인률</dt><dd>{{ (statistics.locationRate * 100).toFixed(0) }}<small>%</small></dd></div>
        </dl>
        <div class="workspace">
          <section class="globe-panel" aria-label="방문 궤적">
            <div class="globe-toolbar"><span class="small">{{ ready ? '3D 지구본' : '3D 화면 준비 중' }} · 마커 {{ markers.length }}개</span><div class="camera-buttons"><button @click="followCamera = false; focus(25, 110, 2.1)">전체 지구</button><button @click="followCamera = false; focus(36.2, 127.5, 0.42)">대한민국 확대</button><button @click="followCamera = false; rotate = !rotate">{{ rotate ? '회전 멈춤' : '자동 회전' }}</button></div></div>
            <OrbitGlobe :markers="markers" :arcs="arcs" :command="cameraCommand" :playing="playing" :speed="speed" :rotate="rotate" @status="motionStatus" @completed="completed" @interact="manualCamera" @select="selectSite" @ready="ready = true; globeAvailable = true" @unsupported="ready = true; globeAvailable = false" />
            <div v-if="!markers.length" class="globe-hint">위치가 확인되면 마커와 궤적이 표시됩니다.</div>
            <div class="globe-legend"><span><i class="dot" /> 추정 위치</span><span><i class="dot amber" /> 선택 사이트</span><span>동일 좌표의 사이트는 마커로 집계</span></div>
            <div class="current-visit">
              <span class="small muted">현재 방문</span><strong data-testid="current-domain">{{ current?.domain ?? '선택 기간의 기록 없음' }}</strong>
              <time v-if="current">{{ timeText(current.timestamp) }} UTC</time>
              <span v-if="currentGeoDisplay" class="small" :title="currentGeoDisplay.detail">추정 서버 위치: {{ currentGeoDisplay.label }} · 국가 {{ currentGeo?.country }}<span v-if="currentGeo?.region"> · 공급자 지역 {{ currentGeo.region }} (미검증)</span></span>
              <span v-if="group && group.count > 1" class="small muted">같은 사이트의 연속 방문 {{ number(group.count) }}건 묶음 · {{ timeText(group.startTime) }} — {{ timeText(group.representative.timestamp) }} UTC</span>
              <span v-if="current && !currentGeo" class="small warning">위치 미확인 · 이 구간은 연결하지 않습니다</span>
            </div>
            <div class="timeline">
              <div class="motion-status" :data-motion-state="motion?.state ?? 'IDLE'" :data-motion-kind="motion?.kind" :data-motion-progress="motion?.progress" :data-path-progress="motion?.pathProgress" :data-flight-elapsed="motion?.flightElapsed" :data-flight-duration="motion?.flightDuration" :data-dwell-elapsed="motion?.dwellElapsed" :data-dwell-duration="motion?.dwellDuration" :data-motion-command="motion?.key" :data-motion-located="motion?.located">
                <span class="small"><span v-if="motion?.kind === 'seek'">탐색 이동 · </span><span v-if="motion?.kind === 'view'">화면 이동 · </span>{{ motion?.state === 'DWELLING' && !motion.located ? '위치 미확인 기록 관찰' : stateLabels[motion?.state ?? 'IDLE'] }}<span v-if="motion?.kind === 'sequence' && motion.state !== 'MANUAL'"> · 시각적 이동 {{ motion.distanceKm.toFixed(0) }} km · 비행 {{ (motion.flightDuration / 1000).toFixed(1) }}초 · 관찰 {{ (motion.dwellDuration / 1000).toFixed(1) }}초</span></span>
                <progress aria-label="카메라 모션 진행률" max="1" :value="motion?.activeState === 'DWELLING' ? motion.dwellElapsed / motion.dwellDuration : motion?.progress ?? 0" />
              </div>
              <div class="playback-row"><button class="primary play-button" :disabled="!timeline.length || !ready || !globeAvailable" :aria-label="playing ? '일시정지' : '재생'" @click="togglePlay">{{ playing ? 'Ⅱ 일시정지' : '▶ 재생' }}</button><label>속도<select v-model.number="speed" aria-label="재생 속도"><option :value="0.5">0.5×</option><option :value="1">1×</option><option :value="2">2×</option><option :value="4">4×</option></select></label><label class="check"><input v-model="allTrails" type="checkbox"> 전체 궤적</label><span class="small muted">{{ timeline.length ? cursor + 1 : 0 }} / {{ timeline.length }}</span></div>
              <input v-model.number="cursor" aria-label="방문 타임라인" type="range" min="0" :max="Math.max(0, timeline.length - 1)" :disabled="!timeline.length" @input="seekCamera">
              <div class="timeline-ends"><span>{{ dateText(filtered[0]?.timestamp) }}</span><span>{{ dateText(filtered[filtered.length - 1]?.timestamp) }}</span></div>
              <div class="time-jump"><label>시점 이동 (UTC)<input v-model="jumpTime" aria-label="이동 시점" type="datetime-local"></label><button :disabled="!jumpTime" @click="jump">이동</button></div>
              <p class="small muted"><span v-if="!followCamera">자동 카메라 추적이 중지되었습니다. 재생하거나 시점을 이동하면 다시 추적합니다. </span>도착 후 최소 2초 관찰한 뒤 다음 위치로 이동합니다. 속도 배율은 비행에만 적용하며 원본 방문 시각은 바뀌지 않습니다. 통계는 전체 유효 기록 기준입니다. 재생은 최대 800건을 샘플링하고, 증명된 같은 사이트의 연속 구간만 묶습니다. 전체 궤적은 최대 400개 연결이며 샘플 사이와 위치 미확인 구간은 연결하지 않습니다.</p>
            </div>
          </section>
          <aside class="insights" aria-label="사이트 분석">
            <section class="ranking">
              <div class="section-title"><h2>주요 사이트</h2><span class="small muted">TOP 10</span></div>
              <p class="small muted">체류시간이 아닌 방문 횟수 기준</p>
              <ol>
                <li v-for="(site, index) in statistics.sites.slice(0, 10)" :key="site.domain">
                  <button class="rank-button" :class="{ selected: selected === site.domain }" :aria-pressed="selected === site.domain" @click="selectSite(site.domain)">
                    <span class="rank-number">{{ String(index + 1).padStart(2, '0') }}</span><span class="rank-content"><span class="rank-title">{{ site.domain }}</span><span class="rank-track"><span :style="{ width: `${site.share * 100}%` }" /></span></span><span class="rank-count">{{ number(site.count) }}<small>{{ (site.share * 100).toFixed(1) }}%</small></span>
                  </button>
                </li>
              </ol>
              <p v-if="!statistics.sites.length" class="muted">선택한 기간에 방문한 사이트가 없습니다.</p>
            </section>
            <section v-if="selectedSite" class="site-detail" aria-live="polite">
              <h3>{{ selectedSite.domain }}</h3><p>{{ selectedSite.count }}회 방문 · {{ selectedSite.hostnames.length }} hostname</p>
              <p v-if="selectedHosts.every(host => !host.locations.length)" class="warning">위치 미확인. 방문 순위에는 포함됩니다.</p>
              <ul class="location-list"><li v-for="host in selectedHosts" :key="host.hostname"><strong>{{ host.hostname }}</strong><span v-for="(loc, index) in host.locations" :key="index" :data-location-precision="loc.display.precision">{{ loc.display.label }} · {{ loc.latitude.toFixed(2) }}, {{ loc.longitude.toFixed(2) }}<small>{{ loc.display.detail }}</small><small>{{ loc.organization || '조직 미제공' }} {{ loc.asn ? '(AS' + loc.asn + ')' : '' }} · 행정구역·물리 서버 위치 미검증</small></span><small v-if="host.locations.length > 1">분산 위치 {{ host.locations.length }}개 · 대표 위치는 정렬된 첫 유효 공용 IP 결과</small><small v-if="host.error">{{ host.error }}</small></li></ul>
              <details><summary>방문 시각 {{ selectedVisits.length }}건</summary><ul class="visit-times"><li v-for="visit in selectedVisits.slice(0, 50)" :key="visit.id + visit.order">{{ timeText(visit.timestamp) }} UTC</li></ul><p v-if="selectedVisits.length > 50" class="small">최근 표시 상한 50건 · 통계는 전체 건수</p></details>
            </section>
            <section class="country-section"><h3>국가별 사이트</h3><p class="small muted">사이트가 여러 국가에 있으면 각각 포함됩니다.</p><ul class="distribution"><li v-for="item in baseStats.countries" :key="item.label"><button @click="country = country === item.label ? '' : item.label">{{ item.label }}<strong>{{ item.count }}개</strong></button></li></ul><p v-if="!baseStats.countries.length" class="small muted">확인된 위치가 없습니다.</p></section>
          </aside>
        </div>
        <section class="activity-section" aria-label="활동 패턴">
          <div><h2>요일별 방문</h2><p class="small muted">UTC 기준 · 전체 방문 이벤트</p><ActivityChart :labels="weekdays" :values="statistics.weekdays" label="요일별 방문 횟수" /></div>
          <div><h2>시간대별 방문</h2><p class="small muted">UTC 기준 · 체류시간 추정 없음</p><ActivityChart :labels="hours" :values="statistics.hours" label="시간대별 방문 횟수" /></div>
          <div class="korea-section"><h2>한국 지역</h2><p class="small muted">공급자 지역명 기준 집계입니다. 실제 행정구역 위치는 미검증입니다.</p><ul class="distribution"><li v-for="item in statistics.koreanRegions" :key="item.label"><span>{{ item.label }} (공급자 추정)</span><strong>{{ item.count }}개 사이트</strong></li></ul><p v-if="!statistics.koreanRegions.length" class="small muted">지역을 확인할 수 있는 한국 위치가 없습니다.</p><p class="small muted">좌표로 구를 확정하지 않습니다. 반경 미제공·25 km 초과 시 사이트 상세는 국가까지만 표시합니다. 25 km는 표시 정책이며 경계 검증이 아닙니다.</p></div>
        </section>
        <AnalysisWorkbench :comparison-visits="comparisonAnalytics" :view-visits="viewAnalytics" :hosts="hosts" :security="securityReport" :analysis-excluded-orders="[...analysisExcluded]" :share-excluded-orders="[...shareExcluded]" @configuration-change="integrationConfiguration = $event" @view-period="viewComparisonPeriod" @exclusion-change="excludeRecord" @share-request="openShare" />
        <footer class="accuracy-note"><strong>지구본을 읽는 방법</strong><p>위치는 방문 당시 서버가 아닌 <b>현재 DNS와 GeoIP의 추정</b>입니다. CDN·클라우드·Anycast로 여러 위치가 반환될 수 있습니다. 첫 번째 유효 IP 위치를 재생 대표 위치로 사용하고, 모든 유효 IP별 위치를 마커와 상세 목록에 보존합니다. 궤적은 시간순 방문 간의 시각적 연결이며 실제 패킷 이동 경로가 아닙니다.</p></footer>
      </template>
    </main>
    <footer v-if="!active" class="page-footer"><span>HISTORY ORBIT</span><span>내 기록은 내 기기에. 내 궤도는 내 선택으로.</span></footer>
  </div>

  <dialog ref="shareDialog" class="share-dialog" aria-labelledby="share-title" @close="shareOpen = false">
    <SharePanel :input="shareInput" @close="shareDialog?.close()" />
  </dialog>
</template>
