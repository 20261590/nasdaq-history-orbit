export interface Visit {
  readonly id: string
  readonly hostname: string
  readonly domain: string
  readonly timestamp: number
  readonly order: number
  readonly title?: string
  readonly url?: string
}

export interface ParseResult {
  readonly visits: readonly Visit[]
  readonly rejected: number
  readonly duplicates: number
  readonly format: string
}

export interface GeoLocation {
  readonly ip?: string
  readonly latitude: number
  readonly longitude: number
  readonly country: string
  readonly countryCode: string
  readonly region?: string
  readonly city?: string
  readonly accuracyRadiusKm: number | null
  readonly asn?: string
  readonly organization?: string
}

export interface HostLocation {
  readonly hostname: string
  readonly locations: readonly GeoLocation[]
  readonly status: 'resolved' | 'failed' | 'unresolved'
  readonly source: 'live' | 'mock' | 'snapshot'
  readonly error?: string
}

export interface LookupProgress {
  readonly total: number
  readonly completed: number
  readonly resolved: number
  readonly failed: number
}

export interface SiteStat {
  readonly domain: string
  readonly count: number
  readonly share: number
  readonly hostnames: readonly string[]
}

export interface Distribution {
  readonly label: string
  readonly count: number
}

export interface Statistics {
  readonly total: number
  readonly uniqueSites: number
  readonly locatedSites: number
  readonly locationRate: number
  readonly start: number
  readonly end: number
  readonly sites: readonly SiteStat[]
  readonly weekdays: readonly number[]
  readonly hours: readonly number[]
  readonly countries: readonly Distribution[]
  readonly koreanRegions: readonly Distribution[]
}
