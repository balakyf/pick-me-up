# Synthesis (Layer 1 §4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Synthesis subsystem — destroy heroes to either transfer traits to a survivor (Transfer) or render them into promotion materials with an optional trait rescue (Salvage) — as a pure engine module, a `SYNTHESIZE` command, and a closed-door, Master-Level-gated Synthesis Chamber in the lobby.

**Architecture:** A new pure module `src/engine/synthesis/synthesis.ts` mirroring `promotion/` (pure, command-driven, seeded). No new `GameState` fields — it reuses per-hero `sanity`, the `materials` map, the `alive: false` permadeath convention, and party `slots`. The ONLY randomness in the whole system is the 25% transfer skill-copy (seeded via `rngFor`); salvage and rescue are fully deterministic, so the determinism guard stays green. The UI follows the existing `DailyPortal` pattern (a standalone panel, not a `Room`, since `Room` is typed to `FacilityId`).

**Tech Stack:** TypeScript (strict), Vitest, the existing `src/engine/<domain>/` module pattern, `tuning.ts` for all constants, the `__guards/determinism` test, React + jsdom smoke tests.

---

## File Structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `src/engine/tuning.ts` | Modify | add the `synthesis` constant block inside `lobby` |
| `src/engine/synthesis/synthesis.ts` | Create | pure engine: `SynthesisInput`/`SynthesisPreview` types, `synthesisUnlocked`, `canSynthesize`, `synthesisPreview`, `synthesize`, + helpers |
| `src/engine/synthesis/index.ts` | Create | re-export the module surface |
| `src/engine/synthesis/synthesis.test.ts` | Create | unit tests: transfer math, salvage yield, rescue, guards, Sanity costs, determinism |
| `src/engine/types.ts` | Modify | add the `SYNTHESIZE` command to the `Command` union |
| `src/engine/store/store.ts` | Modify | import `synthesize`; add the `SYNTHESIZE` case to `reduce` |
| `src/engine/store/store.test.ts` | Modify | add a `SYNTHESIZE` dispatch test |
| `src/ui/LobbyScreen.tsx` | Modify | add the `SynthesisChamber` panel + render it in the scene |
| `src/ui/app.smoke.test.tsx` | Modify | add a smoke test for the chamber (locked + unlocked render) |

---

## Task 1: The synthesis engine module (tuning + pure logic + unit tests)

This is the heart of the slice and lands fully green on its own — it does NOT touch the `Command` union or the store (the module takes a local `SynthesisInput`, not a `Command`), so there is no exhaustiveness coupling yet.

**Files:**
- Modify: `src/engine/tuning.ts`
- Create: `src/engine/synthesis/synthesis.ts`, `src/engine/synthesis/index.ts`
- Test: `src/engine/synthesis/synthesis.test.ts`

- [ ] **Step 1: Add the tuning block** (`src/engine/tuning.ts`)

Inside the `lobby:` block, immediately AFTER the `promotion: { … }` block and BEFORE `materialDrops:`, add:

```ts
    /** Synthesis: the second permadeath path (Layer 1 §4). Pure; instant (no timer). */
    synthesis: {
      /** Master Level that unlocks the Synthesis Chamber. */
      unlockMasterLevel: 3,
      /** Transfer efficiency η — the upward-only grade-nudge magnitude (canon ≈10%). */
      transferEfficiency: 0.1,
      /** Per-sacrifice chance (Transfer) to copy one skill the survivor lacks. */
      skillCopyChance: 0.25,
      /** Sanity drained from the survivor per sacrifice (Transfer) or per rescue (Salvage). */
      survivorSanityCost: 15,
      /** Sanity hit to each OTHER living hero — the roster witnesses the loss. */
      witnessSanityCost: 5,
      /** Salvage render payout by sacrificed star: a lossy fraction of reach-cost. */
      salvageYield: {
        1: { promotionStone: 1, attrStone: 0 },
        2: { promotionStone: 1, attrStone: 0 },
        3: { promotionStone: 6, attrStone: 3 },
        4: { promotionStone: 14, attrStone: 7 },
        5: { promotionStone: 30, attrStone: 15 },
        6: { promotionStone: 62, attrStone: 31 },
      } as Record<number, { promotionStone: number; attrStone: number }>,
    },
```

- [ ] **Step 2: Write the failing unit tests** (`src/engine/synthesis/synthesis.test.ts`)

