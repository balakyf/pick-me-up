import { describe, it, expect } from 'vitest'
import { createAccount } from '../account'
import { summonMany } from '../gacha'
import { buildCombatUnit } from '../unit'
import { SKILLS } from '../content'
import { lifeReact } from '../life'
import { relationKey } from '../life/life'
import type { BondGroup, GameState, HeroId, OwnedHero } from '../types'
import { CHALLENGE } from './tuning'
import { challengeOf } from './challenge'
import { applyPartyBonuses, bindSummonBatch, bondBonuses, bondGriefMult, bondGroupOf, BOND_WORDS, setBonusFor } from './bonds'

const B = CHALLENGE.bonds

function tenPull(seed: number, pool: 'normal' | 'advanced'): GameState {
  const s = { ...createAccount(seed, { now: 0 }), gold: 1_000_000, gems: 100_000 }
  return summonMany(s, pool, 10).state
}

function groupsOf(s: GameState): BondGroup[] {
  return Object.values(challengeOf(s).bondGroups)
}

describe('bond groups (summoned together)', () => {
  it('a ten-pull sometimes arrives bound — pairs most often, the Advanced crystal more often', () => {
    const sizes: Record<number, number> = {}
    let normal = 0
    let advanced = 0
    const N = 300
    for (let seed = 1; seed <= N; seed++) {
      const n = groupsOf(tenPull(seed, 'normal'))
      normal += n.length
      for (const g of n) sizes[g.members.length] = (sizes[g.members.length] ?? 0) + 1
      advanced += groupsOf(tenPull(seed, 'advanced')).length
    }
    expect(normal / N).toBeGreaterThan(B.chance.normal - 0.07)
    expect(normal / N).toBeLessThan(B.chance.normal + 0.07)
    expect(advanced).toBeGreaterThan(normal)
    expect(Object.keys(sizes).every((k) => Number(k) >= 2 && Number(k) <= 5)).toBe(true)
    expect(sizes[2]!).toBeGreaterThan((sizes[3] ?? 0) + (sizes[4] ?? 0) + (sizes[5] ?? 0) - 5)
  })

  it('is deterministic per account and batch, and never changes who was pulled', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const a = tenPull(seed, 'advanced')
      const b = tenPull(seed, 'advanced')
      expect(challengeOf(a).bondGroups).toEqual(challengeOf(b).bondGroups)
      const bare = { ...a, challenge: { ...a.challenge, bondGroups: {} } }
      expect(Object.keys(bare.heroes)).toEqual(Object.keys(b.heroes))
    }
  })

  it('bound heroes carry the group, start as close friends, and get a readable name', () => {
    let found = false
    for (let seed = 1; seed <= 80 && !found; seed++) {
      const s = tenPull(seed, 'advanced')
      for (const g of groupsOf(s)) {
        found = true
        expect(g.name).toMatch(/^the \w+ \w+/)
        expect(BOND_WORDS).toContain(g.adj)
        expect(BOND_WORDS).toContain(g.noun)
        for (const m of g.members) {
          expect(s.heroes[m]!.bondGroup).toBe(g.id)
          expect(bondGroupOf(s, m)).toEqual(g)
        }
        for (let i = 0; i < g.members.length; i++)
          for (let j = i + 1; j < g.members.length; j++)
            expect(s.life.relations[relationKey(g.members[i]!, g.members[j]!)]!.affinity).toBeGreaterThanOrEqual(B.startAffinity)
      }
    }
    expect(found).toBe(true)
  })

  it('single pulls never bind; names stay unique across many ten-pulls', () => {
    let s = { ...createAccount(5, { now: 0 }), gold: 10_000_000, gems: 1_000_000 }
    const one = summonMany(s, 'normal', 1).state
    expect(groupsOf(one)).toHaveLength(0)
    expect(bindSummonBatch(s, [], 'normal')).toBe(s)
    for (let i = 0; i < 40; i++) s = summonMany(s, 'normal', 10).state
    const names = groupsOf(s).map((g) => g.name)
    expect(names.length).toBeGreaterThan(0)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('the set bonus and grief', () => {
  it('grows per extra member and peaks at a full set', () => {
    expect(setBonusFor(1, 3)).toBe(0)
    expect(setBonusFor(2, 3)).toBeCloseTo(B.perExtra)
    expect(setBonusFor(3, 3)).toBeCloseTo(B.perExtra * 2 + B.fullSet)
    expect(setBonusFor(2, 2)).toBeCloseTo(B.perExtra + B.fullSet)
  })

  function bonded(): { s: GameState; ids: HeroId[] } {
    const pulled = tenPull(9, 'normal')
    const s = { ...pulled, challenge: { ...challengeOf(pulled), bondGroups: {} } }
    const heroes = { ...s.heroes }
    for (const h of Object.values(heroes) as OwnedHero[]) heroes[h.id] = { ...h, bondGroup: null }
    const ids = Object.keys(s.heroes).slice(0, 3) as HeroId[]
    for (const id of ids) heroes[id] = { ...heroes[id]!, bondGroup: 'bond_0001' }
    const group: BondGroup = { id: 'bond_0001', name: 'the Gale Trio', members: ids, adj: 'Gale', noun: 'Trio' }
    return { s: { ...s, heroes, challenge: { ...challengeOf(s), bondGroups: { bond_0001: group } } }, ids }
  }

  it('applies at unit build: two members fight better, the full set best; strangers are untouched', () => {
    const { s, ids } = bonded()
    expect(bondBonuses(s, [ids[0]!]).size).toBe(0)
    expect(bondBonuses(s, [ids[0]!, ids[1]!]).get(ids[0]!)).toBeCloseTo(B.perExtra)
    const units = ids.map((id) => buildCombatUnit(s.heroes[id]!, 'front', SKILLS, s.inventory))
    const boosted = applyPartyBonuses(units, s)
    const pct = B.perExtra * 2 + B.fullSet
    expect(boosted[0]!.stats.pAtk).toBe(Math.round(units[0]!.stats.pAtk * (1 + pct)))
    expect(boosted[0]!.stats.maxHP).toBe(Math.round(units[0]!.stats.maxHP * (1 + pct)))
    expect(boosted[0]!.currentHP).toBe(boosted[0]!.stats.maxHP)
    expect(boosted[0]!.stats.spd).toBe(units[0]!.stats.spd)
  })

  it('the Shrine blessing rides on the floor it was bought for only', () => {
    const { s, ids } = bonded()
    const units = [buildCombatUnit(s.heroes[ids[0]!]!, 'front', SKILLS, s.inventory)]
    const blessed = { ...s, challenge: { ...challengeOf(s), blessing: { floor: s.tower.currentFloor, pct: 0.1 } } }
    expect(applyPartyBonuses(units, blessed)[0]!.stats.pAtk).toBe(Math.round(units[0]!.stats.pAtk * 1.1))
    expect(applyPartyBonuses(units, blessed, { blessing: false })[0]!.stats.pAtk).toBe(units[0]!.stats.pAtk)
    const elsewhere = { ...blessed, tower: { ...blessed.tower, currentFloor: blessed.tower.currentFloor + 1 } }
    expect(applyPartyBonuses(units, elsewhere)[0]!.stats.pAtk).toBe(units[0]!.stats.pAtk)
  })

  it('a bond sibling grieves harder than an equally close friend', () => {
    const { s, ids } = bonded()
    const [fallen, sibling] = ids as [HeroId, HeroId, HeroId]
    const friend = (Object.keys(s.heroes) as HeroId[]).find((id) => !ids.includes(id))!
    expect(bondGriefMult(s, fallen, sibling)).toBe(B.griefMult)
    expect(bondGriefMult(s, fallen, friend)).toBe(1)
    const relations = { ...s.life.relations, [relationKey(fallen, sibling)]: { affinity: 70, shared: 0 }, [relationKey(fallen, friend)]: { affinity: 70, shared: 0 } }
    const before: GameState = { ...s, life: { ...s.life, relations } }
    const after: GameState = { ...before, heroes: { ...before.heroes, [fallen]: { ...before.heroes[fallen]!, alive: false } as OwnedHero } }
    const next = lifeReact(before, after, { type: 'TOWER_RAID', floor: 20, parties: [[fallen]], crew: [] }, 0)
    expect(next.heroes[sibling]!.life!.grief).toBeGreaterThan(next.heroes[friend]!.life!.grief)
    const grave = next.life.memorial.at(-1)!
    expect(grave.cause).toBe('battle')
    expect(grave.floor).toBe(20)
  })
})
