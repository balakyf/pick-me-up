/**
 * Lane N — the loadout helpers behind the Armory and the hero sheet's Gear tab: how much an
 * item is worth, what changes between two items, the best free gear for a hero ("equip
 * best"), and which fallen hero last carried an item (gear inherited from the dead).
 *
 * An item's worth is the Combat Power of its stat block (the same weights `combatPower`
 * gives a hero, legacy EVA/ACC folded in), so "equip best" agrees with true CP: every
 * stat a piece of gear adds raises CP, and the multipliers applied after (passives,
 * engravings, favor, morale) scale every item alike, so the order never changes.
 *
 * PURE and DETERMINISTIC: no RNG, ties broken by id.
 */
import { combatPower } from '../stats'
import type { DerivedStats, EquipmentId, EquipmentItem, EquipmentSlot, FallenRecord, GameState, HeroId, OwnedHero } from '../types'
import { combatSubstats, equipItem, wieldable } from './equipment'

export const LOADOUT_SLOTS: readonly EquipmentSlot[] = ['weapon', 'armor', 'accessory']

/** The stats an item can add, in display order. */
export const ITEM_STAT_KEYS = ['maxHP', 'pAtk', 'mAtk', 'pDef', 'mDef', 'spd', 'critPct', 'statusRes'] as const
export type ItemStatKey = (typeof ITEM_STAT_KEYS)[number]

const ZERO: DerivedStats = { maxHP: 0, pAtk: 0, mAtk: 0, pDef: 0, mDef: 0, spd: 0, critPct: 0, evaPct: 0, accPct: 0, statusRes: 0 }

/** An item's stat block as combat reads it, every key present (legacy EVA/ACC folded). */
export function itemStats(item: Pick<EquipmentItem, 'statBonus'> | null): DerivedStats {
  if (item === null) return { ...ZERO }
  return { ...ZERO, ...combatSubstats(item.statBonus) }
}

/** What an item is worth: the Combat Power of the stats it adds (0 for an empty slot). */
export function itemScore(item: Pick<EquipmentItem, 'statBonus'> | null): number {
  return item === null ? 0 : combatPower(itemStats(item))
}

/** Side-by-side compare: what changes when `to` replaces `from` in a slot (either may be
 *  empty). Only the stats that move are listed, in display order; `cp` is the change in
 *  the item's worth (the hero's own CP moves by the same amount before multipliers). */
export function itemDelta(
  from: Pick<EquipmentItem, 'statBonus'> | null,
  to: Pick<EquipmentItem, 'statBonus'> | null,
): { stats: { key: ItemStatKey; from: number; to: number; delta: number }[]; cp: number } {
  const a = itemStats(from)
  const b = itemStats(to)
  const stats = ITEM_STAT_KEYS.filter((k) => a[k] !== b[k]).map((k) => ({ key: k, from: a[k], to: b[k], delta: b[k] - a[k] }))
  return { stats, cp: itemScore(to) - itemScore(from) }
}

/** May "equip best" pick this item for this hero? It must be wieldable (free, or already
 *  theirs, and not bound to another living hero), and a weapon must not change the hero's
 *  element — a foreign-element blade is the Master's call, never an automatic one. */
export function autoFits(state: GameState, item: EquipmentItem, hero: OwnedHero): boolean {
  if (!wieldable(state, item, hero.id)) return false
  if (item.slot === 'weapon' && item.element !== undefined && item.element !== hero.element) return false
  return true
}

/** One change "equip best" would make. */
export interface LoadoutChange {
  slot: EquipmentSlot
  from: EquipmentId | null
  to: EquipmentId
  /** The item-worth gain (positive). */
  gain: number
}

/** Ranking: worth first, then the hero's own bound blade, then what they already wear,
 *  then the lowest id (stable). */
function better(a: EquipmentItem, b: EquipmentItem, hero: OwnedHero): number {
  const d = itemScore(b) - itemScore(a)
  if (d !== 0) return d
  const own = Number(b.exclusiveTo === hero.id) - Number(a.exclusiveTo === hero.id)
  if (own !== 0) return own
  const worn = Number(hero.equipment[b.slot] === b.id) - Number(hero.equipment[a.slot] === a.id)
  if (worn !== 0) return worn
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** The best item this hero could wear in a slot right now (free or their own), or null. */
export function bestFor(state: GameState, hero: OwnedHero, slot: EquipmentSlot): EquipmentItem | null {
  const fits = state.inventory.filter((i) => i.slot === slot && autoFits(state, i, hero))
  return fits.sort((a, b) => better(a, b, hero))[0] ?? null
}

/**
 * What "equip best" would change for a hero: per slot, the best free item when it is
 * strictly worth more than what they wear (an empty slot takes anything). Never takes an
 * item from another living hero. [] when there is nothing better (or no such living hero).
 */
export function bestLoadout(state: GameState, heroId: HeroId): LoadoutChange[] {
  const hero = state.heroes[heroId]
  if (hero === undefined || !hero.alive) return []
  const byId = new Map(state.inventory.map((i) => [i.id, i]))
  const out: LoadoutChange[] = []
  for (const slot of LOADOUT_SLOTS) {
    const wornId = hero.equipment[slot]
    const worn = wornId !== null ? byId.get(wornId) ?? null : null
    const best = bestFor(state, hero, slot)
    if (best === null || best.id === wornId) continue
    const gain = itemScore(best) - itemScore(worn)
    if (worn !== null && gain <= 0) continue
    out.push({ slot, from: worn?.id ?? null, to: best.id, gain })
  }
  return out
}

/**
 * Equip the best free gear on a hero, every slot at once (the hero sheet's and the Armory's
 * one click; the bots use it). PURE. Throws on an unknown or fallen hero, or when nothing
 * better is free.
 */
export function equipBest(state: GameState, heroId: HeroId): GameState {
  const hero = state.heroes[heroId]
  if (hero === undefined) throw new Error(`equipBest: unknown hero ${heroId}`)
  if (!hero.alive) throw new Error(`equipBest: hero ${heroId} is not alive`)
  const changes = bestLoadout(state, heroId)
  if (changes.length === 0) throw new Error(`equipBest: nothing better to equip for ${heroId}`)
  let next = state
  for (const c of changes) next = equipItem(next, heroId, c.to)
  return next
}

/**
 * Gear inherited from the dead (lane B's gear-on-death): the most recent grave whose hero
 * carried this item at the end, or null. The Armory shows "carried by …" with it.
 */
export function heirloomOf(state: GameState, itemId: EquipmentId): FallenRecord | null {
  const graves = state.life.memorial
  for (let i = graves.length - 1; i >= 0; i--) {
    const g = graves[i]!
    if (g.carried?.some((c) => c.itemId === itemId)) return g
  }
  return null
}
