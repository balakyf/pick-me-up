/**
 * Floor modifiers (combat depth §3): from F40 some floors carry a condition — fog, a blood
 * moon, holy ground… — that bends the battle for both sides. Deterministic per account and
 * floor (the Wailing Wall uses its shared seed, like its enemies); never on anchors.
 * PURE — its own rng sub-stream, so no other draw moves.
 */
import type { Element, FloorModifierId, GameState, Seed } from '../types'
import { TUNING } from '../tuning'
import { ANCHORS, actForFloor } from '../content'
import { makeSeed, nextFloat, rngFor } from '../rng'
import { DEPTH } from './depthTuning'

const M = DEPTH.mods

/** Every modifier, in a stable order (the generator picks from this list). */
export const FLOOR_MODIFIERS: readonly FloorModifierId[] = ['fog', 'bloodMoon', 'holyGround', 'miasma', 'gale', 'frost']

/** The modifiers on `floor` for an account seed (0, 1 or — deeper — 2 of them). */
export function floorModifiers(seed: Seed, floor: number): FloorModifierId[] {
  if (floor < M.fromFloor || ANCHORS[floor] !== undefined) return []
  let r = rngFor(seed, 'floormods', floor)
  const roll = nextFloat(r)
  r = roll.rng
  const two = floor >= M.deepFrom ? M.oneChance * M.twoChance : 0
  const count = roll.value < two ? 2 : roll.value < M.oneChance ? 1 : 0
  const pool = [...FLOOR_MODIFIERS]
  const out: FloorModifierId[] = []
  for (let i = 0; i < count; i++) {
    const d = nextFloat(r)
    r = d.rng
    out.push(pool.splice(Math.floor(d.value * pool.length), 1)[0]!)
  }
  return out.sort((a, b) => FLOOR_MODIFIERS.indexOf(a) - FLOOR_MODIFIERS.indexOf(b))
}

/** The modifiers on `floor` for this account (the Wall is the same for every Master). */
export function floorModifiersFor(state: GameState, floor: number): FloorModifierId[] {
  const wall = actForFloor(floor).missions === 'wall'
  return floorModifiers(wall ? makeSeed(TUNING.tower.wallSeed) : state.seed, floor)
}

// ── What each modifier does to a battle (combat reads these; the UI explains them) ──

/** Extra miss chance on every blow. */
export function modMiss(mods: readonly FloorModifierId[]): number {
  return mods.includes('fog') ? M.fogMiss : 0
}

/** Damage multiplier for a blow of `el` by a unit on `side`. */
export function modDamageMult(mods: readonly FloorModifierId[], el: Element, side: 'hero' | 'enemy'): number {
  let m = 1
  if (mods.includes('bloodMoon') && side === 'enemy') m *= 1 + M.bloodMoonDamage
  if (mods.includes('holyGround')) {
    if (el === 'light') m *= 1 + M.holyGround
    else if (el === 'dark') m *= 1 - M.holyGround
  }
  if (mods.includes('frost')) {
    if (el === 'fire') m *= 1 - M.frost
    else if (el === 'water') m *= 1 + M.frost
  }
  return m
}

/** Healing multiplier. */
export function modHealMult(mods: readonly FloorModifierId[]): number {
  return mods.includes('miasma') ? M.miasmaHeal : 1
}

/** A unit's gauge fill per tick. */
export function modSpeed(mods: readonly FloorModifierId[], spd: number): number {
  return mods.includes('gale') ? Math.round(spd * M.galeSpeed) : spd
}

/** The tick an enrage timer fires. */
export function modEnrageTick(mods: readonly FloorModifierId[], afterTick: number): number {
  return mods.includes('bloodMoon') ? Math.floor(afterTick * M.bloodMoonEnrage) : afterTick
}
