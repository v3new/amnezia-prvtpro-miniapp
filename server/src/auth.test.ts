import {describe, expect, test} from 'bun:test'
import {createHmac} from 'node:crypto'
import {issueSession, verifyInitData, verifySession} from './auth.ts'

function makeInitData(botToken: string, user: object, authDate = Math.floor(Date.now() / 1000)): string {
  const params = new URLSearchParams()
  params.set('auth_date', String(authDate))
  params.set('query_id', 'AAH')
  params.set('user', JSON.stringify(user))
  const data = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const hash = createHmac('sha256', secret).update(data).digest('hex')
  params.set('hash', hash)
  return params.toString()
}

describe('verifyInitData', () => {
  const token = 'test:bot:token'

  test('accepts valid signature', () => {
    const init = makeInitData(token, {id: 42, first_name: 'Sasha'})
    const u = verifyInitData(init, token)
    expect(u.id).toBe(42)
    expect(u.first_name).toBe('Sasha')
  })

  test('rejects wrong token', () => {
    const init = makeInitData(token, {id: 1, first_name: 'X'})
    expect(() => verifyInitData(init, 'other:token')).toThrow()
  })

  test('rejects expired', () => {
    const init = makeInitData(token, {id: 1, first_name: 'X'}, Math.floor(Date.now() / 1000) - 4000)
    expect(() => verifyInitData(init, token)).toThrow()
  })

  test('rejects tampered', () => {
    const init = makeInitData(token, {id: 1, first_name: 'X'})
    const tampered = init.replace('first_name', 'first_NAME')
    expect(() => verifyInitData(tampered, token)).toThrow()
  })
})

describe('session JWT', () => {
  test('roundtrip', async () => {
    const secret = 'x'.repeat(40)
    const {token} = await issueSession({panel_user_id: 'u1', tg_id: 7, username: 'alice'}, secret, 1)
    const claims = await verifySession(token, secret)
    expect(claims.panel_user_id).toBe('u1')
    expect(claims.tg_id).toBe(7)
    expect(claims.username).toBe('alice')
  })
})
