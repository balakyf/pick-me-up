/**
 * Reliving (lane O): "Memories of the Tower". A cleared anchor (or a floor that hid a truth)
 * can be relived as a memory, at a chosen difficulty — dimmer than it was ('faded'), as it
 * was ('true'), or more vivid than the Master remembers ('vivid'). It is named apart from
 * the weekly Echo Trial on purpose (lane A): the trial is a gauntlet of echoes; this is one
 * floor, remembered.
 *
 * - Nobody dies in a memory (the battle fields pristine copies at full Sanity; the replay is
 *   non-lethal), but reliving the worst day of their lives costs each hero some Sanity.
 * - A truth missed on the floor (lane C's hidden objectives) can be recovered there, at
 *   'true' or 'vivid' — and a recovered truth counts toward Subverting F90. It pays a share
 *   of its first reward; the clear itself pays a small share of the floor's gold.
 * - A few memories a world-week.
 *
 * PURE and DETERMINISTIC: the battle's seed is hash(seed, 'relive', floor, week, used).
 */
import type { CombatLog, GameState, HeroId, HiddenObjective, MaterialId, OwnedHero, ReliveDifficulty } from '../types'
import { TUNING } from '../tuning'
import { ANCHORS, HIDDEN_OBJECTIVES, SKILLS } from '../content'
import { buildCombatUnit } from '../unit'
import { runBattle } from '../combat'
import { buildEncounter, hiddenObjectivesMet } from '../tower/tower'
import { woundBoss } from '../minigames'
import { addMasterXp } from '../master'
import { clampSanity } from '../kitchen'
import { hash } from '../rng/rng'
import { applyPartyBonuses } from '../challenge/bonds'
import { distinct, lineFor } from '../challenge/challenge'
import { worldWeekOf } from '../challenge/raid'
import { canEnterTrial } from '../challenge/weekly'
import { endgameOf, scaleWaves } from './endgame'
import { ENDGAME } from './tuning'

const R = ENDGAME.relive

export const RELIVE_DIFFICULTIES: readonly ReliveDifficulty[] = ['faded', 'true', 'vivid']

/** Every floor that holds a memory: the anchors and the floors that hid a truth, below the
 *  world's end (the Herald is not a memory; it is a wound). */
export const RELIVE_FLOORS: readonly number[] = [
  ...new Set([...Object.keys(ANCHORS).map(Number), ...HIDDEN_OBJECTIVES.map((h) => h.floor)]),
]
  .filter((f) => f < TUNING.tower.worldEndFloor)
  .sort((a, b) => a - b)

/** The memories the Master can relive now (cleared, in floor order). */
export function relivableFloors(state: Pick<GameState, 'tower'>): number[] {
  return RELIVE_FLOORS.filter((f) => f <= state.tower.highestCleared)
}

/** The truths missed on cleared floors (in floor order), optionally on one floor. */
export function missedTruths(state: Pick<GameState, 'tower'>, floor?: number): HiddenObjective[] {
  const found = new Set(state.tower.hiddenFound)
  return HIDDEN_OBJECTIVES.filter(
    (h) => h.floor <= state.tower.highestCleared && h.floor < TUNING.tower.worldEndFloor && !found.has(h.id) && (floor === undefined || h.floor === floor),
  )
}

/** This world-week's memories: which week it is and how many were spent. */
export function reliveFor(state: GameState, nowWorld: number): { week: number; used: number } {
  const r = endgameOf(state).relive
  const week = worldWeekOf(nowWorld)
  return r && r.week === week ? { ...r } : { week, used: 0 }
}

export function reliveAttemptsLeft(state: GameState, nowWorld: number): number {
  return Math.max(0, R.attemptsPerWeek - reliveFor(state, nowWorld).used)
}

/** Why this memory can't be relived now, or null. English; the UI translates. */
export function reliveRefusal(
  state: GameState,
  floor: number,
  difficulty: ReliveDifficulty,
  heroIds: readonly HeroId[],
  nowWorld: number,
): string | null {
  if (!RELIVE_FLOORS.includes(floor)) return `F${floor} holds no memory to relive.`
  if (floor > state.tower.highestCleared) return `F${floor} has not been cleared yet.`
  if (!RELIVE_DIFFICULTIES.includes(difficulty)) return 'Choose how the memory comes back.'
  if (reliveAttemptsLeft(state, nowWorld) <= 0) return 'No memories left this week.'
  if (heroIds.length === 0) return 'Pick at least one hero.'
  if (heroIds.length > TUNING.account.partySize) return `At most ${TUNING.account.partySize} heroes remember together.`
  if (distinct(heroIds).length !== heroIds.length) return 'A hero can only enter once.'
  for (const id of heroIds) if (!canEnterTrial(state.heroes[id], state)) return 'Everyone must be alive and at home.'
  return null
}

