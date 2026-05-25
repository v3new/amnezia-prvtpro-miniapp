import {Bot} from 'grammy'
import type {Env} from '../env.ts'
import type {PanelClient} from '../panel/client.ts'
import {registerBotHandlers} from './handlers.ts'

export function createBot(env: Env, panel: PanelClient): Bot {
  const bot = new Bot(env.TG_BOT_TOKEN)
  registerBotHandlers(bot, env, panel)
  return bot
}

export async function startBot(bot: Bot, env: Env): Promise<void> {
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
  // grammy bot.start() resolves only on stop; run in background
  bot.start({onStart: (info) => console.log(`[bot] started @${info.username}`)}).catch((e) => {
    console.error('[bot] crashed', e)
  })
}
