type Pending<T> = {
  readonly controller: AbortController
  readonly promise: Promise<T>
  users: number
}

/** Shared work is aborted only after its last consumer leaves. Aborts are never cached. */
export class LookupCache<T> {
  private readonly values = new Map<string, T>()
  private readonly pending = new Map<string, Pending<T>>()

  invalidateFailed(isFailed: (value: T) => boolean): void {
    for (const [key, value] of this.values) {
      if (isFailed(value)) this.values.delete(key)
    }
  }

  async get(
    key: string,
    request: { readonly signal: AbortSignal; readonly load: (signal: AbortSignal) => Promise<T> },
  ): Promise<T | undefined> {
    if (request.signal.aborted) return undefined
    const cached = this.values.get(key)
    if (cached !== undefined) return cached
    let entry = this.pending.get(key)
    if (!entry) {
      const controller = new AbortController()
      const promise = request.load(controller.signal)
      entry = { controller, promise, users: 0 }
      const owned = entry
      this.pending.set(key, owned)
      const clear = () => {
        if (this.pending.get(key) === owned) this.pending.delete(key)
      }
      void promise.then((value) => {
        if (!controller.signal.aborted) this.values.set(key, value)
        clear()
      }, clear)
    }
    const shared = entry
    shared.users++
    return new Promise<T | undefined>((resolve, reject) => {
      let settled = false
      const release = () => {
        settled = true
        request.signal.removeEventListener('abort', abort)
        shared.users--
        if (shared.users === 0 && this.pending.get(key) === shared) {
          this.pending.delete(key)
          shared.controller.abort()
        }
      }
      const abort = () => {
        if (settled) return
        release()
        resolve(undefined)
      }
      request.signal.addEventListener('abort', abort, { once: true })
      void shared.promise.then((value) => {
        if (settled) return
        release()
        resolve(value)
      }, (error: unknown) => {
        if (settled) return
        release()
        reject(error)
      })
    })
  }
}
