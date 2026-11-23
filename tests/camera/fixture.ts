import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

type CameraStop = {
  readonly hostname: string
  readonly latitude: number
  readonly longitude: number
  readonly country: string
  readonly countryCode: string
  readonly region?: string
}

export const cameraStops = [
  { hostname: 'naver.com', latitude: 37.5665, longitude: 126.978, country: 'South Korea', countryCode: 'KR', region: 'Seoul' },
  { hostname: 'daum.net', latitude: 37.4563, longitude: 126.7052, country: 'South Korea', countryCode: 'KR', region: 'Incheon' },
  { hostname: 'yahoo.co.jp', latitude: 35.6762, longitude: 139.6503, country: 'Japan', countryCode: 'JP' },
  { hostname: 'github.com', latitude: 40.7128, longitude: -74.006, country: 'United States', countryCode: 'US' },
] as const

export function cameraHistory(repeats = 5) {
  const route = [cameraStops[0], cameraStops[1], cameraStops[2], cameraStops[0], cameraStops[3], cameraStops[0], cameraStops[1], cameraStops[2]]
  return route.flatMap((stop, index) => Array.from({ length: repeats }, (_, repeat) => ({
    url: `https://${stop.hostname}/synthetic`,
    timestamp: new Date(Date.UTC(2026, 0, 5) + (index * repeats + repeat) * 60000).toISOString(),
  })))
}

export async function openCameraHistory(page: Page, records: readonly { readonly url: string; readonly timestamp: string }[], locations: readonly CameraStop[]) {
  const addresses = ['8.8.8.8', '1.1.1.1', '9.9.9.9', '208.67.222.222']
  await page.route('https://dns.google/**', async route => {
    const query = new URL(route.request().url()).searchParams
    const index = locations.findIndex(stop => stop.hostname === query.get('name'))
    const address = addresses[index]
    if (!address) throw new TypeError('Unexpected camera fixture DNS hostname')
    await route.fulfill({ json: {
      Status: 0,
      Answer: query.get('type') === 'A' ? [{ name: locations[index]?.hostname, type: 1, data: address }] : [],
    } })
  })
  await page.route('https://get.geojs.io/**', async route => {
    const address = new URL(route.request().url()).pathname.split('/').at(-1)?.replace(/\.json$/u, '')
    const stop = locations[addresses.indexOf(address ?? '')]
    if (!stop) throw new TypeError('Unexpected camera fixture GeoJS address')
    await route.fulfill({ json: {
      ip: address, country: stop.country, country_code: stop.countryCode,
      latitude: stop.latitude, longitude: stop.longitude, region: stop.region, accuracy: 5,
    } })
  })
  await page.goto('http://127.0.0.1:5178/tests/camera/index.html')
  await page.getByTestId('file-upload').setInputFiles({
    name: 'camera-history.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(records)),
  })
  await page.getByRole('checkbox', { name: '외부 위치 조회에 동의합니다' }).check()
  await page.getByRole('button', { name: '위치 조회', exact: true }).click()
  await expect(page.getByTestId('globe')).toHaveAttribute('data-markers', String(locations.length))
}
