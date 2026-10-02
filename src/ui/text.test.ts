import { afterEach, describe, expect, it } from 'vitest'
import { aOrAn, fixArticles, fmtInt, startsWithVowelSound, ta, tn, withArticle } from './text'
import { setLocale } from './i18n/i18n'

afterEach(() => setLocale('en'))

describe('text helpers', () => {
  it('a/an by sound, not by letter', () => {
    expect(withArticle('Expert')).toBe('an Expert')
    expect(withArticle('Novice')).toBe('a Novice')
    expect(withArticle('Apprentice')).toBe('an Apprentice')
    expect(withArticle('armorer')).toBe('an armorer')
    expect(withArticle('innkeeper')).toBe('an innkeeper')
    expect(withArticle('unique hero')).toBe('a unique hero')
    expect(withArticle('hour')).toBe('an hour')
    expect(withArticle('one-off')).toBe('a one-off')
    expect(aOrAn('S Blade')).toBe('an')
    expect(aOrAn('B Blade')).toBe('a')
    expect(aOrAn('A-grade charm')).toBe('an')
    expect(startsWithVowelSound('')).toBe(false)
  })

  it('fixes the articles of finished English text, and leaves French alone', () => {
    expect(fixArticles('Ivo is now a Expert Cook.', 'en')).toBe('Ivo is now an Expert Cook.')
    expect(fixArticles('I was a armorer back home.', 'en')).toBe('I was an armorer back home.')
    expect(fixArticles('Mira finished a S Blade at the Forge.', 'en')).toBe('Mira finished an S Blade at the Forge.')
    expect(fixArticles('an Novice', 'en')).toBe('a Novice')
    expect(fixArticles('A unique hero, a hero, an hour.', 'en')).toBe('A unique hero, a hero, an hour.')
    expect(fixArticles('Il a eu peur.', 'fr')).toBe('Il a eu peur.')
  })

  it('ta() translates then fixes articles in English', () => {
    expect(ta('I was a {job} back home. Why was I the one summoned?', { job: 'innkeeper' })).toBe(
      'I was an innkeeper back home. Why was I the one summoned?',
    )
  })

  it('formats whole numbers with thousands separators per locale', () => {
    expect(fmtInt(12500, 'en')).toBe('12,500')
    expect(fmtInt(999.6, 'en')).toBe('1,000')
    expect(fmtInt(12500, 'fr').replace(/\s/g, ' ')).toBe('12 500')
    expect(fmtInt(94075, 'fr')).toBe('94\u00a0075')
  })

  it('tn() picks the singular or plural sentence', () => {
    expect(tn(1, '1 chest waiting', '{n} chests waiting')).toBe('1 chest waiting')
    expect(tn(3, '1 chest waiting', '{n} chests waiting')).toBe('3 chests waiting')
    expect(tn(1200, '1 hero', '{n} heroes')).toBe('1,200 heroes')
  })
})
