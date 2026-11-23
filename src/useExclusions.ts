import { computed, shallowRef, watch } from 'vue'
import type { Ref } from 'vue'
import type { Visit } from './model'
import { inspectSecurity } from './core/security'
import type { ExclusionChange } from './core/security'

/** Session-local choices; raw URLs never leave the existing in-memory corpus. */
export function useExclusions(visits: Ref<readonly Visit[]>) {
  const analysisExcluded = shallowRef<ReadonlySet<number>>(new Set())
  const shareExcluded = shallowRef<ReadonlySet<number>>(new Set())
  const report = computed(() => inspectSecurity(visits.value))
  const analysisVisits = computed(() => visits.value.filter(visit => !analysisExcluded.value.has(visit.order)))
  watch(visits, () => {
    analysisExcluded.value = new Set()
    shareExcluded.value = new Set()
  }, { flush: 'sync' })
  function change(change: ExclusionChange) {
    if (!visits.value.some(visit => visit.order === change.order)) return
    const target = change.scope === 'analysis' ? analysisExcluded : shareExcluded
    const next = new Set(target.value)
    if (change.excluded) next.add(change.order)
    else next.delete(change.order)
    target.value = next
  }
  const shareAllowed = (input: readonly Visit[]) => input.filter(visit => !shareExcluded.value.has(visit.order))
  return { analysisExcluded, shareExcluded, report, analysisVisits, change, shareAllowed }
}
