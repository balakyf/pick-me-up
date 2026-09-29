/**
 * Layer 3 §3.5 — Daily Dungeons: the primary, targeted material faucet.
 *
 * A rotating combat encounter reached from a lobby portal (not a leveled facility).
 * It reuses the seeded combat sim, enemy templates, and mission primitives. Each
 * world-day rotates the dungeon + its reward (Mon Gold, Tue Attribute Stones, Wed
 * Promotion Stones, Thu hero XP, Fri gems, Sat material bundle, Sun reduced mix).
 *
 * IMPORTANT — Daily Dungeons are NON-LETHAL. The whole-game permadeath ledger has
 * exactly three sources (Tower, Synthesis, PvP); a daily wipe is just a failed run
 * (no reward), never a death and never a Sanity hit. Combat only gates the loot.
 *
 * Everything here is PURE and DETERMINISTIC. The encounter + battle are seeded by
 * (accountSeed, 'daily', dayIndex, attemptsUsed); the wall clock enters only via the
 * caller-supplied nowWorld.
 */

import { TUNING } from '../tuning'
import { buildFillerEncounter } from '../tower'
import { buildCombatUnit } from '../unit'
import { runBattle } from '../combat'
import { SKILLS } from '../content'
import { applyXp } from '../stats'
import { foldBattleSkills } from '../skills'
import { hash, rngFor } from '../rng/rng'
import type {
  GameState,
  OwnedHero,
  HeroId,
  Line,
  CombatUnit,
  Encounter,
  BattleResult,
  MaterialId,
  Element,
  SkillProgress,
} from '../types'

const D = TUNING.lobby.daily
const WORLD_DAY_MS = 24 * 3_600_000

/** Rewards a daily win can grant. Folded into account + survivor state on a clear. */
export interface DailyReward {
  gold?: number
  gems?: number
  /** Granted to each deployed survivor via applyXp. */
  heroXp?: number
  materials?: Record<MaterialId, number>
}

export interface DailyDungeon {
  id: string
  name: string
  weekday: string
}

export interface DailyResult {
  dayIndex: number
  dungeon: DailyDungeon
  cleared: boolean
  /** True when this attempt was paid for with gems (beyond the free allotment). */
  paid: boolean
  rewards: DailyReward
  /** Skill level-ups and merges earned by the survivors this run. */
  skillProgress: SkillProgress[]
  result: BattleResult
}

/** The world-day index for a world-time (one world-day = 24 world-hours). */
export function worldDayIndex(nowWorld: number): number {
  return Math.floor(nowWorld / WORLD_DAY_MS)
}

const ROTATION: DailyDungeon[] = [
  { id: 'goldVault', name: 'Gold Vault', weekday: 'Mon' },
  { id: 'elementalTrial', name: 'Elemental Trial', weekday: 'Tue' },
  { id: 'promotionGrounds', name: 'Promotion Grounds', weekday: 'Wed' },
  { id: 'provingHall', name: 'Proving Hall', weekday: 'Thu' },
  { id: 'soulforge', name: 'Soulforge', weekday: 'Fri' },
  { id: 'armory', name: 'Armory', weekday: 'Sat' },
  { id: 'convergence', name: 'Convergence', weekday: 'Sun' },
]

/** Today's dungeon for a world-day index (7-day rotation). */
export function dailyDungeonFor(dayIndex: number): DailyDungeon {
  return ROTATION[((dayIndex % 7) + 7) % 7]!
}

/** The element the Elemental Trial rewards on a given day (rotates by day). */
function trialElement(dayIndex: number): Element {
  const r = D.elementRotation
  return r[((dayIndex % r.length) + r.length) % r.length]! as Element
}

/** The win reward for a world-day index (deterministic per weekday). */
export function dailyReward(dayIndex: number): DailyReward {
  const R = D.rewards
  switch (dailyDungeonFor(dayIndex).id) {
    case 'goldVault':
      return { gold: R.goldVault }
    case 'elementalTrial':
      return { materials: { [`attrStone_${trialElement(dayIndex)}`]: R.attrStones } }
    case 'promotionGrounds':
      return { materials: { promotionStone: R.promotionStones, rankMaterial: R.rankMaterials } }
    case 'provingHall':
      return { heroXp: R.heroXp }
    case 'soulforge':
      return { gems: R.gemsBundle }
    case 'armory':
      return { materials: { promotionStone: R.armoryStones, [`attrStone_${trialElement(dayIndex)}`]: R.armoryStones } }
    case 'convergence':
    default:
      return { gold: R.convergenceGold, materials: { promotionStone: R.convergenceStones } }
  }
}

