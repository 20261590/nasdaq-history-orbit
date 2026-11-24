import { searchHashes } from './client'
import { hashUrl } from './protocol'
import { SafeBrowsingError } from './types'
import type {
  FailureCode, FullHashMatch, ReputationResult, ReputationSnapshot, ReputationTarget,
  ScanOptions,
} from './types'

// Google recommends no more than 30 prefixes per hashes.search request.
const batchSize = 30
const requestLimit = 100
const dispatchIntervalMs = 250
const freshForMs = 30 * 60 * 1000

type Hash = { readonly fullHash: string; readonly prefix: string }
type CacheEntry = {
  readonly matches: readonly FullHashMatch[]
  readonly fetchedAt: number
  readonly expiresAt: number
}
type PendingTarget = { readonly index: number; readonly hashes: readonly Hash[] }

/** Session-only cache; a single sequential dispatcher stays below two concurrent calls and four calls/second. */
export class SafeBrowsingEngine {
  private readonly cache = new Map<string, CacheEntry>()
  private results: ReputationResult[] = []
  private requests = 0
  private running = false
  private generation = 0
  private controller: AbortController | null = null
  private onUpdate: ScanOptions['onUpdate']
  private lastDispatchAt = -Infinity

  snapshot(): ReputationSnapshot {
    const now = Date.now()
    const results = this.results.map(result =>
      (result.status === 'KNOWN_THREAT' || result.status === 'NO_KNOWN_THREAT')
        && result.checkedAt !== null && result.expiresAt !== null
        && now >= Math.min(result.expiresAt, result.checkedAt + freshForMs)
        ? { ...result, status: 'STALE' as const } : result)
    return {
      results,
      total: results.length,
      completed: results.filter(result =>
        result.status !== 'NOT_CHECKED').length,
      requests: this.requests,
      running: this.running,
      lastCheckedAt: results.reduce<number | null>((last, result) =>
        result.checkedAt !== null && (last === null || result.checkedAt > last)
          ? result.checkedAt : last, null),
    }
  }

  private publish(): void {
    this.onUpdate?.(this.snapshot())
  }

  cancel(): void {
    if (!this.running) return
    this.generation++
    this.controller?.abort()
    this.controller = null
    this.running = false
    this.results = this.results.map(result => result.status === 'NOT_CHECKED'
      ? { ...result, error: 'CANCELLED' } : result)
    this.publish()
    this.onUpdate = undefined
  }

  clear(): void {
    this.cancel()
    this.generation++
    this.cache.clear()
    this.results = []
    this.requests = 0
    this.onUpdate = undefined
  }

