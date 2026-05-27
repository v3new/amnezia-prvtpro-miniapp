import {Bot, webhookCallback} from 'grammy'
import type {Context} from 'hono'
import type {Env} from '../env.ts'
import type {PanelClient} from '../panel/client.ts'
import {registerBotHandlers} from './handlers.ts'

export const BOT_WEBHOOK_PATH = '/telegram/webhook'

export function createBot(env: Env, panel: PanelClient): Bot {
  const bot = new Bot(env.TG_BOT_TOKEN)
  registerBotHandlers(bot, env, panel)
  return bot
}

export async function startBot(bot: Bot, env: Env): Promise<void> {
  await configureBotMenu(bot, env)

  if (env.TG_BOT_MODE === 'webhook') {
    const webhookUrl = getWebhookUrl(env)
    await bot.api.setWebhook(webhookUrl, {
      secret_token: env.TG_WEBHOOK_SECRET,
    })
    console.log(`[bot] webhook set to ${webhookUrl}`)
    return
  }

  await bot.api.deleteWebhook({drop_pending_updates: false})
  // grammy bot.start() resolves only on stop; run in background
  bot.start({onStart: (info) => console.log(`[bot] started @${info.username}`)}).catch((e) => {
    console.error('[bot] crashed', e)
  })
}

export function createBotWebhookHandler(bot: Bot, env: Env): (c: Context) => Promise<Response> {
  return webhookCallback(bot, 'hono', {
    onTimeout: 'return',
    secretToken: env.TG_WEBHOOK_SECRET,
  })
}

function getWebhookUrl(env: Env): string {
  const baseUrl = env.MINI_APP_URL.replace(/\/$/, '')
  return `${baseUrl}${BOT_WEBHOOK_PATH}`
}

async function configureBotMenu(bot: Bot, env: Env): Promise<void> {
  try {
    await bot.api.setChatMenuButton({
      menu_button: {
        type: 'web_app',
        text: 'Запустить',
        web_app: {url: env.MINI_APP_URL},
      },
    })
  } catch (e) {
    console.warn('[bot] setChatMenuButton failed', e)
  }
}
