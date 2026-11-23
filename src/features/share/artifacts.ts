import QRCode from 'qrcode'
import {
  QR_MAX_URL_LENGTH,
  buildShareUrl,
  findPeakHour,
  formatPercent,
  formatUtcPeriod,
} from './codec'
import type { ShareArtifacts, ShareInput } from './types'

function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',')
  const base64 = parts[1]
  if (!base64) {
    throw new Error('QR 이미지 데이터 변환에 실패했습니다.')
  }
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: 'image/png' })
}

export async function generateQrPng(url: string): Promise<Blob> {
  if (url.length > QR_MAX_URL_LENGTH) {
    throw new Error('공유 URL이 길어 QR 코드를 생성할 수 없습니다.')
  }
  const dataUrl = await QRCode.toDataURL(url, {
    type: 'image/png',
    width: 320,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  })
  return dataUrlToBlob(dataUrl)
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('결과 카드 PNG 생성에 실패했습니다.'))
        return
      }
      resolve(blob)
    }, 'image/png')
  })
}

export async function generateResultPng(input: ShareInput): Promise<Blob> {
  if (typeof document === 'undefined') {
    throw new Error('브라우저 환경에서만 결과 PNG를 생성할 수 있습니다.')
  }

  const width = 1200
  const height = 680
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas 2D 컨텍스트를 초기화할 수 없습니다.')
  }

  // 배경
  const bg = ctx.createLinearGradient(0, 0, width, height)
  bg.addColorStop(0, '#0b1220')
  bg.addColorStop(1, '#111c33')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, width, height)

  // 헤더
  ctx.fillStyle = '#38bdf8'
  ctx.font = '600 18px sans-serif'
  ctx.fillText('HISTORY ORBIT · ANONYMIZED SUMMARY', 48, 56)

  ctx.fillStyle = '#f8fafc'
  ctx.font = '700 34px sans-serif'
  ctx.fillText('나의 웹 궤도 요약 리포트', 48, 102)

  ctx.fillStyle = '#94a3b8'
  ctx.font = '400 18px sans-serif'
  const sourceLabel = input.source === 'mock' ? '데모 데이터' : '로컬 분석'
  ctx.fillText(
    `기간: ${formatUtcPeriod(input.period)}  |  출처: ${sourceLabel}`,
    48,
    136,
  )

  // 핵심 지표 카드 4개
  const peakHour = findPeakHour(input.activity.hours)
  const kpis = [
    { label: '총 방문 이벤트', value: `${input.total.toLocaleString()}건` },
    { label: '고유 사이트 수', value: `${input.uniqueSites.toLocaleString()}개` },
    {
      label: '위치 추정률',
      value: `${formatPercent(input.locationRate)} (${input.locatedSites.toLocaleString()}개)`,
    },
    {
      label: '주요 활동 시간 / 세션',
      value: `${peakHour === null ? '-' : `${peakHour}시`} / ${input.activity.sessions.toLocaleString()}세션`,
    },
  ]

  const cardWidth = 264
  const cardGap = 16
  kpis.forEach((kpi, index) => {
    const x = 48 + index * (cardWidth + cardGap)
    const y = 168
    drawRoundedRect(ctx, x, y, cardWidth, 106, 14)
    ctx.fillStyle = 'rgba(30, 41, 59, 0.85)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)'
    ctx.lineWidth = 1
    ctx.stroke()

    ctx.fillStyle = '#94a3b8'
    ctx.font = '500 15px sans-serif'
    ctx.fillText(kpi.label, x + 20, y + 36)

    ctx.fillStyle = '#f8fafc'
    ctx.font = '700 24px sans-serif'
    ctx.fillText(kpi.value, x + 20, y + 78)
  })

  // 좌측 패널: 추정 국가 분포 (고유 사이트 수 기준)
  drawRoundedRect(ctx, 48, 298, 540, 260, 14)
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)'
  ctx.stroke()

  ctx.fillStyle = '#e2e8f0'
  ctx.font = '700 20px sans-serif'
  ctx.fillText('주요 추정 국가 분포 (고유 사이트 수)', 70, 336)

  const topCountries = input.countries.slice(0, 5)
  if (topCountries.length === 0) {
    ctx.fillStyle = '#94a3b8'
    ctx.font = '400 16px sans-serif'
    ctx.fillText('표시할 국가 분포 데이터가 없습니다.', 70, 380)
  } else {
    topCountries.forEach((item, idx) => {
      const rowY = 378 + idx * 34
      ctx.fillStyle = '#cbd5e1'
      ctx.font = '500 17px sans-serif'
      ctx.fillText(`${idx + 1}. ${item.label}`, 70, rowY)
      ctx.fillStyle = '#38bdf8'
      ctx.font = '700 17px sans-serif'
      ctx.fillText(`${item.count.toLocaleString()}개 사이트`, 430, rowY)
    })
  }

  // 우측 패널: 활동 & 익명 상위 사이트 비중
  drawRoundedRect(ctx, 612, 298, 540, 260, 14)
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)'
  ctx.stroke()

  ctx.fillStyle = '#e2e8f0'
  ctx.font = '700 20px sans-serif'
  ctx.fillText('활동 패턴 · 익명 상위 사이트 요약', 634, 336)

  const lines = [
    `심야 이벤트: ${input.activity.lateNightEvents.toLocaleString()}건  |  도메인 전환: ${input.activity.domainSwitches.toLocaleString()}건`,
    `분석 제외: ${input.privacy.analysisExcludedCount.toLocaleString()}건  |  공유 전용 제외: ${input.privacy.shareExcludedCount.toLocaleString()}건`,
  ]
  const topSitesText = input.topSites
    .slice(0, 3)
    .map((s) => `#${s.rank} ${formatPercent(s.share)} (${s.count.toLocaleString()}건)`)
    .join(' · ')
  lines.push(topSitesText ? `익명 상위 비중: ${topSitesText}` : '익명 상위 사이트 집계 없음')

  if (input.comparison) {
    lines.push(
      `독립 기간 비교 A/B: ${input.comparison.a.total.toLocaleString()}건 vs ${input.comparison.b.total.toLocaleString()}건`,
    )
  }

  lines.forEach((text, idx) => {
    ctx.fillStyle = '#cbd5e1'
    ctx.font = '400 16px sans-serif'
    ctx.fillText(text, 634, 382 + idx * 38, 496)
  })

  // 하단 면책 및 프라이버시 고지
  ctx.fillStyle = '#94a3b8'
  ctx.font = '400 14px sans-serif'
  ctx.fillText(
    '※ 원본 URL·사이트명·IP·개별 시각은 포함되지 않습니다. 활동 수치는 이벤트 수이며 체류시간·생산성·실제 사용시간이 아닙니다.',
    48,
    610,
  )
  ctx.fillText(
    '※ 기간은 UTC 일 단위 기준이며 종료 경계일(endDayExclusive)은 포함하지 않습니다.',
    48,
    636,
  )

  return canvasToPngBlob(canvas)
}

export async function createShareArtifacts(
  input: ShareInput,
  baseUrl?: string,
): Promise<ShareArtifacts> {
  const url = buildShareUrl(input, baseUrl)
  const [qrPng, resultPng] = await Promise.all([
    generateQrPng(url),
    generateResultPng(input),
  ])
  return { url, qrPng, resultPng }
}
