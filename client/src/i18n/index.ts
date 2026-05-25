import i18n from 'i18next'
import {initReactI18next} from 'react-i18next'
import en from './locales/en.json'
import ru from './locales/ru.json'

const RTL_LANGS = new Set(['fa', 'ar', 'he', 'ur'])

export const SUPPORTED_LANGS = ['ru', 'en'] as const
export type SupportedLang = (typeof SUPPORTED_LANGS)[number]

// Detection of language from Telegram/browser is intentionally disabled —
// MiniApp всегда стартует на русском. Чтобы вернуть автодетект, замени `lng` на
// результат функции, читающей `window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code`.
const FORCED_LANG: SupportedLang = 'ru'

void i18n.use(initReactI18next).init({
  resources: {
    ru: {translation: ru},
    en: {translation: en},
  },
  lng: FORCED_LANG,
  fallbackLng: 'ru',
  interpolation: {escapeValue: false},
  returnNull: false,
})

export function applyDirection(lang: string): void {
  const base = lang.toLowerCase().split('-')[0] ?? 'ru'
  document.documentElement.lang = base
  document.documentElement.dir = RTL_LANGS.has(base) ? 'rtl' : 'ltr'
}

applyDirection(i18n.language)
i18n.on('languageChanged', applyDirection)

export default i18n
