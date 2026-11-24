import { z } from 'zod'
import type { ParseResult, Visit } from '../../../shared/types'
import { publicHostname, registrableDomain } from '../../../shared/utils/network'

const LIMIT = 100_000
const scalarTime = z.union([z.number(), z.string()])
const isoTime = z.iso.datetime({ offset: true })
const timeSchema = z.object({
  time_usec: scalarTime.optional(),
  timestamp: scalarTime.optional(),
  lastVisitTime: scalarTime.optional(),
  visitTime: scalarTime.optional(),
})
const recordSchema = timeSchema.extend({
  url: z.string(),
  id: z.union([z.string(), z.number().finite()]).optional(),
  title: z.string().optional(),
})
const envelopeSchema = z.object({
  'Browser History': z.unknown().optional(),
  history: z.unknown().optional(),
})

function timestamp(value: string | number | undefined, microseconds: boolean): number | null {
  if (value === undefined || value === '') return null
  if (typeof value === 'number' && !Number.isSafeInteger(Math.trunc(value))) return null
  if (microseconds && typeof value === 'string') {
    if (!/^\+?\d+(?:\.\d+)?$/u.test(value)) return null
    // Divide the decimal integer before Number conversion, avoiding a rounded-up millisecond.
    const milliseconds = BigInt(value.split('.')[0]) / 1000n
    return milliseconds <= 8_640_000_000_000_000n ? Number(milliseconds) : null
  }
  const numeric = typeof value === 'number' || /^[+-]?\d+(?:\.\d+)?$/u.test(value)
    ? Number(value) : NaN
  const milliseconds = Number.isFinite(numeric)
    ? microseconds ? numeric / 1000 : Math.abs(numeric) < 1e11 ? numeric * 1000 : numeric
    : typeof value === 'string' && isoTime.safeParse(value).success ? Date.parse(value) : NaN
  return Number.isFinite(milliseconds) && milliseconds >= 0 && milliseconds <= 8.64e15
    ? Math.trunc(milliseconds) : null
}

/** Process at most 100,000 input rows, counting the unprocessed tail as rejected. */
export function parseHistory(input: unknown): ParseResult {
  const envelope = envelopeSchema.safeParse(input)
  const rawTakeout = envelope.success ? envelope.data['Browser History'] : undefined
  const rawGeneric = envelope.success ? envelope.data.history : undefined
  const takeout: readonly unknown[] | undefined = Array.isArray(rawTakeout) ? rawTakeout : undefined
  const generic: readonly unknown[] | undefined = Array.isArray(rawGeneric) ? rawGeneric : undefined
  const rows: readonly unknown[] = Array.isArray(input) ? input : takeout ?? generic ?? []
  const format = Array.isArray(input) ? 'array' : takeout ? 'takeout' : generic ? 'history' : 'unknown'
  const visits: Visit[] = []
  const chronology: { readonly timestamp: number; readonly index: number }[] = []
  let chronologyKnown = rows.length <= LIMIT
  const seen = new Set<string>()
  let rejected = Math.max(0, rows.length - LIMIT)
  let duplicates = 0
  for (let index = 0; index < Math.min(rows.length, LIMIT); index++) {
    const parsedTime = timeSchema.safeParse(rows[index])
    const fields = parsedTime.success ? parsedTime.data : undefined
    const time = fields === undefined ? null
      : timestamp(fields.time_usec ?? fields.timestamp ?? fields.lastVisitTime ?? fields.visitTime,
        fields.time_usec !== undefined)
    if (time === null) { chronologyKnown = false; rejected++; continue }
    chronology.push({ timestamp: time, index })
    const parsed = recordSchema.safeParse(rows[index])
    if (!parsed.success) { rejected++; continue }
    const row = parsed.data
    let url: URL
    try {
      url = new URL(row.url)
    } catch (error) {
      if (error instanceof TypeError) { rejected++; continue }
      throw error
    }
    const hostname = publicHostname(url.hostname)
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !hostname) {
      rejected++
      continue
    }
    const key = `${url.href}\n${time}`
    if (seen.has(key)) { chronology.pop(); duplicates++; continue }
    seen.add(key)
    visits.push({
      id: row.id === undefined ? `visit-${index}` : String(row.id),
      hostname, domain: registrableDomain(hostname), timestamp: time, order: index,
      url: row.url, ...(row.title === undefined ? {} : { title: row.title }),
    })
  }
  chronology.sort((a, b) => a.timestamp - b.timestamp)
  const byIndex = new Map(visits.map(visit => [visit.order, visit]))
  return {
    // An unplaceable event could be anywhere: retain visits, but assert no adjacency.
    // Known skipped events instead occupy their own sorted order slot.
    visits: chronology.flatMap((event, order) => {
      const visit = byIndex.get(event.index)
      return visit ? [{ ...visit, order: chronologyKnown ? order : order * 2 }] : []
    }),
    rejected, duplicates, format,
  }
}

export function filterVisits(visits: readonly Visit[], start?: number, end?: number): readonly Visit[] {
  return visits.filter((visit) => (start === undefined || visit.timestamp >= start)
    && (end === undefined || visit.timestamp <= end))
}

/** Spread adjacent event blocks across the range; retain endpoints and original order indices. */
export function sampleTimeline(visits: readonly Visit[], max = 2000): readonly Visit[] {
  const limit = Number.isFinite(max) ? Math.max(0, Math.floor(max)) : 2000
  if (limit === 0) return []
  if (visits.length <= limit) return visits
  if (limit === 1) return visits.slice(0, 1)
  if (limit === 2) return visits.filter((_, index) => index === 0 || index === visits.length - 1)
  const blocks = Math.ceil(limit / 2)
  const sampled: Visit[] = []
  for (let block = 0; block < blocks; block++) {
    const width = block === blocks - 1 && limit % 2 === 1 ? 1 : 2
    const start = Math.round(block * (visits.length - width) / (blocks - 1))
    sampled.push(...visits.slice(start, start + width))
  }
  return sampled
}
