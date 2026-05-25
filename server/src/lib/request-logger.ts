import type {MiddlewareHandler} from 'hono'

export interface RequestLoggerOptions {
  /** Exact paths that should NOT be logged (e.g. liveness probes). */
  skipPaths?: string[]
  /** Log requests slower than this with a "slow" tag. */
  slowMs?: number
}

const DEFAULT_SLOW_MS = 1000

export function requestLogger(opts: RequestLoggerOptions = {}): MiddlewareHandler {
  const skip = new Set(opts.skipPaths ?? [])
  const slowMs = opts.slowMs ?? DEFAULT_SLOW_MS

  return async (c, next) => {
    if (skip.has(c.req.path)) return next()
    const startedAt = Date.now()
    await next()
    const elapsed = Date.now() - startedAt
    const status = c.res.status
    const tag = status >= 500 ? 'ERR' : status >= 400 ? 'WARN' : elapsed >= slowMs ? 'SLOW' : 'OK'
    const msg = `[http] ${c.req.method} ${c.req.path} → ${status} ${elapsed}ms [${tag}]`
    if (status >= 500) console.error(msg)
    else if (status >= 400 || tag === 'SLOW') console.warn(msg)
    else console.log(msg)
  }
}
