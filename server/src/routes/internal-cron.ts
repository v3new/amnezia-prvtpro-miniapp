import {timingSafeEqual} from 'node:crypto'
import type {Bot} from 'grammy'
import {Hono} from 'hono'
import {err, ok} from '../action-result.ts'
import {runWeeklyDigest} from '../bot/digest.ts'
import type {Env} from '../env.ts'
import type {PanelClient} from '../panel/client.ts'

export function createInternalCronRouter(env: Env, panel: PanelClient, bot: Bot) {
  const app = new Hono()

  app.use('*', async (c, next) => {
    const provided = c.req.header('x-cron-secret') ?? ''
    if (!safeEqual(provided, env.CRON_SECRET)) {
      return c.json(err('unauthorized', 'bad cron secret'), 401)
    }
    await next()
  })

  app.post('/cron/digest-weekly', async (c) => {
    const stats = await runWeeklyDigest({panel, bot, adminHandle: env.TG_ADMIN_HANDLE})
    return c.json(ok(stats))
  })

  return app
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}
