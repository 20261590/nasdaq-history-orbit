import type { HostLocation, SiteStat, Visit } from '../../../shared/types'

export interface Marker {
  readonly lat: number
  readonly lng: number
  readonly domains: readonly string[]
  readonly count: number
  readonly radius: number
  readonly color: string
}

export interface OrbitArc {
  readonly startLat: number
  readonly startLng: number
  readonly endLat: number
  readonly endLng: number
}

export function makeMarkers(hosts: readonly HostLocation[], sites: readonly SiteStat[], selected: string): Marker[] {
  const domainByHost = new Map(sites.flatMap(site => site.hostnames.map(host => [host, site] as const)))
  const groups = new Map<string, { lat: number; lng: number; domains: Set<string>; count: number }>()
  for (const host of hosts) {
    const site = domainByHost.get(host.hostname)
    if (!site) continue
    for (const location of host.locations) {
      const key = `${location.latitude.toFixed(2)},${location.longitude.toFixed(2)}`
      const group = groups.get(key) ?? { lat: location.latitude, lng: location.longitude, domains: new Set(), count: 0 }
      if (!group.domains.has(site.domain)) group.count += site.count
      group.domains.add(site.domain)
      groups.set(key, group)
    }
  }
  return [...groups.values()].slice(0, 1500).map(group => ({
    lat: group.lat, lng: group.lng, domains: [...group.domains], count: group.count,
    radius: Math.min(1.25, 0.3 + Math.log2(group.count + 1) * 0.1),
    color: group.domains.has(selected) ? '#f5cb82' : '#63dbd4',
  }))
}

export function makeArcs(visits: readonly Visit[], hosts: readonly HostLocation[]): OrbitArc[] {
  const byHost = new Map(hosts.map(host => [host.hostname, host.locations[0]]))
  const arcs: OrbitArc[] = []
  for (let index = 0; index + 1 < visits.length; index++) {
    const from = visits[index]
    const to = visits[index + 1]
    if (!from || !to || to.order !== from.order + 1) continue
    const start = byHost.get(from.hostname)
    const end = byHost.get(to.hostname)
    if (!start || !end || (start.latitude === end.latitude && start.longitude === end.longitude)) continue
    arcs.push({ startLat: start.latitude, startLng: start.longitude, endLat: end.latitude, endLng: end.longitude })
  }
  return arcs
}
