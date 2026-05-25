import {createHmac, timingSafeEqual} from 'node:crypto'
import {jwtVerify, SignJWT} from 'jose'

export interface TelegramUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
  is_premium?: boolean
  allows_write_to_pm?: boolean
}

export function verifyInitData(initData: string, botToken: string, maxAgeSec = 3600): TelegramUser {
  const params = new URLSearchParams(initData)
  const receivedHash = params.get('hash')
  if (!receivedHash) throw new Error('hash missing')

  const authDate = Number(params.get('auth_date') ?? 0)
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) {
    throw new Error('initData expired')
  }

  params.delete('hash')
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex')

  const expectedBuf = Buffer.from(expectedHash, 'hex')
  const receivedBuf = Buffer.from(receivedHash, 'hex')
  if (expectedBuf.length !== receivedBuf.length || !timingSafeEqual(expectedBuf, receivedBuf)) {
    throw new Error('bad hash')
  }

  const userJson = params.get('user')
  if (!userJson) throw new Error('user missing')
  return JSON.parse(userJson) as TelegramUser
}

export interface SessionClaims {
  panel_user_id: string
  tg_id: number
  username: string
  first_name?: string
  language_code?: string
}

export async function issueSession(
  claims: SessionClaims,
  secret: string,
  ttlHours: number,
): Promise<{token: string; expiresInSec: number}> {
  const expiresInSec = ttlHours * 3600
  const key = new TextEncoder().encode(secret)
  const token = await new SignJWT({...claims})
    .setProtectedHeader({alg: 'HS256'})
    .setIssuedAt()
    .setExpirationTime(`${ttlHours}h`)
    .sign(key)
  return {token, expiresInSec}
}

export async function verifySession(token: string, secret: string): Promise<SessionClaims> {
  const key = new TextEncoder().encode(secret)
  const {payload} = await jwtVerify(token, key, {algorithms: ['HS256']})
  const panel_user_id = String(payload.panel_user_id ?? '')
  const tg_id = Number(payload.tg_id ?? 0)
  const username = String(payload.username ?? '')
  const first_name = typeof payload.first_name === 'string' ? payload.first_name : undefined
  const language_code = typeof payload.language_code === 'string' ? payload.language_code : undefined
  if (!panel_user_id || !tg_id || !username) {
    throw new Error('invalid session payload')
  }
  return {panel_user_id, tg_id, username, first_name, language_code}
}
