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

  test('does not let stale in-flight lists repopulate cache after create', async () => {
    const staleList = deferred<Response>()
    const freshList = deferred<Response>()
    const staleListRequested = deferred<void>()
    let listRequests = 0
    const mockFetch = (input: FetchInput, init?: FetchInit) => {
      const url = String(input)
      calls.push({url, init})
      if (url.endsWith('/api/users')) {
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
    freshList.resolve(jsonResponse({clients: [rawClient()]}))
    expect(await freshPromise).toHaveLength(1)

    staleList.resolve(jsonResponse({clients: []}))
    await stalePromise
    expect(await panel.listConnections('user-1')).toHaveLength(1)
  })
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'Content-Type': 'application/json'},
  })
}

function panelUser(): unknown {
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
