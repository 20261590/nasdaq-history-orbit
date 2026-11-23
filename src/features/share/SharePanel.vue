<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createShareArtifacts, generateResultPng } from './artifacts'
import {
  findPeakHour,
  formatPercent,
  formatUtcPeriod,
  hasShareFragment,
  parseShareFragment,
} from './codec'
import type { ShareArtifacts, ShareInput } from './types'

const props = defineProps<{ input: ShareInput | null }>()
const emit = defineEmits<{ close: [] }>()

const hashValue = ref(typeof window !== 'undefined' ? window.location.hash : '')
const artifacts = ref<ShareArtifacts | null>(null)
const qrPreviewUrl = ref<string | null>(null)
const resultPreviewUrl = ref<string | null>(null)
const generating = ref(false)
const errorMessage = ref<string | null>(null)
const copied = ref(false)
const copyError = ref<string | null>(null)

function revokePreviews(): void {
  if (qrPreviewUrl.value) {
    URL.revokeObjectURL(qrPreviewUrl.value)
    qrPreviewUrl.value = null
  }
  if (resultPreviewUrl.value) {
    URL.revokeObjectURL(resultPreviewUrl.value)
    resultPreviewUrl.value = null
  }
}

function handleHashChange(): void {
  if (typeof window !== 'undefined') {
    hashValue.value = window.location.hash
  }
}

const restoredResult = computed(() => {
  if (props.input !== null) return null
  if (!hasShareFragment(hashValue.value)) return null
  return parseShareFragment(hashValue.value)
})

const activeSummary = computed<ShareInput | null>(() => {
  if (props.input !== null) return props.input
  if (restoredResult.value?.ok) return restoredResult.value.data
  return null
})

const shareStatus = computed<'ready' | 'restored' | 'generating' | 'error' | 'empty'>(() => {
  if (generating.value) return 'generating'
  if (errorMessage.value) return 'error'
  if (props.input !== null) return 'ready'
  if (restoredResult.value) {
    return restoredResult.value.ok ? 'restored' : 'error'
  }
  return 'empty'
})

const peakHourLabel = computed(() => {
  if (!activeSummary.value) return '-'
  const peak = findPeakHour(activeSummary.value.activity.hours)
  return peak === null ? '-' : `${peak}시`
})

let generationRunId = 0

async function buildArtifactsForInput(input: ShareInput): Promise<void> {
  const runId = ++generationRunId
  generating.value = true
  errorMessage.value = null
  copied.value = false
  copyError.value = null
  revokePreviews()
  artifacts.value = null

  try {
    const created = await createShareArtifacts(input)
    if (runId !== generationRunId) return
    artifacts.value = created
    qrPreviewUrl.value = URL.createObjectURL(created.qrPng)
    resultPreviewUrl.value = URL.createObjectURL(created.resultPng)
  } catch (err: unknown) {
    if (runId !== generationRunId) return
    errorMessage.value =
      err instanceof Error ? err.message : '공유 결과를 생성하지 못했습니다.'
  } finally {
    if (runId === generationRunId) {
      generating.value = false
    }
  }
}

watch(
  () => props.input,
  (nextInput) => {
    if (nextInput !== null) {
      void buildArtifactsForInput(nextInput)
    } else {
      generationRunId += 1
      generating.value = false
      errorMessage.value = null
      artifacts.value = null
      revokePreviews()
    }
  },
  { immediate: true },
)

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('hashchange', handleHashChange)
  }
})

onBeforeUnmount(() => {
  revokePreviews()
  if (typeof window !== 'undefined') {
    window.removeEventListener('hashchange', handleHashChange)
  }
})

