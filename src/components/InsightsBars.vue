<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  title: string
  labels: readonly string[]
  series: readonly { name: string; values: readonly number[] }[]
  unit?: string
}>()
const peak = computed(() => Math.max(1, ...props.series.flatMap(item => item.values)))
const number = (value: number) => value.toLocaleString('ko-KR')
</script>

<template>
  <div class="insights-bars">
    <div class="bars-legend" aria-hidden="true">
      <span v-for="item in series" :key="item.name">{{ item.name }}</span>
    </div>
    <div class="bars-grid" role="img" :aria-label="`${title}. 아래 차트 데이터 보기에서 정확한 값을 확인할 수 있습니다.`">
      <div v-for="(label, index) in labels" :key="`${index}-${label}`" class="bars-column">
        <div class="bars-group">
          <span v-for="item in series" :key="item.name" class="bars-mark"
            :style="{ height: `${((item.values[index] ?? 0) / peak) * 100}%` }" />
        </div>
        <span class="bars-label">{{ label }}</span>
      </div>
    </div>
    <details>
      <summary>차트 데이터 보기: {{ title }}</summary>
      <div class="bars-table-wrap">
        <table>
          <thead><tr><th scope="col">구간</th><th v-for="item in series" :key="item.name" scope="col">{{ item.name }}</th></tr></thead>
          <tbody>
            <tr v-for="(label, index) in labels" :key="`${index}-${label}`">
              <th scope="row">{{ label }}</th>
              <td v-for="item in series" :key="item.name">{{ number(item.values[index] ?? 0) }}{{ unit ?? '건' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  </div>
</template>

<style scoped>
.insights-bars { min-width: 0; }
.bars-legend { display: flex; flex-wrap: wrap; gap: 8px 16px; margin-bottom: 12px; color: var(--muted); font-size: 14px; }
.bars-legend span { display: inline-flex; align-items: center; gap: 8px; }
.bars-legend span::before { content: ''; width: 12px; height: 12px; background: var(--accent); border-radius: 6px; }
.bars-legend span:nth-child(2)::before { background: var(--muted); }
.bars-legend span:nth-child(3)::before { background: var(--warning); }
.bars-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 8px; }
.bars-column { min-width: 0; display: grid; grid-template-rows: 64px auto; gap: 4px; text-align: center; font-size: 12px; color: var(--muted); }
.bars-group { display: flex; align-items: end; justify-content: center; gap: 4px; border-bottom: 1px solid var(--border); }
.bars-mark { flex: 1; max-width: 12px; min-height: 1px; background: var(--accent); }
.bars-mark:nth-child(2) { background: var(--muted); }
.bars-mark:nth-child(3) { background: var(--warning); }
.bars-label { overflow-wrap: anywhere; }
.bars-table-wrap { max-width: 100%; overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 14px; font-variant-numeric: tabular-nums; }
th, td { padding: 8px; text-align: right; border-bottom: 1px solid var(--border); }
th:first-child { text-align: left; }
@container (min-width: 600px) { .bars-grid { grid-template-columns: repeat(24, minmax(0, 1fr)); } }
</style>
