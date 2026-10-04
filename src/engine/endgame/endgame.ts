/**
 * The endgame (lane O): what the F90 decision leaves behind, and the cycle a world is.
 *
 * - `endgameOf(state)` is the defaulting reader (the `challengeOf` pattern): a save written
 *   before lane O has no `endgame` slice and reads as the first world, fate unsealed. No
 *   schema bump.
 * - `fateOf(state)`: 'ended' (F90 cleared plainly), 'saved' (F90 subverted) or null.
 * - The fate's consequences for the rest of the world: past F90 an ended world's foes are
 *   sated (`fateEncounter`) and its floors pay less (`fateGoldMult`); a saved world sends
 *   its tribute once (`sealFate`), and at the summit Tell cannot call back the Herald it
 *   refused. The lobby, Isel and the Priasis arc read `fateOf` too (the UI).
 * - `cycleMult(state)`: each New Cycle's world is harder (the tower's world multiplier).
 *
 * PURE and DETERMINISTIC: no randomness at all here.
 */
import type { CombatUnit, EndgameState, EnemyWave, GameState, WorldFate } from '../types'
import { TUNING } from '../tuning'
import { combatPower } from '../stats'
import { ENDGAME } from './tuning'

export function defaultEndgame(): EndgameState {
  return { cycle: 0, history: [], legends: [] }
}

/** The account's endgame slice with every field present (a save without it is the first
 *  world, its fate unsealed). */
export function endgameOf(state: Pick<GameState, 'endgame'>): EndgameState {
  const e = state.endgame
  if (!e) return defaultEndgame()
  return {
    cycle: Number.isInteger(e.cycle) && e.cycle > 0 ? e.cycle : 0,
    history: Array.isArray(e.history) ? e.history : [],
    legends: Array.isArray(e.legends) ? e.legends : [],
    ...(e.fate ? { fate: e.fate } : {}),
    ...(e.relive ? { relive: e.relive } : {}),
    ...(e.recovered ? { recovered: e.recovered } : {}),
  }
}

/** The world's fate, as F90 sealed it (null before the ninetieth floor is cleared). */
export function fateOf(state: Pick<GameState, 'tower'>): WorldFate | null {
  if (state.tower.worldSaved) return 'saved'
  if (state.tower.worldEnded) return 'ended'
  return null
}

/** The cycle this world is (0 = the first world). */
export function cycleOf(state: Pick<GameState, 'endgame'>): number {
  return endgameOf(state).cycle
}

/** The tower's extra world multiplier for this cycle: 1 in the first world, then
 *  1 + powerStep × cycle. */
export function cycleMult(state: Pick<GameState, 'endgame'>): number {
  return 1 + ENDGAME.cycle.powerStep * cycleOf(state)
}

/** Is this floor past the world's end (F91–100)? */
export function pastTheEnd(floor: number): boolean {
  return floor > TUNING.tower.worldEndFloor
}

/** The floor's clear gold × this, by the world's fate (an ended world pays less past F90). */
export function fateGoldMult(state: Pick<GameState, 'tower'>, floor: number): number {
  return pastTheEnd(floor) && fateOf(state) === 'ended' ? ENDGAME.fate.endedGoldMult : 1
}

/** A foe at `mult` of its strength: HP, attack and defence scaled, CP re-read. Speed,
 *  accuracy and the rest stay, so the fight's rhythm is the same. */
export function scaleFoe(u: CombatUnit, mult: number): CombatUnit {
  if (mult === 1) return u
  const s = u.stats
  const stats = {
    ...s,
    maxHP: Math.max(1, Math.round(s.maxHP * mult)),
    pAtk: Math.round(s.pAtk * mult),
    mAtk: Math.round(s.mAtk * mult),
    pDef: Math.round(s.pDef * mult),
    mDef: Math.round(s.mDef * mult),
  }
  return { ...u, stats, currentHP: stats.maxHP, cp: combatPower(stats) }
}

/** Scale every foe of a set of waves (and their reserves). */
export function scaleWaves<T extends { waves: EnemyWave[]; reserves?: Record<string, CombatUnit[]> }>(built: T, mult: number): T {
  if (mult === 1) return built
  const reserves = built.reserves
    ? Object.fromEntries(Object.entries(built.reserves).map(([k, us]) => [k, us.map((u) => scaleFoe(u, mult))]))
    : undefined
  return {
    ...built,
    waves: built.waves.map((w) => ({ units: w.units.map((u) => scaleFoe(u, mult)) })),
    ...(reserves ? { reserves } : {}),
  }
}

/** The template Tell cannot call back once the world was spared: the Herald was refused, not fed. */
export const REFUSED_ECHO = 'echo_herald'

/**
 * The floor as the world's fate leaves it. Before F90's clear, and on every floor up to it,
 * nothing changes. Past it:
 *  - ended: every foe is sated (× endedPowerMult);
 *  - saved: Tell's last draft calls back no Herald (its echo leaves her reserves).
 */
export function fateEncounter<T extends { waves: EnemyWave[]; reserves?: Record<string, CombatUnit[]> }>(
  state: Pick<GameState, 'tower'>,
  floor: number,
  built: T,
): T {
  if (!pastTheEnd(floor)) return built
  const fate = fateOf(state)
  if (fate === 'ended') return scaleWaves(built, ENDGAME.fate.endedPowerMult)
  if (fate === 'saved' && built.reserves) {
    const reserves = Object.fromEntries(
      Object.entries(built.reserves).map(([k, us]) => [k, us.filter((u) => u.templateId !== REFUSED_ECHO)]),
    )
    return { ...built, reserves }
  }
  return built
}

/**
 * Seal the fate on the attempt that cleared F90 (tower §6d): record it in the endgame slice
 * and, for a world that was spared, pay its tribute. `day` is the world-day; `truths` the
 * truths the Master knew. PURE.
 */
export function sealFate(state: GameState, fate: WorldFate, day: number): GameState {
  const eg = endgameOf(state)
  const tribute = fate === 'saved' ? ENDGAME.fate.savedTribute : { gems: 0, gold: 0 }
  return {
    ...state,
    gems: state.gems + tribute.gems,
    gold: state.gold + tribute.gold,
    endgame: { ...eg, fate: { kind: fate, day, truths: state.tower.hiddenFound.length } },
  }
}
