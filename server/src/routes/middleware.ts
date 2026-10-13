import type {Context, MiddlewareHandler} from 'hono'
import {err} from '../action-result.ts'
import {type SessionClaims, verifySession} from '../auth.ts'
import type {Env} from '../env.ts'
import {appActivity} from '../lib/app-activity.ts'
import {computeAccess, computeNextReset} from '../lib/profile.ts'
import type {PanelClient, PanelUser} from '../panel/client.ts'

export interface AppVariables {
  session: SessionClaims
  panel_user: PanelUser
}

export function authMiddleware(env: Env): MiddlewareHandler<{Variables: AppVariables}> {
  return async (c, next) => {
    const header = c.req.header('authorization') ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    if (!token) {
      return c.json(err('unauthorized', 'Требуется авторизация'), 401)
    }
    let claims: SessionClaims
    try {
      claims = await verifySession(token, env.JWT_SECRET)
    } catch {
      return c.json(err('unauthorized', 'Сессия истекла, авторизуйся заново'), 401)
    }
    c.set('session', claims)
    // Sibling routers share this middleware, so it can run several times per
    // request; recording the same timestamp again is harmless.
    appActivity.recordSeen(claims.username)
    await next()
  }
}

/**
 * Read-only gate: the panel user must exist, but may be switched off.
 *
 * A blocked user still gets their profile, options and connection list — that
 * is exactly the data that explains *why* they are blocked. Denying it is what
 * turned "you ran out of traffic" into an unexplained lock screen.
 */
export function requirePanelUser(panel: PanelClient): MiddlewareHandler<{Variables: AppVariables}> {
  return async (c, next) => {
    const session = getSession(c)
    const user = await panel.findUserById(session.panel_user_id)
    if (!user) {
      return c.json(err('user_not_provisioned', 'Доступ не настроен. Напиши администратору.'), 403)
    }
    c.set('panel_user', user)
    await next()
  }
}

/**
 * Gate for handing out new access, reporting *which* wall was hit so the client
 * can say something better than "access denied".
 */
export function activePanelUserMiddleware(panel: PanelClient): MiddlewareHandler<{Variables: AppVariables}> {
  return async (c, next) => {
    const session = getSession(c)
    const user = await panel.findUserById(session.panel_user_id)
    if (!user) {
      return c.json(err('user_not_provisioned', 'Доступ не настроен. Напиши администратору.'), 403)
    }
    if (!user.enabled) {
      const access = computeAccess(user, computeNextReset(user.last_reset_at, user.traffic_reset_strategy ?? 'never'))
      switch (access.reason) {
        case 'traffic_limit':
          return c.json(
            err('traffic_limit_reached', 'Лимит трафика исчерпан — новые подключения будут доступны после сброса.'),
            403,
          )
        case 'expired':
          return c.json(err('subscription_expired', 'Срок доступа закончился. Напиши администратору.'), 403)
        default:
          return c.json(err('user_disabled', 'Доступ отключён. Напиши администратору.'), 403)
      }
    }
    await next()
  }
}

export function getSession(c: Context<{Variables: AppVariables}>): SessionClaims {
  return c.get('session')
}

export function getPanelUser(c: Context<{Variables: AppVariables}>): PanelUser {
  return c.get('panel_user')
}
