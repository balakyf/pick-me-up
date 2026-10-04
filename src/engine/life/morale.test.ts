import { describe, it, expect } from 'vitest'
import { createAccount } from '../account'
import { reduce } from '../store'
import { TUNING } from '../tuning'
import type { CombatUnit, GameState, HeroId, OwnedHero } from '../types'
import { applyMorale, bandOf, campOutlook, moraleBroken, moraleOf, moraleStatMult, stepLife, MORALE } from '.'
import { deployReport, fitToDeploy } from '../tower'
import { buildCombatUnit } from '../unit'
import { SKILLS } from '../content'
import { moraleAdjust } from '../estate/deploy'
import { freshTrauma } from '../estate'
import { heroCpFull } from '../unit/trueCp'

const DAY = TUNING.life.slotMs * TUNING.life.slotsPerDay

function roster(seed: number, n = 9): GameState {
  let st: GameState = { ...createAccount(seed), gold: TUNING.gacha.normalCostGold * n }
  for (let i = 0; i < n; i++) st = reduce(st, { type: 'SUMMON' })
  return stepLife(st, DAY / 2)
}
const living = (s: GameState) => Object.values(s.heroes).filter((h) => h.alive) as OwnedHero[]

function withHero(s: GameState, h: OwnedHero): GameState {
  return { ...s, heroes: { ...s.heroes, [h.id]: h } }
}

/** A hero at rock bottom: grieving, withdrawn, frayed. */
function heartbroken(s: GameState, id: HeroId): GameState {
  const h = s.heroes[id]!
  const life = { ...h.life!, grief: 100, needs: { energy: 10, hunger: 10, social: 10, fun: 10 } }
  const st = withHero(s, { ...h, sanity: 5, life })
  return { ...st, estate: { ...st.estate, trauma: { ...st.estate.trauma, [id]: { ...freshTrauma(), withdrawn: { since: 0, cause: null, comfort: 0, lastTalkDay: -1 } } } } }
}

