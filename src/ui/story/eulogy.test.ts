import { afterEach, describe, expect, it } from 'vitest'
import { createAccount } from '../../engine/account'
import { summonMany } from '../../engine/gacha'
import { personalityOf } from '../../engine/life'
import { traitOf } from '../../engine/content/traits'
import type { OwnedHero } from '../../engine/types'
import { setLocale } from '../i18n/i18n'
import { FR } from '../i18n/fr'
import { tradeName } from '../life/speech'
import { EULOGY_CLOSE, EULOGY_TRAIT, eulogy, type EulogyInput } from './eulogy'

function roster(): OwnedHero[] {
  let s = { ...createAccount(9090, { now: 0 }), gold: 10_000_000 }
  for (let i = 0; i < 4; i++) s = summonMany(s, 'normal', 10).state
  return Object.values(s.heroes)
}
const input = (h: OwnedHero, extra: Partial<EulogyInput> = {}): EulogyInput => ({
  name: h.name.split(' ')[0]!,
  who: { id: h.id, name: h.name, star: h.star, heroClass: h.heroClass, portraitToken: h.portraitToken },
  floor: 23,
  fellOn: 23,
  daysServed: 5,
  mourners: '',
  ...extra,
})

afterEach(() => setLocale('en'))

describe('Isel’s eulogy (lane M)', () => {
  const heroes = roster()

  it('is non-empty, deterministic and about who they were, for every hero', () => {
    expect(heroes.length).toBeGreaterThan(20)
    for (const h of heroes) {
      const a = eulogy(input(h))
      expect(a).toBe(eulogy(input(h)))
      expect(a.length).toBeGreaterThan(40)
      expect(a).toContain(h.name.split(' ')[0]!)
      expect(a).toContain(tradeName(personalityOf(h).background))
      expect(a).toContain(EULOGY_TRAIT[traitOf(h).family])
      expect(a).not.toMatch(/[{}]/)
    }
  })

  it('names the mourners, welcomes a newcomer, and names an anchor floor by its story', () => {
    const h = heroes[0]!
    expect(eulogy(input(h, { mourners: 'Bo and Cy' }))).toContain('Bo and Cy')
    const newcomer = eulogy(input(h, { daysServed: 0 }))
    expect(newcomer).toContain(EULOGY_CLOSE.brief[0])
    const atDragon = eulogy(input(h, { fellOn: 20, floor: 20 }))
    expect(atDragon).toContain('The Half Black Dragon')
    expect(atDragon).toContain('floor 20')
  })

  it('does not say the same sentence twice over one battle’s dead (while the pools last)', () => {
    const taken = new Set<string>()
    const five = heroes.slice(0, 5).map((h) => eulogy(input(h, { mourners: 'Zed' }), taken))
    const closes = five.map((l) => EULOGY_CLOSE.mourned.find((c) => l.includes(c.replace('{mourners}', 'Zed'))))
    expect(new Set(closes).size).toBe(5)
  })

  it('works from a name alone (an old grave), and in French with every placeholder filled', () => {
    expect(eulogy({ name: 'Ana', floor: 9, mourners: '' })).toMatch(/^Ana\. /)
    setLocale('fr')
    for (const h of heroes.slice(0, 12)) {
      const fr = eulogy(input(h, { mourners: h.id.length % 2 ? 'Bo' : '' }))
      expect(fr.length).toBeGreaterThan(40)
      expect(fr).not.toMatch(/[{}]/)
      expect(fr).toContain(FR[EULOGY_TRAIT[traitOf(h).family]]!)
    }
  })
})
