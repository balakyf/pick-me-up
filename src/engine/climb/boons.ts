/**
 * Boons: pick 1 of 3 after an Elite or Boss clear; they last the Sortie (spec 2026-10-12
 * S14). Owner: WP3. Values live in `TUNING.climb.boonValues`.
 *
 * Three ways a Boon acts:
 *   - stat Boons (Shieldwall, Volley, Arcane Tide, Sanctuary, Underdog) scale the deployed
 *     hero units before battle (`applyBoonsToUnits`);
 *   - battle Boons (Iron Vow, Hunter's Mark, Second Wind) ride into `runBattle` as
 *     `BattleMods` (`boonBattleMods`) and never draw RNG;
 *   - the rest are read where they apply: Quartermaster by `ordersAllowed`, War Chest and
 *     Scholar's Lamp by the floor rewards, Calm Mind by the Sanity drain.
 *
 * Randomness: stream `rngFor(state.seed, 'boon', floor)` only.
 */
import { TUNING } from '../tuning'
import { combatPower } from '../stats'
import { rngFor, nextInt } from '../rng'
import type { BoonId, CombatUnit, DerivedStats, GameState } from '../types'
import type { BattleMods } from '../combat'

const CL = TUNING.climb
const BV = CL.boonValues

/** A Boon's display data; names and descriptions are English source strings for `t()`. */
export interface BoonDef {
  id: BoonId
  name: string
  description: string
}

/** Every Boon by id, in offer order. */
export const BOONS: Readonly<Record<BoonId, BoonDef>> = {
  ironVow: { id: 'ironVow', name: 'Iron Vow', description: 'A Protected hero takes 20% less damage.' },
  huntersMark: { id: 'huntersMark', name: 'Hunter’s Mark', description: 'The Focus target takes 15% more damage.' },
  secondWind: { id: 'secondWind', name: 'Second Wind', description: 'The first hero to drop below 25% HP heals 30%, once a battle.' },
  quartermaster: { id: 'quartermaster', name: 'Quartermaster', description: '+1 order per battle.' },
  warChest: { id: 'warChest', name: 'War Chest', description: '+25% floor gold.' },
  scholarsLamp: { id: 'scholarsLamp', name: 'Scholar’s Lamp', description: '+25% floor XP.' },
  shieldwall: { id: 'shieldwall', name: 'Shieldwall', description: 'Warriors get +10% physical and magic defence.' },
  volley: { id: 'volley', name: 'Volley', description: 'Archers get +10% speed.' },
  arcaneTide: { id: 'arcaneTide', name: 'Arcane Tide', description: 'Mages get +10% magic attack.' },
  sanctuary: { id: 'sanctuary', name: 'Sanctuary', description: 'Back-line heroes get +15% max HP.' },
  underdog: { id: 'underdog', name: 'Underdog', description: '1-2★ heroes get +12% to every stat.' },
  calmMind: { id: 'calmMind', name: 'Calm Mind', description: 'Floors drain 40% less Sanity.' },
}

/** Is `id` a known Boon? */
export function isBoon(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(BOONS, id)
}

/** The Boons the running Sortie carries (none on campus). */
export function sortieBoons(state: GameState): readonly BoonId[] {
  return state.tower.sortie?.boons ?? []
}

/** Does the running Sortie carry `id`? */
export function hasBoon(state: GameState, id: BoonId): boolean {
  return sortieBoons(state).includes(id)
}

/**
 * The Boon ids offered after clearing `floor`: `boons.offer` distinct Boons the Sortie
 * does not hold yet, drawn on the floor's own stream. None on campus (no Sortie) or once
 * the Sortie holds `boons.max`.
 */
