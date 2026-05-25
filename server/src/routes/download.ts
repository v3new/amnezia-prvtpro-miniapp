import {zipSync} from 'fflate'
import {Hono} from 'hono'
import {err} from '../action-result.ts'
import type {Env} from '../env.ts'
import {contentDispositionAttachment, type DownloadClaims, verifyDownloadToken} from '../lib/download-token.ts'
import type {PanelClient} from '../panel/client.ts'

// Public download endpoints — no auth-middleware, no /api CORS.
// Authorization is the signed token in the URL itself (10 min TTL).
// Called by:
//   • Telegram client via tg.downloadFile (native popup, sends a real GET).
//   • External browser via tg.openLink (fallback for old Telegram clients) — uses the .zip variant.
export function createDownloadRouter(env: Env, panel: PanelClient) {
  const app = new Hono()

  app.get('/:tokenWithExt', async (c) => {
    const raw = c.req.param('tokenWithExt')
    const isZip = raw.endsWith('.zip')
    const token = isZip ? raw.slice(0, -'.zip'.length) : raw

    let claims: DownloadClaims
    try {
      claims = await verifyDownloadToken(token, env.JWT_SECRET)
    } catch {
      return c.json(err('bad_token', 'Ссылка устарела или повреждена'), 401)
    }

    // Ownership was validated at issue time and the signature covers it.
    // We trust the signed claims inside the 10-min TTL and skip a second
    // listConnections round-trip. The config is cached in PanelClient.
    const cfg = await panel.getConnectionConfig(claims.proto, claims.cid)
    const body =
      claims.fmt === 'conf'
        ? cfg.config
        : // AmneziaVPN-native `.vpn` file: the desktop client treats the file
          // contents as the same `vpn://...` URL that you'd paste manually.
          cfg.vpn_link

    if (!body) return c.json(err('config_unavailable', 'Конфиг недоступен'), 502)

    const nativeName = `${claims.name}.${claims.fmt}`
    const nativeMime = claims.fmt === 'conf' ? 'application/x-wireguard-config' : 'application/octet-stream'

    if (!isZip) {
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': `${nativeMime}; charset=utf-8`,
          'Content-Disposition': contentDispositionAttachment(nativeName),
          'Cache-Control': 'no-store',
        },
      })
    }

    const zipName = `${claims.name}.zip`
    const zipped = zipSync({[nativeName]: new TextEncoder().encode(body)}, {level: 6})
    return new Response(new Uint8Array(zipped), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': contentDispositionAttachment(zipName),
        'Cache-Control': 'no-store',
      },
    })
  })

  return app
}
