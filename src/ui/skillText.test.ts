import { afterEach, describe, expect, it } from 'vitest'
import { SKILLS } from '../engine/content'
import { setLocale } from './i18n/i18n'
import { roleLabel, skillBlurb, skillPhrases, skillRole } from './skillText'

afterEach(() => setLocale('en'))

describe('what a skill does, in words', () => {
  it('reads every skill without a gap (blow, effects, costs)', () => {
    for (const def of Object.values(SKILLS)) {
      const line = skillBlurb(def, 1)
      expect(line.length, def.id).toBeGreaterThan(4)
      expect(line, def.id).not.toMatch(/\{|undefined|NaN/)
    }
  })

  it('Basic Shield: the taunt and the guard, at its level', () => {
    expect(skillPhrases(SKILLS.basic_shield!, 2)).toEqual([
      'taunts: foes must strike the caster for 2 turns',
      'the caster takes 29% less damage for 2 turns',
      '15 SP',
    ])
  })

  it('Shadow Flurry: three hits and a chance to bleed', () => {
    expect(skillBlurb(SKILLS.shadow_flurry!, 1)).toBe(
      '3 hits on one foe (×0.45 each, physical) · 40% chance: bleed: 12% of attack a turn for 3 turns · 25 SP',
    )
  })

  it('heals, shields, marks and HP costs', () => {
    expect(skillPhrases(SKILLS.first_aid!, 1)[0]).toBe('heals the most wounded ally for 18% of max HP')
    expect(skillPhrases(SKILLS.barrier!, 1)[0]).toBe('shields the ally under attack for 70% of M.ATK (2 turns)')
    expect(skillPhrases(SKILLS.hunters_mark!, 1)[1]).toBe('marks one foe: +20% damage taken for 3 turns')
    expect(skillPhrases(SKILLS.ixid!, 1).at(-1)).toBe('20 SP · 18 HP')
    expect(skillPhrases(SKILLS.pain_tolerance!, 1)).toEqual(['takes 4% less damage, always'])
    expect(skillPhrases(SKILLS.flame_resistance!, 1)).toEqual(['takes 15% less Fire damage, always'])
  })

  it('each skill has a role tag', () => {
    expect(skillRole(SKILLS.basic_shield!)).toBe('tank')
    expect(skillRole(SKILLS.first_aid!)).toBe('heal')
    expect(skillRole(SKILLS.war_cry!)).toBe('support')
    expect(skillRole(SKILLS.spellbind!)).toBe('control')
    expect(skillRole(SKILLS.berserk!)).toBe('strike')
    expect(skillRole(SKILLS.thunder_volley!)).toBe('control')
    expect(skillRole(SKILLS.incident!)).toBe('sweep')
    expect(skillRole(SKILLS.insight!)).toBe('passive')
    expect(roleLabel('heal')).toBe('HEAL')
  })

  it('reads in French too', () => {
    setLocale('fr')
    expect(skillPhrases(SKILLS.first_aid!, 1)[0]).toBe('soigne l’allié le plus blessé de 18 % des PV max')
    expect(roleLabel('tank')).toBe('TANK')
  })
})
