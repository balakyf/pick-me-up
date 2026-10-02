/**
 * Small English text helpers for strings the UI builds: a/an, plurals, thousands
 * separators, round numbers. French grammar lives in the fr* dictionaries; these only
 * fix what English templates get wrong ("a Expert", "1 chests", "XP 12500").
 */
import { getLocale, t } from './i18n/i18n'

/** Letters whose spoken name starts with a vowel sound (an A-grade, an S Blade). */
const VOWEL_LETTERS = new Set(['A', 'E', 'F', 'H', 'I', 'L', 'M', 'N', 'O', 'R', 'S', 'X'])
/** Vowel-letter words that start with a consonant sound (a unique, a one-off, a European). */
const CONSONANT_SOUND = /^(uni|use|usu|uti|ura|ure|uro|eu|ewe|one\b|once\b|ouija)/i
/** Words that start with a silent h (an hour, an honest). */
const SILENT_H = /^(hour|honest|honou?r|heir)/i

/** Does `word` start with a vowel sound (so it takes "an")? */
export function startsWithVowelSound(word: string): boolean {
  const w = word.trim()
  if (w === '') return false
  // A lone capital letter (or one followed by a non-letter, e.g. "S-grade") is read by its name.
  if (/^[A-Z](?![a-z])/.test(w)) return VOWEL_LETTERS.has(w[0]!)
  if (SILENT_H.test(w)) return true
  if (CONSONANT_SOUND.test(w)) return false
  return /^[aeiou]/i.test(w)
}

/** "a" or "an" for `word`. */
export function aOrAn(word: string): 'a' | 'an' {
  return startsWithVowelSound(word) ? 'an' : 'a'
}

/** "an Expert", "a Novice". */
export function withArticle(word: string): string {
  return `${aOrAn(word)} ${word}`
}

/**
 * Correct the indefinite articles of finished English text ("a Expert" → "an Expert",
 * "an Novice" → "a Novice"). Only for English: in French "a" is a verb.
 */
export function fixArticles(text: string, locale: string = getLocale()): string {
  if (locale !== 'en') return text
  return text.replace(/\b([Aa])(n?) (?=([A-Za-z][\w'’-]*))/g, (m, a: string, _n: string, word: string) => {
    const an = startsWithVowelSound(word)
    return `${a}${an ? 'n' : ''} `
  })
}

/** `t()` for a template that puts a noun after "a": the article follows the noun. */
export function ta(en: string, vars?: Record<string, string | number>): string {
  return fixArticles(t(en, vars))
}

/** A whole number with the locale's thousands separator (12,500 · 12 500). */
export function fmtInt(n: number, locale: string = getLocale()): string {
  return Math.round(n).toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-US')
}

/**
 * Pick the singular or plural source string by `n`, then translate: the English
 * dictionary keys stay whole sentences (t('1 chest waiting') / t('{n} chests waiting')).
 */
export function tn(n: number, one: string, many: string, vars: Record<string, string | number> = {}): string {
  return t(n === 1 ? one : many, { n: fmtInt(n), ...vars })
}
