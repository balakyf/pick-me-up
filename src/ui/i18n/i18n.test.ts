import { afterEach, describe, expect, it } from 'vitest'
import { FR, FR_MODULES } from './fr'
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

  it('no key is defined in more than one FR module (a later spread would win silently)', () => {
    // Pre-existing job names (frContent and frLife) with identical translations, grandfathered.
    // This list may only shrink; every other key must live in exactly one module.
    const GRANDFATHERED = ['farmer', 'carpenter', 'baker', 'fisher', 'weaver', 'shepherd', 'miller']
    const owner = new Map<string, string>()
    const dupes: string[] = []
    const allowed: string[] = []
    for (const [mod, dict] of Object.entries(FR_MODULES)) {
      for (const key of Object.keys(dict)) {
        const first = owner.get(key)
        if (first === undefined) owner.set(key, mod)
        else if (GRANDFATHERED.includes(key) && FR_MODULES[first]![key] === dict[key]) allowed.push(key)
        else dupes.push(`${JSON.stringify(key)} in ${first} and ${mod}`)
      }
    }
    expect(dupes).toEqual([])
    expect(allowed.sort()).toEqual([...GRANDFATHERED].sort())
  })

  it('FR is exactly the union of its modules', () => {
    const keys = new Set(Object.values(FR_MODULES).flatMap((d) => Object.keys(d)))
    expect(Object.keys(FR).sort()).toEqual([...keys].sort())
    for (const d of Object.values(FR_MODULES)) for (const [k, v] of Object.entries(d)) expect(FR[k]).toBe(v)
  })

  it('the feature modules are wired in (the legacy seed lines translate)', () => {
    setLocale('fr')
    expect(t('Avenged {name}', { name: 'Ana' })).toBe('A vengé Ana')
  })
})
