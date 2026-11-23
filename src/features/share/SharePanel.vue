<script setup lang="ts">
import type { ShareInput } from './types'

defineProps<{ input: ShareInput | null }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <div class="dialog-title">
    <h2 id="share-title">나의 궤도 공유</h2>
    <button aria-label="공유 닫기" @click="emit('close')">닫기</button>
  </div>
  <div class="share-body" data-share-status="not-implemented">
    <p v-if="input === null" role="alert">공유 링크 복원은 NOT IMPLEMENTED 상태입니다. 결과 공유 기능은 팀원 개발 및 통합 예정입니다.</p>
    <p v-else role="status">결과 공유 기능은 팀원 개발 및 통합 예정입니다.</p>
    <p class="small muted">Share · NOT IMPLEMENTED</p>
    <p class="small muted">압축 URL·QR코드·PNG 생성과 공유 페이지 복원은 아직 제공하지 않습니다.</p>
  </div>
</template>
