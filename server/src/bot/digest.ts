import type {Bot} from 'grammy'
import {GrammyError} from 'grammy'
import {compareByFormFactorThenName} from '../lib/device-order.ts'
import {getDevice} from '../lib/devices.ts'
import {parseDescription, parseDeviceFromName} from '../lib/naming.ts'
import {computeNextReset, daysUntil} from '../lib/profile.ts'
import {formatBytes, progressBar} from '../lib/progress-bar.ts'
import type {PanelClient, PanelUser} from '../panel/client.ts'

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
    if (!user.enabled || !user.telegramId) {
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
  lines.push('Глянем, как у тебя дела:')
  lines.push('')

  const limit = user.traffic_limit ?? 0
  const used = user.traffic_used ?? 0
  if (limit > 0) {
    const percent = Math.min(100, Math.round((used / limit) * 100))
    lines.push(`📊 Накапало: ${formatBytes(used)} из ${formatBytes(limit)}`)
    lines.push(`${progressBar(percent)} ${percent}%`)
  } else {
    lines.push(`📊 Накапало: ${formatBytes(used)} (без лимита)`)
  }

  const strategy = user.traffic_reset_strategy ?? 'never'
  if (strategy !== 'never') {
    const next = computeNextReset(user.last_reset_at, strategy)
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
    lines.push('Подключений пока нет. Открой кабинет и сделай первое — это минута')
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

async function sendWithRetry(bot: Bot, chatId: number, text: string, attempt = 1): Promise<void> {
  try {
    await bot.api.sendMessage(chatId, text, {parse_mode: 'HTML'})
  } catch (e) {
    if (e instanceof GrammyError && e.error_code === 429 && attempt <= 3) {
      const retry = (e.parameters?.retry_after ?? 1) * 1000 * 2 ** (attempt - 1)
      await new Promise((r) => setTimeout(r, retry))
      return sendWithRetry(bot, chatId, text, attempt + 1)
    }
    throw e
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const MONTHS_RU = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
]

function formatRuDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getUTCDate()} ${MONTHS_RU[d.getUTCMonth()]}`
}

function pluralDays(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'день'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'дня'
  return 'дней'
}
