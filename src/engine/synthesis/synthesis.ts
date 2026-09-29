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
 * Skill copy (Transfer) picks one missing skill, then rolls THAT skill's grade odds —
 * higher-grade skills are harder to carry over. Bound (achievement) skills never copy.
 * A 7★ survivor transfers at η 0.25 (the canon "absorption" engine, §4.3). Salvage may
 * name what it rescues (a skill or a grade); without a choice the automatic rule runs.
 *
 * PURE + DETERMINISTIC. The only randomness is the Transfer skill-copy, seeded by
 * (accountSeed, 'synthesis', survivorId, sacrificeId). Hero IDs are never reused,
 * so each (survivor, sacrifice) pair is a unique, replayable stream. No Date.now /
 * Math.random — the determinism guard stays green.
 */
import { TUNING } from '../tuning'
import { rngFor, chance, pick } from '../rng'
import { attrStoneId } from '../promotion'
import { SKILLS } from '../content'
import { withFavor } from '../favor'
import type { GameState, OwnedHero, HeroId, MaterialId, GrowthGrades, RescueChoice } from '../types'

const S = TUNING.lobby.synthesis
const GRADE_MAX = 10
const ATTR_KEYS = ['str', 'agi', 'vit', 'int', 'wil'] as const

export interface SynthesisInput {
  mode: 'transfer' | 'salvage'
  /** Transfer: required nudge target. Salvage: optional rescue target (null = pure render). */
  survivorId: HeroId | null
  sacrificeIds: HeroId[]
  /** Salvage: the player's rescue pick; omitted = the automatic rule. */
  rescue?: RescueChoice
}

