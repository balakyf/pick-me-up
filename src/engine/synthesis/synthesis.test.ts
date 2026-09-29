/**
 * Tests for Synthesis (Layer 1 §4). Vitest globals enabled (no imports needed).
 *
 * Transfer grade math and salvage/rescue are fully deterministic; the ONLY RNG is
 * the 25% transfer skill-copy, seeded by (accountSeed, 'synthesis', survivor, sacrifice).
 */
import {
  synthesize,
  synthesisPreview,
  canSynthesize,
  synthesisUnlocked,
  salvageYield,
  type SynthesisInput,
} from './synthesis'
import { createAccount } from '../account'
import { TUNING } from '../tuning'
import type { GameState, OwnedHero, HeroId } from '../types'

const S = TUNING.lobby.synthesis

/** Lv1 skills from ids. */
const sk = (...ids: string[]) => ids.map((id) => ({ id, level: 1, xp: 0 }))
const ids = (h: OwnedHero) => h.skills.map((s) => s.id)

/** A hand-built hero (mirrors unit.test.ts's makeWarrior). */
function makeHero(id: string, overrides: Partial<OwnedHero> = {}): OwnedHero {
  return {
    id: id as HeroId,
    name: `Hero ${id}`,
    star: 3,
    heroClass: 'warrior',
    element: 'fire',
    baseAttrs: { str: 20, agi: 15, vit: 18, int: 8, wil: 12 },
    growthGrades: { str: 5, agi: 4, vit: 5, int: 2, wil: 3 },
    skills: sk('power_strike'),
    portraitToken: '#ffffff',
    origin: 'procedural',
    xp: { level: 7, xpIntoLevel: 0, heldXp: 0, atCap: false },
    alive: true,
    sanity: 100,
    promotion: null,
    equipment: { weapon: null, armor: null, accessory: null },
    training: null,
    ...overrides,
  }
}

/** An account at Master Level >= unlock, with a custom hero roster. */
function accountWith(heroes: OwnedHero[]): GameState {
  const base = createAccount(1)
  const map: Record<string, OwnedHero> = {}
  for (const h of heroes) map[h.id] = h
  return {
    ...base,
    heroes: map,
    meta: { ...base.meta, masterLevel: S.unlockMasterLevel },
    materials: {},
  }
}

describe('synthesisUnlocked', () => {
  it('is gated on Master Level', () => {
    const locked = accountWith([makeHero('a')])
    expect(synthesisUnlocked({ ...locked, meta: { ...locked.meta, masterLevel: S.unlockMasterLevel - 1 } })).toBe(false)
    expect(synthesisUnlocked(locked)).toBe(true)
  })
})

describe('Transfer mode', () => {
  it('nudges survivor grades upward-only by ceil(diff × η), never lowering', () => {
    const surv = makeHero('surv', { growthGrades: { str: 2, agi: 4, vit: 5, int: 2, wil: 3 } })
    const sac = makeHero('sac', { growthGrades: { str: 9, agi: 1, vit: 5, int: 6, wil: 3 } })
    const state = accountWith([surv, sac])
    const input: SynthesisInput = { mode: 'transfer', survivorId: surv.id, sacrificeIds: [sac.id] }
    const after = synthesize(state, input)
    const g = after.heroes['surv' as HeroId]!.growthGrades
    // str: diff 7 → ceil(0.7)=+1 → 3; agi/vit: sac not higher → unchanged; int: diff 4 → +1 → 3.
    expect(g.str).toBe(3)
    expect(g.agi).toBe(4)
    expect(g.vit).toBe(5)
    expect(g.int).toBe(3)
    expect(g.wil).toBe(3)
  })

  it('permadeaths the sacrifice and charges survivor + witness Sanity', () => {
    const surv = makeHero('surv')
    const sac = makeHero('sac')
    const witness = makeHero('w')
    const state = accountWith([surv, sac, witness])
    const after = synthesize(state, { mode: 'transfer', survivorId: surv.id, sacrificeIds: [sac.id] })
    expect(after.heroes['sac' as HeroId]!.alive).toBe(false)
    expect(after.heroes['surv' as HeroId]!.sanity).toBe(100 - S.survivorSanityCost)
    expect(after.heroes['w' as HeroId]!.sanity).toBe(100 - S.witnessSanityCost)
  })

  it('skill copy is seeded + deterministic (same seed → same outcome)', () => {
    const surv = makeHero('surv', { skills: [] })
    const sac = makeHero('sac', { skills: sk('power_strike', 'piercing_thrust') })
    const state = accountWith([surv, sac])
    const a = synthesize(state, { mode: 'transfer', survivorId: surv.id, sacrificeIds: [sac.id] })
    const b = synthesize(state, { mode: 'transfer', survivorId: surv.id, sacrificeIds: [sac.id] })
    expect(a.heroes['surv' as HeroId]!.skills).toEqual(b.heroes['surv' as HeroId]!.skills)
  })
})

