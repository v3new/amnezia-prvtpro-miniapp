import type {Context, MiddlewareHandler} from 'hono'
import {getConnInfo} from 'hono/bun'

interface Bucket {
  count: number
  resetAt: number
}

export interface RateLimitOptions {
  windowMs: number
  max: number
  key?: (c: Context) => string
}

const SWEEP_EVERY_N_REQUESTS = 500

export function rateLimit(opts: RateLimitOptions): MiddlewareHandler {
  const buckets = new Map<string, Bucket>()
  const keyFn = opts.key ?? ((c: Context) => clientIp(c))
  let sinceSweep = 0

  return async (c, next) => {
    const now = Date.now()
    const key = keyFn(c)
    let bucket = buckets.get(key)
    if (!bucket || bucket.resetAt <= now) {
      bucket = {count: 0, resetAt: now + opts.windowMs}
      buckets.set(key, bucket)
    }
    bucket.count++
    if (bucket.count > opts.max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
      console.warn(
        `[rate-limit] 429 key=${key} count=${bucket.count}/${opts.max} ${c.req.method} ${c.req.path} retry=${retryAfter}s`,
      )
      return c.json({ok: false, error: {code: 'rate_limited', message: 'Too many requests'}}, 429, {
        'Retry-After': String(retryAfter),
      })
    }
    if (++sinceSweep >= SWEEP_EVERY_N_REQUESTS) {
      sinceSweep = 0
      for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k)
    }
    await next()
  }
}

function clientIp(c: Context): string {
  // Behind a reverse proxy these headers are authoritative.
  const xf = c.req.header('x-forwarded-for')
  if (xf) return xf.split(',')[0]?.trim() ?? 'unknown'
  const xr = c.req.header('x-real-ip')
  if (xr) return xr
  // Direct connection (dev/local): take the real socket address so we don't
  // collapse every caller into a single shared bucket.
  try {
    const info = getConnInfo(c)
    return info.remote.address ?? 'unknown'
  } catch {
    return 'unknown'
  }
}
