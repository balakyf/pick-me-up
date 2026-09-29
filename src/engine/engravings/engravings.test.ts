import { describe, it, expect } from 'vitest'
import { engravingEffect, engravingCp, evolveEngraving, nextEngravingGrade, rollEngraving } from './engravings'
import { ENGRAVINGS, CAMEO_HEROES } from '../content'
import { TUNING } from '../tuning'
import { makeSeed, rngFor } from '../rng'
import { buildCombatUnit } from '../unit'
import { buildOwnedHeroFromTemplate } from '../gacha'
import { completePromotion } from '../promotion'
import { SKILLS } from '../content'
import type { HeroId, OwnedHero } from '../types'

describe('engravings', () => {
  it('every engraving defines all four grades with at least one keyword', () => {
    for (const def of Object.values(ENGRAVINGS)) {
      for (const g of ['C', 'B', 'A', 'S'] as const) expect(def.byGrade[g].keywords.length).toBeGreaterThan(0)
    }
  })

  it('True Black Dragon’s Blood is the canon 2% of all engravings', () => {
    const total = Object.values(ENGRAVINGS).reduce((a, d) => a + d.weight, 0)
    expect(ENGRAVINGS.black_dragon_blood!.weight / total).toBeCloseTo(0.02, 5)
    expect(ENGRAVINGS.black_dragon_blood!.byGrade.S.statPct).toEqual({ pDef: 0.2, mDef: 0.2 })
  })

  it('evolves one grade at a time and stops at S', () => {
    expect(nextEngravingGrade('C')).toBe('B')
    expect(nextEngravingGrade('A')).toBe('S')
    expect(nextEngravingGrade('S')).toBe('S')
    expect(evolveEngraving({ id: 'iron_oath', grade: 'B' })).toEqual({ id: 'iron_oath', grade: 'A' })
  })

  it('rolls deterministically; a 5★ never rolls grade C', () => {
    const r = rngFor(makeSeed(4), 'engr', 1)
    expect(rollEngraving(r, 4).value).toEqual(rollEngraving(r, 4).value)
    for (let i = 0; i < 200; i++) expect(rollEngraving(rngFor(makeSeed(4), 'engr', i), 5).value.grade).not.toBe('C')
  })

  it('adds CP and lends its keywords + stat bonus to the bearer’s unit', () => {
    const anasis = buildOwnedHeroFromTemplate(CAMEO_HEROES.find((t) => t.templateId === 'anasis')!, 'h_anasis' as HeroId)
    expect(anasis.engraving).toEqual({ id: 'black_dragon_blood', grade: 'A' })
    const bare: OwnedHero = { ...anasis, engraving: null }
    const withE = buildCombatUnit(anasis, 'front', SKILLS)
    const without = buildCombatUnit(bare, 'front', SKILLS)
    expect(withE.keywords).toContainEqual({ kind: 'aegis', charges: 2 })
    expect(withE.stats.pDef).toBe(Math.round(without.stats.pDef * 1.12))
    expect(withE.cp).toBeGreaterThan(without.cp)
    expect(engravingCp(anasis.engraving)).toBe(TUNING.engravings.cp.A)
    expect(engravingEffect(null)).toBeNull()
  })

  it('a promotion evolves an engraving; reaching 4★ can awaken one', () => {
    const base = buildOwnedHeroFromTemplate(CAMEO_HEROES.find((t) => t.templateId === 'kishasha')!, 'h_k' as HeroId)
    const capped: OwnedHero = { ...base, xp: { level: 60, xpIntoLevel: 0, heldXp: 0, atCap: true } }
    expect(completePromotion(capped, makeSeed(1)).engraving).toEqual({ id: 'beast_king_heir', grade: 'A' })

    const three: OwnedHero = { ...base, star: 3, engraving: null, xp: { level: 40, xpIntoLevel: 0, heldXp: 0, atCap: true } }
    let awakened = 0
    for (let s = 1; s <= 60; s++) {
      const done = completePromotion({ ...three, id: `h_${s}` as HeroId }, makeSeed(s))
      if (done.engraving !== null) {
        awakened++
        expect(done.engraving.grade).toBe('C')
      }
    }
    expect(awakened).toBeGreaterThan(5)
    expect(awakened).toBeLessThan(40)
  })
})
