export const DEVICE_SLUGS = [
  'iphone',
  'ipad',
  'android',
  'android_tablet',
  'androidtv',
  'mac',
  'windows',
  'linux',
  'appletv',
  'router',
  'other',
] as const

export type DeviceSlug = (typeof DEVICE_SLUGS)[number]

export interface DeviceDef {
  slug: DeviceSlug
  label: string
  icon: string
  name_examples: string[]
}

export const DEVICES: readonly DeviceDef[] = [
  {slug: 'iphone', label: 'iPhone', icon: '📱', name_examples: ['Айфон', 'Личный', 'Рабочий']},
  {slug: 'ipad', label: 'iPad', icon: '📲', name_examples: ['Планшет', 'iPad']},
  {slug: 'android', label: 'Android', icon: '🤖', name_examples: ['Андроид', 'Xiaomi', 'Рабочий телефон']},
  {
    slug: 'android_tablet',
    label: 'Android планшет',
    icon: '📲',
    name_examples: ['Планшет', 'Samsung Tab', 'Lenovo Tab'],
  },
  {slug: 'androidtv', label: 'Android TV', icon: '📺', name_examples: ['Телевизор', 'ТВ в гостиной', 'ТВ у родителей']},
  {slug: 'mac', label: 'Mac', icon: '💻', name_examples: ['Домашний Mac', 'MacBook', 'Рабочий Mac']},
  {slug: 'windows', label: 'Windows', icon: '🖥', name_examples: ['Рабочий ПК', 'Игровой комп', 'Ноутбук']},
  {slug: 'linux', label: 'Linux', icon: '🐧', name_examples: ['Сервер', 'Linux-ноут']},
  {slug: 'appletv', label: 'Apple TV', icon: '📺', name_examples: ['Apple TV', 'Телевизор у мамы']},
  {slug: 'router', label: 'Роутер', icon: '📡', name_examples: ['Домашний роутер', 'Дача']},
  {slug: 'other', label: 'Другое', icon: '❓', name_examples: ['Устройство']},
]

const BY_SLUG: Record<string, DeviceDef> = Object.fromEntries(DEVICES.map((d) => [d.slug, d]))
const FALLBACK_DEVICE: DeviceDef = {slug: 'other', label: 'Другое', icon: '❓', name_examples: ['Устройство']}

export function getDevice(slug: string): DeviceDef {
  return BY_SLUG[slug] ?? FALLBACK_DEVICE
}
