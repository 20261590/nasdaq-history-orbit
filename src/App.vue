<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { HistoryUploadPanel } from './features/history'
import { GeolocationPanel } from './features/geolocation'
import { SharePanel } from './features/share'
import { useHistoryOrbit } from './app/composables/useHistoryOrbit'

const OrbitGlobe = defineAsyncComponent(() => import('./features/globe').then(module => module.OrbitGlobe))
const ActivityChart = defineAsyncComponent(() => import('./features/analytics').then(module => module.ActivityChart))
const AnalysisWorkbench = defineAsyncComponent(() => import('./app/components/AnalysisWorkbench.vue'))
const {
  active, analysisExcluded, analysisVisits, allTrails, arcs, baseStats, cameraCommand, canceled,
  comparisonAnalytics, completed, consent, country, createDemoHistory, current,
  currentGeo, currentGeoDisplay, cursor, dateText, dismissError, earthPreview,
  endDate, error, excludeRecord, fileName, fileProgress, filtered, focus, followCamera,
  globeAvailable, group, hosts, hours, integrationConfiguration, jump, jumpTime, light, load,
  lookup, manualCamera, markers, motion, motionStatus, number, openShare, parseInfo, playing, readFile,
  progress, provider, querying, ready, reading, reset, rotate, securityReport, selected,
  selectedHosts, selectedSite, selectedVisits, shareDialog, shareExcluded, shareInput, shareOpen,
  siteFilter, source, speed, startDate, stateLabels, statistics, timeline, timeText, togglePlay,
  viewAnalytics, viewComparisonPeriod, weekdays, cancelLookup, seekCamera, selectSite,
} = useHistoryOrbit()
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
      <HistoryUploadPanel v-if="!active" :reading="reading" :file-progress="fileProgress" :earth-preview="earthPreview" @file="readFile" @demo="load(createDemoHistory(), true)" />
      <template v-else>
        <div class="analysis-heading">
          <div><h1>나의 웹 궤도</h1><p class="muted small">{{ fileName }} <span v-if="parseInfo">· 제외 {{ parseInfo.rejected }}건 · 중복 {{ parseInfo.duplicates }}건</span></p></div>
          <div class="source-tag" :class="{ mock: source === 'mock' }">{{ source === 'mock' ? 'MOCK · 예시 위치' : '현재 DNS · GeoIP 추정' }}</div>
        </div>
        <p v-if="parseInfo" class="small muted" data-testid="import-summary">원본 유효 {{ number(parseInfo.visits.length) }}건 · 제외 {{ number(parseInfo.rejected) }}건 · 중복 {{ number(parseInfo.duplicates) }}건 · 분석 제외 {{ analysisExcluded.size }}건 · 현재 필터 {{ number(filtered.length) }}건</p>
        <p class="small muted">로컬 URL 검사 {{ securityReport.totals.inspected }}건 · 잠재 항목 {{ securityReport.totals.flagged }}건. <a href="#analysis-workbench">분석·개인정보 점검으로 이동</a></p>
        <div v-if="parseInfo?.rejected" class="notice warning" role="status">제외된 기록이 있습니다. 시각을 배치할 수 없는 기록이나 처리 상한을 넘어 확인하지 못한 기록이 있으면 잘못된 이동을 피하기 위해 전체 아크 연결을 생략합니다. 유효한 방문 통계와 위치는 유지합니다.</div>
        <GeolocationPanel v-model:provider="provider" v-model:consent="consent" :querying="querying" :progress="progress" :canceled="canceled" @lookup="lookup" @cancel="cancelLookup" />
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
        <AnalysisWorkbench :comparison-visits="comparisonAnalytics" :view-visits="viewAnalytics" :hosts="hosts" :security="securityReport" :reputation-visits="analysisVisits" :analysis-excluded-orders="[...analysisExcluded]" :share-excluded-orders="[...shareExcluded]" @configuration-change="integrationConfiguration = $event" @view-period="viewComparisonPeriod" @exclusion-change="excludeRecord" @share-request="openShare" />
        <footer class="accuracy-note"><strong>지구본을 읽는 방법</strong><p>위치는 방문 당시 서버가 아닌 <b>현재 DNS와 GeoIP의 추정</b>입니다. CDN·클라우드·Anycast로 여러 위치가 반환될 수 있습니다. 첫 번째 유효 IP 위치를 재생 대표 위치로 사용하고, 모든 유효 IP별 위치를 마커와 상세 목록에 보존합니다. 궤적은 시간순 방문 간의 시각적 연결이며 실제 패킷 이동 경로가 아닙니다.</p></footer>
      </template>
    </main>
    <footer v-if="!active" class="page-footer"><span>HISTORY ORBIT</span><span>내 기록은 내 기기에. 내 궤도는 내 선택으로.</span></footer>
  </div>

  <dialog ref="shareDialog" class="share-dialog" aria-labelledby="share-title" @close="shareOpen = false">
    <SharePanel :input="shareInput" @close="shareDialog?.close()" />
  </dialog>
</template>
