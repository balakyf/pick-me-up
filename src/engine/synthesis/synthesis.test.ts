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
    skillIds: ['power_strike'],
    portraitToken: '#ffffff',
    origin: 'procedural',
    xp: { level: 7, xpIntoLevel: 0, heldXp: 0, atCap: false },
    alive: true,
    sanity: 100,
    promotion: null,
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
    const surv = makeHero('surv', { skillIds: [] })
    const sac = makeHero('sac', { skillIds: ['power_strike', 'piercing_thrust'] })
    const state = accountWith([surv, sac])
    const a = synthesize(state, { mode: 'transfer', survivorId: surv.id, sacrificeIds: [sac.id] })
    const b = synthesize(state, { mode: 'transfer', survivorId: surv.id, sacrificeIds: [sac.id] })
    expect(a.heroes['surv' as HeroId]!.skillIds).toEqual(b.heroes['surv' as HeroId]!.skillIds)
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
    const surv = makeHero('surv', { skillIds: [] })
    const sac = makeHero('sac', { skillIds: ['piercing_thrust'] })
    const state = accountWith([surv, sac])
    const after = synthesize(state, { mode: 'salvage', survivorId: surv.id, sacrificeIds: [sac.id] })
    expect(after.heroes['surv' as HeroId]!.skillIds).toContain('piercing_thrust')
    // Rescue charges the survivor Sanity once.
    expect(after.heroes['surv' as HeroId]!.sanity).toBe(100 - S.survivorSanityCost)
  })

  it('rescues the best grade (upward-only) when the survivor already knows every skill', () => {
    const surv = makeHero('surv', { skillIds: ['power_strike'], growthGrades: { str: 2, agi: 2, vit: 2, int: 2, wil: 2 } })
    const sac = makeHero('sac', { skillIds: ['power_strike'], growthGrades: { str: 9, agi: 1, vit: 1, int: 1, wil: 1 } })
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
