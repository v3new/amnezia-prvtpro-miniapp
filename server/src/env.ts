import {z} from 'zod'

const EnvSchema = z.object({
  TG_BOT_TOKEN: z.string().min(1),
  TG_BOT_USERNAME: z.string().min(1),
  TG_ADMIN_ID: z.coerce.number().int(),
  TG_ADMIN_HANDLE: z.string().min(1),

  PORT: z.coerce.number().int().default(8000),
  MINI_APP_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(24),

  CRON_SECRET: z.string().min(16),

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

  DEFAULT_PROTOCOL: z.enum(['awg2', 'awg', 'awg_legacy', 'wireguard', 'xray']).default('awg2'),
  ENABLED_PROTOCOLS: z
    .string()
    .default('awg2,xray,wireguard')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  MAX_CONNECTIONS_PER_USER: z.coerce.number().int().positive().default(6),

  DONATE_URL: z.string().url(),

  TZ: z.string().default('Europe/Moscow'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
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
