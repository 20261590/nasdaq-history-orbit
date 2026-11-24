import { describe, expect, it } from 'vitest'
import { describeLocation, parseGeo } from '../src/features/geolocation'
import type { GeoLocation } from '../src/shared/types'

const korea: GeoLocation = {
  latitude: 37.5, longitude: 127, country: 'South Korea', countryCode: 'KR',
  region: 'Seoul', city: 'Seoul', accuracyRadiusKm: null,
}

describe('uncertainty-sensitive location presentation', () => {
  it.each(['종로구', '중구', '면목동'])('keeps Korean-script administrative token %s in unverified detail', city => {
    const display = describeLocation({ ...korea, city, accuracyRadiusKm: 5 })
    expect(display).toMatchObject({ precision: 'region', label: 'South Korea · Seoul (추정)' })
    expect(display.detail).toContain(city)
  })
  it.each([
    { radius: null, precision: 'country', label: 'South Korea (추정)' },
    { radius: 1000, precision: 'country', label: 'South Korea (추정)' },
    { radius: 100.01, precision: 'country', label: 'South Korea (추정)' },
    { radius: 100, precision: 'country', label: 'South Korea (추정)' },
    { radius: 25.01, precision: 'country', label: 'South Korea (추정)' },
    { radius: 25, precision: 'city', label: 'South Korea · Seoul (추정)' },
    { radius: 0, precision: 'city', label: 'South Korea · Seoul (추정)' },
  ])('uses display policy for radius=$radius without claiming administrative proof', ({ radius, precision, label }) => {
    const display = describeLocation({ ...korea, accuracyRadiusKm: radius })
    expect(display).toMatchObject({ precision, label })
    expect(display.warning).toContain('국가도 추정')
    expect(display.warning).toContain('행정 경계')
  })

  it('keeps provider city and region as unverified detail when the primary label is broad', () => {
    const display = describeLocation({ ...korea, region: 'Gyeonggi-do', city: 'Suwon' })
    expect(display).toMatchObject({ precision: 'country', label: 'South Korea (추정)' })
    expect(display.detail).toContain('공급자 지역(미검증): Gyeonggi-do')
    expect(display.detail).toContain('공급자 도시(미검증): Suwon')
    expect(display.detail).toContain('반경 미제공')
  })

  it.each([
    { fields: { region: ' ', city: ' ' }, precision: 'country', label: 'South Korea (추정)' },
    { fields: { city: ' ' }, precision: 'region', label: 'South Korea · Seoul (추정)' },
    { fields: { region: ' ' }, precision: 'city', label: 'South Korea · Seoul (추정)' },
    { fields: { country: ' ' }, precision: 'unknown', label: '위치 미확인' },
  ])('never fills absent administrative names from coordinates: %#', ({ fields, precision, label }) => {
    const display = describeLocation({ ...korea, accuracyRadiusKm: 5, ...fields })
    expect(display).toMatchObject({ precision, label })
  })

  it('keeps the same provider estimate when only the coordinates move across Korean districts', () => {
    const supplied = { ...korea, city: 'Suwon', region: 'Gyeonggi-do', accuracyRadiusKm: 5 }
    const original = describeLocation(supplied)
    const moved = describeLocation({ ...supplied, latitude: 35.18, longitude: 129.07 })
    expect(moved).toEqual(original)
    expect(moved.warning).toContain('구·군')
    expect(moved.warning).toContain('CDN/Anycast')
  })

  // Public Chromium responses, 2026-11-16: docs/evidence/phase2/geo-probe.json.
  it.each([
    { input: { ip: '223.130.200.104', latitude: '37.5112', longitude: '126.9741',
      country: 'South Korea', country_code: 'KR', accuracy: 200, asn: 23576,
      organization_name: 'NAVER Cloud Corp.' }, precision: 'country', label: 'South Korea (추정)' },
    { input: { ip: '168.126.63.1', latitude: '37.5701', longitude: '127.0171',
      country: 'South Korea', country_code: 'KR', region: 'Seoul', city: 'Jongno-gu',
      accuracy: 5, asn: 4766, organization_name: 'Korea Telecom' },
    precision: 'region', label: 'South Korea · Seoul (추정)' },
    { input: { ip: '8.8.8.8', latitude: '37.751', longitude: '-97.822',
      country: 'United States', country_code: 'US', accuracy: 1000, asn: 15169,
      organization_name: 'Google LLC' }, precision: 'country', label: 'United States (추정)' },
    { input: { ip: '2001:4860:4860::8888', latitude: '37.751', longitude: '-97.822',
      country: 'United States', country_code: 'US', accuracy: 1000, asn: 15169,
      organization_name: 'Google LLC' }, precision: 'country', label: 'United States (추정)' },
  ])('presents public provider evidence without promoting a district: $input.ip', ({ input, precision, label }) => {
    const location = parseGeo(input)
    if (location === null) throw new Error('Public fixture must parse')
    const display = describeLocation(location)
    expect(display).toMatchObject({ precision, label })
    if (input.city) {
      expect(location.city).toBe(input.city)
      expect(display.detail).toContain(`공급자 도시(미검증): ${input.city}`)
    }
  })

  it('keeps the public nil-coordinate Cloudflare response unlocated', () => {
    expect(parseGeo({
      ip: '1.1.1.1', latitude: 'nil', longitude: 'nil', asn: 13335,
      organization: 'AS13335 Cloudflare, Inc.', organization_name: 'Cloudflare, Inc.',
    })).toBeNull()
  })
})
