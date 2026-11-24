import { describe, expect, it } from 'vitest'
import { isPublicIp, parseDns, parseGeo } from '../src/features/geolocation'

describe('public network and API boundaries', () => {
  it.each([
    '8.8.8.8', '1.1.1.1', '223.130.195.200', '2606:4700:4700::1111', '2001:4860:4860::8888',
  ])('recognizes routable address %s', (ip) => {
    expect(isPublicIp(ip)).toBe(true)
  })

  it.each([
    '', 'host.com', '127.1', '0x08080808', '8.8.8.999', '0.0.0.0', '10.0.0.1',
    '100.64.0.1', '127.0.0.1', '169.254.169.254', '172.16.0.1', '192.168.1.1',
    '192.0.0.1', '192.0.2.1', '198.18.0.1', '198.51.100.1', '203.0.113.1',
    '224.0.0.1', '240.1.1.1', '255.255.255.255', '::', '::1', 'fc00::1', 'fe80::1',
    'fec0::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:8.8.8.8', '64:ff9b::808:808',
    '2001:db8::1', '2002:0808:0808::1', '3fff::1', '5f00::1', '2606:4700::1%eth0',
  ])('excludes non-public or ambiguous address %s', (ip) => {
    expect(isPublicIp(ip)).toBe(false)
  })

  it('accepts public A/AAAA records after CNAME and deduplicates equivalent IPv6', () => {
    expect(parseDns({ Status: 0, Answer: [
      { name: 'www.google.com.', type: 5, data: 'google.com.' },
      { name: 'google.com.', type: 1, data: '8.8.8.8' },
      { name: 'google.com.', type: 28, data: '2606:4700:4700:0:0:0:0:1111' },
      { name: 'google.com.', type: 28, data: '2606:4700:4700::1111' },
      { name: 'google.com.', type: 1, data: '192.168.0.1' },
      { name: 'google.com.', type: 16, data: '1.1.1.1' },
      { name: 'google.com.', type: 1, data: '2606:4700::1' },
    ] })).toEqual(['8.8.8.8', '2606:4700:4700::1111'])
  })

  it.each([
    null, {}, { Status: 3, Answer: [] }, { Status: 0, TC: true, Answer: [] },
    { Status: 0, Answer: [{ name: 'google.com.', type: 5, data: 'localhost.' }] },
    { Status: 0, Answer: [{ name: 'google.com.', type: '1', data: '8.8.8.8' }] },
  ])('rejects unsuccessful or malformed DNS response %#', (input) => {
    expect(parseDns(input)).toEqual([])
  })

  it('parses numeric GeoJS coordinates and preserves unknown accuracy plus ASN metadata', () => {
    expect(parseGeo({
      latitude: '37.5665', longitude: '126.978', country: 'South Korea', country_code: 'kr',
      region: 'Seoul', city: 'Seoul', asn: 4766, organization_name: 'Korea Telecom',
    })).toEqual({
      latitude: 37.5665, longitude: 126.978, country: 'South Korea', countryCode: 'KR',
      region: 'Seoul', city: 'Seoul', accuracyRadiusKm: null, asn: '4766', organization: 'Korea Telecom',
    })
  })

  it('preserves supplied radius and valid coordinate endpoints including zero', () => {
    expect(parseGeo({
      latitude: 0, longitude: -180, country: 'United States', country_code: 'US',
      accuracy: '12.5', ip: '8.8.8.8', organization: 'AS15169 Google LLC',
    })).toMatchObject({
      latitude: 0, longitude: -180, accuracyRadiusKm: 12.5, asn: 'AS15169', ip: '8.8.8.8',
    })
  })
  it.each([
    { country: 'South Korea', countryCode: 'KR', city: 'Seoul', latitude: 37.5, longitude: 127, radius: 5.5 },
    { country: 'Canada', countryCode: 'CA', city: "St. John's", latitude: 47.56, longitude: -52.71, radius: 5 },
    { country: 'Côte d’Ivoire', countryCode: 'CI', city: 'Abidjan', latitude: 5.35, longitude: -4, radius: 5 },
  ])('preserves valid provider metadata for $country / $city', ({ country, countryCode, city, latitude, longitude, radius }) => {
    expect(parseGeo({
      latitude, longitude, country, country_code: countryCode, city, accuracy: radius,
    })).toMatchObject({ latitude, longitude, country, countryCode, city, accuracyRadiusKm: radius })
  })

  it('treats the GeoJS unknown ASN sentinel as absent while preserving its unknown label', () => {
    const location = parseGeo({
      latitude: 0, longitude: 0, country: 'United States', country_code: 'US',
      asn: 64512, organization_name: 'Unknown',
    })
    expect(location).toMatchObject({ organization: 'Unknown', accuracyRadiusKm: null })
    expect(location).not.toHaveProperty('asn')
  })

  it.each([
    { latitude: '' }, { latitude: 'NaN' }, { latitude: 'nil', longitude: 'nil' },
    { latitude: null }, { latitude: 91 },
    { longitude: -181 }, { longitude: Infinity }, { accuracy_radius: -1 }, { accuracy: -1 },
    { ip: '127.0.0.1' }, { country_code: 'USA' }, { country: '' },
  ])('rejects invalid geolocation fields %#', (fields) => {
    expect(parseGeo({
      latitude: 37, longitude: 127, country: 'South Korea', country_code: 'KR', ...fields,
    })).toBeNull()
  })
})
