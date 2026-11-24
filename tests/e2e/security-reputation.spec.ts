import { createHash } from 'node:crypto'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const key = 'SYNTHETIC_SAFE_BROWSING_DEPLOYMENT_KEY_742'
const secret = 'SYNTHETIC_PRIVATE_QUERY_742'
const records = [
  { url: `https://example.com/bad?access_token=${secret}`, timestamp: '2026-11-10T09:00:00Z' },
  { url: 'https://example.org/clear', timestamp: '2026-11-10T09:01:00Z' },
  { url: 'https://example.net/collision', timestamp: '2026-11-10T09:02:00Z' },
  { url: `https://example.com/bad?access_token=${secret}`, timestamp: '2026-11-10T09:03:00Z' },
]
const digest = (expression: string) => createHash('sha256').update(expression).digest()
const threatHash = digest(`example.com/bad?access_token=${secret}`)
const collisionHash = Buffer.from(digest('example.net/collision'))
collisionHash[31] = (collisionHash[31] ?? 0) ^ 1

async function openSecurity(page: Page, input: unknown = records) {
  await page.goto('/')
  await page.getByTestId('file-upload').setInputFiles({
    name: 'synthetic-reputation.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(input)),
  })
  await page.getByRole('tab', { name: '개인정보 점검', exact: true }).click()
  return page.getByRole('region', { name: 'Google 사이트 위험 점검' })
}
async function allowLookup(page: Page) {
  await expect(page.getByLabel('개인 Safe Browsing API 키', { exact: true })).toHaveCount(0)
  await expect(page.getByTestId('safe-browsing-key-status')).toContainText('별도 키 입력 불필요')
  await page.getByRole('checkbox', { name: /Google 외부 평판 조회에 동의합니다/ }).check()
}
async function mockGoogle(page: Page, duration = '600s', status = 200) {
  const calls: string[] = []
  await page.route('https://safebrowsing.googleapis.com/**', async route => {
    const url = new URL(route.request().url())
    expect(route.request().headers()['x-goog-api-key']).toBe(key)
    calls.push(url.href)
    const prefixes = url.searchParams.getAll('hashPrefixes').map(value => Buffer.from(value, 'base64'))
    const fullHashes = [threatHash, collisionHash].filter(hash =>
      prefixes.some(prefix => prefix.equals(hash.subarray(0, 4)))).map(hash => ({
      fullHash: hash.toString('base64'), fullHashDetails: [{ threatType: 'MALWARE', attributes: [] }],
    }))
    await route.fulfill({ status, json: status === 200 ? { fullHashes, cacheDuration: duration } : { error: { code: status } } })
  })
  return calls
}

test('deployment key needs no personal input while consent gates requests and exact hashes reject collisions', async ({ page }) => {
  const captured: string[] = []
  page.on('console', event => captured.push(event.text()))
  page.on('pageerror', error => captured.push(error.message))
  page.on('request', request => captured.push(request.url(), request.postData() ?? ''))
  const calls = await mockGoogle(page)
  const panel = await openSecurity(page)
  await expect(page.getByTestId('total-visits')).toHaveText('4회')
  await expect(panel.locator('[data-reputation-status="NOT_CHECKED"]')).toHaveCount(3)
  await expect(panel.getByRole('button', { name: '위험 점검 시작', exact: true })).toBeDisabled()
  await allowLookup(page)
  expect(calls).toEqual([])
  await panel.getByRole('button', { name: '위험 점검 시작', exact: true }).click()
  await expect(panel.locator('[data-reputation-status="KNOWN_THREAT"]')).toHaveCount(1)
  await expect(panel.locator('[data-reputation-status="NO_KNOWN_THREAT"]')).toHaveCount(2)
  await expect(panel.locator('[data-reputation-status="CHECK_FAILED"]')).toHaveCount(0)
  await expect(panel.locator('[data-reputation-status="KNOWN_THREAT"]')).toContainText('Advisory provided by Google')
  for (const value of calls) {
    const request = new URL(value)
    expect(request.pathname).toBe('/v5/hashes:search')
    expect(request.searchParams.get('alt')).toBe('json')
    expect(request.searchParams.has('key')).toBe(false)
    for (const prefix of request.searchParams.getAll('hashPrefixes')) expect(Buffer.from(prefix, 'base64')).toHaveLength(4)
  }
  const firstRequestCount = calls.length
  await panel.getByRole('button', { name: '위험 점검 시작', exact: true }).click()
  await expect(panel.getByRole('button', { name: '위험 점검 시작', exact: true })).toBeEnabled()
  expect(calls).toHaveLength(firstRequestCount)
  const dom = await page.locator('html').evaluate(element => element.outerHTML)
  for (const value of [key, secret, records[0].url]) {
    expect(dom).not.toContain(value)
    expect(captured.join('\n')).not.toContain(value)
  }
  expect(await page.evaluate(async () => ({
    local: localStorage.length, session: sessionStorage.length, cookies: document.cookie, databases: (await indexedDB.databases()).length,
  }))).toEqual({ local: 0, session: 0, cookies: '', databases: 0 })
  await panel.getByRole('button', { name: '결과 지우기' }).click()
  await expect(panel.locator('[data-reputation-status="NOT_CHECKED"]')).toHaveCount(3)
})

