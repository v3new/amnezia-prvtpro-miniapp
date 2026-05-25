import {z} from 'zod'
import {
  type AuthResponse,
  AuthResponseSchema,
  type Connection,
  type ConnectionConfig,
  ConnectionConfigSchema,
  type ConnectionsList,
  ConnectionsListSchema,
  type DownloadUrls,
  DownloadUrlsSchema,
  type Options,
  OptionsSchema,
  type ProfileResponse,
  ProfileResponseSchema,
  type ServerStatus,
  ServerStatusSchema,
} from './types.ts'

const TOKEN_KEY = 'amnezia.session.v1'

export class ApiError extends Error {
  readonly code: string
  readonly status: number
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}
function setToken(t: string | null): void {
  if (t) localStorage.setItem(TOKEN_KEY, t)
  else localStorage.removeItem(TOKEN_KEY)
}

async function request<T extends z.ZodTypeAny>(
  method: string,
  path: string,
  schema: T,
  body?: unknown,
): Promise<z.infer<T>> {
  const headers: Record<string, string> = {'Content-Type': 'application/json'}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  let res: Response
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    })
  } catch (e) {
    throw new ApiError(0, 'network', (e as Error).message || 'Network error')
  }
  const text = await res.text()
  let json: {ok: true; data: unknown} | {ok: false; error: {code: string; message: string}} | null = null
  if (text) {
    try {
      json = JSON.parse(text)
    } catch {
      throw new ApiError(res.status, 'bad_response', 'Неверный ответ сервера')
    }
  }
  if (!json || typeof json !== 'object' || !('ok' in json)) {
    throw new ApiError(res.status, 'bad_response', 'Неверный ответ сервера')
  }
  if (!json.ok) {
    if (res.status === 401) setToken(null)
    throw new ApiError(res.status, json.error.code, json.error.message)
  }
  return schema.parse(json.data)
}

export async function authenticate(initData: string): Promise<AuthResponse> {
  const data = await request('POST', '/auth', AuthResponseSchema, {init_data: initData})
  setToken(data.token)
  return data
}

export function listConnections(): Promise<ConnectionsList> {
  return request('GET', '/connections', ConnectionsListSchema)
}

export function getProfile(): Promise<ProfileResponse> {
  return request('GET', '/profile', ProfileResponseSchema)
}

export function createConnection(input: {
  device: string
  protocol: string
  description: string
}): Promise<ConnectionConfig> {
  return request('POST', '/connections', ConnectionConfigSchema, input)
}

export function deleteConnection(id: string): Promise<{deleted: boolean}> {
  return request('DELETE', `/connections/${encodeURIComponent(id)}`, z.object({deleted: z.boolean()}))
}

export function getConnectionConfig(id: string): Promise<ConnectionConfig> {
  return request('GET', `/connections/${encodeURIComponent(id)}/config`, ConnectionConfigSchema)
}

export function getDownloadUrls(id: string, format: 'conf' | 'vpn'): Promise<DownloadUrls> {
  return request('POST', `/connections/${encodeURIComponent(id)}/download-url`, DownloadUrlsSchema, {format})
}

export function getServerStatus(): Promise<ServerStatus> {
  return request('GET', '/server/status', ServerStatusSchema)
}

export function getOptions(): Promise<Options> {
  return request('GET', '/options', OptionsSchema)
}

export type {Connection}
export {getToken, setToken}
