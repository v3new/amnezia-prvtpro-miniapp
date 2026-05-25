import {z} from 'zod'

export const ProfileSchema = z.object({
  username: z.string(),
  first_name: z.string(),
  language_code: z.string(),
  tg_id: z.number(),
  enabled: z.boolean(),
  expiration_date: z.string().nullable(),
  expires_in_days: z.number().nullable(),
  traffic: z.object({
    used_bytes: z.number(),
    limit_bytes: z.number(),
    total_bytes: z.number(),
    reset_strategy: z.enum(['daily', 'weekly', 'monthly', 'never']),
    next_reset_at: z.string().nullable(),
    percent_used: z.number(),
  }),
})
export type Profile = z.infer<typeof ProfileSchema>

export const AuthResponseSchema = z.object({
  token: z.string(),
  expires_in: z.number(),
  profile: ProfileSchema,
})
export type AuthResponse = z.infer<typeof AuthResponseSchema>

export const ProfileResponseSchema = z.object({
  profile: ProfileSchema,
  cached_at: z.string(),
  is_stale: z.boolean(),
  refresh_in_progress: z.boolean(),
})
export type ProfileResponse = z.infer<typeof ProfileResponseSchema>

export const ConnectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  device: z.string(),
  protocol: z.string(),
  protocol_label: z.string(),
  created_at: z.string().nullable().optional(),
  last_bytes: z.number(),
  bytes_received: z.number().default(0),
  bytes_sent: z.number().default(0),
  enabled: z.boolean(),
  last_handshake_at: z.string().nullable(),
  online: z.boolean(),
})
export type Connection = z.infer<typeof ConnectionSchema>

export const ConnectionsListSchema = z.object({
  connections: z.array(ConnectionSchema),
  limit: z.number(),
  used_slots: z.number(),
  cached_at: z.string().optional(),
  is_stale: z.boolean().optional(),
  refresh_in_progress: z.boolean().optional(),
})
export type ConnectionsList = z.infer<typeof ConnectionsListSchema>

export const ConnectionConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  config: z.string(),
  vpn_link: z.string(),
  qr_payload: z.string(),
})
export type ConnectionConfig = z.infer<typeof ConnectionConfigSchema>

export const DownloadUrlsSchema = z.object({
  native_url: z.string().url(),
  zip_url: z.string().url(),
  filename: z.string(),
  expires_at: z.string(),
})
export type DownloadUrls = z.infer<typeof DownloadUrlsSchema>

export const ServerStatusSchema = z.object({
  online: z.boolean(),
  ping_ms: z.number().nullable(),
  uptime_seconds: z.number().nullable(),
  protocols_available: z.array(z.string()),
})
export type ServerStatus = z.infer<typeof ServerStatusSchema>

export const OptionsSchema = z.object({
  devices: z.array(
    z.object({
      slug: z.string(),
      label: z.string(),
      icon: z.string(),
      name_examples: z.array(z.string()).default([]),
    }),
  ),
  protocols: z.array(z.object({slug: z.string(), label: z.string(), recommended_for: z.array(z.string())})),
  admin_contact_url: z.string(),
  donate_url: z.string(),
  vpn_server_host: z.string().nullable().default(null),
  description_constraints: z.object({
    min_length: z.number(),
    max_length: z.number(),
    pattern: z.string(),
  }),
})
export type Options = z.infer<typeof OptionsSchema>

export const ActionResultSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.discriminatedUnion('ok', [
    z.object({ok: z.literal(true), data}),
    z.object({ok: z.literal(false), error: z.object({code: z.string(), message: z.string()})}),
  ])
