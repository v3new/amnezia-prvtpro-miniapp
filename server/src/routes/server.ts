import {Hono} from 'hono'
import {err, ok} from '../action-result.ts'
import type {Env} from '../env.ts'
import type {PanelClient} from '../panel/client.ts'
import {type AppVariables, activePanelUserMiddleware, authMiddleware} from './middleware.ts'

export function createServerRouter(env: Env, panel: PanelClient) {
  const app = new Hono<{Variables: AppVariables}>()
  app.use('*', authMiddleware(env))
  app.use('*', activePanelUserMiddleware(panel))

  app.get('/server/status', async (c) => {
    try {
      const ping = await panel.ping()
      return c.json(
        ok({
          online: ping.online,
          ping_ms: ping.ping_ms ?? null,
          uptime_seconds: ping.uptime_seconds ?? null,
          protocols_available: ping.protocols_available,
        }),
      )
    } catch {
      return c.json(ok({online: false, ping_ms: null, uptime_seconds: null, protocols_available: []}))
    }
  })

  app.onError((e, c) => {
    console.error('[server] unhandled', e)
    return c.json(err('internal_error', 'Внутренняя ошибка'), 500)
  })

  return app
}
