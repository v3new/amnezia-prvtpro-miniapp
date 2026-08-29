import type {Bot} from 'grammy'
import {GrammyError} from 'grammy'
import {LRUCache} from 'lru-cache'
import {computeNextReset, daysUntil} from '../lib/profile.ts'
import {formatBytes, progressBar} from '../lib/progress-bar.ts'
import {escapeHtml, formatRuDate, pluralDays} from '../lib/ru-date.ts'
import type {PanelClient, PanelUser} from '../panel/client.ts'
import {sendWithRetry} from './send.ts'

/** Percent thresholds that earn a heads-up, low to high. */
export const ALERT_THRESHOLDS = [80, 95, 100] as const
export type AlertThreshold = (typeof ALERT_THRESHOLDS)[number]

export interface TrafficAlertStats {
  processed: number
  sent: number
  skipped: number
  errors: number
}

export interface TrafficAlertDeps {
  panel: PanelClient
  bot: Bot
  adminHandle: string
  ledger?: AlertLedger
}

/**
 * Remembers the highest threshold already announced for a given traffic period,
 * so a daily cron does not repeat itself.
 *
 * Deliberately in-memory: the service is stateless by design, and the worst
 * case after a restart is one duplicate heads-up — far cheaper than adding a
 * database. The period key folds in `last_reset_at` and the limit itself, so a
 * panel reset or an admin raising the limit re-arms every threshold.
 */
export class AlertLedger {
  private readonly seen: LRUCache<string, AlertThreshold>

  constructor(max = 5000, ttlMs = 40 * 24 * 3600 * 1000) {
    this.seen = new LRUCache<string, AlertThreshold>({max, ttl: ttlMs})
  }

  /** Highest threshold already sent for this user's current traffic period. */
  lastSent(user: PanelUser): AlertThreshold | null {
    return this.seen.get(periodKey(user)) ?? null
  }

  record(user: PanelUser, threshold: AlertThreshold): void {
    this.seen.set(periodKey(user), threshold)
  }
}

function periodKey(user: PanelUser): string {
  return `${user.id}:${user.last_reset_at ?? 'never'}:${user.traffic_limit ?? 0}`
}

/** Highest threshold this user has crossed, or null if they are below all of them. */
export function crossedThreshold(percentUsed: number): AlertThreshold | null {
  let hit: AlertThreshold | null = null
  for (const threshold of ALERT_THRESHOLDS) {
    if (percentUsed >= threshold) hit = threshold
  }
  return hit
}

export async function runTrafficAlerts(deps: TrafficAlertDeps): Promise<TrafficAlertStats> {
  const stats: TrafficAlertStats = {processed: 0, sent: 0, skipped: 0, errors: 0}
  const ledger = deps.ledger ?? defaultLedger
  const users = await deps.panel.listUsers()

  for (const user of users) {
    stats.processed++
    const limit = user.traffic_limit ?? 0
    const chatId = Number(user.telegramId)
    if (limit <= 0 || !user.telegramId || !Number.isFinite(chatId)) {
      stats.skipped++
      continue
    }

    const percent = ((user.traffic_used ?? 0) / limit) * 100
    const threshold = crossedThreshold(percent)
    if (threshold === null) {
      stats.skipped++
      continue
    }
    // Only escalate. Re-announcing 80% after 95% has already gone out would
    // read as noise, and the period key handles the reset case.
    const already = ledger.lastSent(user)
    if (already !== null && already >= threshold) {
      stats.skipped++
      continue
    }

    try {
      await sendWithRetry(deps.bot, chatId, renderTrafficAlert(user, threshold, deps.adminHandle))
      ledger.record(user, threshold)
      stats.sent++
    } catch (e) {
      if (e instanceof GrammyError && e.error_code === 403) {
        // Bot blocked by the user — record anyway so we stop retrying daily.
        ledger.record(user, threshold)
        stats.skipped++
      } else {
        stats.errors++
        console.error(`[traffic-alerts] user=${user.id}`, e)
      }
    }
  }
  return stats
}

export function renderTrafficAlert(user: PanelUser, threshold: AlertThreshold, adminHandle: string): string {
  const limit = user.traffic_limit ?? 0
  const used = user.traffic_used ?? 0
  const remaining = Math.max(0, limit - used)
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const strategy = user.traffic_reset_strategy ?? 'never'
  const nextReset = computeNextReset(user.last_reset_at, strategy)

  const lines: string[] = []
  const name = user.username || 'друг'

  if (threshold === 100) {
    lines.push(`${escapeHtml(name)}, трафик закончился 🚦`)
    lines.push('')
    lines.push(`Израсходовано ${formatBytes(used)} из ${formatBytes(limit)} — VPN сейчас не пропускает трафик.`)
  } else {
    lines.push(`${escapeHtml(name)}, трафик на исходе ⚠️`)
    lines.push('')
    lines.push(`Израсходовано ${formatBytes(used)} из ${formatBytes(limit)}, осталось ${formatBytes(remaining)}.`)
  }

  lines.push(`${progressBar(percent)} ${percent}%`)
  lines.push('')

  if (nextReset) {
    const days = daysUntil(nextReset)
    const when =
      days !== null && days >= 0
        ? `${formatRuDate(nextReset)} (через ${days} ${pluralDays(days)})`
        : formatRuDate(nextReset)
    lines.push(threshold === 100 ? `🔄 Лимит обнулится ${when} — доступ вернётся сам.` : `🔄 Лимит обнулится ${when}.`)
  } else {
    lines.push('🔄 Автоматического обнуления нет — лимит поднимаю руками.')
  }

  lines.push('')
  lines.push(
    threshold === 100
      ? `Ждать не хочешь — напиши мне: @${escapeHtml(adminHandle)}, подниму лимит.`
      : `Нужно больше — напиши мне: @${escapeHtml(adminHandle)}.`,
  )
  return lines.join('\n')
}

const defaultLedger = new AlertLedger()
