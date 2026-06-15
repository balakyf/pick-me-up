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
    let sanity = survivor.sanity
    for (let i = 0; i < sacrifices.length; i++) sanity = Math.max(0, sanity - S.survivorSanityCost)
    survivorSanityCost = survivor.sanity - sanity
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
      if (r.applied) survivorSanityCost = Math.min(S.survivorSanityCost, survivor.sanity)
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
