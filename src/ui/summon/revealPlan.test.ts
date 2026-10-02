import { describe, expect, it } from 'vitest'
import {
  TIER_TINT,
  beamSteps,
  bestGrade,
  cardStamps,
  flipAt,
  floorHits,
  gradeShout,
  isFastBeat,
  lineupGroups,
  lineupOrder,
  moteCount,
  nextBestIndex,
  orbTier,
  overviewHold,
  overviewOrbs,
  rareAtFor,
  rarityWordKey,
  revealTiming,
  stampDelay,
  stampStagger,
  surgeTimes,
  tierOf,
} from './revealPlan'
import { TUNING } from '../../engine/tuning'
import type { OwnedHero } from '../../engine/types'
import { STAR_COLOR } from '../bits'

describe('summon reveal plan', () => {
  it('maps stars to beam tiers, capping 6★/7★ at prismatic', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(tierOf)).toEqual([1, 2, 3, 4, 5, 5, 5])
  })

  it('teases 4★+ as a lower colour that surges up; commoner pulls show the truth at once', () => {
    expect(beamSteps(1, false)).toEqual([1])
    expect(beamSteps(3, false)).toEqual([3])
    expect(beamSteps(4, false)).toEqual([3, 4])
    expect(beamSteps(5, false)).toEqual([3, 4, 5])
    expect(beamSteps(7, false)).toEqual([3, 4, 5])
  })

  it('reduced motion: no tease and a much shorter build-up', () => {
    expect(beamSteps(5, true)).toEqual([5])
    expect(surgeTimes(5, true)).toEqual([])
    expect(flipAt(5, true)).toBeLessThan(500)
    expect(moteCount(5, true)).toBeLessThan(moteCount(5, false))
  })

  it('each surge lands before the flip, and rarer pulls take longer', () => {
    const t = revealTiming(false)
    expect(surgeTimes(5, false)).toEqual([t.charge, t.charge + t.step])
    for (const s of surgeTimes(5, false)) expect(s).toBeLessThan(flipAt(5, false))
    expect(flipAt(5, false)).toBeGreaterThan(flipAt(4, false))
    expect(flipAt(4, false)).toBeGreaterThan(flipAt(3, false))
    // Reveal 2.0 (changed on purpose): 1–2★ flip fast; 3★ keeps the full beat.
    expect(flipAt(3, false)).toBeGreaterThan(flipAt(2, false))
    expect(flipAt(1, false)).toBe(flipAt(2, false))
  })

  it('bigger bursts for rarer pulls', () => {
    expect(moteCount(4, false)).toBeGreaterThan(moteCount(3, false))
    expect(moteCount(5, false)).toBeGreaterThan(moteCount(4, false))
  })

  it('"Skip to best" stops on the next 4★+, or reports none left', () => {
    const stars = [2, 3, 4, 1, 5, 3]
    expect(nextBestIndex(stars, 0)).toBe(2)
    expect(nextBestIndex(stars, 3)).toBe(4)
    expect(nextBestIndex(stars, 5)).toBe(-1)
    expect(nextBestIndex([1, 2, 3], 0)).toBe(-1)
  })

  it('the lineup sorts by stars, best first, keeping pull order among equals', () => {
    expect(lineupOrder([2, 3, 4, 3, 1])).toEqual([2, 1, 3, 0, 4])
  })

  it('the beam wears the card colours: 4★ purple, 5★ gold', () => {
    expect(TIER_TINT[2]).toBe(STAR_COLOR[2])
    expect(TIER_TINT[3]).toBe(STAR_COLOR[3])
    expect(TIER_TINT[4]).toBe(STAR_COLOR[4])
    expect(TIER_TINT[5]).toBe(STAR_COLOR[5])
  })

  it("the Normal pool's 3★ is its jackpot: a tease, a word and a Skip-to-best stop", () => {
    const rare = rareAtFor('normal')
    expect(beamSteps(3, false, rare)).toEqual([2, 3])
    expect(beamSteps(2, false, rare)).toEqual([2])
    expect(rarityWordKey(3, rare)).toBe('Rare!')
    expect(rarityWordKey(2, rare)).toBeNull()
    expect(nextBestIndex([1, 2, 1, 3, 2], 0, rare)).toBe(3)
    expect(flipAt(3, false, rare)).toBeGreaterThan(flipAt(2, false, rare))
    // The Advanced pool keeps the 4★ line.
    const adv = rareAtFor('advanced')
    expect(beamSteps(3, false, adv)).toEqual([3])
    expect(rarityWordKey(3, adv)).toBeNull()
    expect(rarityWordKey(4, adv)).toBe('Rare!')
    expect(rarityWordKey(5, adv)).toBe('Legendary!')
  })

  it('1–2★ flip fast (well under a second), 3★+ take the full beat; reduced motion stays short for all', () => {
    expect(isFastBeat(1)).toBe(true)
    expect(isFastBeat(2)).toBe(true)
    expect(isFastBeat(3)).toBe(false)
    expect(flipAt(1, false)).toBeLessThan(700)
    expect(flipAt(3, false)).toBeGreaterThan(1200)
    expect(revealTiming(true, true)).toEqual(revealTiming(true, false))
    expect(flipAt(5, true)).toBeLessThan(500)
  })

  it('the second beat comes after the flip: quick for commoners, a held breath for 3★+', () => {
    expect(stampDelay(1, false)).toBeLessThan(stampDelay(3, false))
    expect(stampDelay(5, true)).toBeLessThanOrEqual(200)
    expect(stampStagger(true)).toBe(0)
    expect(stampStagger(false)).toBeGreaterThan(0)
    expect(overviewHold(true)).toBeLessThan(overviewHold(false))
  })

  it('a ten-pull overview: each orb in its opening colour, the rare ones teased', () => {
    const rare = rareAtFor('normal')
    const orbs = overviewOrbs([1, 2, 3, 1], false, rare)
    expect(orbs.map((o) => o.tier)).toEqual([1, 2, 2, 1])
    expect(orbs.map((o) => o.tease)).toEqual([false, false, true, false])
    // Reduced motion: the truth, no tease.
    expect(overviewOrbs([1, 2, 3, 1], true, rare).map((o) => o.tier)).toEqual([1, 2, 3, 1])
    // The progress strip shows the truth once a hero is out.
    expect(orbTier(3, false, false, rare)).toBe(2)
    expect(orbTier(3, true, false, rare)).toBe(3)
    const adv = overviewOrbs([3, 4, 5], false, rareAtFor('advanced'))
    expect(adv).toEqual([
      { tier: 3, tease: false },
      { tier: 3, tease: true },
      { tier: 3, tease: true },
    ])
  })

  it('the best growth grade, and when it is worth a shout', () => {
    expect(bestGrade({ str: 9, agi: 2, vit: 9, int: 0, wil: 1 })).toEqual({ attr: 'STR', value: 9, letter: 'S' })
    expect(bestGrade({ str: 1, agi: 2, vit: 3, int: 0, wil: 7 })).toEqual({ attr: 'WIL', value: 7, letter: 'A' })
    expect(gradeShout({ letter: 'S' })).toBe(true)
    expect(gradeShout({ letter: 'A' })).toBe(true)
    expect(gradeShout({ letter: 'B' })).toBe(false)
  })

  it('the stamps: engraving, Oath-weapon, each skill, trait, grade, and the floor when it lifted them', () => {
    const plain = { engraving: null, equipment: { weapon: null, armor: null, accessory: null }, skills: [] } as unknown as OwnedHero
    expect(cardStamps(plain).map((s) => s.kind)).toEqual(['trait', 'grade'])
    const rich = {
      engraving: { id: 'beast_king_heir', grade: 'B' },
      equipment: { weapon: 'eq_000001', armor: null, accessory: null },
      skills: [{ id: 'power_strike', level: 1, xp: 0 }, { id: 'composure', level: 1, xp: 0 }],
    } as unknown as OwnedHero
    expect(cardStamps(rich, true)).toEqual([
      { kind: 'engraving' },
      { kind: 'weapon' },
      { kind: 'skill', id: 'power_strike' },
      { kind: 'skill', id: 'composure' },
      { kind: 'trait' },
      { kind: 'grade' },
      { kind: 'floor' },
    ])
  })

  it('the quality floor: marks the pull it lifted, counting pity as the gacha does', () => {
    const at = TUNING.gacha.normalPityFloor3At
    expect(floorHits('normal', { pity: at - 2, advPity4: 0, advPity5: 0 }, [1, 3, 1])).toEqual([false, true, false])
    expect(floorHits('normal', { pity: 0, advPity4: 0, advPity5: 0 }, [3, 1, 2])).toEqual([false, false, false])
    const a4 = TUNING.gacha.advanced.pityFloor4At
    expect(floorHits('advanced', { pity: 0, advPity4: a4 - 1, advPity5: 10 }, [4, 3])).toEqual([true, false])
    const a5 = TUNING.gacha.advanced.pityFloor5At
    expect(floorHits('advanced', { pity: 0, advPity4: 0, advPity5: a5 - 1 }, [5])).toEqual([true])
  })

  it('the lineup gathers a bond group (two or more here) under its name, best group first', () => {
    const h = (bondGroup: string | null) => ({ bondGroup })
    const heroes = [h(null), h('g1'), h('g2'), h('g1'), h(null), h('g2'), h('g3')]
    const stars = [3, 1, 2, 2, 1, 1, 2]
    const groups = lineupGroups(heroes, stars)
    // g2's best is a 2★ (pull 2), g1's a 2★ (pull 3): g2 first by pull order among equals.
    expect(groups).toEqual([
      { group: 'g2', order: [2, 5] },
      { group: 'g1', order: [3, 1] },
      { group: null, order: [0, 6, 4] },
    ])
    // Every pull appears exactly once.
    expect(groups.flatMap((g) => g.order).sort()).toEqual([0, 1, 2, 3, 4, 5, 6])
  })
})
