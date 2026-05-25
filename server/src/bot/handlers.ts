import type {Bot} from 'grammy'
import {InlineKeyboard} from 'grammy'
import type {Env} from '../env.ts'
import type {PanelClient} from '../panel/client.ts'
import {renderDigest} from './digest.ts'

export function registerBotHandlers(bot: Bot, env: Env, panel: PanelClient): void {
  bot.command('start', async (ctx) => {
    const tgId = ctx.from?.id
    const keyboard = new InlineKeyboard().webApp('Запустить', env.MINI_APP_URL)
    if (!tgId) {
      await ctx.reply('Привет! Открой кабинет:', {reply_markup: keyboard})
      return
    }
    const me = await safeFindUser(panel, tgId)
    if (!me) {
      const adminKb = new InlineKeyboard().url('Написать админу', `https://t.me/${env.TG_ADMIN_HANDLE}`)
      await ctx.reply(
        `Привет, ${ctx.from?.first_name ?? 'друг'}! Доступ не настроен. Напиши администратору — он добавит тебя в панель.`,
        {reply_markup: adminKb},
      )
      return
    }
    await ctx.reply(`Привет, ${ctx.from?.first_name ?? me.username}! Открой кабинет, чтобы управлять подключениями.`, {
      reply_markup: keyboard,
    })
  })

  bot.command('cabinet', async (ctx) => {
    const keyboard = new InlineKeyboard().webApp('Запустить', env.MINI_APP_URL)
    await ctx.reply('Кабинет:', {reply_markup: keyboard})
  })

  bot.command('stats', async (ctx) => {
    const tgId = ctx.from?.id
    if (!tgId) return
    const me = await safeFindUser(panel, tgId)
    if (!me) {
      await ctx.reply(`Доступ не настроен. Напиши администратору @${env.TG_ADMIN_HANDLE}.`)
      return
    }
    const conns = await panel.listConnections(me.id)
    await ctx.reply(renderDigest(me, conns, env.TG_ADMIN_HANDLE), {parse_mode: 'HTML'})
  })

  bot.command('help', async (ctx) => {
    await ctx.reply(
      [
        '/start — приветствие и кнопка кабинета',
        '/cabinet — запустить',
        '/stats — текущий статус трафика и соединения',
        '/help — это сообщение',
        '',
        `Админ: @${env.TG_ADMIN_HANDLE}`,
      ].join('\n'),
    )
  })

  bot.catch((err) => {
    console.error('[bot] error', err)
  })
}

async function safeFindUser(panel: PanelClient, tgId: number) {
  try {
    return await panel.findUserByTelegramId(tgId)
  } catch (e) {
    console.error('[bot] panel findUserByTelegramId', e)
    return null
  }
}