```ts
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
    const g = after.heroes['surv']!.growthGrades
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
    expect(after.heroes['sac']!.alive).toBe(false)
    expect(after.heroes['surv']!.sanity).toBe(100 - S.survivorSanityCost)
    expect(after.heroes['w']!.sanity).toBe(100 - S.witnessSanityCost)
  })

  it('skill copy is seeded + deterministic (same seed → same outcome)', () => {
    const surv = makeHero('surv', { skillIds: [] })
    const sac = makeHero('sac', { skillIds: ['power_strike', 'piercing_thrust'] })
    const state = accountWith([surv, sac])
    const a = synthesize(state, { mode: 'transfer', survivorId: surv.id, sacrificeIds: [sac.id] })
    const b = synthesize(state, { mode: 'transfer', survivorId: surv.id, sacrificeIds: [sac.id] })
    expect(a.heroes['surv']!.skillIds).toEqual(b.heroes['surv']!.skillIds)
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
    expect(after.heroes['sac']!.alive).toBe(false)
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
    expect(after.heroes['surv']!.skillIds).toContain('piercing_thrust')
    // Rescue charges the survivor Sanity once.
    expect(after.heroes['surv']!.sanity).toBe(100 - S.survivorSanityCost)
  })

  it('rescues the best grade (upward-only) when the survivor already knows every skill', () => {
    const surv = makeHero('surv', { skillIds: ['power_strike'], growthGrades: { str: 2, agi: 2, vit: 2, int: 2, wil: 2 } })
    const sac = makeHero('sac', { skillIds: ['power_strike'], growthGrades: { str: 9, agi: 1, vit: 1, int: 1, wil: 1 } })
    const state = accountWith([surv, sac])
    const after = synthesize(state, { mode: 'salvage', survivorId: surv.id, sacrificeIds: [sac.id] })
    expect(after.heroes['surv']!.growthGrades.str).toBe(9) // best grade rescued whole
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/engine/synthesis/synthesis.test.ts`
Expected: FAIL — module `./synthesis` does not exist yet.

- [ ] **Step 4: Create the module** (`src/engine/synthesis/synthesis.ts`)

