import {z} from 'zod'

function splitList(v: string): string[] {
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
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