async function copyShareUrl(): Promise<void> {
  if (!artifacts.value) return
  copyError.value = null
  try {
    await navigator.clipboard.writeText(artifacts.value.url)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch {
    copyError.value = '클립보드 복사에 실패했습니다. 아래 링크를 직접 선택해 복사해 주세요.'
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function downloadQrPng(): void {
  if (!artifacts.value) return
  downloadBlob(artifacts.value.qrPng, 'history-orbit-qr.png')
}

async function downloadResultPng(): Promise<void> {
  if (artifacts.value) {
    downloadBlob(artifacts.value.resultPng, 'history-orbit-summary.png')
    return
  }
  if (!activeSummary.value) return
  try {
    const blob = await generateResultPng(activeSummary.value)
    downloadBlob(blob, 'history-orbit-summary.png')
  } catch (err: unknown) {
    errorMessage.value =
      err instanceof Error ? err.message : '결과 PNG를 생성하지 못했습니다.'
  }
}
</script>

<template>
  <div class="dialog-title">
    <h2 id="share-title">나의 궤도 공유</h2>
    <button type="button" aria-label="공유 닫기" @click="emit('close')">닫기</button>
  </div>

  <div class="share-body" :data-share-status="shareStatus">
    <p v-if="generating" role="status">압축 링크와 QR·결과 이미지를 생성하고 있습니다...</p>

    <p v-else-if="errorMessage" role="alert" class="share-alert">
      {{ errorMessage }}
    </p>

    <p v-else-if="restoredResult && !restoredResult.ok" role="alert" class="share-alert">
      공유 링크를 복원할 수 없습니다: {{ restoredResult.error }}
    </p>

    <p v-else-if="!activeSummary" role="status" class="muted">
      공유할 로컬 분석 결과가 없습니다. 방문기록을 분석한 뒤 다시 열어 주세요.
    </p>

    <template v-else>
      <p v-if="props.input === null" role="status" class="small share-notice">
        공유 링크에서 복원된 익명 요약 리포트입니다. 원본 방문기록이나 3D 전체 궤적은 포함되지 않습니다.
      </p>

      <section class="share-summary" aria-label="공유 요약 미리보기">
        <p class="small muted">
          기간: {{ formatUtcPeriod(activeSummary.period) }} · 출처:
          {{ activeSummary.source === 'mock' ? '데모' : '로컬 분석' }}
        </p>

        <div class="share-kpi-grid">
          <div class="share-kpi">
            <span class="small muted">총 방문 이벤트</span>
            <strong>{{ activeSummary.total.toLocaleString() }}건</strong>
          </div>
          <div class="share-kpi">
            <span class="small muted">고유 사이트</span>
            <strong>{{ activeSummary.uniqueSites.toLocaleString() }}개</strong>
          </div>
          <div class="share-kpi">
            <span class="small muted">위치 추정률</span>
            <strong>{{ formatPercent(activeSummary.locationRate) }}</strong>
          </div>
          <div class="share-kpi">
            <span class="small muted">주 활동 시간 / 세션</span>
            <strong>{{ peakHourLabel }} / {{ activeSummary.activity.sessions.toLocaleString() }}</strong>
          </div>
        </div>

        <div class="share-lists">
          <div>
            <h3>추정 국가 분포 (고유 사이트 수)</h3>
            <ul v-if="activeSummary.countries.length > 0" class="share-list">
              <li v-for="c in activeSummary.countries.slice(0, 5)" :key="c.label">
                <span>{{ c.label }}</span>
                <span>{{ c.count.toLocaleString() }}개</span>
              </li>
            </ul>
            <p v-else class="small muted">국가 분포 데이터 없음</p>
          </div>

          <div>
            <h3>익명 상위 사이트 비중</h3>
            <ul v-if="activeSummary.topSites.length > 0" class="share-list">
              <li v-for="s in activeSummary.topSites.slice(0, 5)" :key="s.rank">
                <span>#{{ s.rank }}</span>
                <span>{{ formatPercent(s.share) }} ({{ s.count.toLocaleString() }}건)</span>
              </li>
            </ul>
            <p v-else class="small muted">상위 사이트 집계 없음</p>
          </div>
        </div>

        <div v-if="activeSummary.comparison" class="share-comparison small">
          <h3>독립 기간 비교 요약 (대표 국가 기준 이벤트 수)</h3>
          <p>
            A ({{ formatUtcPeriod(activeSummary.comparison.a.period) }}):
            <strong>{{ activeSummary.comparison.a.total.toLocaleString() }}건</strong>
            /
            B ({{ formatUtcPeriod(activeSummary.comparison.b.period) }}):
            <strong>{{ activeSummary.comparison.b.total.toLocaleString() }}건</strong>
          </p>
        </div>

        <p class="small muted">
          개인정보 보호: 분석 제외 {{ activeSummary.privacy.analysisExcludedCount.toLocaleString() }}건,
          공유 전용 제외 {{ activeSummary.privacy.shareExcludedCount.toLocaleString() }}건 적용 (원본 URL·사이트명 미포함).
          활동 수치는 이벤트 수이며 체류시간·생산성·실제 사용시간이 아닙니다.
        </p>
      </section>

      <section v-if="artifacts" class="share-exports" aria-label="링크 및 이미지 내보내기">
        <div class="share-url-row">
          <input
            type="text"
            readonly
            aria-label="압축 공유 URL"
            :value="artifacts.url"
          />
          <button type="button" @click="copyShareUrl">
            {{ copied ? '복사 완료' : '링크 복사' }}
          </button>
        </div>
        <p v-if="copyError" role="alert" class="small share-alert">{{ copyError }}</p>

        <div class="share-previews">
          <div v-if="qrPreviewUrl" class="share-preview-card">
            <img :src="qrPreviewUrl" alt="공유 링크 QR 코드 미리보기" class="share-qr-img" />
            <button type="button" @click="downloadQrPng">QR PNG 저장</button>
          </div>

          <div v-if="resultPreviewUrl" class="share-preview-card">
            <img :src="resultPreviewUrl" alt="결과 요약 카드 PNG 미리보기" class="share-card-img" />
            <button type="button" @click="downloadResultPng">결과 PNG 저장</button>
          </div>
        </div>
      </section>

      <div v-else class="share-actions">
        <button type="button" @click="downloadResultPng">복원 요약 PNG 저장</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.share-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.share-alert {
  color: #f87171;
}

.share-notice {
  margin: 0;
}

.share-summary {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.share-kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 8px;
}

.share-kpi {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 8px;
}

.share-lists {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.share-lists h3,
.share-comparison h3 {
  margin: 0 0 6px;
  font-size: 0.9rem;
}

.share-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.85rem;
}

.share-list li {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.share-exports {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.share-url-row {
  display: flex;
  gap: 8px;
}

.share-url-row input {
  flex: 1;
  min-width: 0;
}

.share-previews {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.share-preview-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 8px;
}

.share-qr-img {
  width: 160px;
  height: 160px;
  background: #ffffff;
  border-radius: 6px;
}

.share-card-img {
  width: 100%;
  max-width: 320px;
  height: auto;
  border-radius: 6px;
}

.share-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
