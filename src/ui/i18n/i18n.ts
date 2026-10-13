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
  const out = s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
  return locale === 'fr' ? elideFr(s, out, vars) : out
}

/** A vowel a French "de" elides before (h is left alone: aspirated or not, it varies). */
const FR_VOWEL = /^[AEIOUYÀÂÄÆÉÈÊËÎÏÔŒÙÛÜaeiouyàâäæéèêëîïôœùûü]/

/**
 * French elision before an interpolated name: "Écho de {name}" with Islat reads
 * "Écho d’Islat", "Le Fléau de {name}" with Aaron "Le Fléau d’Aaron". Only a "de" written
 * right before a placeholder is touched (the template's own words are already correct).
 */
function elideFr(template: string, out: string, vars: Record<string, string | number>): string {
  if (!/\bde \{\w+\}/i.test(template)) return out
  let res = ''
  let last = 0
  const re = /\b([Dd])e \{(\w+)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(template))) {
    const k = m[2]!
    if (!(k in vars) || !FR_VOWEL.test(String(vars[k]))) continue
    res += template.slice(last, m.index) + `${m[1]}’{${k}}`
    last = m.index + m[0].length
  }
  if (last === 0) return out
  res += template.slice(last)
  return res.replace(/\{(\w+)\}/g, (mm, k: string) => (k in vars ? String(vars[k]) : mm))
}
