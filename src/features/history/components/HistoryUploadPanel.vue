<script setup lang="ts">
import { ref } from 'vue'

defineProps<{ reading: boolean; fileProgress: number; earthPreview: string }>()
const emit = defineEmits<{ file: [file: File | undefined]; demo: [] }>()
const dragging = ref(false)

function chooseFile(event: Event) {
  if (event.target instanceof HTMLInputElement) emit('file', event.target.files?.[0])
}
function drop(event: DragEvent) {
  dragging.value = false
  emit('file', event.dataTransfer?.files[0])
}
</script>

<template>
  <section class="welcome">
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
      <button class="demo-button" @click="emit('demo')">예제 데이터로 둘러보기 <span aria-hidden="true">↗</span></button>
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
</template>
