import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import type { GeoLocation, HostLocation, LookupProgress, ParseResult, Visit } from '../../shared/types'
import { createDemoHistory, filterVisits, parseHistory, sampleTimeline } from '../../features/history'
import { LocationEngine, createMockHosts, describeLocation } from '../../features/geolocation'
import { computeStatistics } from '../../features/analytics'
import { makeArcs, makeMarkers, playbackGroup } from '../../features/globe'
import type { CameraCommand, MotionState, MotionStatus, PlaybackGroup } from '../../features/globe'
import { useExclusions } from '../../features/security'
import type { ExclusionChange } from '../../features/security'
import { buildShareInput } from '../adapters/share-input'
import type { ComparisonPeriods, DayRange } from '../../features/analytics'

export function useHistoryOrbit() {
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

  return {
    active, analysisExcluded, analysisVisits, allTrails, arcs, baseStats, cameraCommand, canceled,
    chooseFile, comparisonAnalytics, completed, consent, country, createDemoHistory, current,
    currentGeo, currentGeoDisplay, cursor, dateText, dismissError, dragging, drop, earthPreview,
    endDate, error, excludeRecord, fileName, fileProgress, filtered, focus, globeAvailable, group,
    hosts, hours, integrationConfiguration, jump, jumpTime, light, load, lookup, manualCamera,
    markers, motion, motionStatus, number, openShare, parseInfo, playing, progress, provider,
    querying, readFile, ready, reading, reset, rotate, securityReport, selected, selectedHosts, selectedSite,
    selectedVisits, shareDialog, shareExcluded, shareInput, shareOpen, siteFilter, source, speed,
    startDate, stateLabels, statistics, timeline, timeText, togglePlay, viewAnalytics,
    viewComparisonPeriod, weekdays, cancelLookup, followCamera, seekCamera, selectSite,
  }
}
