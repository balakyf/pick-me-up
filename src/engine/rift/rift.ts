/**
 * The Crack of Time and Space (canon: Master Lv 20+) and the Ruins beyond it.
 *
 * Opening the crack is a large one-time investment (canon "tons of materials … a 4★
 * Magician-class hero"): Master Lv 20, enough Probability Interference, a living 4★+
 * mage, gold and stones. Once open, the Master sends small teams on Ruins expeditions —
 * a world-time timer after which they return with gems (canon: the Ruins yield gems)
 * and sometimes rare stones. Heroes away on an expedition can't deploy, train or be
 * promoted. The open crack also exposes the lobby to invasions (Layer 4).
 *
 * PURE and DETERMINISTIC: the return roll is rngFor(seed, 'ruins', heroId, completesAt).
 */

import type { GameState, HeroId, MaterialId, OwnedHero } from '../types'
import { TUNING } from '../tuning'
import { piUnlocked } from '../interference'
import { rngFor, chance } from '../rng'
import { combatPowerForHero } from '../stats'
import { worldDayIndex } from '../daily'

const R = TUNING.rift

/** Why the crack can't be opened now, or null. */
export function crackRefusal(state: GameState): string | null {
  if (state.meta.crackOpen) return 'The crack is already open.'
  if (state.meta.masterLevel < R.masterLevel) return `Opens at Master Lv ${R.masterLevel}.`
  if (!piUnlocked(state, 'crack')) return `The world's Probability Interference is too weak (needs ${TUNING.interference.unlock.crack}).`
  const mage = (Object.values(state.heroes) as OwnedHero[]).some((h) => h.alive && h.heroClass === 'mage' && h.star >= R.mageStar)
  if (!mage) return `Needs a living ${R.mageStar}★+ mage to hold the gate open.`
  if (state.gold < R.gold) return `Needs ${R.gold.toLocaleString()} gold.`
  if ((state.materials.promotionStone ?? 0) < R.stones) return `Needs ${R.stones} Promotion Stones.`
  return null
}

/** Open the Crack of Time and Space. Throws when refused. PURE. The invasion clock
 *  starts today — no backlog of raids for the days before the crack existed. */
export function openCrack(state: GameState, nowWorld = 0): GameState {
  const refusal = crackRefusal(state)
  if (refusal !== null) throw new Error(`openCrack: ${refusal}`)
  return {
    ...state,
    gold: state.gold - R.gold,
    materials: { ...state.materials, promotionStone: (state.materials.promotionStone ?? 0) - R.stones },
    meta: { ...state.meta, crackOpen: true },
    pvp: { ...state.pvp, lastInvasionDay: worldDayIndex(nowWorld), shieldUntil: nowWorld + TUNING.pvp.shieldMs },
  }
}

/** Is a hero free to leave on an expedition? */
function busy(h: OwnedHero): string | null {
  if (!h.alive) return 'has fallen'
  if (h.promotion !== null) return 'is being promoted'
  if (h.training !== null) return 'is training'
  if (h.expedition !== null) return 'is already away'
  if (h.captiveOf) return 'is held captive'
  return null
}

/** Why a team can't be dispatched now, or null. */
export function dispatchRefusal(state: GameState, heroIds: readonly HeroId[]): string | null {
  if (!state.meta.crackOpen) return 'The Crack of Time and Space is closed.'
  if (heroIds.length < 1 || heroIds.length > R.maxTeam) return `Send 1–${R.maxTeam} heroes.`
  if (new Set(heroIds).size !== heroIds.length) return 'Each hero can go once.'
  for (const id of heroIds) {
    const h = state.heroes[id]
    if (!h) return 'Unknown hero.'
    const why = busy(h)
    if (why) return `${h.name} ${why}.`
  }
  return null
}

/** Send heroes into the Ruins until `nowWorld + expeditionMs`. Throws when refused. PURE. */
export function dispatchRuins(state: GameState, heroIds: readonly HeroId[], nowWorld: number): GameState {
  const refusal = dispatchRefusal(state, heroIds)
  if (refusal !== null) throw new Error(`dispatchRuins: ${refusal}`)
  const heroes = { ...state.heroes }
  for (const id of heroIds) heroes[id] = { ...heroes[id]!, expedition: { completesAtWorld: nowWorld + R.expeditionMs } }
  return { ...state, heroes }
}

/** What a returning hero brings back (deterministic in seed, hero, return time). */
export function expeditionHaul(hero: OwnedHero, seed: GameState['seed']): { gems: number; materials: Record<MaterialId, number> } {
  const at = hero.expedition?.completesAtWorld ?? 0
  const cp = combatPowerForHero(hero, hero.xp.level)
  const gems = R.gemsBase + Math.round((cp / 1000) * R.gemsPerKCp)
  const rare = chance(rngFor(seed, 'ruins', hero.id, at), R.rareChance).value
  return { gems, materials: rare ? { promotionStone: R.rareStones } : {} }
}
