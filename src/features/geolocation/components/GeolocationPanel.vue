<script setup lang="ts">
import type { LookupProgress } from '../types'

defineProps<{
  provider: 'live' | 'mock'
  consent: boolean
  querying: boolean
  progress: LookupProgress
  canceled: boolean
}>()
const emit = defineEmits<{
  'update:provider': [value: 'live' | 'mock']
  'update:consent': [value: boolean]
  lookup: [retryFailed: boolean]
  cancel: []
}>()
</script>

<template>
  <section class="lookup-bar" aria-label="위치 조회">
    <div class="lookup-explanation"><strong>웹사이트의 현재 서버 위치 찾기</strong><span class="small muted">Google에 hostname만, GeoJS에 공용 IP만 보냅니다. 공급자는 요청자의 IP도 볼 수 있습니다.</span></div>
    <div class="lookup-controls">
      <label class="small">위치 공급자<select :value="provider" :disabled="querying" @change="emit('update:provider', ($event.target as HTMLSelectElement).value as 'live' | 'mock')"><option value="live">실제 DNS / GeoJS</option><option value="mock">MOCK 예시 위치 (외부 요청 없음)</option></select></label>
      <label v-if="provider === 'live'" class="check"><input :checked="consent" type="checkbox" :disabled="querying" @change="emit('update:consent', ($event.target as HTMLInputElement).checked)"> 외부 위치 조회에 동의합니다</label>
      <button v-if="querying" @click="emit('cancel')">조회 취소</button>
      <button v-else class="primary" :disabled="provider === 'live' && !consent" @click="emit('lookup', progress.failed > 0 || canceled)">{{ progress.failed > 0 || canceled ? '미확인 재시도' : '위치 조회' }}</button>
    </div>
    <div v-if="querying || progress.completed" class="lookup-progress" role="status" aria-live="polite">
      <progress :value="progress.completed" :max="progress.total || 1" aria-label="위치 조회 진행률" />
      {{ progress.completed }} / {{ progress.total }} hostname · 성공 {{ progress.resolved }} · 실패 {{ progress.failed }} <span v-if="canceled">· 취소됨</span>
    </div>
  </section>
</template>
