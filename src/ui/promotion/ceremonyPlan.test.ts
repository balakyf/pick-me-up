import { describe, expect, it } from 'vitest'
import { createAccount } from '../../engine/account'
import { summonMany } from '../../engine/gacha'
import { completePromotion, startPromotion } from '../../engine/promotion'
import { traitOf } from '../../engine/content/traits'
import type { GameState, HeroId, OwnedHero } from '../../engine/types'
import { beatHold, ceremonyBeats, ceremonyChanges, detectPromotions, gradeRows, tickingValue } from './ceremonyPlan'

function withCapped(): { s: GameState; id: HeroId } {
  let s: GameState = { ...createAccount(91, { now: 0 }), gold: 1_000_000 }
  s = summonMany(s, 'normal', 10).state
  const h = (Object.values(s.heroes) as OwnedHero[]).find((x) => x.star === 2 && x.heroClass === null) ?? (Object.values(s.heroes) as OwnedHero[])[0]!
  s = {
    ...s,
    materials: { ...s.materials, promotionStone: 999, [`attrStone_${h.element}`]: 999 },
    heroes: { ...s.heroes, [h.id]: { ...h, xp: { ...h.xp, atCap: true } } },
  }
  return { s, id: h.id }
}

describe('detectPromotions', () => {
  it('finds a hero whose star rose out of the chamber — and nothing else', () => {
    const { s, id } = withCapped()
    const started = startPromotion(s, id, 0)
    const done: GameState = { ...started, heroes: { ...started.heroes, [id]: completePromotion(started.heroes[id]!, started.seed) } }
    const found = detectPromotions(started, done)
    expect(found.map((p) => p.heroId)).toEqual([id])
    expect(found[0]!.after.star).toBe(found[0]!.before.star + 1)
    // No change, a different account, or a star that rose without the chamber: nothing.
    expect(detectPromotions(started, started)).toEqual([])
    expect(detectPromotions(started, { ...done, accountId: 'other' })).toEqual([])
    expect(detectPromotions(s, { ...s, heroes: { ...s.heroes, [id]: { ...s.heroes[id]!, star: 5 } } })).toEqual([])
    expect(detectPromotions(null, done)).toEqual([])
  })
})

describe('ceremonyChanges and beats', () => {
  it('reads what changed: grades, a new class and skill, the trait', () => {
    const { s, id } = withCapped()
    const before = { ...s.heroes[id]!, promotion: { completesAtWorld: 0 } }
    const after = completePromotion(before, s.seed)
    const c = ceremonyChanges(before, after)
    expect(c.grades.length).toBe(5)
    for (const g of c.grades) expect(g.to).toBeGreaterThanOrEqual(g.from)
    expect(c.newSkills.length).toBeGreaterThanOrEqual(before.star === 2 ? 1 : 0)
    if (before.star === 2) expect(c.newClass).not.toBeNull()
    expect(c.trait === null).toBe(traitOf(before).id === traitOf(after).id)
    const beats = ceremonyBeats(c)
    expect(beats[0]).toBe('open')
    expect(beats.at(-1)).toBe('done')
    expect(beats).toContain('grades')
    expect(beats.includes('skill')).toBe(c.newSkills.length > 0)
  })

  it('an engraving that evolves or awakens gets its own beat', () => {
    const base = withCapped().s.heroes[withCapped().id]!
    const evolved = ceremonyChanges({ ...base, engraving: { id: 'beast_king_heir', grade: 'C' } }, { ...base, engraving: { id: 'beast_king_heir', grade: 'B' } })
    expect(evolved.engraving).toEqual({ kind: 'evolved', from: { id: 'beast_king_heir', grade: 'C' }, to: { id: 'beast_king_heir', grade: 'B' } })
    expect(ceremonyBeats(evolved)).toContain('engraving')
    const awoke = ceremonyChanges(base, { ...base, engraving: { id: 'sword_saint_mark', grade: 'C' } })
    expect(awoke.engraving?.kind).toBe('awakened')
    expect(ceremonyChanges(base, base).engraving).toBeNull()
  })

  it('grades tick up one step at a time and stop at the new value', () => {
    expect(tickingValue(2, 5, 0)).toBe(2)
    expect(tickingValue(2, 5, 170)).toBe(3)
    expect(tickingValue(2, 5, 10_000)).toBe(5)
    expect(tickingValue(4, 4, 999)).toBe(4)
    const rows = gradeRows({ str: 2, agi: 1, vit: 3, int: 0, wil: 2 }, { str: 4, agi: 2, vit: 4, int: 1, wil: 3 })
    expect(rows[0]).toMatchObject({ label: 'STR', fromLetter: 'E', toLetter: 'C', delta: 2 })
  })

  it('reduced motion holds no beat', () => {
    for (const b of ['open', 'stars', 'grades', 'skill', 'done'] as const) expect(beatHold(b, true)).toBe(0)
    expect(beatHold('stars', false)).toBeGreaterThan(0)
  })
})
