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

const NUMBER_TAG: Record<Locale, string> = { en: 'en-US', fr: 'fr-FR' }
const numberFormats = new Map<string, Intl.NumberFormat>()

/**
 * A number as the active locale writes it: "27,120" and "0.5" in English, "27 120" and
 * "0,5" in French (narrow no-break space, decimal comma). Use it for every amount the
 * player reads (gold, damage, CP…) instead of `toLocaleString()`, which follows the
 * browser, not the game's language.
 */
export function fmt(n: number, opts?: Intl.NumberFormatOptions): string {
  const key = `${locale}|${opts ? JSON.stringify(opts) : ''}`
  let f = numberFormats.get(key)
  if (!f) {
    f = new Intl.NumberFormat(NUMBER_TAG[locale], opts)
    numberFormats.set(key, f)
  }
  return f.format(n)
}

/**
 * A placeholder value as text. A number with a fractional part takes the locale's decimal
 * mark ("×1,5" in French); whole numbers are left as they are (floors, ranks and levels
 * are not amounts — amounts go through `fmt` before they reach `t()`).
 */
function show(v: string | number): string {
  if (typeof v === 'number' && locale === 'fr' && Number.isFinite(v) && !Number.isInteger(v)) return String(v).replace('.', ',')
  return String(v)
}

/** Translate an English UI string (with optional `{var}` placeholders). */
export function t(en: string, vars?: Record<string, string | number>): string {
  const s = DICTS[locale][en] ?? en
  if (!vars) return s
  const out = s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? show(vars[k]!) : m))
  return locale === 'fr' ? joinFr(s, out, vars) : out
}

/** A leading article, per locale ("Le Fléau de Mira", "Un Fléau", "L’Œuf"; "A Bane"). */
const LEADING_ARTICLE: Record<Locale, RegExp> = {
  en: /^(?:A|An|The) /,
  fr: /^(?:(?:Le|La|Les|Un|Une|Des) |L[’'])/,
}

/**
 * A name as it reads in the middle of a sentence: a leading article loses its capital.
 * "Le Fléau de Mira" is a heading; "Vengeance sur le Fléau de Mira" is a sentence (and
 * English "A Bane" becomes "Revenge on a Bane"). Anything without an article is unchanged.
 * Interpolated through `t()`, a French "de"/"à" before it then contracts ("du Fléau…").
 */
export function inSentence(name: string): string {
  return LEADING_ARTICLE[locale].test(name) ? name.charAt(0).toLowerCase() + name.slice(1) : name
}

/** A vowel a French "de" elides before (h is left alone: aspirated or not, it varies). */
const FR_VOWEL = /^[AEIOUYÀÂÄÆÉÈÊËÎÏÔŒÙÛÜaeiouyàâäæéèêëîïôœùûü]/

/** "de"/"à" + a mid-sentence "le …"/"les …" (see `inSentence`). */
const FR_CONTRACT: Record<string, Record<string, string>> = { de: { le: 'du', les: 'des' }, à: { le: 'au', les: 'aux' } }

/**
 * French "de"/"à" written right before an interpolated name. Elision: "Écho de {name}"
 * with Islat reads "Écho d’Islat", "Le Fléau de {name}" with Aaron "Le Fléau d’Aaron".
 * Contraction, for a name `inSentence` gave a lowercase article: "de" + "le Fléau de Mira"
 * reads "du Fléau de Mira", "à" + it "au Fléau de Mira". The template's own words are
 * already correct and are left alone; a capitalised (heading) name is never contracted.
 */
function joinFr(template: string, out: string, vars: Record<string, string | number>): string {
  const re = /(?<!\p{L})([Dd]e|[Àà]) \{(\w+)\}/gu
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (mm, k: string) => (k in vars ? show(vars[k]!) : mm))
  let res = ''
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(template))) {
    const prep = m[1]!
    const k = m[2]!
    if (!(k in vars)) continue
    const v = String(vars[k])
    const lower = prep.toLowerCase()
    const art = /^(les?) /.exec(v)
    let joined: string
    if (art) {
      const c = FR_CONTRACT[lower]![art[1]!]!
      joined = (prep === lower ? c : c.charAt(0).toUpperCase() + c.slice(1)) + v.slice(art[1]!.length)
    } else if (lower === 'de' && FR_VOWEL.test(v)) {
      joined = `${prep.charAt(0)}’${v}`
    } else continue
    res += fill(template.slice(last, m.index)) + joined
    last = m.index + m[0].length
  }
  return last === 0 ? out : res + fill(template.slice(last))
}

