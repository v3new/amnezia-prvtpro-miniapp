import type {Bot, Context} from 'grammy'
import {InlineKeyboard} from 'grammy'
import type {Env} from '../env.ts'
import type {PanelClient} from '../panel/client.ts'
import {renderDigest} from './digest.ts'
import {pickUnknownReply} from './unknown-replies.ts'

type WelcomeStep = {text: string; delayBefore: number}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function buildWelcomeScript(name: string): WelcomeStep[] {
  return [
    {text: `Привет, ${name} 👋`, delayBefore: 0},
    {text: 'Слушай, без долгих вступлений', delayBefore: 1200},
    {text: 'Интернет, который мы знали, накрывается медным тазом', delayBefore: 1800},
    {
      text: 'Telegram тормозит. YouTube не показывает. ChatGPT отвечает "недоступно в вашем регионе". Instagram... что-то на забытом',
      delayBefore: 2000,
    },
    {text: 'И это только начало', delayBefore: 2500},
    {text: 'Скоро за VPN-трафик придётся платить. Белые списки, чёрные списки. Каждый мегабайт свободы по счётчику', delayBefore: 2000},
    {
      text: 'А пока — этот идиотский танец: включить VPN, чтобы написать другу, выключить VPN, чтобы оплатить такси, снова включить, чтобы открыть ChatGPT, снова выключить, чтобы зайти в банк',
      delayBefore: 1800,
    },
    {text: 'Меня это добило', delayBefore: 2200},
    {text: 'Поэтому я сделал решение. Для себя. И для тебя', delayBefore: 1500},
    {
      text: 'В этом боте — приложение. Запускаешь один раз, настраиваешь за пару минут — и забываешь про эти качели навсегда',
      delayBefore: 1500,
    },
    {
      text: 'Оно работает внутри занавеса. Поэтому банк и такси видят тебя как "свой", а заблокированное — снова работает',
      delayBefore: 2000,
    },
    {text: 'И за это не надо платить. Ни мне, ни кому-либо ещё', delayBefore: 1800},
    {
      text: 'Потому что информация и связь с близкими — это не услуга премиум-класса. Это воздух',
      delayBefore: 1800,
    },
    {text: 'Никто не имеет права отгораживать тебя от мира. Ни сейчас, ни потом', delayBefore: 2200},
  ]
}

async function playWelcomeScript(ctx: Context, name: string): Promise<void> {
  const steps = buildWelcomeScript(name)
  for (const step of steps) {
    if (step.delayBefore > 0) {
      try {
        await ctx.replyWithChatAction('typing')
      } catch (e) {
        console.warn('[bot] chat action failed', e)
      }
      await sleep(step.delayBefore)
    }
    await ctx.reply(step.text)
  }
}

export function registerBotHandlers(bot: Bot, env: Env, panel: PanelClient): void {
  async function playWelcomeWithButton(ctx: Context, name: string): Promise<void> {
    const keyboard = new InlineKeyboard().webApp('🚀 Запустить', env.MINI_APP_URL)
    await playWelcomeScript(ctx, name)
    await sleep(1500)
    await ctx.reply('Держи 🖤', {reply_markup: keyboard})
  }

  bot.use(async (ctx, next) => {
    const tgId = ctx.from?.id
    if (!tgId) {
      await next()
      return
    }
    if (!ctx.message && !ctx.callbackQuery) {
      await next()
      return
    }
    const me = await safeFindUser(panel, tgId)
    if (!me) {
      if (ctx.message) {
        await ctx.reply(pickUnknownReply())
      }
      return
    }
    const text = ctx.message?.text ?? ''
    if (text.startsWith('/start')) {
      await next()
      return
    }
    if (ctx.message) {
      const conns = await safeListConnections(panel, me.id)
      if (conns.length === 0) {
        const name = ctx.from?.first_name ?? me.username ?? 'друг'
        await playWelcomeWithButton(ctx, name)
        return
      }
    }
    await next()
  })

  bot.command('start', async (ctx) => {
    const name = ctx.from?.first_name ?? 'друг'
    await playWelcomeWithButton(ctx, name)
  })

  bot.command('cabinet', async (ctx) => {
    const keyboard = new InlineKeyboard().webApp('Запустить', env.MINI_APP_URL)
    await ctx.reply('Кабинет:', {reply_markup: keyboard})
  })

  bot.command('usage', async (ctx) => {
    const tgId = ctx.from?.id
    if (!tgId) return
    const me = await safeFindUser(panel, tgId)
    if (!me) return
    const conns = await panel.listConnections(me.id)
    await ctx.reply(renderDigest(me, conns, env.TG_ADMIN_HANDLE), {parse_mode: 'HTML'})
  })

  bot.command('help', async (ctx) => {
    await ctx.reply(
      [
        '/start — рассказать историю и открыть кабинет',
        '/cabinet — открыть кабинет',
        '/usage — сколько трафика накапало и когда обнулится',
        '/help — это сообщение',
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

async function safeListConnections(panel: PanelClient, userId: string) {
  try {
    return await panel.listConnections(userId)
  } catch (e) {
    console.error('[bot] panel listConnections', e)
    return []
  }
}