describe('Salvage mode', () => {
  it('renders a sacrifice into promotion materials by star (no survivor required)', () => {
    const keeper = makeHero('keeper')
    const sac = makeHero('sac', { star: 4, element: 'water' })
    const state = accountWith([keeper, sac])
    const after = synthesize(state, { mode: 'salvage', survivorId: null, sacrificeIds: [sac.id] })
    expect(after.materials['promotionStone']).toBe(S.salvageYield[4]!.promotionStone)
    expect(after.materials['attrStone_water']).toBe(S.salvageYield[4]!.attrStone)
    expect(after.heroes['sac' as HeroId]!.alive).toBe(false)
  })

  it('salvageYield matches the tuning table for a given hero', () => {
    expect(salvageYield(makeHero('x', { star: 5, element: 'wind' }))).toEqual({
      promotionStone: S.salvageYield[5]!.promotionStone,
      attrStone_wind: S.salvageYield[5]!.attrStone,
    })
  })

  it('optional rescue copies a missing skill onto the survivor (preferred over grade)', () => {
    const surv = makeHero('surv', { skills: [] })
    const sac = makeHero('sac', { skills: sk('piercing_thrust') })
    const state = accountWith([surv, sac])
    const after = synthesize(state, { mode: 'salvage', survivorId: surv.id, sacrificeIds: [sac.id] })
    expect(ids(after.heroes['surv' as HeroId]!)).toContain('piercing_thrust')
    // a transferred skill arrives fresh (Lv1)
    expect(after.heroes['surv' as HeroId]!.skills.find((s) => s.id === 'piercing_thrust')!.level).toBe(1)
    // Rescue charges the survivor Sanity once.
    expect(after.heroes['surv' as HeroId]!.sanity).toBe(100 - S.survivorSanityCost)
  })

  it('rescues the best grade (upward-only) when the survivor already knows every skill', () => {
    const surv = makeHero('surv', { skills: sk('power_strike'), growthGrades: { str: 2, agi: 2, vit: 2, int: 2, wil: 2 } })
    const sac = makeHero('sac', { skills: sk('power_strike'), growthGrades: { str: 9, agi: 1, vit: 1, int: 1, wil: 1 } })
    const state = accountWith([surv, sac])
    const after = synthesize(state, { mode: 'salvage', survivorId: surv.id, sacrificeIds: [sac.id] })
    expect(after.heroes['surv' as HeroId]!.growthGrades.str).toBe(9) // best grade rescued whole
  })
})

