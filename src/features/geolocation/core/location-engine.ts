import ky, { HTTPError, TimeoutError } from 'ky'
import { z } from 'zod'
import type { GeoLocation, HostLocation, LookupProgress, Visit } from '../../../shared/types'
import { inspectDns } from '../services/dns'
import { parseGeo } from './geo'
import { LookupCache } from './lookup-cache'
import { isPublicIp, publicHostname } from '../../../shared/utils/network'

export interface ResolveOptions {
  readonly signal: AbortSignal
  readonly onProgress?: (progress: LookupProgress) => void
  readonly onHost?: (host: HostLocation) => void
  readonly retryFailed?: boolean
}

type RequestResult =
  | { readonly kind: 'data'; readonly data: unknown }
  | { readonly kind: 'failed'; readonly error: string }
type GeoResult =
  | { readonly kind: 'located'; readonly location: GeoLocation }
  | { readonly kind: 'failed'; readonly error: string }

/** Memory-only caches, at most `concurrency` HTTP requests across all concurrent resolves. */
export class LocationEngine {
  private readonly hosts = new LookupCache<HostLocation>()
  private readonly ips = new LookupCache<GeoResult>()
  private readonly concurrency: number
  private active = 0
  private readonly waiting: (() => void)[] = []

  constructor(concurrency = 4) {
    this.concurrency = z.number().int().min(1).max(16).parse(concurrency)
  }

  private async json(url: URL, signal: AbortSignal): Promise<RequestResult> {
    if (signal.aborted) return { kind: 'failed', error: 'Cancelled' }
    await new Promise<void>((resolve) => {
      if (this.active < this.concurrency) {
        this.active++
        resolve()
      } else this.waiting.push(resolve)
    })
    try {
      if (signal.aborted) return { kind: 'failed', error: 'Cancelled' }
      const data = await ky.get(url, {
        signal, timeout: 8000, retry: 0, redirect: 'error',
        credentials: 'omit', referrerPolicy: 'no-referrer',
      }).json<unknown>()
      return { kind: 'data', data }
    } catch (error) {
      // This is the external HTTP/JSON boundary. No history URLs or errors are logged.
      if (error instanceof HTTPError) return { kind: 'failed', error: `HTTP ${error.response.status}` }
      if (error instanceof TimeoutError) return { kind: 'failed', error: 'TimeoutError' }
      if (error instanceof TypeError) return { kind: 'failed', error: 'TypeError: network/CORS failure' }
      if (error instanceof SyntaxError) return { kind: 'failed', error: 'Malformed JSON response' }
      if (error instanceof DOMException && error.name === 'AbortError') {
        return { kind: 'failed', error: 'Cancelled' }
      }
      if (error instanceof Error) return { kind: 'failed', error: 'Network request failed' }
      throw error
    } finally {
      const next = this.waiting.shift()
      if (next) next()
      else this.active--
    }
  }

  private async locateIp(ip: string, signal: AbortSignal): Promise<GeoResult | undefined> {
    return this.ips.get(ip, {
      signal,
      load: async (sharedSignal) => {
        const url = new URL(`https://get.geojs.io/v1/ip/geo/${encodeURIComponent(ip)}.json`)
        const response = await this.json(url, sharedSignal)
        switch (response.kind) {
          case 'failed': return response
          case 'data': {
            const location = parseGeo(response.data)
            if (!location) return { kind: 'failed', error: 'Malformed or unavailable GeoJS location' }
            if (location.ip !== undefined && location.ip !== ip) {
              return { kind: 'failed', error: 'GeoJS IP mismatch' }
            }
            return { kind: 'located', location: { ...location, ip } }
          }
          default: return response satisfies never
        }
      },
    })
  }

  private async locateHost(hostname: string, signal: AbortSignal): Promise<HostLocation> {
    let addresses: readonly string[]
    const errors: string[] = []
    if (isPublicIp(hostname)) addresses = [hostname]
    else {
      const responses = await Promise.all(['A', 'AAAA'].map(async (type) => {
        const url = new URL('https://dns.google/resolve')
        url.search = new URLSearchParams({
          name: hostname, type, edns_client_subnet: '0.0.0.0/0',
        }).toString()
        const response = await this.json(url, signal)
        switch (response.kind) {
          case 'failed':
            errors.push(`DNS ${type}: ${response.error}`)
            return []
          case 'data': {
            const result = inspectDns(response.data)
            if (result.error) errors.push(`DNS ${type}: ${result.error}`)
            return result.addresses
          }
          default: return response satisfies never
        }
      }))
      addresses = [...new Set(responses.flat())]
    }
    const locations: GeoLocation[] = []
    for (const ip of addresses) {
      if (signal.aborted) break
      const result = await this.locateIp(ip, signal)
      if (result === undefined) continue
      switch (result.kind) {
        case 'located': locations.push(result.location); break
        case 'failed': errors.push(`GeoJS: ${result.error}`); break
        default: result satisfies never
      }
    }
    return {
      hostname, locations, status: locations.length ? 'resolved' : 'failed', source: 'live',
      ...(errors.length ? { error: [...new Set(errors)].sort().join('; ') } : {}),
    }
  }

  async resolve(visits: readonly Visit[], options: ResolveOptions): Promise<readonly HostLocation[]> {
    if (options.retryFailed) {
      this.hosts.invalidateFailed((host) => host.status === 'failed')
      this.ips.invalidateFailed((result) => result.kind === 'failed')
    }
    const counts = new Map<string, number>()
    for (const visit of visits) counts.set(visit.hostname, (counts.get(visit.hostname) ?? 0) + 1)
    const names = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([hostname]) => hostname)
    const results = new Map<string, HostLocation>()
    let cursor = 0
    let resolved = 0
    let failed = 0
    const progress = () => options.onProgress?.({
      total: names.length, completed: results.size, resolved, failed,
    })
    progress()
    const worker = async () => {
      while (!options.signal.aborted) {
        const input = names[cursor++]
        if (input === undefined) return
        const hostname = publicHostname(input)
        const host = hostname === null
          ? { hostname: input, locations: [], status: 'failed', source: 'live',
            error: 'Invalid or non-public hostname' } satisfies HostLocation
          : await this.hosts.get(hostname, {
            signal: options.signal, load: (signal) => this.locateHost(hostname, signal),
          })
        if (!host || options.signal.aborted) return
        results.set(input, host)
        switch (host.status) {
          case 'resolved': resolved++; break
          case 'failed': failed++; break
          case 'unresolved': break
          default: host.status satisfies never
        }
        options.onHost?.(host)
        progress()
      }
    }
    await Promise.all(Array.from({ length: Math.min(this.concurrency, names.length) }, worker))
    return names.flatMap((name) => {
      const host = results.get(name)
      return host ? [host] : []
    })
  }
}
