import {Hono} from 'hono'
import {err, ok} from '../action-result.ts'
import type {Env} from '../env.ts'
import {buildProfile} from '../lib/profile.ts'
import type {PanelClient} from '../panel/client.ts'
import {type AppVariables, activePanelUserMiddleware, authMiddleware, getSession} from './middleware.ts'

export function createProfileRouter(env: Env, panel: PanelClient) {
  const app = new Hono<{Variables: AppVariables}>()
  app.use('*', authMiddleware(env))
  app.use('*', activePanelUserMiddleware(panel))

  app.get('/profile', async (c) => {
    const session = getSession(c)
    const cached = await panel.getProfile(session.panel_user_id)
    if (!cached.value) {
      return c.json(err('user_not_provisioned', 'Доступ не настроен. Напиши администратору.'), 403)
    }
    return c.json(
      ok({
        profile: buildProfile(cached.value, {
          id: session.tg_id,
          first_name: session.first_name ?? session.username,
          language_code: session.language_code,
        }),
        cached_at: cached.cached_at,
        is_stale: cached.is_stale,
        refresh_in_progress: cached.refresh_in_progress,
      }),
    )
  })

  return app
}
