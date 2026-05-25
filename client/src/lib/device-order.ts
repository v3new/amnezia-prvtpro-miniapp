export type FormFactor = 'phone' | 'computer' | 'tablet' | 'tv' | 'other' | 'router'

export const FORM_FACTOR_ORDER: FormFactor[] = ['phone', 'computer', 'tablet', 'tv', 'other', 'router']

const DEVICE_TO_FORM_FACTOR: Record<string, FormFactor> = {
  iphone: 'phone',
  android: 'phone',
  mac: 'computer',
  windows: 'computer',
  linux: 'computer',
  ipad: 'tablet',
  android_tablet: 'tablet',
  appletv: 'tv',
  androidtv: 'tv',
  router: 'router',
  other: 'other',
}

export function formFactorOf(deviceSlug: string): FormFactor {
  return DEVICE_TO_FORM_FACTOR[deviceSlug] ?? 'other'
}

export function formFactorRank(f: FormFactor): number {
  const i = FORM_FACTOR_ORDER.indexOf(f)
  return i === -1 ? FORM_FACTOR_ORDER.length : i
}

export function compareByFormFactorThenName<T extends {device: string; description: string}>(a: T, b: T): number {
  const fa = formFactorRank(formFactorOf(a.device))
  const fb = formFactorRank(formFactorOf(b.device))
  if (fa !== fb) return fa - fb
  return a.description.localeCompare(b.description, undefined, {sensitivity: 'base', numeric: true})
}
