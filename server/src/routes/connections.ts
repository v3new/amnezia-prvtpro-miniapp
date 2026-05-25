import {Hono} from 'hono'
import {z} from 'zod'
import {ApiError, err, ok} from '../action-result.ts'
import type {Env} from '../env.ts'
import {DEVICE_SLUGS} from '../lib/devices.ts'
import {
  DOWNLOAD_TOKEN_TTL_SEC,
  type DownloadFormat,
  sanitizeFilenameBase,
  signDownloadToken,
} from '../lib/download-token.ts'
import {
  buildConnectionName,
  normalizeDescription,
  PROTO_LABEL,
  parseDescription,
  parseDeviceFromName,
  validateDescription,
} from '../lib/naming.ts'
import type {PanelClient} from '../panel/client.ts'
import {type AppVariables, activePanelUserMiddleware, authMiddleware, getSession} from './middleware.ts'

const CreateBodySchema = z.object({
  device: z.enum(DEVICE_SLUGS),
  protocol: z.string().min(1),
  description: z.string(),
})

const ToggleBodySchema = z.object({enable: z.boolean()})

const DownloadUrlBodySchema = z.object({
  format: z.enum(['conf', 'vpn']),
})

// VLESS-style protocols have no native single-file container — clients import
// via URI/clipboard. Download is hidden in UI; the server still rejects to be
// explicit if someone calls the endpoint directly.
const PROTOCOLS_WITHOUT_FILE = new Set(['xray'])
const PROTOCOLS_WG_FAMILY = new Set(['awg2', 'awg', 'awg_legacy', 'wireguard'])

const ONLINE_WINDOW_MS = 5 * 60_000

