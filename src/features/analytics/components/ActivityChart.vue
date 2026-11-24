<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { init, use } from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsType } from 'echarts/core'

use([BarChart, GridComponent, TooltipComponent, CanvasRenderer])
const props = defineProps<{ labels: readonly string[]; values: readonly number[]; label: string }>()
const root = ref<HTMLDivElement>()
let chart: EChartsType | undefined
let resize: ResizeObserver | undefined
function update() {
  chart?.setOption({
    animation: !matchMedia('(prefers-reduced-motion: reduce)').matches,
    grid: { top: 12, right: 8, bottom: 28, left: 34 },
    tooltip: { trigger: 'axis', renderMode: 'richText', valueFormatter: (value: unknown) => `${String(value)}회` },
    xAxis: { type: 'category', data: props.labels, axisLabel: { color: '#a5b8d0', fontSize: 12 }, axisLine: { lineStyle: { color: '#2a3b50' } }, axisTick: { show: false } },
    yAxis: { type: 'value', minInterval: 1, axisLabel: { color: '#a5b8d0', fontSize: 12 }, splitLine: { lineStyle: { color: '#2a3b50' } } },
    series: [{ type: 'bar', data: props.values, itemStyle: { color: '#63dbd4', borderRadius: [3, 3, 0, 0] }, barMaxWidth: 22 }],
  })
}
watch(() => [props.labels, props.values], update)
onMounted(() => {
  if (!root.value) return
  chart = init(root.value)
  update()
  resize = new ResizeObserver(() => chart?.resize())
  resize.observe(root.value)
})
onUnmounted(() => { resize?.disconnect(); chart?.dispose() })
</script>

<template>
  <div ref="root" class="activity-chart" role="img" :aria-label="label" />
  <details class="chart-table">
    <summary>차트 데이터 보기</summary>
    <dl><template v-for="(text, index) in labels" :key="text"><dt>{{ text }}</dt><dd>{{ values[index] }}회</dd></template></dl>
  </details>
</template>
