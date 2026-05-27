import {Bot, webhookCallback} from 'grammy'
import type {Context} from 'hono'
import type {Env} from '../env.ts'
import type {PanelClient} from '../panel/client.ts'
import {registerBotHandlers} from './handlers.ts'

export const BOT_WEBHOOK_PATH = '/telegram/webhook'
const BOT_START_RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000]

export function createBot(env: Env, panel: PanelClient): Bot {
  const bot = new Bot(env.TG_BOT_TOKEN)
  registerBotHandlers(bot, env, panel)
  return bot
}

export function startBot(bot: Bot, env: Env): void {
  startBotOnce(bot, env).catch((e) => {
    console.error('[bot] startup failed', e)
    scheduleBotStartupRetry(bot, env, 0)
  })
}

async function startBotOnce(bot: Bot, env: Env): Promise<void> {
  if (env.TG_BOT_MODE === 'webhook') {
    const webhookUrl = getWebhookUrl(env)
    await bot.api.setWebhook(webhookUrl, {
      secret_token: env.TG_WEBHOOK_SECRET,
    })
    console.log(`[bot] webhook set to ${webhookUrl}`)
    configureBotMenu(bot, env)
    return
  }

  await bot.api.deleteWebhook({drop_pending_updates: false})
  configureBotMenu(bot, env)
  // grammy bot.start() resolves only on stop; run in background
  bot.start({onStart: (info) => console.log(`[bot] started @${info.username}`)}).catch((e) => {
    console.error('[bot] crashed', e)
    scheduleBotStartupRetry(bot, env, 0)
  })
}

function scheduleBotStartupRetry(bot: Bot, env: Env, attempt: number): void {
  const delayMs = BOT_START_RETRY_DELAYS_MS[Math.min(attempt, BOT_START_RETRY_DELAYS_MS.length - 1)]
  console.warn(`[bot] startup retry in ${delayMs}ms`)

  setTimeout(() => {
    startBotOnce(bot, env).catch((e) => {
      console.error('[bot] startup retry failed', e)
      scheduleBotStartupRetry(bot, env, attempt + 1)
    })
  }, delayMs)
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

function configureBotMenu(bot: Bot, env: Env): void {
  bot.api
    .setChatMenuButton({
      menu_button: {
        type: 'web_app',
        text: 'Запустить',
        web_app: {url: env.MINI_APP_URL},
      },
    })
    .catch((e) => {
      console.warn('[bot] setChatMenuButton failed', e)
    })
}
