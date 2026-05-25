import {Hono} from 'hono'
import {z} from 'zod'
import {err, ok} from '../action-result.ts'
import {issueSession, verifyInitData} from '../auth.ts'
import type {Env} from '../env.ts'
import {buildProfile} from '../lib/profile.ts'
import type {PanelClient} from '../panel/client.ts'

const AuthRequestSchema = z.object({init_data: z.string().min(1)})

export function createAuthRouter(env: Env, panel: PanelClient) {
  const app = new Hono()

  app.post('/auth', async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = AuthRequestSchema.safeParse(body)
    if (!parsed.success) {
      return c.json(err('bad_request', 'init_data обязателен'), 400)
    }

    let tg: ReturnType<typeof verifyInitData>
    try {
      tg = verifyInitData(parsed.data.init_data, env.TG_BOT_TOKEN)
    } catch {
      return c.json(err('bad_init_data', 'Неверная подпись initData'), 401)
    }

    const me = await panel.findUserByTelegramId(tg.id)
    if (!me) {
      return c.json(
        err('user_not_provisioned', `Доступ не настроен. Напиши администратору @${env.TG_ADMIN_HANDLE}.`),
        403,
      )
    }

    const session = await issueSession(
      {
        panel_user_id: me.id,
        tg_id: tg.id,
        username: me.username,
        first_name: tg.first_name,
        language_code: tg.language_code,
      },
      env.JWT_SECRET,
      env.SESSION_TTL_HOURS,
    )

    const profile = buildProfile(me, {
      id: tg.id,
      first_name: tg.first_name,
      language_code: tg.language_code,
    })

    return c.json(ok({token: session.token, expires_in: session.expiresInSec, profile}))
  })

  return app
}