/** Light tower-progress gate: dailies open once the unlock floor is cleared. */
export function dailyUnlocked(state: GameState): boolean {
  return state.tower.highestCleared >= D.unlockHighestCleared
}

/** Free attempts remaining today (0 once the free allotment is spent). */
export function dailyAttemptsLeft(state: GameState): number {
  return Math.max(0, D.freeAttempts - state.dailies.attemptsUsed)
}

/** The floor whose power budget the daily fight uses (scales with tower progress). */
function dailyFloor(state: GameState): number {
  return Math.max(1, state.tower.highestCleared)
}

/**
 * Run today's Daily Dungeon once. PURE — returns a fresh GameState + DailyResult.
 *
 * Gates on the tower-progress unlock and attempt budget (free, then gem-paid). Builds
 * the party from alive, non-broken-down slots, runs a seeded battle reusing the tower
 * filler generator, and on a WIN folds the weekday reward into the account (and hero
 * XP into deployed survivors; survivors also auto-learn skills from their casts). NON-LETHAL: fallen heroes are not killed and Sanity is
 * untouched. Always consumes the attempt. Throws when locked or unaffordable.
 */
export function attemptDaily(state: GameState, nowWorld: number): { state: GameState; result: DailyResult } {
  if (!dailyUnlocked(state)) {
    throw new Error(`attemptDaily: locked (clear floor ${D.unlockHighestCleared} first)`)
  }

  const paid = state.dailies.attemptsUsed >= D.freeAttempts
  if (paid && state.gems < D.extraAttemptGemCost) {
    throw new Error(`attemptDaily: no free attempts left and insufficient gems for a refill`)
  }

  const dayIndex = worldDayIndex(nowWorld)
  const attempt = state.dailies.attemptsUsed

  // Build the deployed party (skip empty slots, the dead, and the broken-down).
  const heroUnits: CombatUnit[] = []
  const deployedIds: HeroId[] = []
  const { slots, lines } = state.party
  for (let s = 0; s < slots.length; s++) {
    const heroId = slots[s]
    if (heroId === null || heroId === undefined) continue
    const hero = state.heroes[heroId]
    // A hero in a Training Center drill is in the yard, not the party.
    if (hero === undefined || !hero.alive || hero.sanity <= 0 || hero.training !== null) continue
    heroUnits.push(buildCombatUnit(hero, lines[s] ?? 'front', SKILLS, state.inventory))
    deployedIds.push(heroId)
  }
  if (heroUnits.length === 0) throw new Error('attemptDaily: no deployable heroes')

  // Seeded encounter + battle (reuses the tower filler power-budget generator).
  const worldMult = TUNING.tower.worldMult[state.worldGrade]
  const floor = dailyFloor(state)
  const built = buildFillerEncounter(floor, worldMult, rngFor(state.seed, 'daily', dayIndex, attempt))
  const enc: Encounter = { floor, mission: built.mission, waves: built.waves, encounterContext: 'tower' }
  const res = runBattle(heroUnits, enc, hash(state.seed, 'daily', dayIndex, attempt))

  const cleared = res.outcome === 'win'
  const rewards = cleared ? dailyReward(dayIndex) : {}

  // ── Fold rewards into the account (NON-LETHAL: no permadeath, no Sanity change). ──
  const survivorSet = new Set<string>(res.survivorHeroIds as string[])
  const heroes = { ...state.heroes }
  const skillProgress: SkillProgress[] = []
  for (const id of deployedIds) {
    if (!survivorSet.has(id as string)) continue
    const h = heroes[id]!
    // Survivors auto-learn from their casts win or lose (Layer 1 §2.4); XP only on a win.
    const learned = foldBattleSkills(id, h.skills, res.skillCasts[id as string])
    skillProgress.push(...learned.progress)
    const xp = cleared && rewards.heroXp ? applyXp(h.xp, rewards.heroXp, h.star) : h.xp
    heroes[id] = { ...h, xp, skills: learned.skills }
  }

  const materials: Record<MaterialId, number> = { ...state.materials }
  for (const id of Object.keys(rewards.materials ?? {})) {
    materials[id] = (materials[id] ?? 0) + rewards.materials![id]!
  }

  const nextState: GameState = {
    ...state,
    gold: state.gold + (rewards.gold ?? 0),
    gems: state.gems - (paid ? D.extraAttemptGemCost : 0) + (rewards.gems ?? 0),
    materials,
    heroes,
    dailies: { ...state.dailies, attemptsUsed: state.dailies.attemptsUsed + 1 },
  }

  return {
    state: nextState,
    result: { dayIndex, dungeon: dailyDungeonFor(dayIndex), cleared, paid, rewards, skillProgress, result: res },
  }
}