describe('morale (lane L)', () => {
  it('bands follow the score and light 0–5 pips', () => {
    expect(bandOf(100)).toBe('inspired')
    expect(bandOf(MORALE.bands.inspired)).toBe('inspired')
    expect(bandOf(MORALE.bands.inspired - 1)).toBe('high')
    expect(bandOf(50)).toBe('steady')
    expect(bandOf(MORALE.bands.shaken)).toBe('shaken')
    expect(bandOf(0)).toBe('broken')
  })

  it('a rested newcomer is in decent spirits, and every reason is named', () => {
    const s = roster(41)
    for (const h of living(s)) {
      const m = moraleOf(s, h.id)
      expect(m.score).toBeGreaterThanOrEqual(0)
      expect(m.score).toBeLessThanOrEqual(100)
      expect(['inspired', 'high', 'steady']).toContain(m.band)
      expect(m.factors.some((f) => f.key === 'sanity')).toBe(true)
    }
    // The factors add up to the score (from the base).
    const h = living(s)[0]!
    const m = moraleOf(s, h.id)
    const sum = MORALE.base + m.factors.reduce((a, f) => a + f.value, 0)
    expect(m.score).toBe(Math.max(0, Math.min(100, Math.round(sum))))
  })

  it('grief, withdrawal and frayed nerves break a hero; a broken hero refuses to deploy', () => {
    const s0 = roster(42)
    const id = s0.party.slots.find(Boolean)!
    expect(fitToDeploy(s0, s0.heroes[id]).ok).toBe(true)
    const s = heartbroken(s0, id)
    const m = moraleOf(s, id)
    expect(m.band).toBe('broken')
    expect(m.factors.map((f) => f.key)).toEqual(expect.arrayContaining(['grief', 'withdrawn', 'sanity', 'tired']))
    expect(moraleBroken(s, id)).toBe(true)
    expect(fitToDeploy(s, s.heroes[id])).toEqual({ ok: false, reason: 'disheartened' })
    const row = deployReport(s).find((r) => r.heroId === id)!
    expect(row.fit).toBe(false)
    expect(row.reason).toBe('disheartened')
  })

  it('a banquet, a gift and friends lift morale', () => {
    const s = roster(43)
    const h = living(s)[1]!
    const before = moraleOf(s, h.id).score
    const feast = { ...s, meta: { ...s.meta, banquetDay: Math.floor(s.meta.lastSeenAtWorld / DAY) } }
    expect(moraleOf(feast, h.id).score).toBe(Math.min(100, before + MORALE.banquetToday))
    const other = living(s)[2]!
    const key = h.id < other.id ? `${h.id}|${other.id}` : `${other.id}|${h.id}`
    const friends = { ...s, life: { ...s.life, relations: { ...s.life.relations, [key]: { affinity: 80, shared: 3 } } } }
    expect(moraleOf(friends, h.id).score).toBeGreaterThan(before - 1)
    expect(moraleOf(friends, h.id).factors.find((f) => f.key === 'friends')?.other).toBe(other.id)
  })

  it('neutral bands leave a combat unit untouched; inspired and shaken scale it a little', () => {
    const s = roster(44)
    const h = living(s)[0]!
    const unit: CombatUnit = buildCombatUnit(h, 'front', SKILLS, s.inventory)
    const band = moraleOf(s, h.id).band
    if (band !== 'inspired' && band !== 'shaken') expect(applyMorale(s, unit)).toBe(unit)

    // Inspired: a feast, friends, a clear, full needs.
    const today = Math.floor(s.meta.lastSeenAtWorld / DAY)
    const life = { ...h.life!, needs: { energy: 90, hunger: 90, social: 90, fun: 90 }, memories: [...h.life!.memories, { kind: 'floorCleared' as const, day: today, floor: 5, weight: 40 }] }
    let up = withHero({ ...s, meta: { ...s.meta, banquetDay: today } }, { ...h, sanity: 100, life })
    for (const o of living(s).slice(1, 4)) {
      const key = h.id < o.id ? `${h.id}|${o.id}` : `${o.id}|${h.id}`
      up = { ...up, life: { ...up.life, relations: { ...up.life.relations, [key]: { affinity: 80, shared: 1 } } } }
    }
    expect(moraleOf(up, h.id).band).toBe('inspired')
    expect(moraleStatMult(up, h.id)).toBe(MORALE.inspiredStat)
    const inspired = applyMorale(up, buildCombatUnit(up.heroes[h.id]!, 'front', SKILLS, up.inventory))
    const plain = buildCombatUnit(up.heroes[h.id]!, 'front', SKILLS, up.inventory)
    expect(inspired.stats.pAtk).toBe(Math.max(1, Math.round(plain.stats.pAtk * MORALE.inspiredStat)))
    expect(inspired.stats.critPct).toBe(plain.stats.critPct)
    expect(inspired.currentHP).toBe(inspired.stats.maxHP)
    // True CP reads it too (the Party Board and the scout tell the truth).
    expect(heroCpFull(up, up.heroes[h.id]!)).toBe(moraleAdjust(up, plain).cp)
  })

  it('shaken does not stack on a withdrawn hero’s own dulling', () => {
    const s0 = roster(45)
    const id = living(s0)[0]!.id
    const s = heartbroken(s0, id)
    // Broken (would refuse), but the multiplier is the withdrawal's alone.
    expect(moraleStatMult(s, id)).toBe(1)
  })

  it('the camp outlook counts every living hero once', () => {
    const s0 = roster(46)
    const id = living(s0)[0]!.id
    const s = heartbroken(s0, id)
    const o = campOutlook(s)
    expect(Object.values(o.counts).reduce((a, b) => a + b, 0)).toBe(living(s).length)
    expect(o.troubled[0]).toBe(id)
    expect(o.mean).toBeGreaterThan(0)
  })

  it('is memoized per state and pure (the same state reads the same morale)', () => {
    const s = roster(47)
    const id = living(s)[0]!.id
    expect(moraleOf(s, id)).toBe(moraleOf(s, id))
    expect(moraleOf({ ...s }, id)).toEqual(moraleOf(s, id))
  })
})
