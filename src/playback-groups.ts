import type { Visit } from './model'

export interface PlaybackGroup {
  readonly representative: Visit
  readonly sampleEnd: number
  readonly count: number
  readonly startTime: number
}

// Inspect the full retained chronology, not just gaps in its 800-row sample.
// Only one hostname with proven adjacent original order slots can be grouped.
export function playbackGroup(
  visits: readonly Visit[], sampled: readonly Visit[], index: number,
): PlaybackGroup | undefined {
  const first = sampled[index]
  if (!first) return undefined
  let started = false
  let representative = first
  let count = 0
  for (const visit of visits) {
    if (!started) {
      if (visit.order !== first.order) continue
      started = true
    } else if (visit.hostname !== first.hostname || visit.order !== representative.order + 1) break
    representative = visit
    count++
  }
  if (!started) throw new RangeError('Playback sample must belong to the retained history')
  let sampleEnd = index
  for (const visit of sampled.slice(index + 1)) {
    if (visit.hostname !== first.hostname || visit.order < first.order || visit.order > representative.order) break
    sampleEnd++
  }
  return { representative, sampleEnd, count, startTime: first.timestamp }
}
