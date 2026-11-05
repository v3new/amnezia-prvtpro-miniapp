import {z} from 'zod'

function splitList(v: string): string[] {
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

const SERVER_NAME = /^[a-z0-9-]+$/

const PROTOCOLS = ['awg3', 'awg2', 'awg', 'awg_legacy', 'wireguard', 'xray'] as const

const ExtraServerSchema = z.object({
  name: z.string().regex(SERVER_NAME),
  serverId: z
    .string()
    .regex(/^\d+$/)
    .transform((s) => Number(s)),
  protocols: z
    .array(z.enum(PROTOCOLS))
    .min(1)
    .transform((list) => [...new Set(list)]),
})

export type ExtraServer = z.infer<typeof ExtraServerSchema>

export function parseExtraServers(v: string, ctx: z.RefinementCtx): ExtraServer[] {
  const servers: ExtraServer[] = []
  for (const entry of splitList(v)) {
    const parts = entry.split(':')
    const [name = '', serverId = '', protocols = ''] = parts
    const parsed =
      parts.length === 3
        ? ExtraServerSchema.safeParse({name, serverId, protocols: protocols.split('+').filter(Boolean)})
        : null
    if (!parsed?.success) {
      ctx.addIssue({code: z.ZodIssueCode.custom, message: `expected name:serverId:proto+proto, got "${entry}"`})
      return z.NEVER
    }
    servers.push(parsed.data)
  }
  return servers
}

/**
 * Every server's series must stay distinct: unique ids and names, none equal to
 * the main server, and the main server named so its totals never mix with extras.
 */
export function checkExtraServers(
  env: {PANEL_SERVER_ID: number; METRICS_SERVER_NAME?: string; METRICS_EXTRA_SERVERS: ExtraServer[]},
  ctx: z.RefinementCtx,
): void {
  const extras = env.METRICS_EXTRA_SERVERS
  if (extras.length === 0) return
  const issue = (message: string) =>
    ctx.addIssue({code: z.ZodIssueCode.custom, path: ['METRICS_EXTRA_SERVERS'], message})
  if (!env.METRICS_SERVER_NAME) issue('METRICS_SERVER_NAME is required when METRICS_EXTRA_SERVERS is set')
  const ids = [env.PANEL_SERVER_ID, ...extras.map((s) => s.serverId)]
  if (new Set(ids).size !== ids.length) issue('server ids must be unique and differ from PANEL_SERVER_ID')
  const names = [env.METRICS_SERVER_NAME, ...extras.map((s) => s.name)]
  if (new Set(names).size !== names.length) issue('server names must be unique and differ from METRICS_SERVER_NAME')
}

const EnvSchema = z
  .object({
    TG_BOT_TOKEN: z.string().min(1),
    TG_BOT_USERNAME: z.string().min(1),
    TG_BOT_MODE: z.enum(['polling', 'webhook']),
    TG_WEBHOOK_SECRET: z
      .string()
      .min(16)
      .optional()
      .or(z.literal('').transform(() => undefined)),
    TG_ADMIN_ID: z.coerce.number().int(),
    TG_ADMIN_HANDLE: z.string().min(1),

    PORT: z.coerce.number().int().default(8000),
    MINI_APP_URL: z.string().url(),
    JWT_SECRET: z.string().min(32),
    SESSION_TTL_HOURS: z.coerce.number().int().positive().default(24),

    CRON_SECRET: z.string().min(16),
    // Bearer token for GET /internal/metrics (VictoriaMetrics scrape). Unset disables the endpoint.
    METRICS_TOKEN: z
      .string()
      .min(32)
      .optional()
      .or(z.literal('').transform(() => undefined)),

    // `server` label on the metrics of PANEL_SERVER_ID; unset keeps them unlabelled.
    METRICS_SERVER_NAME: z
      .string()
      .regex(SERVER_NAME)
      .optional()
      .or(z.literal('').transform(() => undefined)),
    // Other panel servers watched for metrics only, never shown to users:
    // `name:serverId:proto+proto`, comma-separated, e.g. `yandex:1:awg2+awg3+xray+wireguard`.
    METRICS_EXTRA_SERVERS: z.string().default('').transform(parseExtraServers),

    PANEL_BASE_URL: z.string().url(),
    PANEL_API_TOKEN: z.string().min(1),
    PANEL_SERVER_ID: z.coerce.number().int().default(0),

    // Хост VPN-сервера (домен или IP, опц. с портом), который клиент пингает напрямую,
    // чтобы показать честный RTT телефон→VPN-хост. Без схемы — клиент сам соберёт HTTPS.
    // Пусто — клиентский пинг не показывается, остаётся только статус из панели.
    VPN_SERVER_HOST: z
      .string()
      .regex(/^[a-zA-Z0-9.-]+(:\d+)?$/, 'expected host or host:port')
      .optional()
      .or(z.literal('').transform(() => undefined)),

    DEFAULT_PROTOCOL: z.enum(['awg3', 'awg2', 'awg', 'awg_legacy', 'wireguard', 'xray']).default('awg3'),
    ENABLED_PROTOCOLS: z.string().default('awg3,xray,wireguard').transform(splitList),
    LEGACY_PROTOCOLS: z.string().default('awg2,awg,awg_legacy').transform(splitList),
    MAX_CONNECTIONS_PER_USER: z.coerce.number().int().positive().default(6),

    DONATE_URL: z.string().url(),

    TZ: z.string().default('Europe/Moscow'),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  })
  .superRefine((env, ctx) => {
    if (env.TG_BOT_MODE === 'webhook' && !env.TG_WEBHOOK_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['TG_WEBHOOK_SECRET'],
        message: 'required when TG_BOT_MODE=webhook',
      })
    }
    const overlap = env.ENABLED_PROTOCOLS.filter((p) => env.LEGACY_PROTOCOLS.includes(p))
    if (overlap.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['LEGACY_PROTOCOLS'],
        message: `overlaps ENABLED_PROTOCOLS: ${overlap.join(', ')}`,
      })
    }
    checkExtraServers(env, ctx)
    if (!env.ENABLED_PROTOCOLS.includes(env.DEFAULT_PROTOCOL)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DEFAULT_PROTOCOL'],
        message: `not listed in ENABLED_PROTOCOLS (${env.ENABLED_PROTOCOLS.join(', ')})`,
      })
    }
  })

export type Env = z.infer<typeof EnvSchema>

let cached: Env | null = null

export function loadEnv(): Env {
  if (cached) return cached
  const parsed = EnvSchema.safeParse(process.env)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Invalid environment configuration:\n${issues}`)
  }
  cached = parsed.data
  return cached
}