```ts
/**
 * Layer 1 §4 — Synthesis: the second of the game's three permadeath paths.
 *
 * Drag heroes into the Synthesis Chamber; all but one are permanently destroyed
 * (alive=false, never deleted — same tombstone convention as tower death). Two
 * modes:
 *   ① Transfer — nudge a survivor's growth grades UPWARD by η (≈10%) and maybe
 *      copy one skill. Deliberately strictly worse than Promotion for power — the
 *      "trap good Masters avoid."
 *   ② Salvage — render a doomed hero into promotion materials, optionally rescuing
 *      its single best grade OR one signature skill onto a survivor first.
 *
 * Costs: survivor Sanity per sacrifice/rescue; a witness Sanity hit to every other
 * living hero (Favorability is a Layer 3 system — we reuse the tower's witness
 * precedent). Instant: no world-time timer.
 *
 * PURE + DETERMINISTIC. The only randomness is the Transfer skill-copy, seeded by
 * (accountSeed, 'synthesis', survivorId, sacrificeId). Hero IDs are never reused,
 * so each (survivor, sacrifice) pair is a unique, replayable stream. No Date.now /
 * Math.random — the determinism guard stays green.
 */
import { TUNING } from '../tuning'
import { rngFor, chance, pick } from '../rng'
import { attrStoneId } from '../promotion'
import type { GameState, OwnedHero, HeroId, MaterialId, GrowthGrades } from '../types'

const S = TUNING.lobby.synthesis
const GRADE_MAX = 10
const ATTR_KEYS = ['str', 'agi', 'vit', 'int', 'wil'] as const

export interface SynthesisInput {
  mode: 'transfer' | 'salvage'
  /** Transfer: required nudge target. Salvage: optional rescue target (null = pure render). */
  survivorId: HeroId | null
  sacrificeIds: HeroId[]
}

export interface SynthesisPreview {
  mode: 'transfer' | 'salvage'
  /** Heroes that will permadie. */
  doomed: { id: HeroId; name: string }[]
  /** Transfer: per-attribute grade delta applied to the survivor. */
  gradeDeltas: Partial<Record<keyof GrowthGrades, number>>
  /** Transfer: a-priori chance any single sacrifice copies a skill (display odds). */
  skillCopyChance: number
  /** Salvage: total materials rendered. */
  materialYield: Record<MaterialId, number>
  /** Salvage: one-line description of the optional rescue, or null. */
  rescue: string | null
  /** Total Sanity the survivor will lose. */
  survivorSanityCost: number
  /** Sanity each OTHER living hero will lose. */
  witnessSanityCost: number
}

/** True when the account's Master Level has opened the Synthesis Chamber. */
export function synthesisUnlocked(state: GameState): boolean {
  return state.meta.masterLevel >= S.unlockMasterLevel
}

/** Salvage payout for a sacrificed hero, by its star (element-matched attr stones). */
export function salvageYield(hero: OwnedHero): Record<MaterialId, number> {
  const y = S.salvageYield[hero.star] ?? { promotionStone: 0, attrStone: 0 }
  const out: Record<MaterialId, number> = {}
  if (y.promotionStone > 0) out.promotionStone = y.promotionStone
  if (y.attrStone > 0) out[attrStoneId(hero.element)] = y.attrStone
  return out
}

/** Upward-only η-scaled grade nudge from a sacrifice's grades into the survivor's. Pure. */
function transferGrades(survivor: GrowthGrades, sac: GrowthGrades): GrowthGrades {
  const out = { ...survivor }
  for (const k of ATTR_KEYS) {
    if (sac[k] > out[k]) {
      const bump = Math.ceil((sac[k] - out[k]) * S.transferEfficiency)
      out[k] = Math.min(GRADE_MAX, out[k] + bump)
    }
  }
  return out
}

/**
 * Optional Salvage rescue onto a survivor: prefer copying ONE missing skill; else
 * rescue the single best grade (highest attribute across the sacrifices), whole and
 * upward-only. Deterministic. Returns a fresh survivor + whether anything applied.
 */
function applyRescue(
  survivor: OwnedHero,
  sacrifices: OwnedHero[],
): { survivor: OwnedHero; applied: boolean; desc: string | null } {
  for (const sac of sacrifices) {
    for (const sid of sac.skillIds) {
      if (!survivor.skillIds.includes(sid)) {
        return { survivor: { ...survivor, skillIds: [...survivor.skillIds, sid] }, applied: true, desc: `skill: ${sid}` }
      }
    }
  }
  let bestAttr: (typeof ATTR_KEYS)[number] | null = null
  let bestVal = -1
  for (const sac of sacrifices) {
    for (const k of ATTR_KEYS) {
      if (sac.growthGrades[k] > bestVal) { bestVal = sac.growthGrades[k]; bestAttr = k }
    }
  }
  if (bestAttr !== null && bestVal > survivor.growthGrades[bestAttr]) {
    const growthGrades = { ...survivor.growthGrades, [bestAttr]: Math.min(GRADE_MAX, bestVal) }
    return { survivor: { ...survivor, growthGrades }, applied: true, desc: `grade: ${bestAttr}` }
  }
  return { survivor, applied: false, desc: null }
}

/** Validate the command; throws on a closed gate. Returns the resolved heroes. */
function validate(state: GameState, input: SynthesisInput): { survivor: OwnedHero | null; sacrifices: OwnedHero[] } {
  if (!synthesisUnlocked(state)) {
    throw new Error(`synthesize: Synthesis Chamber locked until Master Lv ${S.unlockMasterLevel}`)
  }
  if (input.sacrificeIds.length === 0) throw new Error('synthesize: no sacrifices selected')
  if (new Set(input.sacrificeIds).size !== input.sacrificeIds.length) {
    throw new Error('synthesize: duplicate sacrifice')
  }
  const sacrifices: OwnedHero[] = []
  for (const id of input.sacrificeIds) {
    const h = state.heroes[id]
    if (h === undefined) throw new Error(`synthesize: unknown hero ${id}`)
    if (!h.alive) throw new Error(`synthesize: ${id} is not alive`)
    if (h.promotion !== null) throw new Error(`synthesize: ${id} is mid-promotion`)
    if (id === input.survivorId) throw new Error('synthesize: survivor cannot be a sacrifice')
    sacrifices.push(h)
  }
  let survivor: OwnedHero | null = null
  if (input.mode === 'transfer' && input.survivorId === null) {
    throw new Error('synthesize: transfer requires a survivor')
  }
  if (input.survivorId !== null) {
    const s = state.heroes[input.survivorId]
    if (s === undefined) throw new Error(`synthesize: unknown survivor ${input.survivorId}`)
    if (!s.alive) throw new Error(`synthesize: survivor ${input.survivorId} is not alive`)
    survivor = s
  }
  const sacSet = new Set(input.sacrificeIds)
  const survivingAfter = (Object.values(state.heroes) as OwnedHero[]).filter(
    (h) => h.alive && !sacSet.has(h.id),
  ).length
  if (survivingAfter < 1) throw new Error('synthesize: cannot destroy the last living hero')
  return { survivor, sacrifices }
}

/** Predicate form of the gate — for the UI to enable/disable, no throw. */
export function canSynthesize(state: GameState, input: SynthesisInput): boolean {
  try {
    validate(state, input)
    return true
  } catch {
    return false
  }
}

/** Apply a synthesis. Validates, then returns a fresh GameState. Throws on a closed gate. */
export function synthesize(state: GameState, input: SynthesisInput, _nowWorld = 0): GameState {
  const { survivor, sacrifices } = validate(state, input)

  const heroes: Record<HeroId, OwnedHero> = { ...state.heroes }
  const materials: Record<MaterialId, number> = { ...state.materials }
  let surv: OwnedHero | null = survivor
    ? { ...survivor, growthGrades: { ...survivor.growthGrades }, skillIds: [...survivor.skillIds] }
    : null

  if (input.mode === 'transfer') {
    for (const sac of sacrifices) {
      surv!.growthGrades = transferGrades(surv!.growthGrades, sac.growthGrades)
      const missing = sac.skillIds.filter((sid) => !surv!.skillIds.includes(sid))
      if (missing.length > 0) {
        const roll = chance(rngFor(state.seed, 'synthesis', surv!.id, sac.id), S.skillCopyChance)
        if (roll.value) {
          const drew = pick(roll.rng, missing)
          surv!.skillIds = [...surv!.skillIds, drew.value]
        }
      }
      surv!.sanity = Math.max(0, surv!.sanity - S.survivorSanityCost)
    }
  } else {
    for (const sac of sacrifices) {
      const y = salvageYield(sac)
      for (const id of Object.keys(y)) materials[id] = (materials[id] ?? 0) + y[id]!
    }
    if (surv) {
      const r = applyRescue(surv, sacrifices)
      surv = r.survivor
      if (r.applied) surv = { ...surv, sanity: Math.max(0, surv.sanity - S.survivorSanityCost) }
    }
  }

  if (surv) heroes[surv.id] = surv
  for (const sac of sacrifices) heroes[sac.id] = { ...heroes[sac.id]!, alive: false }

  // Witness Sanity hit: every other living hero (not the survivor, not the dead).
  const sacSet = new Set(input.sacrificeIds)
  for (const h of Object.values(heroes) as OwnedHero[]) {
    if (!h.alive) continue
    if (surv && h.id === surv.id) continue
    if (sacSet.has(h.id)) continue
    heroes[h.id] = { ...h, sanity: Math.max(0, h.sanity - S.witnessSanityCost) }
  }

  const slots = state.party.slots.map((id) => (id !== null && sacSet.has(id) ? null : id))

  return { ...state, heroes, materials, party: { ...state.party, slots } }
}

/** Side-effect-free preview for the UI. No RNG, no mutation. */
export function synthesisPreview(state: GameState, input: SynthesisInput): SynthesisPreview {
  const sacrifices = input.sacrificeIds
    .map((id) => state.heroes[id])
    .filter((h): h is OwnedHero => h !== undefined && h.alive)
  const survivor = input.survivorId ? state.heroes[input.survivorId] ?? null : null

  const gradeDeltas: Partial<Record<keyof GrowthGrades, number>> = {}
  const materialYield: Record<MaterialId, number> = {}
  let rescue: string | null = null
  let survivorSanityCost = 0

  if (input.mode === 'transfer' && survivor) {
    let g = { ...survivor.growthGrades }
    for (const sac of sacrifices) g = transferGrades(g, sac.growthGrades)
    for (const k of ATTR_KEYS) {
      const d = g[k] - survivor.growthGrades[k]
      if (d !== 0) gradeDeltas[k] = d
    }
    survivorSanityCost = sacrifices.length * S.survivorSanityCost
  } else if (input.mode === 'salvage') {
    for (const sac of sacrifices) {
      const y = salvageYield(sac)
      for (const id of Object.keys(y)) materialYield[id] = (materialYield[id] ?? 0) + y[id]!
    }
    if (survivor) {
      const r = applyRescue(
        { ...survivor, growthGrades: { ...survivor.growthGrades }, skillIds: [...survivor.skillIds] },
        sacrifices,
      )
      rescue = r.desc
      if (r.applied) survivorSanityCost = S.survivorSanityCost
    }
  }

  return {
    mode: input.mode,
    doomed: sacrifices.map((h) => ({ id: h.id, name: h.name })),
    gradeDeltas,
    skillCopyChance: input.mode === 'transfer' ? S.skillCopyChance : 0,
    materialYield,
    rescue,
    survivorSanityCost,
    witnessSanityCost: S.witnessSanityCost,
  }
}
```

