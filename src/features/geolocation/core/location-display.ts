import type { GeoLocation } from '../../../shared/types'

export interface LocationDescription {
  readonly label: string
  readonly detail: string
  readonly precision: 'country' | 'region' | 'city' | 'unknown'
  readonly warning: string
}

// UI disclosure limits, not geographic facts or administrative-boundary tests.
const LOCAL_DISPLAY_RADIUS_KM = 25

/** Present provider estimates without deriving a district or verifying a physical server. */
export function describeLocation(location: GeoLocation): LocationDescription {
  const country = location.country.trim()
  const region = location.region?.trim()
  const city = location.city?.trim()
  const radius = location.accuracyRadiusKm
  // GeoJS city can itself be a Korean district (observed: Jongno-gu). Keep it in raw detail.
  const cityDisplayEligible = location.countryCode !== 'KR'
    || !/(?:(?:-|\s)(?:gu|gun|dong|eup|myeon)|[구군동읍면])$/iu.test(city ?? '')
  const detail = [
    region ? `공급자 지역(미검증): ${region}` : '',
    city ? `공급자 도시(미검증): ${city}` : '',
    radius === null ? '반경 미제공' : `공급자 추정 반경: ${radius} km`,
  ].filter(Boolean).join(' · ')
  const warning = '국가도 추정입니다. 현재 DNS·GeoIP는 방문 당시 물리 서버를 확인하지 않으며 CDN/Anycast의 영향을 받습니다. '
    + '구·군 위치는 확인하지 않습니다. 반경은 행정 경계의 증거가 아니며 표시 단계는 UI 정책입니다.'
  if (!country) return { label: '위치 미확인', detail, precision: 'unknown', warning }
  if (radius !== null && radius <= LOCAL_DISPLAY_RADIUS_KM && city && cityDisplayEligible) {
    return { label: `${country} · ${city} (추정)`, detail, precision: 'city', warning }
  }
  if (radius !== null && radius <= LOCAL_DISPLAY_RADIUS_KM && region) {
    return { label: `${country} · ${region} (추정)`, detail, precision: 'region', warning }
  }
  return { label: `${country} (추정)`, detail, precision: 'country', warning }
}