export interface SynthesisPreview {
  mode: 'transfer' | 'salvage'
  /** Heroes that will permadie. */
  doomed: { id: HeroId; name: string }[]
  /** Transfer: per-attribute grade delta applied to the survivor. */
  gradeDeltas: Partial<Record<keyof GrowthGrades, number>>
  /** Transfer: each copyable skill and the chance it carries over (display odds). */
  skillCopyOdds: { skillId: string; chance: number }[]
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

/** Transfer efficiency η for a survivor (a 7★ absorbs far more). */
export function transferEfficiency(survivor: OwnedHero): number {
  return survivor.star >= 7 ? S.transferEfficiency7 : S.transferEfficiency
}

/** Chance a drawn skill of this id copies over (by its grade; unknown = the F rate). */
export function skillCopyChance(skillId: string): number {
  const grade = SKILLS[skillId]?.grade ?? 'F'
  return S.skillCopyChanceByGrade[grade] ?? 0
}

/** Skills a sacrifice could pass to the survivor: ones it lacks, never bound ones. */
function copyableSkills(survivor: OwnedHero, sac: OwnedHero): string[] {
  return sac.skills.map((s) => s.id).filter((id) => !hasSkill(survivor, id) && SKILLS[id]?.bound !== true)
}

/** Upward-only η-scaled grade nudge from a sacrifice's grades into the survivor's. Pure. */
function transferGrades(survivor: GrowthGrades, sac: GrowthGrades, eta: number = S.transferEfficiency): GrowthGrades {
  const out = { ...survivor }
  for (const k of ATTR_KEYS) {
    if (sac[k] > out[k]) {
      const bump = Math.ceil((sac[k] - out[k]) * eta)
      out[k] = Math.min(GRADE_MAX, out[k] + bump)
    }
  }
  return out
}

function hasSkill(hero: OwnedHero, id: string): boolean {
  return hero.skills.some((s) => s.id === id)
}

/** A transferred skill arrives fresh (Lv1): synthesis keeps <10% of a sacrifice. */
function withSkill(hero: OwnedHero, id: string): OwnedHero {
  return { ...hero, skills: [...hero.skills, { id, level: 1, xp: 0 }] }
}

/**
 * Optional Salvage rescue onto a survivor: prefer copying ONE missing skill; else
 * rescue the single best grade (highest attribute across the sacrifices), whole and
 * upward-only. Deterministic. Returns a fresh survivor + whether anything applied.
 */
function applyRescue(
  survivor: OwnedHero,
  sacrifices: OwnedHero[],
  choice?: RescueChoice,
): { survivor: OwnedHero; applied: boolean; desc: string | null } {
  if (choice !== undefined) {
    if (choice.kind === 'skill') {
      return { survivor: withSkill(survivor, choice.skillId), applied: true, desc: `skill: ${choice.skillId}` }
    }
    const best = Math.max(...sacrifices.map((s) => s.growthGrades[choice.attr]))
    const growthGrades = { ...survivor.growthGrades, [choice.attr]: Math.min(GRADE_MAX, best) }
    return { survivor: { ...survivor, growthGrades }, applied: true, desc: `grade: ${choice.attr}` }
  }
  for (const sac of sacrifices) {
    for (const id of copyableSkills(survivor, sac)) {
      return { survivor: withSkill(survivor, id), applied: true, desc: `skill: ${id}` }
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
    if (h.expedition) throw new Error(`synthesize: ${id} is away in the Ruins`)
    if (h.captiveOf) throw new Error(`synthesize: ${id} is held captive`)
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
  if (input.rescue !== undefined) {
    if (input.mode !== 'salvage' || survivor === null) throw new Error('synthesize: a rescue needs a salvage survivor')
    const r = input.rescue
    if (r.kind === 'skill') {
      if (!sacrifices.some((sac) => copyableSkills(survivor!, sac).includes(r.skillId))) {
        throw new Error(`synthesize: no sacrifice can pass on ${r.skillId}`)
      }
    } else if (!sacrifices.some((sac) => sac.growthGrades[r.attr] > survivor!.growthGrades[r.attr])) {
      throw new Error(`synthesize: no sacrifice has a better ${r.attr} grade`)
    }
  }
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
    ? { ...survivor, growthGrades: { ...survivor.growthGrades }, skills: survivor.skills.map((s) => ({ ...s })) }
    : null

  if (input.mode === 'transfer') {
    const eta = transferEfficiency(surv!)
    for (const sac of sacrifices) {
      surv!.growthGrades = transferGrades(surv!.growthGrades, sac.growthGrades, eta)
      const missing = copyableSkills(surv!, sac)
      if (missing.length > 0) {
        // Draw the candidate first, then roll its grade's odds.
        const drew = pick(rngFor(state.seed, 'synthesis', surv!.id, sac.id), missing)
        const roll = chance(drew.rng, skillCopyChance(drew.value))
        if (roll.value) surv = withSkill(surv!, drew.value)
      }
      surv!.sanity = Math.max(0, surv!.sanity - S.survivorSanityCost)
    }
  } else {
    for (const sac of sacrifices) {
      const y = salvageYield(sac)
      for (const id of Object.keys(y)) materials[id] = (materials[id] ?? 0) + y[id]!
    }
    if (surv) {
      const r = applyRescue(surv, sacrifices, input.rescue)
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
    // The roster witnesses the loss: Sanity and Favorability both fall (Layer 1 §4.1).
    heroes[h.id] = withFavor({ ...h, sanity: Math.max(0, h.sanity - S.witnessSanityCost) }, h.favor - TUNING.favor.witnessLoss)
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

  const skillCopyOdds: { skillId: string; chance: number }[] = []
  if (input.mode === 'transfer' && survivor) {
    let g = { ...survivor.growthGrades }
    const eta = transferEfficiency(survivor)
    for (const sac of sacrifices) g = transferGrades(g, sac.growthGrades, eta)
    // Per-skill odds across sacrifices: 1 − Π(1 − p_i), p_i = gradeOdds / candidates_i.
    const miss = new Map<string, number>()
    for (const sac of sacrifices) {
      const cands = copyableSkills(survivor, sac)
      for (const id of cands) miss.set(id, (miss.get(id) ?? 1) * (1 - skillCopyChance(id) / cands.length))
    }
    for (const [skillId, m] of miss) skillCopyOdds.push({ skillId, chance: Math.round((1 - m) * 1000) / 1000 })
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
        { ...survivor, growthGrades: { ...survivor.growthGrades }, skills: survivor.skills.map((s) => ({ ...s })) },
        sacrifices,
        input.rescue,
      )
      rescue = r.desc
      if (r.applied) survivorSanityCost = Math.min(S.survivorSanityCost, survivor.sanity)
    }
  }

  return {
    mode: input.mode,
    doomed: sacrifices.map((h) => ({ id: h.id, name: h.name })),
    gradeDeltas,
    skillCopyOdds,
    materialYield,
    rescue,
    survivorSanityCost,
    witnessSanityCost: S.witnessSanityCost,
  }
}

/** Everything a Salvage survivor could rescue from these sacrifices (for the UI picker). */
export function rescueOptions(state: GameState, survivorId: HeroId, sacrificeIds: HeroId[]): RescueChoice[] {
  const survivor = state.heroes[survivorId]
  if (survivor === undefined) return []
  const sacs = sacrificeIds.map((id) => state.heroes[id]).filter((h): h is OwnedHero => h !== undefined && h.alive)
  const out: RescueChoice[] = []
  const seen = new Set<string>()
  for (const sac of sacs) {
    for (const id of copyableSkills(survivor, sac)) {
      if (!seen.has(id)) {
        seen.add(id)
        out.push({ kind: 'skill', skillId: id })
      }
    }
  }
  for (const k of ATTR_KEYS) {
    if (sacs.some((sac) => sac.growthGrades[k] > survivor.growthGrades[k])) out.push({ kind: 'grade', attr: k })
  }
  return out
}