test('Google authentication failure never appears as a threat miss', async ({ page }) => {
  await mockGoogle(page, '600s', 403)
  const panel = await openSecurity(page, records.slice(0, 1))
  await allowLookup(page)
  await panel.getByRole('button', { name: '위험 점검 시작', exact: true }).click()
  await expect(panel.locator('[data-reputation-status="CHECK_FAILED"]')).toHaveCount(1)
  await expect(panel.locator('[data-reputation-status="NO_KNOWN_THREAT"]')).toHaveCount(0)
  await expect(panel.locator('[data-reputation-status="KNOWN_THREAT"]')).toHaveCount(0)
  await expect(panel).toContainText('API 키·API 사용 설정·v5 접근 권한')
})

test('expired evidence becomes stale without automatic requests and explicit recheck refreshes it', async ({ page }) => {
  const calls = await mockGoogle(page, '2s')
  const panel = await openSecurity(page, records.slice(0, 1))
  await allowLookup(page)
  await panel.getByRole('button', { name: '위험 점검 시작', exact: true }).click()
  await expect(panel.locator('[data-reputation-status="KNOWN_THREAT"]')).toHaveCount(1)
  const firstRequestCount = calls.length
  await expect(panel.locator('[data-reputation-status="STALE"]')).toHaveCount(1)
  expect(calls).toHaveLength(firstRequestCount)
  await expect(panel.locator('[data-reputation-status="STALE"]')).not.toContainText('위험 가능성:')
  await panel.getByRole('button', { name: 'Google에 재검사' }).click()
  await expect(panel.locator('[data-reputation-status="KNOWN_THREAT"]')).toHaveCount(1)
  expect(calls).toHaveLength(firstRequestCount * 2)
})

test('analysis exclusion removes the URL from reputation targets while Share stays unimplemented', async ({ page }) => {
  const calls = await mockGoogle(page)
  const panel = await openSecurity(page, records.slice(0, 3))
  await page.getByRole('combobox', { name: '탐지 종류', exact: true }).selectOption('authentication')
  await page.getByRole('checkbox', { name: '분석에서 제외 (공유에도 적용)', exact: true }).check()
  await expect(panel.locator('[data-reputation-status="NOT_CHECKED"]')).toHaveCount(2)
  await allowLookup(page)
  await panel.getByRole('button', { name: '위험 점검 시작', exact: true }).click()
  await expect(panel.locator('[data-reputation-status="NO_KNOWN_THREAT"]')).toHaveCount(2)
  await expect(panel.locator('[data-reputation-status="KNOWN_THREAT"]')).toHaveCount(0)
  const forbidden = threatHash.subarray(0, 4)
  for (const request of calls) for (const prefix of new URL(request).searchParams.getAll('hashPrefixes')) {
    expect(Buffer.from(prefix, 'base64').equals(forbidden)).toBe(false)
  }
  await page.getByRole('button', { name: '결과 공유', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '나의 궤도 공유' })).toContainText('NOT IMPLEMENTED')
})