- [ ] **Step 5: Create the barrel** (`src/engine/synthesis/index.ts`)

```ts
export {
  synthesize,
  synthesisPreview,
  canSynthesize,
  synthesisUnlocked,
  salvageYield,
  type SynthesisInput,
  type SynthesisPreview,
} from './synthesis'
```

- [ ] **Step 6: Run typecheck + the module tests**

Run: `npm run typecheck && npx vitest run src/engine/synthesis/synthesis.test.ts`
Expected: typecheck clean; all synthesis tests pass.

- [ ] **Step 7: Run the determinism guard**

Run: `npx vitest run src/engine/__guards/determinism.test.ts`
Expected: PASS — synthesis uses only `rngFor`/`chance`/`pick`/`Math.ceil`/`Math.min`/`Math.max`, no `Date.now`/`Math.random`.

- [ ] **Step 8: Commit**

```bash
git add src/engine/tuning.ts src/engine/synthesis
git commit -m "feat(synthesis): pure synthesis engine — transfer, salvage, rescue (Layer 1 §4)

Add the synthesis/ module: upward-only grade transfer (η), seeded 25%
skill copy, salvage render to promotion materials, optional best-trait
rescue, and the Sanity (survivor + witness) costs. No new GameState
fields; instant; determinism guard stays green.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Wire the `SYNTHESIZE` command into types + store

**Files:**
- Modify: `src/engine/types.ts`, `src/engine/store/store.ts`
- Test: `src/engine/store/store.test.ts`

- [ ] **Step 1: Write the failing store test** (append to `src/engine/store/store.test.ts`)

Add `synthesize` and `synthesisUnlocked` to the existing engine imports area is NOT needed — the test drives through `reduce`. Append this block:

```ts
describe('reduce — SYNTHESIZE', () => {
  /** Two-hero account at the synthesis unlock Master Level. */
  function synthState(): GameState {
    const base = createAccount(42)
    const [starter] = Object.values(base.heroes) as OwnedHero[]
    const second: OwnedHero = { ...starter!, id: 'h_second' as HeroId, name: 'Second' }
    return {
      ...base,
      heroes: { [starter!.id]: starter!, [second.id]: second },
      meta: { ...base.meta, masterLevel: TUNING.lobby.synthesis.unlockMasterLevel },
    }
  }

  it('salvage renders a sacrifice into materials and permadeaths it', () => {
    const state = synthState()
    const sacId = 'h_second' as HeroId
    const after = reduce(state, { type: 'SYNTHESIZE', mode: 'salvage', survivorId: null, sacrificeIds: [sacId] })
    expect(after.heroes[sacId]!.alive).toBe(false)
    expect((after.materials['promotionStone'] ?? 0)).toBeGreaterThan(0)
  })

  it('throws when the chamber is locked (Master Level too low)', () => {
    const locked = { ...synthState(), meta: { ...synthState().meta, masterLevel: 1 } }
    expect(() =>
      reduce(locked, { type: 'SYNTHESIZE', mode: 'salvage', survivorId: null, sacrificeIds: ['h_second' as HeroId] }),
    ).toThrow()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/engine/store/store.test.ts -t "SYNTHESIZE"`
Expected: FAIL — `reduce` has no `SYNTHESIZE` case (TS error: object literal not assignable to `Command`; or the exhaustiveness `never` check throws).

- [ ] **Step 3: Add the command to the `Command` union** (`src/engine/types.ts`)

After the `ATTEMPT_DAILY` line in the `Command` union, add:

```ts
  /** Synthesis (Layer 1 §4): destroy heroes to transfer traits or render materials. */
  | { type: 'SYNTHESIZE'; mode: 'transfer' | 'salvage'; survivorId: HeroId | null; sacrificeIds: HeroId[] }
```

- [ ] **Step 4: Wire it into `reduce`** (`src/engine/store/store.ts`)

Add the import alongside the other engine imports (after the `startPromotion`/`skipPromotion` import line):

```ts
import { synthesize } from '../synthesis'
```

Add the case to the `reduce` switch, immediately after the `ATTEMPT_DAILY` case and before the `ADD_GOLD` case:

```ts
    case 'SYNTHESIZE':
      return synthesize(current, cmd, nowWorld)
```

(`cmd` here is narrowed to the SYNTHESIZE variant; its `{ mode, survivorId, sacrificeIds }` shape satisfies `SynthesisInput` structurally.)

- [ ] **Step 5: Run typecheck + the full suite**

Run: `npm run typecheck && npm test`
Expected: typecheck clean; all tests green, including the new `reduce — SYNTHESIZE` tests and the determinism guard.

- [ ] **Step 6: Commit**

```bash
git add src/engine/types.ts src/engine/store/store.ts src/engine/store/store.test.ts
git commit -m "feat(synthesis): SYNTHESIZE command wired through reduce (Layer 1 §4)

Add the SYNTHESIZE command variant and its reduce case (advanceTime then
synthesize). Engine stays Date.now-free.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: The Synthesis Chamber lobby panel

Follows the existing `DailyPortal` pattern (a standalone panel rendered after the diorama — NOT a `Room`, which is typed to `FacilityId`). Closed-door, Master-Level-gated, with a mode toggle, survivor + sacrifice pickers, a live preview, and a destructive confirm.

**Files:**
- Modify: `src/ui/LobbyScreen.tsx`
- Test: `src/ui/app.smoke.test.tsx`

- [ ] **Step 1: Write the failing smoke test** (append a test inside the `describe('App smoke', …)` block in `src/ui/app.smoke.test.tsx`)

```ts
  it('the Synthesis Chamber renders, gated by Master Level', () => {
    mount()
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 2024, now: 0 })
    })
    // Chamber heading is always present…
    expect(container.textContent).toContain('Synthesis Chamber')
    // …but a fresh ML1 account sees it locked.
    expect(container.textContent).toContain('Unlocks at Master Lv 3')
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/ui/app.smoke.test.tsx -t "Synthesis Chamber"`
Expected: FAIL — "Synthesis Chamber" text is not in the DOM yet.

- [ ] **Step 3: Add imports** (`src/ui/LobbyScreen.tsx`)

Extend the existing type import to include `HeroId`, and add the synthesis import. Change:

```ts
import type { GameState, OwnedHero, FacilityId } from '../engine/types'
```
to:
```ts
import type { GameState, OwnedHero, FacilityId, HeroId } from '../engine/types'
```

Add, alongside the other engine imports near the top:

```ts
import { canSynthesize, synthesisPreview, synthesisUnlocked, type SynthesisInput } from '../engine/synthesis'
```

- [ ] **Step 4: Add the `SynthesisChamber` component** (`src/ui/LobbyScreen.tsx`)

Add this component immediately BEFORE the `export function LobbyScreen(...)` declaration:

```tsx
const SYN = TUNING.lobby.synthesis

/** A clickable hero chip used by the synthesis pickers. */
function HeroChip({
  hero,
  selected,
  onClick,
  label,
}: {
  hero: OwnedHero
  selected: boolean
  onClick: () => void
  label?: string
}) {
  return (
    <button
      type="button"
      className={`syn-chip ${selected ? 'sel' : ''}`}
      onClick={onClick}
      title={`${hero.name} · ${hero.star}★ · Sanity ${hero.sanity}`}
    >
      <Portrait hero={hero} size="sm" />
      <span className="syn-chip-name">{hero.name.split(/\s+/)[0]}</span>
      {label && <span className="muted"> {label}</span>}
    </button>
  )
}

/** The Synthesis Chamber — closed-door, ML-gated. Transfer or Salvage heroes. */
function SynthesisChamber({ state, store }: { state: GameState; store: Store }) {
  const [mode, setMode] = useState<'transfer' | 'salvage'>('salvage')
  const [survivorId, setSurvivorId] = useState<HeroId | null>(null)
  const [sacrificeIds, setSacrificeIds] = useState<HeroId[]>([])
  const [confirming, setConfirming] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const unlocked = synthesisUnlocked(state)
  const living = (Object.values(state.heroes) as OwnedHero[]).filter((h) => h.alive)

  if (!unlocked) {
    return (
      <div className="lobby-portal synth-portal locked">
        <div className="lp-head">
          <span className="lp-glyph">🧪</span>
          <span className="lp-name">Synthesis Chamber</span>
          <span className="muted">— the door stays shut</span>
        </div>
        <div className="lr-blurb">Unlocks at Master Lv {SYN.unlockMasterLevel}.</div>
      </div>
    )
  }

  const reset = () => { setSacrificeIds([]); setSurvivorId(null); setConfirming(false); setErr(null) }
  const toggleSac = (id: HeroId) => {
    setConfirming(false)
    setSacrificeIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  }
  const chooseSurvivor = (id: HeroId) => {
    setConfirming(false)
    setSurvivorId((cur) => (cur === id ? null : id))
    setSacrificeIds((cur) => cur.filter((x) => x !== id)) // a survivor can't also be a sacrifice
  }

  const input: SynthesisInput = { mode, survivorId, sacrificeIds }
  const valid = canSynthesize(state, input)
  const preview = valid ? synthesisPreview(state, input) : null

  function run() {
    setErr(null)
    try {
      store.dispatch({ type: 'SYNTHESIZE', mode, survivorId, sacrificeIds }, Date.now())
      reset()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Synthesis failed')
    }
  }

  const sacrificeable = living.filter((h) => h.id !== survivorId && h.promotion === null)

  return (
    <div className="lobby-portal synth-portal">
      <div className="lp-head">
        <span className="lp-glyph">🧪</span>
        <span className="lp-name">Synthesis Chamber</span>
        <span className="muted">— the Master can’t watch</span>
      </div>

      <div className="syn-modes">
        <button className={`btn sm ${mode === 'salvage' ? 'primary' : ''}`} onClick={() => { setMode('salvage'); setConfirming(false) }}>
          ♻ Salvage
        </button>
        <button className={`btn sm ${mode === 'transfer' ? 'primary' : ''}`} onClick={() => { setMode('transfer'); setConfirming(false) }}>
          ⇄ Transfer
        </button>
      </div>

      <div className="syn-section">
        <div className="syn-label">
          {mode === 'transfer' ? 'Survivor (required)' : 'Rescue onto (optional)'}
        </div>
        <div className="syn-row">
          {living.map((h) => (
            <HeroChip key={h.id} hero={h} selected={survivorId === h.id} onClick={() => chooseSurvivor(h.id)} />
          ))}
        </div>
      </div>

      <div className="syn-section">
        <div className="syn-label">Sacrifices (permanently destroyed)</div>
        <div className="syn-row">
          {sacrificeable.map((h) => (
            <HeroChip key={h.id} hero={h} selected={sacrificeIds.includes(h.id)} onClick={() => toggleSac(h.id)} />
          ))}
        </div>
      </div>

      {preview && (
        <div className="syn-preview">
          {mode === 'transfer' ? (
            <span>
              {Object.keys(preview.gradeDeltas).length > 0
                ? 'Grades ' + Object.entries(preview.gradeDeltas).map(([k, v]) => `${k} +${v}`).join(', ')
                : 'No grade gain'}
              {' · '}{Math.round(preview.skillCopyChance * 100)}% skill copy/sac
            </span>
          ) : (
            <span>
              Yields {Object.entries(preview.materialYield).map(([k, v]) => `${v} ${k.replace('attrStone_', '🔹').replace('promotionStone', '🪨')}`).join(', ') || '—'}
              {preview.rescue ? ` · rescue ${preview.rescue}` : ''}
            </span>
          )}
          <span className="muted"> · −{preview.survivorSanityCost} survivor / −{preview.witnessSanityCost} witness Sanity</span>
        </div>
      )}

      <div className="syn-actions">
        {!confirming ? (
          <button className="btn sm" disabled={!valid} onClick={() => setConfirming(true)}>
            {mode === 'transfer' ? '⇄ Synthesize' : '♻ Render'}
          </button>
        ) : (
          <>
            <button className="btn sm" style={{ background: 'var(--bad)' }} onClick={run}>
              Permanently destroy {sacrificeIds.length} hero{sacrificeIds.length === 1 ? '' : 'es'}
            </button>
            <button className="btn sm" onClick={() => setConfirming(false)}>Cancel</button>
          </>
        )}
      </div>
      {err && <div className="lr-action-note" style={{ color: 'var(--bad)' }}>{err}</div>}
    </div>
  )
}
```

- [ ] **Step 5: Render the chamber in the scene** (`src/ui/LobbyScreen.tsx`)

In the `LobbyScreen` return, immediately AFTER the `<DailyPortal state={state} store={store} />` line, add:

```tsx
      {/* Synthesis Chamber — a closed-door access point, not a leveled facility */}
      <SynthesisChamber state={state} store={store} />
```

- [ ] **Step 6: Add minimal styles** (`src/ui/ui.css`)

Append (reuses existing tokens; keeps the chip/grid local to synthesis):

```css
.synth-portal .syn-modes { display: flex; gap: 8px; margin: 8px 0; }
.synth-portal .syn-section { margin: 8px 0; }
.synth-portal .syn-label { font-size: 12px; color: var(--ink-faint); margin-bottom: 4px; }
.synth-portal .syn-row { display: flex; flex-wrap: wrap; gap: 6px; }
.syn-chip { display: flex; align-items: center; gap: 4px; padding: 2px 6px; border: 1px solid var(--line); border-radius: 6px; background: transparent; cursor: pointer; }
.syn-chip.sel { border-color: var(--accent-2); background: color-mix(in srgb, var(--accent-2) 18%, transparent); }
.syn-chip-name { font-size: 12px; }
.synth-portal .syn-preview { font-size: 12px; margin: 6px 0; }
.synth-portal .syn-actions { display: flex; gap: 8px; margin-top: 6px; }
.synth-portal.locked { opacity: 0.7; }
```

(If `--line` is not a defined token, reuse `var(--ink-faint)`; check the `:root` block in `ui.css` and match an existing border token.)

- [ ] **Step 7: Run the smoke test + the full suite**

Run: `npm run typecheck && npm test`
Expected: typecheck clean; all green, including the new "Synthesis Chamber renders, gated by Master Level" smoke test.

- [ ] **Step 8: Commit**

```bash
git add src/ui/LobbyScreen.tsx src/ui/app.smoke.test.tsx src/ui/ui.css
git commit -m "feat(synthesis): Synthesis Chamber lobby panel (Layer 1 §4)

Closed-door, Master-Level-gated panel (DailyPortal pattern): mode toggle,
survivor + sacrifice pickers, live preview, and a destructive 'permanently
destroy N heroes' confirm. Renders locked until ML unlock.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Done-When (acceptance)

- `npm run typecheck` clean; `npm test` all green (the prior suite + new synthesis/store/smoke tests + determinism guard).
- Both modes work end-to-end through `dispatch({ type: 'SYNTHESIZE', … })`: Transfer nudges grades upward + maybe copies a skill at Sanity cost; Salvage renders to promotion materials with an optional best-trait rescue.
- Sacrifices become `alive: false`, are removed from the party, and no path can destroy the last living hero.
- The Synthesis Chamber renders in the lobby, gated at Master Lv `unlockMasterLevel`, with a working preview and destructive confirm.
- No regression in gacha, promotion, tower, daily, or lobby flows.

## Self-review (done while writing)

- **Spec coverage:** Transfer (§3) → Task 1 grade math + seeded skill copy. Salvage (§4) → Task 1 render + rescue. Shared mechanics/guards (§5) → Task 1 validate + permadeath + party cleanup + witness cost. Tuning (§6) → Task 1 Step 1. UI (§7) → Task 3. Command surface (§2) → Task 2. Testing (§8) → tests in every task. Deferred ledger (§10) honored: no Soul-Stone material, no Favorability, flat skill-copy odds, 6★ ceiling untouched.
- **Type consistency:** `SynthesisInput` (`mode`/`survivorId`/`sacrificeIds`) is identical in the module, the `Command` variant, and the UI. `salvageYield` returns `Record<MaterialId, number>`; `attrStoneId` is imported from `promotion`. `synthesize(state, input, nowWorld?)` is called by `reduce` with `(current, cmd, nowWorld)`.
- **No placeholders:** every code step is complete; the one judgment call flagged for the engineer (the `--line` CSS token) names the exact fallback and where to check.