  async scan(targets: readonly ReputationTarget[], options: ScanOptions): Promise<ReputationSnapshot> {
    this.cancel()
    const generation = ++this.generation
    const controller = new AbortController()
    this.controller = controller
    this.onUpdate = options.onUpdate
    this.requests = 0
    this.results = targets.map(({ id }) => ({
      id, status: 'NOT_CHECKED', threats: [], checkedAt: null, expiresAt: null, error: null,
    }))
    const blocked: FailureCode | null = !options.consent ? 'CONSENT_REQUIRED'
      : !options.apiKey.trim() ? 'KEY_REQUIRED' : null
    if (blocked !== null) {
      this.results = this.results.map(result => ({ ...result, error: blocked }))
      this.publish()
      this.onUpdate = undefined
      this.controller = null
      return this.snapshot()
    }
    this.running = true
    this.publish()

    const byUrl = new Map<string, Promise<readonly Hash[]>>()
    const pending: PendingTarget[] = []
    for (const [index, target] of targets.entries()) {
      let hashes = byUrl.get(target.url)
      if (hashes === undefined) {
        hashes = hashUrl(target.url)
        byUrl.set(target.url, hashes)
      }
      try {
        pending.push({ index, hashes: await hashes })
      } catch {
        if (this.generation !== generation) return this.snapshot()
        this.results[index] = { ...this.results[index], error: 'INVALID_URL' }
      }
      if (this.generation !== generation) return this.snapshot()
    }

    const prefixSet = new Set(pending.flatMap(target => target.hashes.map(hash => hash.prefix)))
    const fresh = new Map<string, CacheEntry>()
    const failures = new Map<string, FailureCode>()
    const entry = (prefix: string): CacheEntry | undefined => {
      const fetched = fresh.get(prefix)
      if (fetched !== undefined) return fetched
      if (options.forceRefresh) return fresh.get(prefix)
      const cached = this.cache.get(prefix)
      return cached !== undefined && Date.now() < cached.expiresAt ? cached : undefined
    }
    const unresolved = [...prefixSet].filter(prefix => entry(prefix) === undefined)
    const batches: string[][] = []
    for (let offset = 0; offset < unresolved.length; offset += batchSize) {
      batches.push(unresolved.slice(offset, offset + batchSize))
    }

    const resolveResults = (): void => {
      for (const { index, hashes } of pending) {
        const problem = hashes.map(hash => failures.get(hash.prefix)).find(code => code !== undefined)
        if (problem !== undefined) {
          this.results[index] = {
            id: targets[index].id,
            status: problem === 'REQUEST_LIMIT' ? 'NOT_CHECKED' : 'CHECK_FAILED', threats: [],
            checkedAt: null, expiresAt: null, error: problem,
          }
          continue
        }
        const entries = hashes.map(hash => entry(hash.prefix))
        if (entries.some(item => item === undefined)) continue
        const resolved = entries.filter(item => item !== undefined)
        const threats = [...new Set(hashes.flatMap(hash =>
          entry(hash.prefix)?.matches
            .filter(match => match.fullHash === hash.fullHash)
            .flatMap(match => match.threats) ?? []))]
        this.results[index] = {
          id: targets[index].id,
          status: threats.length > 0 ? 'KNOWN_THREAT' : 'NO_KNOWN_THREAT',
          threats,
          checkedAt: Math.min(...resolved.map(item => item.fetchedAt)),
          expiresAt: Math.min(...resolved.map(item => item.expiresAt)),
          error: null,
        }
      }
      this.publish()
    }
    resolveResults()

    for (const [index, batch] of batches.entries()) {
      if (this.generation !== generation) return this.snapshot()
      if (index >= requestLimit) {
        for (const prefix of batches.slice(index).flat()) failures.set(prefix, 'REQUEST_LIMIT')
        break
      }
      const delay = Math.max(0, this.lastDispatchAt + dispatchIntervalMs - Date.now())
      if (delay > 0) {
        await new Promise<void>(resolve => {
          const timer = setTimeout(resolve, delay)
          controller.signal.addEventListener('abort', () => {
            clearTimeout(timer)
            resolve()
          }, { once: true })
        })
      }
      if (this.generation !== generation) return this.snapshot()
      this.lastDispatchAt = Date.now()
      this.requests++
      try {
        const reply = await searchHashes(batch, options.apiKey, controller.signal)
        if (this.generation !== generation) return this.snapshot()
        const fetchedAt = Date.now()
        for (const prefix of batch) {
          const matches = reply.matches.filter(match =>
            btoa(atob(match.fullHash).slice(0, 4)) === prefix)
          const cached = { matches, fetchedAt, expiresAt: fetchedAt + reply.cacheDurationMs }
          this.cache.set(prefix, cached)
          fresh.set(prefix, cached)
        }
      } catch (error) {
        if (this.generation !== generation) return this.snapshot()
        const code = error instanceof SafeBrowsingError ? error.code : 'NETWORK'
        for (const prefix of batch) failures.set(prefix, code)
        if (code === 'RATE_LIMITED') {
          for (const prefix of batches.slice(index + 1).flat()) failures.set(prefix, code)
          resolveResults()
          break
        }
      }
      resolveResults()
    }
    if (this.generation !== generation) return this.snapshot()
    resolveResults()
    this.running = false
    this.controller = null
    this.publish()
    this.onUpdate = undefined
    return this.snapshot()
  }
}
