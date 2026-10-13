import {afterEach, beforeEach, describe, expect, test} from 'bun:test'
import {PanelClient} from './client.ts'

const originalFetch = globalThis.fetch
type FetchInput = Parameters<typeof originalFetch>[0]
type FetchInit = Parameters<typeof originalFetch>[1]

let calls: Array<{url: string; init: FetchInit | undefined}>

beforeEach(() => {
  calls = []
  const mockFetch = (input: FetchInput, init?: FetchInit) => {
    calls.push({url: String(input), init})
    return Promise.resolve(
      new Response(JSON.stringify({client_id: 'client-1', config: 'cfg', vpn_link: 'vpn://cfg'}), {
        status: 200,
        headers: {'Content-Type': 'application/json'},
      }),
    )
  }
  globalThis.fetch = Object.assign(mockFetch, {preconnect: originalFetch.preconnect})
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('PanelClient.addConnection', () => {
  test('creates via server endpoint and links the user', async () => {
    const panel = new PanelClient({
      baseUrl: 'https://panel.example',
      token: 'token',
      serverId: 7,
      protocols: ['wireguard'],
    })

    const created = await panel.addConnection('user-1', {protocol: 'wireguard', name: 'user:router:wg (home)'})

    expect(created.id).toBe('client-1')
    expect(calls[0]?.url).toBe('https://panel.example/api/servers/7/connections/add')
    expect(calls[0]?.init?.method).toBe('POST')
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      protocol: 'wireguard',
      name: 'user:router:wg (home)',
      user_id: 'user-1',
    })
  })

  test('after create, the list comes from a listing that started after it, never the stale one', async () => {
    const staleList = deferred<Response>()
    const freshList = deferred<Response>()
    const staleListRequested = deferred<void>()
    let listRequests = 0
    const mockFetch = (input: FetchInput, init?: FetchInit) => {
      const url = String(input)
      calls.push({url, init})
      if (url.includes('/api/users')) {
        return Promise.resolve(jsonResponse({users: [panelUser()]}))
      }
      if (url.includes('/connections?protocol=wireguard')) {
        listRequests += 1
        if (listRequests === 1) staleListRequested.resolve()
        return listRequests === 1 ? staleList.promise : freshList.promise
      }
      if (url.endsWith('/connections/add')) {
        return Promise.resolve(jsonResponse({client_id: 'client-1', config: 'cfg', vpn_link: 'vpn://cfg'}))
      }
      return Promise.resolve(jsonResponse({error: 'unexpected'}, 500))
    }
    globalThis.fetch = Object.assign(mockFetch, {preconnect: originalFetch.preconnect})

    const panel = new PanelClient({
      baseUrl: 'https://panel.example',
      token: 'token',
      serverId: 7,
      protocols: ['wireguard'],
    })

    const stalePromise = panel.listConnections('user-1')
    await staleListRequested.promise
    await panel.addConnection('user-1', {protocol: 'wireguard', name: 'user:router:wg (home)'})
    const freshPromise = panel.listConnections('user-1')

    // Listings run one at a time: the fresh one is only requested after the stale one ends.
    expect(listRequests).toBe(1)
    staleList.resolve(jsonResponse({clients: []}))
    expect(await stalePromise).toHaveLength(0)
    freshList.resolve(jsonResponse({clients: [rawClient()]}))
    expect(await freshPromise).toHaveLength(1)
    expect(listRequests).toBe(2)
    expect(await panel.listConnections('user-1')).toHaveLength(1)
  })
})

describe('PanelClient user pagination', () => {
  test('loads every page returned by the panel', async () => {
    const requestedUrls: string[] = []
    const mockFetch = (input: FetchInput, init?: FetchInit) => {
      const url = String(input)
      requestedUrls.push(url)
      calls.push({url, init})
      if (url.endsWith('/api/users?page=1&size=100')) {
        return Promise.resolve(
          jsonResponse({
            users: [panelUser()],
            total: 2,
            page: 1,
            size: 100,
            pages: 2,
          }),
        )
      }
      if (url.endsWith('/api/users?page=2&size=100')) {
        return Promise.resolve(
          jsonResponse({
            users: [{...panelUser(), id: 'user-2', username: 'second-user', telegramId: '283830388'}],
            total: 2,
            page: 2,
            size: 100,
            pages: 2,
          }),
        )
      }
      return Promise.resolve(jsonResponse({error: 'unexpected'}, 500))
    }
    globalThis.fetch = Object.assign(mockFetch, {preconnect: originalFetch.preconnect})

    const panel = new PanelClient({
      baseUrl: 'https://panel.example',
      token: 'token',
      serverId: 7,
      protocols: ['wireguard'],
    })

    const users = await panel.listUsers()

    expect(users).toHaveLength(2)
    expect(users[1]?.username).toBe('second-user')
    expect(requestedUrls).toEqual([
      'https://panel.example/api/users?page=1&size=100',
      'https://panel.example/api/users?page=2&size=100',
    ])
  })
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'Content-Type': 'application/json'},
  })
}

function panelUser() {
  return {
    id: 'user-1',
    username: 'user',
    role: 'user',
    enabled: true,
    traffic_limit: 0,
    traffic_used: 0,
    traffic_total: 0,
    traffic_reset_strategy: 'never',
  }
}

function rawClient(): unknown {
  return {
    clientId: 'client-1',
    userData: {
      clientName: 'user:router:wg (home)',
      enabled: true,
    },
  }
}

function deferred<T>(): {promise: Promise<T>; resolve: (value: T) => void} {
  let resolveFn: ((value: T) => void) | null = null
  const promise = new Promise<T>((resolve) => {
    resolveFn = resolve
  })
  return {
    promise,
    resolve: (value) => {
      if (!resolveFn) throw new Error('Deferred promise was not initialized')
      resolveFn(value)
    },
  }
}
