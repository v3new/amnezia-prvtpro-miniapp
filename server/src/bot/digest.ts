import type {Bot} from 'grammy'
import {GrammyError} from 'grammy'
import {compareByFormFactorThenName} from '../lib/device-order.ts'
import {getDevice} from '../lib/devices.ts'
import {parseDescription, parseDeviceFromName} from '../lib/naming.ts'
import {type AccessReason, computeAccess, computeNextReset, daysUntil} from '../lib/profile.ts'
import {formatBytes, progressBar} from '../lib/progress-bar.ts'
import {escapeHtml, formatRuDate, pluralDays} from '../lib/ru-date.ts'
import type {PanelClient, PanelUser} from '../panel/client.ts'
import {sendWithRetry} from './send.ts'

export interface DigestStats {
  processed: number
  sent: number
  skipped: number
  errors: number
}

export interface DigestDeps {
  panel: PanelClient
  bot: Bot
  adminHandle: string
}

export async function runWeeklyDigest(deps: DigestDeps): Promise<DigestStats> {
  const stats: DigestStats = {processed: 0, sent: 0, skipped: 0, errors: 0}
  const users = await deps.panel.listUsers()
  for (const user of users) {
    stats.processed++
    // Blocked users are NOT skipped: someone whose traffic just ran out is the
    // person most in need of an explanation, not the least.
    if (!user.telegramId) {
      stats.skipped++
      continue
    }
    const chatId = Number(user.telegramId)
    if (!Number.isFinite(chatId)) {
      stats.skipped++
      continue
    }
    try {
      const conns = await deps.panel.listConnections(user.id)
      const text = renderDigest(user, conns, deps.adminHandle)
      await sendWithRetry(deps.bot, chatId, text)
      stats.sent++
    } catch (e) {
      if (e instanceof GrammyError && e.error_code === 403) {
        stats.skipped++
      } else {
        stats.errors++
        console.error(`[digest] user=${user.id}`, e)
      }
    }
  }
  return stats
}

export function renderDigest(
  user: PanelUser,
  conns: {name: string; last_bytes: number}[],
  adminHandle: string,
): string {
  const lines: string[] = []
  const firstName = user.username || 'друг'
  lines.push(`Привет, ${escapeHtml(firstName)} 🖤`)
  lines.push('')

  const strategyForAccess = user.traffic_reset_strategy ?? 'never'
  const access = computeAccess(user, computeNextReset(user.last_reset_at, strategyForAccess))
  const blocked = access.status === 'blocked'
  if (blocked) {
    lines.push(renderBlockNotice(access.reason, access.self_heals_at))
    lines.push('')
  } else {
    lines.push('Глянем, как у тебя дела:')
    lines.push('')
  }

  const limit = user.traffic_limit ?? 0
  const used = user.traffic_used ?? 0
  if (limit > 0) {
    const percent = Math.min(100, Math.round((used / limit) * 100))
    lines.push(`📊 Накапало: ${formatBytes(used)} из ${formatBytes(limit)}`)
    lines.push(`${progressBar(percent)} ${percent}%`)
  } else {
    lines.push(`📊 Накапало: ${formatBytes(used)} (без лимита)`)
  }

  if (strategyForAccess !== 'never' && !access.self_heals_at) {
    const next = computeNextReset(user.last_reset_at, strategyForAccess)
    if (next) {
      const days = daysUntil(next)
      const dateStr = formatRuDate(next)
      lines.push(
        days !== null && days >= 0
          ? `🔄 Обнулится: ${dateStr} (через ${days} ${pluralDays(days)})`
          : `🔄 Обнулится: ${dateStr}`,
      )
    }
  }

  lines.push('')
  if (conns.length === 0) {
    lines.push(
      blocked
        ? 'Подключений пока нет — создать новое получится, когда доступ вернётся'
        : 'Подключений пока нет. Открой кабинет и сделай первое — это минута',
    )
  } else {
    lines.push('🔌 Твои подключения:')
    const sorted = conns
      .map((conn) => {
        const device = parseDeviceFromName(conn.name) ?? 'other'
        const description = parseDescription(conn.name) ?? conn.name
        return {conn, device, description}
      })
      .sort(compareByFormFactorThenName)
    for (const {conn, device, description} of sorted) {
      const dev = getDevice(device)
      lines.push(`${dev.icon} ${escapeHtml(description)} — ${formatBytes(conn.last_bytes)}`)
    }
  }

  lines.push('')
  lines.push(`Если что — я рядом: @${escapeHtml(adminHandle)}`)
  return lines.join('\n')
}

/** Human-readable "here is why your VPN stopped" line for a blocked user. */
export function renderBlockNotice(reason: AccessReason | null, selfHealsAt: string | null): string {
  switch (reason) {
    case 'traffic_limit': {
      const lines = ['🚦 Трафик закончился — VPN сейчас не работает.']
      if (selfHealsAt) {
        const days = daysUntil(selfHealsAt)
        lines.push(
          days !== null && days >= 0
            ? `Лимит обнулится ${formatRuDate(selfHealsAt)} (через ${days} ${pluralDays(days)}), и доступ вернётся сам.`
            : `Лимит обнулится ${formatRuDate(selfHealsAt)}, и доступ вернётся сам.`,
        )
      }
      lines.push('Нужно раньше — напиши, подниму лимит.')
      return lines.join('\n')
    }
    case 'expired':
      return '⌛️ Срок доступа закончился — VPN сейчас не работает.\nНапиши мне, продлим.'
    default:
      return '🔌 Доступ сейчас отключён.\nНапиши мне, разберёмся.'
  }
}
