import { afterEach, describe, expect, it } from 'vitest'
import { TRAITS } from '../../engine/content/traits'
import { FR } from '../i18n/fr'
import { setLocale } from '../i18n/i18n'
import { traitCombatLines, traitEffects, traitFilterOptions, traitLifeLines, traitTooltip } from './traitText'

afterEach(() => setLocale('en'))

describe('trait text', () => {
  it('every trait says what it does, from its own numbers', () => {
    for (const d of Object.values(TRAITS)) {
      expect(traitCombatLines(d).length, d.id).toBeGreaterThan(0)
      expect(traitEffects(d)).not.toMatch(/undefined|NaN/)
    }
    expect(traitEffects(TRAITS.brave)).toBe('+6% damage below 40% HP · +6 status resistance (steadier nerves)')
    expect(traitEffects(TRAITS.glass_cannon)).toBe('ATK +9% · HP -6%')
    expect(traitEffects(TRAITS.fortunes_child)).toContain('The first blow of a fight misses them')
    expect(traitEffects(TRAITS.lone_wolf)).toBe('Outside a bond group: ATK +4%, SPD +2%')
    expect(traitLifeLines(TRAITS.iron_stomach)).toEqual(['gets hungry 25% more slowly'])
    expect(traitLifeLines(TRAITS.healers_hands)).toEqual(['a natural healer (+1 aptitude)'])
    expect(traitTooltip(TRAITS.lucky)).toContain('Finds coins in the dirt')
  })

  it('names, lines and effects all read in French', () => {
    for (const d of Object.values(TRAITS)) {
      expect(FR[d.name], d.name).toBeTruthy()
      expect(FR[d.blurb], d.blurb).toBeTruthy()
    }
    setLocale('fr')
    expect(traitEffects(TRAITS.brave)).toBe('+6 % de dégâts sous 40 % de PV · +6 de résistance aux altérations (nerfs plus solides)')
    expect(traitEffects(TRAITS.night_fighter)).toContain('ombre')
  })

  it('the Registry filter lists every trait once, commons first', () => {
    const opts = traitFilterOptions()
    expect(opts.length).toBe(Object.keys(TRAITS).length)
    const firstRare = opts.findIndex((o) => o.rare)
    expect(opts.slice(firstRare).every((o) => o.rare)).toBe(true)
  })
})