describe('guards', () => {
  it('throws when the chamber is locked', () => {
    const state = accountWith([makeHero('a'), makeHero('b')])
    const locked = { ...state, meta: { ...state.meta, masterLevel: S.unlockMasterLevel - 1 } }
    expect(() => synthesize(locked, { mode: 'salvage', survivorId: null, sacrificeIds: ['a' as HeroId] })).toThrow()
  })

  it('refuses to destroy the last living hero', () => {
    const only = makeHero('only')
    const state = accountWith([only])
    expect(() => synthesize(state, { mode: 'salvage', survivorId: null, sacrificeIds: [only.id] })).toThrow(/last living/)
  })

  it('refuses a mid-promotion sacrifice', () => {
    const keeper = makeHero('keeper')
    const busy = makeHero('busy', { promotion: { completesAtWorld: 999 } })
    const state = accountWith([keeper, busy])
    expect(() => synthesize(state, { mode: 'salvage', survivorId: null, sacrificeIds: [busy.id] })).toThrow(/mid-promotion/)
  })

  it('refuses survivor == sacrifice, and transfer with no survivor', () => {
    const a = makeHero('a'); const b = makeHero('b')
    const state = accountWith([a, b])
    expect(() => synthesize(state, { mode: 'transfer', survivorId: a.id, sacrificeIds: [a.id] })).toThrow()
    expect(() => synthesize(state, { mode: 'transfer', survivorId: null, sacrificeIds: [b.id] })).toThrow()
  })

  it('canSynthesize mirrors the guards without throwing', () => {
    const a = makeHero('a'); const b = makeHero('b')
    const state = accountWith([a, b])
    expect(canSynthesize(state, { mode: 'salvage', survivorId: null, sacrificeIds: [b.id] })).toBe(true)
    expect(canSynthesize(state, { mode: 'salvage', survivorId: null, sacrificeIds: [] })).toBe(false)
  })
})

describe('party cleanup', () => {
  it('nulls a sacrificed hero out of the party slots', () => {
    const a = makeHero('a'); const b = makeHero('b')
    const base = accountWith([a, b])
    const state = { ...base, party: { ...base.party, slots: ['b', null, null, null, null] as (HeroId | null)[] } }
    const after = synthesize(state, { mode: 'salvage', survivorId: null, sacrificeIds: [b.id] })
    expect(after.party.slots[0]).toBeNull()
  })
})

describe('synthesisPreview', () => {
  it('reports doomed heroes, grade deltas, and Sanity costs without mutating', () => {
    const surv = makeHero('surv', { growthGrades: { str: 2, agi: 2, vit: 2, int: 2, wil: 2 } })
    const sac = makeHero('sac', { growthGrades: { str: 9, agi: 9, vit: 9, int: 9, wil: 9 } })
    const state = accountWith([surv, sac])
    const before = JSON.stringify(state)
    const p = synthesisPreview(state, { mode: 'transfer', survivorId: surv.id, sacrificeIds: [sac.id] })
    expect(p.doomed).toEqual([{ id: 'sac', name: 'Hero sac' }])
    expect(p.gradeDeltas.str).toBe(1)
    expect(p.survivorSanityCost).toBe(S.survivorSanityCost)
    expect(p.witnessSanityCost).toBe(S.witnessSanityCost)
    expect(JSON.stringify(state)).toBe(before) // pure: no mutation
  })
})

describe('multi-sacrifice accumulation', () => {
  it('transfer charges survivor Sanity once per sacrifice and accumulates grade nudges', () => {
    const surv = makeHero('surv', { growthGrades: { str: 1, agi: 1, vit: 1, int: 1, wil: 1 } })
    const s1 = makeHero('s1', { growthGrades: { str: 9, agi: 1, vit: 1, int: 1, wil: 1 } })
    const s2 = makeHero('s2', { growthGrades: { str: 9, agi: 1, vit: 1, int: 1, wil: 1 } })
    const state = accountWith([surv, s1, s2])
    const after = synthesize(state, { mode: 'transfer', survivorId: surv.id, sacrificeIds: [s1.id, s2.id] })
    // Two sacrifices, each +1 to str (upward-only, re-evaluated): 1 → 2 → 3.
    expect(after.heroes['surv' as HeroId]!.growthGrades.str).toBe(3)
    expect(after.heroes['surv' as HeroId]!.sanity).toBe(100 - 2 * S.survivorSanityCost)
    expect(after.heroes['s1' as HeroId]!.alive).toBe(false)
    expect(after.heroes['s2' as HeroId]!.alive).toBe(false)
  })

  it('salvage sums material yield across multiple sacrifices', () => {
    const keeper = makeHero('keeper')
    const a = makeHero('a', { star: 4, element: 'fire' })
    const b = makeHero('b', { star: 4, element: 'fire' })
    const state = accountWith([keeper, a, b])
    const after = synthesize(state, { mode: 'salvage', survivorId: null, sacrificeIds: [a.id, b.id] })
    expect(after.materials['promotionStone']).toBe(2 * S.salvageYield[4]!.promotionStone)
    expect(after.materials['attrStone_fire']).toBe(2 * S.salvageYield[4]!.attrStone)
  })
})

