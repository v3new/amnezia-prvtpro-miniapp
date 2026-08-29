import type {Bot} from 'grammy'
import {GrammyError} from 'grammy'

const MAX_RETRY_ATTEMPTS = 3

/** sendMessage with backoff on Telegram's 429 flood control. */
export async function sendWithRetry(bot: Bot, chatId: number, text: string, attempt = 1): Promise<void> {
  try {
    await bot.api.sendMessage(chatId, text, {parse_mode: 'HTML'})
  } catch (e) {
    if (e instanceof GrammyError && e.error_code === 429 && attempt <= MAX_RETRY_ATTEMPTS) {
      const retry = (e.parameters?.retry_after ?? 1) * 1000 * 2 ** (attempt - 1)
      await new Promise((r) => setTimeout(r, retry))
      return sendWithRetry(bot, chatId, text, attempt + 1)
    }
    throw e
  }
}