export interface ReliveOutcome {
  floor: number
  difficulty: ReliveDifficulty
  won: boolean
  gold: number
  gems: number
  materials: Record<MaterialId, number>
  /** Truths recovered (ids). */
  truths: string[]
  /** Sanity each hero paid. */
  sanityCost: number
  log: CombatLog
}

/**
 * Relive one memory. The real roster fights nothing (the memory fields copies at full
 * Sanity) and nobody dies; each hero pays `sanityCost`. A win at 'true' or 'vivid' recovers
 * the floor's missed truths. PURE.
 */
export function relive(
  state: GameState,
  floor: number,
  difficulty: ReliveDifficulty,
  heroIds: readonly HeroId[],
  nowWorld: number,
): { state: GameState; outcome: ReliveOutcome } {
  const refusal = reliveRefusal(state, floor, difficulty, heroIds, nowWorld)
  if (refusal !== null) throw new Error(`relive: ${refusal}`)
  const cur = reliveFor(state, nowWorld)
  const diff = R.difficulties[difficulty]

  // The floor as it was (the account's own encounter), at the memory's strength.
  let enc = buildEncounter(state, floor)
  enc = { ...scaleWaves(enc, diff.power), label: 'relive' }
  // The ballista's anchors: the Master's tracked aim breaks the scales, as in the climb.
  if (ANCHORS[floor]?.minigame === 'ballista') {
    const bossTag = enc.mission.objectives.find((o) => o.kind === 'defeat' || o.kind === 'acquire') as { targetTag: string } | undefined
    enc = {
      ...enc,
      waves: enc.waves.map((w) => ({ units: w.units.map((u) => (bossTag && u.targetTag === bossTag.targetTag ? woundBoss(u, state.meta.skill.ballista) : u)) })),
    }
  }
  const units = applyPartyBonuses(
    heroIds.map((id) => {
      const copy: OwnedHero = { ...state.heroes[id]!, sanity: TUNING.lobby.sanityMax }
      return buildCombatUnit(copy, lineFor(copy), SKILLS, state.inventory)
    }),
    state,
    { blessing: false },
  )
  const res = runBattle(units, enc, hash(state.seed, 'relive', floor, cur.week, cur.used))
  const won = res.outcome === 'win'

  const worldMult = TUNING.tower.worldMult[state.worldGrade]
  const gold0 = won ? Math.round(TUNING.economy.goldPerFloor * floor * worldMult * diff.gold) : 0
  const found = won && diff.truths ? hiddenObjectivesMet(floor, res, state.tower.hiddenFound) : []
  let gold = gold0
  let gems = 0
  const materials: Record<MaterialId, number> = {}
  for (const h of found) {
    gold += Math.round((h.reward.gold ?? 0) * R.truthShare)
    gems += Math.round((h.reward.gems ?? 0) * R.truthShare)
    for (const [id, n] of Object.entries(h.reward.materials ?? {})) {
      const got = Math.round(n * R.truthShare)
      if (got > 0) materials[id] = (materials[id] ?? 0) + got
    }
  }
  const nextMaterials = { ...state.materials }
  for (const [id, n] of Object.entries(materials)) nextMaterials[id] = (nextMaterials[id] ?? 0) + n

  // Reliving it costs each of them a little of themselves.
  const heroes = { ...state.heroes }
  for (const id of heroIds) {
    const h = heroes[id]!
    heroes[id] = { ...h, sanity: clampSanity(h.sanity - R.sanityCost) }
  }

  const ids = found.map((h) => h.id)
  const eg = endgameOf(state)
  const masterXp = won ? R.masterXp + found.length * TUNING.lobby.master.xpPerHiddenObjective : 0
  const next: GameState = {
    ...state,
    gold: state.gold + gold,
    gems: state.gems + gems,
    materials: nextMaterials,
    heroes,
    tower: ids.length > 0 ? { ...state.tower, hiddenFound: [...state.tower.hiddenFound, ...ids].sort() } : state.tower,
    meta: masterXp > 0 ? addMasterXp(state.meta, masterXp) : state.meta,
    endgame: {
      ...eg,
      relive: { week: cur.week, used: cur.used + 1 },
      ...(ids.length > 0 ? { recovered: [...(eg.recovered ?? []), ...ids].sort() } : {}),
    },
  }
  return {
    state: next,
    outcome: { floor, difficulty, won, gold, gems, materials, truths: ids, sanityCost: R.sanityCost, log: res.log },
  }
}
