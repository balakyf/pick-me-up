/**
 * Localisation (English source, French translation). Gettext-style: `t('English text')`
 * looks the English string up in the active locale's dictionary and falls back to the
 * English, so any string can be wrapped without inventing keys. `{name}` placeholders
 * are filled from `vars`. Content names (places, skills, enemies…) go through the same
 * lookup. The engine never sees the locale — presentation only.
 */
import { FR } from './fr'

export type Locale = 'en' | 'fr'

const KEY = 'pmu.locale'
const DICTS: Record<Locale, Record<string, string>> = { en: {}, fr: FR }

function initial(): Locale {
  try {
    const v = typeof window !== 'undefined' ? window.localStorage.getItem(KEY) : null
    if (v === 'fr' || v === 'en') return v
    if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('fr')) return 'fr'
  } catch {
    /* storage may be unavailable */
  }
  return 'en'
}

let locale: Locale = initial()
const listeners = new Set<() => void>()

export function getLocale(): Locale {
  return locale
}

export function setLocale(l: Locale): void {
  locale = l
  try {
    window.localStorage.setItem(KEY, l)
  } catch {
    /* storage may be unavailable */
  }
  for (const fn of listeners) fn()
}

export function onLocaleChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Translate an English UI string (with optional `{var}` placeholders). */
export function t(en: string, vars?: Record<string, string | number>): string {
  const s = DICTS[locale][en] ?? en
  if (!vars) return s
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
}
