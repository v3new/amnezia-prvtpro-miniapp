export interface CacheEntry<T> {
  value: T
  fetchedAt: number
  refreshPromise?: Promise<T>
}

export interface CacheSnapshot<T> {
  value: T
  cached_at: string
  is_stale: boolean
  refresh_in_progress: boolean
}

export function snapshot<T>(entry: CacheEntry<T>, refreshMs: number): CacheSnapshot<T> {
  return {
    value: entry.value,
    cached_at: new Date(entry.fetchedAt).toISOString(),
    is_stale: Date.now() - entry.fetchedAt >= refreshMs,
    refresh_in_progress: entry.refreshPromise !== undefined,
  }
}
