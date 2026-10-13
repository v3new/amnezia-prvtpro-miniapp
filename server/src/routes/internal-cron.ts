import type {Bot} from 'grammy'
import {Hono} from 'hono'
import {err, ok} from '../action-result.ts'
import {runWeeklyDigest} from '../bot/digest.ts'
import {runTrafficAlerts} from '../bot/traffic-alerts.ts'
import type {Env} from '../env.ts'
import {safeEqual} from '../lib/safe-equal.ts'
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

  // Meant to run daily. Thresholds are announced at most once per traffic
  // period, so a more frequent schedule is harmless but pointless.
  app.post('/cron/traffic-alerts', async (c) => {
    const stats = await runTrafficAlerts({panel, bot, adminHandle: env.TG_ADMIN_HANDLE})
    return c.json(ok(stats))
  })

  return app
}
