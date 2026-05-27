import {Hono} from 'hono'
import {cors} from 'hono/cors'
import {err} from './action-result.ts'
import {BOT_WEBHOOK_PATH, createBot, createBotWebhookHandler, startBot} from './bot/index.ts'
import {loadEnv} from './env.ts'
import {rateLimit} from './lib/rate-limit.ts'
import {requestLogger} from './lib/request-logger.ts'
import {PanelClient} from './panel/client.ts'
import {createAuthRouter} from './routes/auth.ts'
import {createConnectionsRouter} from './routes/connections.ts'
import {createDownloadRouter} from './routes/download.ts'
import {createInternalCronRouter} from './routes/internal-cron.ts'
import {createOptionsRouter} from './routes/options.ts'
import {createProfileRouter} from './routes/profile.ts'
import {createServerRouter} from './routes/server.ts'
import {serveSpa} from './static.ts'

const VERSION = '1.0.0'
const STARTED_AT = Date.now()

const RATE_LIMIT_WINDOW_MS = 60_000
const AUTH_RATE_LIMIT_MAX = 60 // per IP per minute — initData verification is cheap but should not be flooded
const API_RATE_LIMIT_MAX = 600 // global per IP per minute across /api/v1/*
// Bun default idleTimeout is 10s — too short for slow panel upstreams.
// Value is in seconds, max 255, 0 disables.
const SERVER_IDLE_TIMEOUT_SEC = 120

async function main() {
  const env = loadEnv()
  const panel = new PanelClient({
    baseUrl: env.PANEL_BASE_URL,
    token: env.PANEL_API_TOKEN,
    serverId: env.PANEL_SERVER_ID,
    protocols: env.ENABLED_PROTOCOLS,
  })

  const app = new Hono()

  // Log every incoming request: method, path, status, ms. Skip /health to avoid
  // drowning the console in liveness probes.
  app.use('*', requestLogger({skipPaths: ['/health']}))

  app.use(
    '/api/*',
    cors({
      origin: env.MINI_APP_URL,
      allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type'],
    }),
  )

  app.get('/health', (c) =>
    c.json({
      ok: true,
      version: VERSION,
      uptime_seconds: Math.floor((Date.now() - STARTED_AT) / 1000),
    }),
  )

  const authRouter = createAuthRouter(env, panel)
  // Apply the strict /auth limit to /auth specifically. Using '*' here leaks
  // the middleware onto every sibling router mounted under the same parent
  // (Hono propagates router-level middleware), which would cap /connections
  // at 60/min too. Scoping by path prevents that.
  authRouter.use('/auth', rateLimit({windowMs: RATE_LIMIT_WINDOW_MS, max: AUTH_RATE_LIMIT_MAX}))

  const v1 = new Hono()
  v1.use('*', rateLimit({windowMs: RATE_LIMIT_WINDOW_MS, max: API_RATE_LIMIT_MAX}))
  v1.route('/', authRouter)
  v1.route('/', createProfileRouter(env, panel))
  v1.route('/', createConnectionsRouter(env, panel))
  v1.route('/', createServerRouter(env, panel))
  v1.route('/', createOptionsRouter(env, panel))

  app.route('/api/v1', v1)
  app.route('/dl', createDownloadRouter(env, panel))

  const bot = createBot(env, panel)
  if (env.TG_BOT_MODE === 'webhook') {
    app.post(BOT_WEBHOOK_PATH, createBotWebhookHandler(bot, env))
  }
  app.route('/internal', createInternalCronRouter(env, panel, bot))

  const spa = serveSpa(getStaticRoot())
  app.get('*', async (c, next) => {
    const url = new URL(c.req.url)
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/internal/')) {
      return c.json(err('not_found', 'Не найдено'), 404)
    }
    return spa(c, next)
  })

  app.onError((e, c) => {
    console.error('[server] unhandled', e)
    return c.json(err('internal_error', 'Внутренняя ошибка'), 500)
  })

  await startBot(bot, env)

  const server = Bun.serve({
    port: env.PORT,
    fetch: app.fetch,
    idleTimeout: SERVER_IDLE_TIMEOUT_SEC,
  })
  console.log(`[server] listening on http://localhost:${server.port}`)
}

function getStaticRoot(): string {
  return new URL('../../client/dist', import.meta.url).pathname
}

main().catch((e) => {
  console.error('[server] fatal', e)
  process.exit(1)
})