export function createConnectionsRouter(env: Env, panel: PanelClient) {
  const app = new Hono<{Variables: AppVariables}>()
  app.use('*', authMiddleware(env))
  app.use('*', activePanelUserMiddleware(panel))

  app.get('/connections', async (c) => {
    const session = getSession(c)
    const cached = await panel.getConnections(session.panel_user_id)
    const conns = cached.value

    const list = conns.map((conn) => {
      const description = parseDescription(conn.name) ?? ''
      const device = parseDeviceFromName(conn.name) ?? 'other'
      const lastHs = conn.last_handshake_at
      const online = lastHs ? Date.now() - new Date(lastHs).getTime() < ONLINE_WINDOW_MS : false
      return {
        id: conn.id,
        name: conn.name,
        description,
        device,
        protocol: conn.protocol,
        protocol_label: PROTO_LABEL[conn.protocol] ?? conn.protocol,
        created_at: conn.created_at,
        last_bytes: conn.last_bytes,
        bytes_received: conn.bytes_received,
        bytes_sent: conn.bytes_sent,
        enabled: conn.enabled,
        last_handshake_at: lastHs,
        online,
      }
    })

    return c.json(
      ok({
        connections: list,
        limit: env.MAX_CONNECTIONS_PER_USER,
        used_slots: list.length,
        cached_at: cached.cached_at,
        is_stale: cached.is_stale,
        refresh_in_progress: cached.refresh_in_progress,
      }),
    )
  })

  app.post('/connections', async (c) => {
    const session = getSession(c)
    const body = await c.req.json().catch(() => null)
    const parsed = CreateBodySchema.safeParse(body)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      if (issue?.path[0] === 'device') return c.json(err('device_invalid', 'Неверное устройство'), 400)
      return c.json(err('bad_request', issue?.message ?? 'Bad request'), 400)
    }
    if (!env.ENABLED_PROTOCOLS.includes(parsed.data.protocol)) {
      return c.json(err('protocol_invalid', 'Этот протокол не включён'), 400)
    }
    const descCheck = validateDescription(parsed.data.description)
    if (!descCheck.ok) {
      return c.json(err(descCheck.code, descCheck.message), 400)
    }

    const existing = await panel.listConnections(session.panel_user_id)
    if (existing.length >= env.MAX_CONNECTIONS_PER_USER) {
      return c.json(
        err(
          'max_connections_reached',
          `Достигнут лимит соединений (${env.MAX_CONNECTIONS_PER_USER}). Удали неиспользуемые.`,
        ),
        409,
      )
    }
    const normalized = normalizeDescription(descCheck.value)
    const collision = existing.some((cn) => {
      const d = parseDescription(cn.name)
      return d ? normalizeDescription(d) === normalized : false
    })
    if (collision) {
      return c.json(err('description_already_used', 'У тебя уже есть соединение с таким описанием. Уточни.'), 409)
    }

    const name = buildConnectionName(session.username, parsed.data.device, parsed.data.protocol, descCheck.value)

    const created = await panel.addConnection(session.panel_user_id, {
      protocol: parsed.data.protocol,
      name,
    })

    return c.json(
      ok({
        id: created.id,
        name: created.name,
        description: descCheck.value,
        config: created.config,
        vpn_link: created.vpn_link,
        qr_payload: created.config,
      }),
    )
  })

  app.delete('/connections/:id', async (c) => {
    const session = getSession(c)
    const id = c.req.param('id')
    const conn = await panel.findOwnedConnection(session.panel_user_id, id)
    if (!conn) return c.json(err('not_found', 'Соединение не найдено'), 404)
    await panel.removeConnection(conn.protocol, conn.client_id)
    return c.json(ok({deleted: true}))
  })

  app.post('/connections/:id/toggle', async (c) => {
    const session = getSession(c)
    const id = c.req.param('id')
    const body = await c.req.json().catch(() => null)
    const parsed = ToggleBodySchema.safeParse(body)
    if (!parsed.success) return c.json(err('bad_request', 'enable обязателен'), 400)
    const conn = await panel.findOwnedConnection(session.panel_user_id, id)
    if (!conn) return c.json(err('not_found', 'Соединение не найдено'), 404)
    const result = await panel.toggleConnection(conn.protocol, conn.client_id, parsed.data.enable)
    return c.json(ok({enabled: result.enabled}))
  })

  app.get('/connections/:id/config', async (c) => {
    const session = getSession(c)
    const id = c.req.param('id')
    const conn = await panel.findOwnedConnection(session.panel_user_id, id)
    if (!conn) return c.json(err('not_found', 'Соединение не найдено'), 404)
    const cfg = await panel.getConnectionConfig(conn.protocol, conn.client_id)
    return c.json(
      ok({
        id: conn.id,
        name: conn.name,
        description: parseDescription(conn.name) ?? '',
        config: cfg.config,
        vpn_link: cfg.vpn_link,
        qr_payload: cfg.config,
      }),
    )
  })

  app.post('/connections/:id/download-url', async (c) => {
    const session = getSession(c)
    const id = c.req.param('id')
    const body = await c.req.json().catch(() => null)
    const parsed = DownloadUrlBodySchema.safeParse(body)
    if (!parsed.success) return c.json(err('bad_request', 'format обязателен (conf|vpn)'), 400)
    const format: DownloadFormat = parsed.data.format

    const conn = await panel.findOwnedConnection(session.panel_user_id, id)
    if (!conn) return c.json(err('not_found', 'Соединение не найдено'), 404)

    if (PROTOCOLS_WITHOUT_FILE.has(conn.protocol)) {
      return c.json(err('download_unsupported', 'Этот протокол не поддерживает скачивание файла'), 400)
    }
    if (format === 'conf' && !PROTOCOLS_WG_FAMILY.has(conn.protocol)) {
      return c.json(err('format_incompatible', 'Формат .conf доступен только для WireGuard-семейства'), 400)
    }

    // Filename is built from the full panel-side name (e.g. "v3new:mac:wg2 (личный)")
    // so the saved file carries the full context — user + device + protocol +
    // description — and not just the short description.
    const baseName = sanitizeFilenameBase(conn.name || 'amnezia')
    const filename = `${baseName}.${format}`

    const token = await signDownloadToken(
      {cid: conn.id, uid: session.panel_user_id, proto: conn.protocol, fmt: format, name: baseName},
      env.JWT_SECRET,
    )

    const base = env.MINI_APP_URL.replace(/\/+$/, '')
    const expiresAt = new Date(Date.now() + DOWNLOAD_TOKEN_TTL_SEC * 1000).toISOString()
    return c.json(
      ok({
        native_url: `${base}/dl/${token}`,
        zip_url: `${base}/dl/${token}.zip`,
        filename,
        expires_at: expiresAt,
      }),
    )
  })

  app.onError((e, c) => {
    if (e instanceof ApiError) {
      return c.json(err(e.code, e.message), e.status as 400 | 401 | 403 | 404 | 409 | 500 | 502 | 504)
    }
    console.error('[connections] unhandled', e)
    return c.json(err('internal_error', 'Внутренняя ошибка'), 500)
  })

  return app
}
