import type {Context, MiddlewareHandler} from 'hono'
import {err} from '../action-result.ts'
import {type SessionClaims, verifySession} from '../auth.ts'
import type {Env} from '../env.ts'
import type {PanelClient} from '../panel/client.ts'

export interface AppVariables {
  session: SessionClaims
}

export function authMiddleware(env: Env): MiddlewareHandler<{Variables: AppVariables}> {
  return async (c, next) => {
    const header = c.req.header('authorization') ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    if (!token) {
      return c.json(err('unauthorized', 'Требуется авторизация'), 401)
    }
    try {
      const claims = await verifySession(token, env.JWT_SECRET)
      c.set('session', claims)
    } catch {
      return c.json(err('unauthorized', 'Сессия истекла, авторизуйся заново'), 401)
    }
    await next()
  }
}

export function activePanelUserMiddleware(panel: PanelClient): MiddlewareHandler<{Variables: AppVariables}> {
  return async (c, next) => {
    const session = getSession(c)
    const user = await panel.findUserById(session.panel_user_id)
    if (!user) {
      return c.json(err('user_not_provisioned', 'Доступ не настроен. Напиши администратору.'), 403)
    }
    if (!user.enabled) {
      return c.json(err('user_disabled', 'Доступ отключён. Напиши администратору.'), 403)
    }
    await next()
  }
}

export function getSession(c: Context<{Variables: AppVariables}>): SessionClaims {
  return c.get('session')
}
