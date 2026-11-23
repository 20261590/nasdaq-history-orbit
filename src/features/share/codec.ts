import { Inflate, deflateSync, strFromU8, strToU8 } from 'fflate'
import { z } from 'zod'
import type { ShareInput, SharePeriod } from './types'

export const SHARE_FORMAT_VERSION = '1'
export const MAX_ENCODED_DATA_LENGTH = 16_384
export const MAX_DECOMPRESSED_BYTES = 65_536
export const QR_MAX_URL_LENGTH = 2_900

const nonNegInt = z.number().int().min(0).max(100_000_000)

const sharePeriodSchema = z
  .strictObject({
    startDay: z.number().int().min(0).max(9_999_999_999_999),
    endDayExclusive: z.number().int().min(1).max(9_999_999_999_999),
  })
  .refine((p) => p.endDayExclusive > p.startDay, {
    message: '종료일은 시작일보다 커야 합니다.',
  })

const shareSiteSchema = z.strictObject({
  rank: z.number().int().min(1).max(1_000),
  count: nonNegInt,
  share: z.number().min(0).max(100),
})

const sharePeriodSummarySchema = z.strictObject({
  period: sharePeriodSchema,
  total: nonNegInt,
  uniqueSites: nonNegInt,
  locatedEvents: nonNegInt,
  unlocatedEvents: nonNegInt,
  hours: z.array(nonNegInt).length(24),
  weekdays: z.array(nonNegInt).length(7),
  countries: z
    .array(
      z.strictObject({
        code: z.string().min(1).max(32),
        count: nonNegInt,
      }),
    )
    .max(250),
})

export const shareInputSchema = z.strictObject({
  source: z.enum(['live', 'mock']),
  period: sharePeriodSchema.nullable(),
  total: nonNegInt,
  uniqueSites: nonNegInt,
  locatedSites: nonNegInt,
  locationRate: z.number().min(0).max(100),
  topSites: z.array(shareSiteSchema).max(50),
  hours: z.array(nonNegInt).length(24),
  weekdays: z.array(nonNegInt).length(7),
  countries: z
    .array(
      z.strictObject({
        label: z.string().min(1).max(64),
        count: nonNegInt,
      }),
    )
    .max(250),
  comparison: z
    .strictObject({
      sourceTotal: nonNegInt,
      a: sharePeriodSummarySchema,
      b: sharePeriodSummarySchema,
    })
    .nullable(),
  activity: z.strictObject({
    total: nonNegInt,
    sessionGapMinutes: z.number().int().min(1).max(1_440),
    knownPairs: nonNegInt,
    unknownGaps: nonNegInt,
    domainSwitches: nonNegInt,
    sameDomainNavigation: nonNegInt,
    gapBuckets: z.array(nonNegInt).max(32),
    hours: z.array(nonNegInt).length(24),
    sessions: nonNegInt,
    lateNightEvents: nonNegInt,
  }),
  privacy: z.strictObject({
    analysisExcludedCount: nonNegInt,
    shareExcludedCount: nonNegInt,
    rawRecordsIncluded: z.literal(false),
    siteNamesIncluded: z.literal(false),
  }),
})

export type ShareDecodeResult =
  | { readonly ok: true; readonly data: ShareInput }
  | { readonly ok: false; readonly error: string }

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = bytes[i]
    if (byte !== undefined) {
      binary += String.fromCharCode(byte)
    }
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+\$/g, '')
}

function fromBase64Url(encoded: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+\$/.test(encoded)) {
    throw new Error('공유 데이터에 허용되지 않은 문자가 포함되어 있습니다.')
  }
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/')
  const padLength = (4 - (padded.length % 4)) % 4
  const binary = atob(padded + '='.repeat(padLength))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function safeInflate(compressed: Uint8Array, maxBytes: number): Uint8Array {
  const chunks: Uint8Array[] = []
  let totalLength = 0

  const inflater = new Inflate((chunk) => {
    totalLength += chunk.byteLength
    if (totalLength > maxBytes) {
      throw new Error('압축 해제 크기가 허용 한도를 초과했습니다.')
    }
    chunks.push(chunk)
  })

  inflater.push(compressed, true)

  const merged = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return merged
}

export function encodeShareInput(input: ShareInput): string {
  const validated = shareInputSchema.parse(input)
  const rawBytes = strToU8(JSON.stringify(validated))
  const compressed = deflateSync(rawBytes, { level: 9 })
  const encoded = toBase64Url(compressed)
  if (encoded.length > MAX_ENCODED_DATA_LENGTH) {
    throw new Error('공유 요약 데이터 크기가 허용 한도를 초과했습니다.')
  }
  return encoded
}

export function buildShareUrl(input: ShareInput, baseUrl?: string): string {
  const encoded = encodeShareInput(input)
  const cleanBase =
    baseUrl ??
