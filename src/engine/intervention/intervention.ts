/**
 * Intervention Points (Layer 3 §D2) — active and per-hero. A hero earns IP as its rank
 * (promotions) and its bond with the Master (reaching Devoted, then Bonded) deepen; only
 * a Devoted+ hero will spend them, through its own agency, to bend the system:
 *
 *   reveal     — show the hint of the next hidden objective not yet found
 *   peek       — show the current floor's boss weaknesses
 *   nudge      — the next Normal summon rolls its star twice and keeps the better
 *   guarantee  — the hero's first strike in its next tower battle lands ×2
 *
 * Hard rule (Layer 0/2 anchor): no intervention revives the dead or undoes permadeath.
 * PURE and DETERMINISTIC.
 */

import type { GameState, HeroId, InterventionId, OwnedHero } from '../types'
import { TUNING } from '../tuning'
import { HIDDEN_OBJECTIVES } from '../content'
import { favorTier } from '../favor'

const IV = TUNING.intervention

export const INTERVENTIONS: readonly InterventionId[] = ['reveal', 'peek', 'nudge', 'guarantee']

export const INTERVENTION_LABEL: Record<InterventionId, string> = {
  reveal: 'Reveal a hidden objective',
  peek: 'Peek at a weakness',
  nudge: 'Nudge probability',
  guarantee: 'Guarantee an action',
}

export function interventionCost(action: InterventionId): number {
  return IV.cost[action]!
}

/** The next hidden objective neither found nor already revealed (tower order), one on a
 *  floor still ahead first: a truth whose floor is behind (an older save past a truth added
 *  later) is revealed only when nothing ahead is left. */
export function nextUnrevealedHidden(state: GameState): string | null {
  const found = new Set([...state.tower.hiddenFound, ...state.meta.revealedHidden])
  const open = HIDDEN_OBJECTIVES.filter((h) => !found.has(h.id))
  return (open.find((h) => h.floor > state.tower.highestCleared) ?? open[0])?.id ?? null
}

/** Why a hero can't intervene this way now, or null when it can. */
export function interventionRefusal(state: GameState, heroId: HeroId, action: InterventionId): string | null {
  const hero: OwnedHero | undefined = state.heroes[heroId]
  if (!hero || !hero.alive) return 'Only the living can intervene.'
  if (favorTier(hero.favor) < IV.minTier) return 'Only a Devoted hero will bend the system for you.'
  if (hero.ip < interventionCost(action)) return 'Not enough Intervention Points.'
  switch (action) {
    case 'reveal':
      return nextUnrevealedHidden(state) === null ? 'No hidden objective is left to reveal.' : null
    case 'peek':
      return state.meta.peekedFloors.includes(state.tower.currentFloor) ? 'This floor is already laid bare.' : null
    case 'nudge':
      return state.meta.nudge ? 'Probability is already nudged.' : null
    case 'guarantee':
      return hero.blessed ? 'This hero is already blessed.' : null
  }
}

/** Spend a hero's IP on an intervention. Throws when refused. PURE. */
export function intervene(state: GameState, heroId: HeroId, action: InterventionId): GameState {
  const refusal = interventionRefusal(state, heroId, action)
  if (refusal !== null) throw new Error(`intervene: ${refusal}`)
  const hero = state.heroes[heroId]!
  let next: GameState = {
    ...state,
    heroes: { ...state.heroes, [heroId]: { ...hero, ip: hero.ip - interventionCost(action) } },
  }
  switch (action) {
    case 'reveal':
      next = { ...next, meta: { ...next.meta, revealedHidden: [...next.meta.revealedHidden, nextUnrevealedHidden(state)!].sort() } }
      break
    case 'peek':
      next = { ...next, meta: { ...next.meta, peekedFloors: [...next.meta.peekedFloors, state.tower.currentFloor].sort((a, b) => a - b) } }
      break
    case 'nudge':
      next = { ...next, meta: { ...next.meta, nudge: true } }
      break
    case 'guarantee':
      next = { ...next, heroes: { ...next.heroes, [heroId]: { ...next.heroes[heroId]!, blessed: true } } }
      break
  }
  return next
}
