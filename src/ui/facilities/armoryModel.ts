/**
 * The Armory's pure half (lane N): the inventory grid's rows and filters, and the
 * per-hero compare list. No React, so every rule is tested.
 */
import type { EquipmentGrade, EquipmentItem, EquipmentSlot, FallenRecord, GameState, OwnedHero } from '../../engine/types'
import { autoFits, heirloomOf, itemDelta, itemScore, wearerOf, wieldable } from '../../engine/equipment'

export const GRADE_ORDER: EquipmentGrade[] = ['E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS']
const SLOT_ORDER: EquipmentSlot[] = ['weapon', 'armor', 'accessory']

export interface GearFilter {
  slot: EquipmentSlot | 'all'
  grade: EquipmentGrade | 'all'
  /** Everything, only what nobody wears, only what someone wears, or only what the dead left. */
  show: 'all' | 'free' | 'worn' | 'heirloom'
}
export const GEAR_ALL: GearFilter = { slot: 'all', grade: 'all', show: 'all' }

export interface GearRow {
  item: EquipmentItem
  /** The living hero wearing it, if any. */
  wearer: OwnedHero | null
  /** The fallen hero who carried it last, if any (lane B's gear on death). */
  heirloom: FallenRecord | null
  /** The hero an Oath-weapon is bound to (living or not), if any. */
  boundTo: OwnedHero | null
  score: number
}

/** The inventory grid: filtered, then by slot, best grade first, then id (stable). */
export function gearRows(state: GameState, filter: GearFilter = GEAR_ALL): GearRow[] {
  const rows: GearRow[] = []
  for (const item of state.inventory) {
    if (filter.slot !== 'all' && item.slot !== filter.slot) continue
    if (filter.grade !== 'all' && item.grade !== filter.grade) continue
    const wearer = wearerOf(state, item.id)
    const heirloom = heirloomOf(state, item.id)
    if (filter.show === 'free' && wearer !== null) continue
    if (filter.show === 'worn' && wearer === null) continue
    if (filter.show === 'heirloom' && heirloom === null) continue
    const boundTo = item.exclusiveTo !== undefined ? state.heroes[item.exclusiveTo] ?? null : null
    rows.push({ item, wearer, heirloom, boundTo, score: itemScore(item) })
  }
  return rows.sort(
    (a, b) =>
      SLOT_ORDER.indexOf(a.item.slot) - SLOT_ORDER.indexOf(b.item.slot) ||
      GRADE_ORDER.indexOf(b.item.grade) - GRADE_ORDER.indexOf(a.item.grade) ||
      (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0),
  )
}

/** How many items of each grade the inventory holds (the grade filter's counts). */
export function gradeCounts(state: GameState): Partial<Record<EquipmentGrade, number>> {
  const out: Partial<Record<EquipmentGrade, number>> = {}
  for (const i of state.inventory) out[i.grade] = (out[i.grade] ?? 0) + 1
  return out
}

export interface CompareRow {
  item: EquipmentItem
  delta: ReturnType<typeof itemDelta>
  /** Can the hero take it up right now (free or theirs, not bound elsewhere)? */
  ok: boolean
  /** Would "equip best" pick items like this one (not a foreign-element blade)? */
  autoOk: boolean
  wearer: OwnedHero | null
}

/**
 * Side-by-side compare for one hero's slot: every other item of that slot, with its stat
 * deltas against what the hero wears now, the best first. Items another living hero wears
 * are listed (marked) so the Master sees what they would take.
 */
export function compareFor(state: GameState, hero: OwnedHero, slot: EquipmentSlot): CompareRow[] {
  const wornId = hero.equipment[slot]
  const worn = wornId !== null ? state.inventory.find((i) => i.id === wornId) ?? null : null
  return state.inventory
    .filter((i) => i.slot === slot && i.id !== wornId)
    .map((item) => ({
      item,
      delta: itemDelta(worn, item),
      ok: wieldable(state, item, hero.id),
      autoOk: autoFits(state, item, hero),
      wearer: wearerOf(state, item.id),
    }))
    .sort((a, b) => Number(b.ok) - Number(a.ok) || b.delta.cp - a.delta.cp || (a.item.id < b.item.id ? -1 : 1))
}