describe('Sanity clamping', () => {
  it('clamps the witness hit at 0 (never negative)', () => {
    const surv = makeHero('surv')
    const sac = makeHero('sac')
    const frail = makeHero('frail', { sanity: 2 }) // witness cost (5) would push below 0
    const state = accountWith([surv, sac, frail])
    const after = synthesize(state, { mode: 'transfer', survivorId: surv.id, sacrificeIds: [sac.id] })
    expect(after.heroes['frail' as HeroId]!.sanity).toBe(0)
  })

  it('preview reports the clamped survivor cost, matching apply', () => {
    const surv = makeHero('surv', { sanity: 20, growthGrades: { str: 1, agi: 1, vit: 1, int: 1, wil: 1 } })
    const s1 = makeHero('s1'); const s2 = makeHero('s2')
    const state = accountWith([surv, s1, s2])
    const input: SynthesisInput = { mode: 'transfer', survivorId: surv.id, sacrificeIds: [s1.id, s2.id] }
    const p = synthesisPreview(state, input)
    const after = synthesize(state, input)
    const actualLost = surv.sanity - after.heroes['surv' as HeroId]!.sanity
    expect(p.survivorSanityCost).toBe(actualLost) // 20 → 5 → 0, so 20 lost, not 30
  })
})

describe('salvage preview + no-survivor', () => {
  it('previews salvage material yield and a null rescue with no survivor', () => {
    const keeper = makeHero('keeper')
    const sac = makeHero('sac', { star: 5, element: 'water' })
    const state = accountWith([keeper, sac])
    const p = synthesisPreview(state, { mode: 'salvage', survivorId: null, sacrificeIds: [sac.id] })
    expect(p.materialYield['promotionStone']).toBe(S.salvageYield[5]!.promotionStone)
    expect(p.materialYield['attrStone_water']).toBe(S.salvageYield[5]!.attrStone)
    expect(p.rescue).toBeNull()
    expect(p.skillCopyChance).toBe(0)
    expect(p.survivorSanityCost).toBe(0)
  })

  it('salvage with no survivor leaves the keeper untouched and renders materials', () => {
    const keeper = makeHero('keeper')
    const sac = makeHero('sac', { star: 3 })
    const state = accountWith([keeper, sac])
    const after = synthesize(state, { mode: 'salvage', survivorId: null, sacrificeIds: [sac.id] })
    expect(after.heroes['keeper' as HeroId]!.skills).toEqual(keeper.skills)
    expect((after.materials['promotionStone'] ?? 0)).toBeGreaterThan(0)
  })
})

describe('guards — duplicates + unknown', () => {
  it('throws on a duplicate sacrifice', () => {
    const a = makeHero('a'); const b = makeHero('b')
    const state = accountWith([a, b])
    expect(() => synthesize(state, { mode: 'salvage', survivorId: null, sacrificeIds: [b.id, b.id] })).toThrow()
  })

  it('throws on an unknown sacrifice id', () => {
    const a = makeHero('a'); const b = makeHero('b')
    const state = accountWith([a, b])
    expect(() => synthesize(state, { mode: 'salvage', survivorId: null, sacrificeIds: ['ghost' as HeroId] })).toThrow()
  })
})
