import { afterEach, describe, expect, it } from 'vitest'
import { FR } from './fr'
import { getLocale, onLocaleChange, setLocale, t } from './i18n'

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')

afterEach(() => setLocale('en'))

describe('i18n', () => {
  it('English is the source text: keys pass through and placeholders fill', () => {
    setLocale('en')
    expect(t('Floor {n}', { n: 7 })).toBe('Floor 7')
    expect(t('Not in any dictionary')).toBe('Not in any dictionary')
  })

  it('French translates, interpolates, and falls back to English for unknown keys', () => {
    setLocale('fr')
    expect(getLocale()).toBe('fr')
    expect(t('Floor {n}', { n: 7 })).toBe('Étage 7')
    expect(t('Kitchen')).toBe('Cuisine')
    expect(t('Not in any dictionary')).toBe('Not in any dictionary')
    // A proper name has no entry and stays as it is.
    expect(t('Halgiraf')).toBe('Halgiraf')
  })

  it('notifies listeners when the locale changes', () => {
    let calls = 0
    const off = onLocaleChange(() => calls++)
    setLocale('fr')
    setLocale('en')
    off()
    setLocale('fr')
    expect(calls).toBe(2)
  })

  it('every French entry keeps exactly the placeholders of its English key', () => {
    const bad = Object.entries(FR).filter(([en, fr]) => placeholders(en) !== placeholders(fr))
    expect(bad).toEqual([])
  })

  it('no French entry is left empty', () => {
    expect(Object.entries(FR).filter(([, fr]) => fr.trim() === '')).toEqual([])
  })
})
