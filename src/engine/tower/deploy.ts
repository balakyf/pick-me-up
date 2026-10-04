/**
 * Deploy rails — the ONE answer to "who fights?" (safety rails before permadeath).
 *
 * Every place that sends heroes into a battle (the tower, the Daily Dungeon, the scout,
 * raids, side rooms, the tournament, PvP, the weekly trial) asks `fitToDeploy`, so a hero
 * the tower would leave home is never counted, suggested or sent anywhere else, and the
 * reason a hero stays behind is always the true one:
 *
 *   dead        — fallen (or no longer on the roster)
 *   captive     — held by a raiding Master
 *   expedition  — away in the Ruins
 *   promotion   — in the Promotion Chamber
 *   training    — in a Training Center drill
 *   bounty      — out on a bounty (the estate)
 *   burnout     — burnt out and still resting (the estate)
 *   exhausted   — Sanity 0: broken down, cannot deploy
 *   rebellion   — Wary and broken: refuses the Master's order (a seeded tower draw)
 *   disheartened — morale broken (lane L, life/morale.ts): grief and despair keep them home
 *
 * The rebellion draw is the tower's own: it is keyed on the current floor and attempt
 * (rngFor(seed, 'rebel', floor, attemptIndex, heroId)) and gated on a positive chance, so
 * it is already fixed before the Master presses Enter — what the report shows is exactly
 * what the attempt will do. Non-tower callers pass `{ rebellion: false }`.
 *
 * PURE and DETERMINISTIC.
 */
import { TUNING } from '../tuning'
import type { CombatUnit, DeployReason, GameState, HeroId, Line, OwnedHero } from '../types'
import { rebellionChance } from '../favor'
import { estateRefusal } from '../estate/deploy'
import { moraleBroken } from '../life/morale'
import { chance, rngFor } from '../rng/rng'

export type { DeployReason } from '../types'

export type DeployCheck = { ok: true } | { ok: false; reason: DeployReason }

export interface DeployOpts {
  /** Roll the tower's rebellion draw for a Wary, broken hero (default true). */
  rebellion?: boolean
}

/** Reasons a hero refuses the order themselves (as opposed to being away or unable). */
export const REFUSAL_REASONS: readonly DeployReason[] = ['rebellion', 'burnout', 'bounty', 'disheartened']

const OK: DeployCheck = { ok: true }
const no = (reason: DeployReason): DeployCheck => ({ ok: false, reason })

/**
 * The reasons that live on the hero alone (no account state needed): fallen, held, away,
 * in the chamber or the yard, or broken down at Sanity 0. Null = nothing on the hero
 * keeps them home.
 */
export function heroUnfitReason(hero: OwnedHero | undefined): DeployReason | null {
  if (!hero || !hero.alive) return 'dead'
  if (hero.captiveOf) return 'captive'
  if (hero.expedition) return 'expedition'
  if (hero.promotion) return 'promotion'
  if (hero.training) return 'training'
  if (hero.sanity <= 0) return 'exhausted'
  return null
}

/** Does this hero refuse the tower's order on this attempt (Wary and broken)? The draw is
 *  keyed on the current floor + attempt and gated on a positive chance. */
export function rebelsNow(state: GameState, hero: OwnedHero): boolean {
  const p = rebellionChance(hero)
  if (p <= 0) return false
  return chance(rngFor(state.seed, 'rebel', state.tower.currentFloor, state.tower.attemptIndex, hero.id), p).value
}

/**
 * Is this hero fit to be sent into a battle right now? `{ ok: true }` or the reason they
 * stay behind. The single source of truth for every deployment.
 */
export function fitToDeploy(state: GameState, hero: OwnedHero | undefined, opts: DeployOpts = {}): DeployCheck {
  const own = heroUnfitReason(hero)
  // A hero who has broken down (Sanity 0) but is also away/burnt out shows the estate's
  // reason first — that is the one the Master can act on.
  if (own !== null && own !== 'exhausted') return no(own)
  const estate = estateRefusal(state, hero!.id)
  if (estate !== null) return no(estate)
  if (own === 'exhausted') return no(own)
  if (moraleBroken(state, hero!.id)) return no('disheartened')
  if (opts.rebellion !== false && rebelsNow(state, hero!)) return no('rebellion')
  return OK
}

/** Predicate form (narrows to OwnedHero). */
export function canDeploy(state: GameState, hero: OwnedHero | undefined, opts: DeployOpts = {}): hero is OwnedHero {
  return fitToDeploy(state, hero, opts).ok
}

/** One party slot, as the Enter sheet sees it. */
export interface DeploySlot {
  slot: number
  heroId: HeroId | null
  line: Line
  /** Will this hero fight if the Master presses Enter now? */
  fit: boolean
  /** Why not ('empty' for an empty slot). */
  reason?: DeployReason | 'empty'
  sanity: number
  sanityMax: number
}

/**
 * The party as the next tower attempt would field it: one row per slot (length = party
 * size), in slot order. Pure — the UI's "are you sure?" sheet reads it before Enter.
 */
export function deployReport(state: GameState): DeploySlot[] {
  const max = TUNING.lobby.sanityMax
  return state.party.slots.map((id, slot) => {
    const line: Line = state.party.lines[slot] ?? 'front'
    if (id === null || id === undefined) return { slot, heroId: null, line, fit: false, reason: 'empty' as const, sanity: 0, sanityMax: max }
    const hero = state.heroes[id]
    const check = fitToDeploy(state, hero)
    const sanity = hero?.alive ? hero.sanity : 0
    return check.ok
      ? { slot, heroId: id, line, fit: true, sanity, sanityMax: max }
      : { slot, heroId: id, line, fit: false, reason: check.reason, sanity, sanityMax: max }
  })
}

/** How many of the party would fight right now. */
export function fitCount(state: GameState): number {
  return deployReport(state).filter((s) => s.fit).length
}

export interface DeployedParty<T> {
  /** The fielded units, in slot order. */
  units: T[]
  /** The heroes fielded, in slot order. */
  ids: HeroId[]
  /** Every slotted hero who stays behind, with the reason. */
  refusals: { heroId: HeroId; reason: DeployReason }[]
}

/**
 * Walk the party's slots and field everyone fit to deploy, building each unit with
 * `build` (slot order is kept). Empty slots are skipped silently.
 */
export function deployParty<T = CombatUnit>(
  state: GameState,
  build: (hero: OwnedHero, line: Line) => T,
  opts: DeployOpts = {},
  slots: readonly (HeroId | null)[] = state.party.slots,
  lines: readonly Line[] = state.party.lines,
): DeployedParty<T> {
  const units: T[] = []
  const ids: HeroId[] = []
  const refusals: { heroId: HeroId; reason: DeployReason }[] = []
  for (let s = 0; s < slots.length; s++) {
    const id = slots[s]
    if (id === null || id === undefined) continue
    const hero = state.heroes[id]
    const check = fitToDeploy(state, hero, opts)
    if (!check.ok) {
      refusals.push({ heroId: id, reason: check.reason })
      continue
    }
    units.push(build(hero!, lines[s] ?? 'front'))
    ids.push(id)
  }
  return { units, ids, refusals }
}