export function boonOffer(state: GameState, floor: number): BoonId[] {
  const sortie = state.tower.sortie
  if (sortie === null || sortie.boons.length >= CL.boons.max) return []
  const pool = Object.keys(BOONS).filter((id) => !sortie.boons.includes(id))
  const out: BoonId[] = []
  let r = rngFor(state.seed, 'boon', floor)
  while (out.length < CL.boons.offer && pool.length > 0) {
    const d = nextInt(r, 0, pool.length - 1)
    r = d.rng
    out.push(pool.splice(d.value, 1)[0]!)
  }
  return out
}

/** The relative stat bonus the stat Boons give one deployed hero unit. */
export function boonStatPct(unit: CombatUnit, star: number, boons: readonly BoonId[]): Partial<Record<keyof DerivedStats, number>> {
  const pct: Partial<Record<keyof DerivedStats, number>> = {}
  const add = (k: keyof DerivedStats, v: number) => (pct[k] = (pct[k] ?? 0) + v)
  if (boons.includes('shieldwall') && unit.unitClass === 'warrior') (add('pDef', BV.shieldwall), add('mDef', BV.shieldwall))
  if (boons.includes('volley') && unit.unitClass === 'archer') add('spd', BV.volley)
  if (boons.includes('arcaneTide') && unit.unitClass === 'mage') add('mAtk', BV.arcaneTide)
  if (boons.includes('sanctuary') && unit.line === 'back') add('maxHP', BV.sanctuary)
  if (boons.includes('underdog') && star <= 2) for (const k of ['maxHP', 'pAtk', 'mAtk', 'pDef', 'mDef', 'spd'] as const) add(k, BV.underdog)
  return pct
}

/** Apply the Sortie's stat Boons to the deployed hero units, before battle. Each lifted
 *  stat is scaled and rounded, current HP follows max HP, and CP is re-derived from the
 *  new stats. Enemies and NPCs pass through. PURE (fresh units for the changed ones). */
export function applyBoonsToUnits(state: GameState, units: CombatUnit[], boons: readonly BoonId[]): CombatUnit[] {
  if (boons.length === 0) return units
  return units.map((u) => {
    if (u.side !== 'hero' || u.isNpc || u.sourceHeroId === undefined) return u
    const star = state.heroes[u.sourceHeroId]?.star ?? 7
    const pct = boonStatPct(u, star, boons)
    const keys = Object.keys(pct) as (keyof DerivedStats)[]
    if (keys.length === 0) return u
    const stats: DerivedStats = { ...u.stats }
    for (const k of keys) stats[k] = Math.round(stats[k] * (1 + pct[k]!))
    const cp = u.cp - combatPower(u.stats) + combatPower(stats)
    return { ...u, stats, currentHP: stats.maxHP, cp, keywords: [...u.keywords], skills: [...u.skills] }
  })
}

/** The in-battle effects of the Sortie's Boons. */
export function boonBattleMods(boons: readonly BoonId[]): BattleMods {
  const mods: BattleMods = {}
  if (boons.includes('ironVow')) mods.protectedReduction = BV.ironVow
  if (boons.includes('huntersMark')) mods.focusVulnerability = BV.huntersMark
  if (boons.includes('secondWind')) mods.secondWind = { below: BV.secondWind.below, heal: BV.secondWind.heal }
  return mods
}

/** Extra orders per battle the Boons grant (Quartermaster). */
export function boonOrders(boons: readonly BoonId[]): number {
  return boons.includes('quartermaster') ? BV.quartermaster : 0
}

/** Gold multiplier from the Boons (War Chest). */
export function boonGoldMult(boons: readonly BoonId[]): number {
  return boons.includes('warChest') ? 1 + BV.warChest : 1
}

/** XP multiplier from the Boons (Scholar's Lamp). */
export function boonXpMult(boons: readonly BoonId[]): number {
  return boons.includes('scholarsLamp') ? 1 + BV.scholarsLamp : 1
}

/** Sanity-drain multiplier from the Boons (Calm Mind). */
export function boonDrainMult(boons: readonly BoonId[]): number {
  return boons.includes('calmMind') ? 1 - BV.calmMind : 1
}
