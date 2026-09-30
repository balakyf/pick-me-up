import { describe, it, expect } from 'vitest'
import { createAccount } from '../account'
import { reduce } from '../store'
import { TUNING } from '../tuning'
import { ANCHORS } from '../content'
import { makeSeed } from '../rng'
import { buildEncounter, playFloor } from '../tower'
import type { GameState, HeroId } from '../types'
import { DEPTH } from './depthTuning'
import { floorModifiers, floorModifiersFor, FLOOR_MODIFIERS } from './floorMods'
import { formationNotes, lineDamageMult, bestLine, adjacentLines } from './formation'
import { partyBonds, withBonds } from './synergy'
import { relationKey } from '../life'

function roster(seed: number, n = 6): GameState {
  let s: GameState = { ...createAccount(seed), gold: TUNING.gacha.normalCostGold * n }
  for (let i = 0; i < n; i++) s = reduce(s, { type: 'SUMMON' })
  return s
}

describe('floor modifiers — generation', () => {
  it('none below F40 or on anchors', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (let f = 1; f < DEPTH.mods.fromFloor; f++) expect(floorModifiers(makeSeed(seed), f)).toEqual([])
      for (const f of Object.keys(ANCHORS).map(Number)) expect(floorModifiers(makeSeed(seed), f)).toEqual([])
    }
  })

  it('is deterministic per account and floor, and differs between accounts', () => {
    const a = Array.from({ length: 60 }, (_, i) => floorModifiers(makeSeed(7), 40 + i))
    const b = Array.from({ length: 60 }, (_, i) => floorModifiers(makeSeed(7), 40 + i))
    const c = Array.from({ length: 60 }, (_, i) => floorModifiers(makeSeed(8), 40 + i))
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
  })

  it('most floors carry 0–1 modifiers; two only deeper and rarely; never a duplicate', () => {
    let floors = 0
    let withAny = 0
    let twoShallow = 0
    let twoDeep = 0
    let deep = 0
    const seen = new Set<string>()
    for (let seed = 1; seed <= 200; seed++) {
      for (let f = 40; f <= 100; f++) {
        if (ANCHORS[f] !== undefined) continue
        const m = floorModifiers(makeSeed(seed), f)
        floors++
        if (m.length > 0) withAny++
        if (f >= DEPTH.mods.deepFrom) deep++
        if (m.length === 2) f >= DEPTH.mods.deepFrom ? twoDeep++ : twoShallow++
        expect(m.length).toBeLessThanOrEqual(2)
        expect(new Set(m).size).toBe(m.length)
        for (const x of m) seen.add(x)
      }
    }
    const share = withAny / floors
    expect(share).toBeGreaterThan(0.38)
    expect(share).toBeLessThan(0.52)
    expect(twoShallow).toBe(0)
    expect(twoDeep / deep).toBeGreaterThan(0.02)
    expect(twoDeep / deep).toBeLessThan(0.1)
    expect([...seen].sort()).toEqual([...FLOOR_MODIFIERS].sort())
  })

  it('the Wailing Wall’s conditions are the same for every Master', () => {
    const a = roster(1, 0)
    const b = roster(2, 0)
    for (let f = 81; f <= 89; f++) expect(floorModifiersFor(a, f)).toEqual(floorModifiersFor(b, f))
  })

  it('the tower attaches them to the floor’s encounter', () => {
    const s = roster(3, 0)
    let found = false
    for (let f = 40; f <= 79 && !found; f++) {
      const mods = floorModifiersFor(s, f)
      if (mods.length === 0) continue
      expect(buildEncounter(s, f).modifiers).toEqual(mods)
      found = true
    }
    expect(found).toBe(true)
    expect(buildEncounter(s, 10).modifiers).toBeUndefined()
  })
})

describe('formation — hints', () => {
  it('reads the tuned table', () => {
    expect(lineDamageMult('mage', 'back')).toBe(DEPTH.formation.dealt.ranged.back)
    expect(lineDamageMult('warrior', 'back')).toBe(DEPTH.formation.dealt.melee.back)
    expect(bestLine('archer')).toBe('back')
    expect(bestLine('spearman')).toBe('front')
    expect(bestLine(null)).toBeNull()
    expect(adjacentLines('front', 'mid')).toBe(true)
    expect(adjacentLines('front', 'back')).toBe(false)
  })

  it('notes shelter only where the lineup provides it', () => {
    const notes = formationNotes([
      { heroClass: 'warrior', line: 'front' },
      { heroClass: 'thief', line: 'mid' },
      { heroClass: 'mage', line: 'back' },
    ])
    expect(notes[0]).toMatchObject({ dealtPct: 0, shelter: 'midSupport' })
    expect(notes[1]).toMatchObject({ supportHeal: true, shelter: null })
    expect(notes[2]).toMatchObject({ dealtPct: 8, shelter: 'backCover' })
    const alone = formationNotes([{ heroClass: 'mage', line: 'back' }])
    expect(alone[0]!.shelter).toBeNull()
  })
})

describe('synergy — bonds from Quanton Life', () => {
  function withRelations(s: GameState, pairs: [HeroId, HeroId, number][]): GameState {
    const relations = { ...s.life.relations }
    for (const [a, b, affinity] of pairs) relations[relationKey(a, b)] = { affinity, shared: 0 }
    return { ...s, life: { ...s.life, relations } }
  }

  it('turns affinity into bond kinds by the life thresholds', () => {
    const s0 = roster(4)
    const ids = Object.keys(s0.heroes) as HeroId[]
    const R = TUNING.life.relation
    const s = withRelations(s0, [
      [ids[0]!, ids[1]!, R.closeFriend + 5],
      [ids[0]!, ids[2]!, R.friend],
      [ids[1]!, ids[2]!, R.rival],
      [ids[2]!, ids[3]!, R.grudge - 1],
      [ids[3]!, ids[4]!, 10], // acquaintances: no bond
    ])
    const bonds = partyBonds(s, ids.slice(0, 5))
    const kind = (a: HeroId, b: HeroId) => bonds.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a))?.kind
    expect(kind(ids[0]!, ids[1]!)).toBe('closeFriend')
    expect(kind(ids[0]!, ids[2]!)).toBe('friend')
    expect(kind(ids[1]!, ids[2]!)).toBe('rival')
    expect(kind(ids[2]!, ids[3]!)).toBe('grudge')
    expect(kind(ids[3]!, ids[4]!)).toBeUndefined()
    // only among the given heroes
    expect(partyBonds(s, [ids[0]!, ids[3]!])).toEqual([])
  })

  it('a floor attempt carries the deployed party’s bonds into combat', () => {
    const s0 = roster(5)
    const ids = Object.keys(s0.heroes) as HeroId[]
    const party = ids.slice(0, 5)
    const s1 = { ...s0, party: { slots: party, lines: s0.party.lines } }
    const s = withRelations(s1, [[party[0]!, party[1]!, 90]])
    expect(withBonds(buildEncounter(s, 1), s, party).bonds).toHaveLength(1)
    expect(withBonds(buildEncounter(s1, 1), s1, party).bonds).toBeUndefined()
    // and the fight still resolves deterministically
    const a = playFloor(s).result.result.log
    const b = playFloor(s).result.result.log
    expect(a.events).toEqual(b.events)
  })
})
