import {existsSync, statSync} from 'node:fs'
import {join, normalize, resolve} from 'node:path'
import type {MiddlewareHandler} from 'hono'

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

export function serveSpa(rootDir: string): MiddlewareHandler {
  const root = resolve(rootDir)
  return async (c) => {
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      return c.notFound()
    }
    const url = new URL(c.req.url)
    const reqPath = decodeURIComponent(url.pathname)
    const safe = normalize(reqPath).replace(/^[\\/]+/, '')
    let target = join(root, safe)
    if (!target.startsWith(root)) return c.notFound()

    if (!existsSync(target) || statSync(target).isDirectory()) {
      target = join(root, 'index.html')
      if (!existsSync(target)) return c.notFound()
    }

    const ext = target.slice(target.lastIndexOf('.')).toLowerCase()
    const type = CONTENT_TYPES[ext] ?? 'application/octet-stream'
    const file = Bun.file(target)
    return new Response(file, {headers: {'content-type': type}})
  }
}
