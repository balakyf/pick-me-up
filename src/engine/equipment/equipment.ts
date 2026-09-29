/**
 * Layer 1 §5 — Equipment: flat derived-stat blocks the Master forges and slots
 * onto heroes. Equipment NEVER touches a hero's attributes (Layer 0 §5.4): it adds
 * a flat DerivedStats block at the combat-assembly seam (unit/buildCombatUnit), and
 * a weapon may also override the wielder's element and/or carry keyword tags.
 *
 * The in-slice acquisition loop is the Smithy forge: spend gold + Promotion Stones
 * to craft an item whose grade is the best the account's Master Level permits. The
 * forge is DETERMINISTIC — crafting success rates and recipes are a Layer 3 concern
 * (§5.3), deliberately deferred — so the whole module has NO RNG and the determinism
 * guard stays green. Item ids are a pure function of inventory length, so an offline
 * craft replays identically.
 */
import { TUNING } from '../tuning'
import type {
  GameState,
  OwnedHero,
  HeroId,
  EquipmentItem,
  EquipmentId,
  EquipmentSlot,
  EquipmentGrade,
  DerivedStats,
  Element,
  KeywordTag,
} from '../types'

const E = TUNING.lobby.equipment

/** Per-slot display nouns for forged items. */
const SLOT_NOUN: Record<EquipmentSlot, string> = {
  weapon: 'Blade',
  armor: 'Plate',
  accessory: 'Charm',
}

/** True when the account's Master Level has opened the Smithy. */
export function smithyUnlocked(state: GameState): boolean {
  return state.meta.masterLevel >= E.unlockMasterLevel
}

/** The per-grade magnitude `m` (the canon weapon-ATK ladder, Layer 1 §5.2). */
export function gradeMagnitude(grade: EquipmentGrade): number {
  return E.gradeMagnitude[grade] ?? 0
}

/** The flat DerivedStats block a slot grants at a grade (Layer 1 §5.2). */
export function statBlockFor(slot: EquipmentSlot, grade: EquipmentGrade): Partial<DerivedStats> {
  const m = gradeMagnitude(grade)
  switch (slot) {
    case 'weapon':
      return { pAtk: m, mAtk: m }
    case 'armor':
      return {
        maxHP: Math.round(m * E.slotMult.armorHpPerM),
        pDef: Math.round(m * E.slotMult.armorPDefPerM),
      }
    case 'accessory':
      return {
        critPct: Math.round(m * E.slotMult.accessoryCritPerM),
        spd: Math.round(m * E.slotMult.accessorySpdPerM),
      }
  }
}

/** A display name for a forged item, e.g. "B Plate". */
export function itemName(slot: EquipmentSlot, grade: EquipmentGrade): string {
  return `${grade} ${SLOT_NOUN[slot]}`
}

/** The best grade unlocked at a Master Level (highest threshold ≤ ml wins). */
export function forgeGrade(masterLevel: number): EquipmentGrade {
  let best: EquipmentGrade = 'E'
  for (const key of Object.keys(E.forgeGradeThresholds)) {
    const threshold = Number(key)
    if (masterLevel >= threshold) best = E.forgeGradeThresholds[threshold] as EquipmentGrade
  }
  return best
}

/** Gold + Promotion Stone cost to forge an item of a grade. */
export function forgeCost(grade: EquipmentGrade): { gold: number; promotionStone: number } {
  return E.forgeCost[grade] ?? { gold: 0, promotionStone: 0 }
}

/** True when the Smithy is open and the account can afford the next forge. */
export function canCraft(state: GameState): boolean {
  if (!smithyUnlocked(state)) return false
  const cost = forgeCost(forgeGrade(state.meta.masterLevel))
  return state.gold >= cost.gold && (state.materials.promotionStone ?? 0) >= cost.promotionStone
}

/** Deterministic next equipment id from the current inventory size. */
function nextEquipmentId(inventory: readonly EquipmentItem[]): EquipmentId {
  return `eq_${String(inventory.length + 1).padStart(6, '0')}` as EquipmentId
}

/**
 * A 4★+ summon's bound exclusive weapon (Layer 1 §4.2 "arrives with … exclusive
 * weapon"): the weapon stat block at `grade`, the hero's own element, and bound to
 * that hero (only it may equip it). The id continues the inventory sequence. PURE.
 */
export function makeExclusiveWeapon(
  inventory: readonly EquipmentItem[],
  hero: OwnedHero,
  grade: EquipmentGrade,
): EquipmentItem {
  const first = hero.name.split(/\s+/)[0] ?? hero.name
  return {
    id: nextEquipmentId(inventory),
    slot: 'weapon',
    grade,
    name: `${first}'s Oath-${SLOT_NOUN.weapon}`,
    statBonus: statBlockFor('weapon', grade),
    element: hero.element,
    exclusiveTo: hero.id,
  }
}

/**
 * Forge one item for `slot` at the Master-Level grade. Validates the gate +
 * affordability, deducts gold + Promotion Stones, appends the item. PURE.
 * Throws on a closed gate or insufficient funds (same contract as promotion).
 */
export function craftEquipment(state: GameState, slot: EquipmentSlot): GameState {
  if (!smithyUnlocked(state)) {
    throw new Error(`craftEquipment: Smithy locked until Master Lv ${E.unlockMasterLevel}`)
  }
  const grade = forgeGrade(state.meta.masterLevel)
  const cost = forgeCost(grade)
  if (state.gold < cost.gold) throw new Error('craftEquipment: insufficient gold')
  if ((state.materials.promotionStone ?? 0) < cost.promotionStone) {
    throw new Error('craftEquipment: insufficient Promotion Stones')
  }

  const item: EquipmentItem = {
    id: nextEquipmentId(state.inventory),
    slot,
    grade,
    name: itemName(slot, grade),
    statBonus: statBlockFor(slot, grade),
  }

  return {
    ...state,
    gold: state.gold - cost.gold,
    materials: {
      ...state.materials,
      promotionStone: (state.materials.promotionStone ?? 0) - cost.promotionStone,
    },
    inventory: [...state.inventory, item],
  }
}

/** Every item id currently referenced by any hero's equipment slots. */
export function equippedItemIds(state: GameState): Set<EquipmentId> {
  const ids = new Set<EquipmentId>()
  for (const hero of Object.values(state.heroes) as OwnedHero[]) {
    for (const id of [hero.equipment.weapon, hero.equipment.armor, hero.equipment.accessory]) {
      if (id !== null) ids.add(id)
    }
  }
  return ids
}

/**
 * Equip an owned item onto its hero. The item routes by its OWN slot, replacing
 * whatever sat there (the replaced item returns to free inventory). Validates the
 * hero is alive, the item exists, and the item is not already worn by ANOTHER hero.
 * PURE — returns a fresh GameState.
 */
export function equipItem(state: GameState, heroId: HeroId, itemId: EquipmentId): GameState {
  const hero = state.heroes[heroId]
  if (hero === undefined) throw new Error(`equipItem: unknown hero ${heroId}`)
  if (!hero.alive) throw new Error(`equipItem: hero ${heroId} is not alive`)
  const item = state.inventory.find((i) => i.id === itemId)
  if (item === undefined) throw new Error(`equipItem: unknown item ${itemId}`)
  if (item.exclusiveTo !== undefined && item.exclusiveTo !== heroId) {
    throw new Error(`equipItem: ${itemId} is bound to another hero`)
  }

  for (const [hid, h] of Object.entries(state.heroes) as [HeroId, OwnedHero][]) {
    if (hid === heroId) continue
    if (
      h.equipment.weapon === itemId ||
      h.equipment.armor === itemId ||
      h.equipment.accessory === itemId
    ) {
      throw new Error(`equipItem: ${itemId} is already equipped by ${hid}`)
    }
  }

  return {
    ...state,
    heroes: {
      ...state.heroes,
      [heroId]: { ...hero, equipment: { ...hero.equipment, [item.slot]: itemId } },
    },
  }
}

/** Clear a hero's slot back to empty (no-op if already empty). PURE. */
export function unequipItem(state: GameState, heroId: HeroId, slot: EquipmentSlot): GameState {
  const hero = state.heroes[heroId]
  if (hero === undefined) throw new Error(`unequipItem: unknown hero ${heroId}`)
  if (hero.equipment[slot] === null) return state
  return {
    ...state,
    heroes: {
      ...state.heroes,
      [heroId]: { ...hero, equipment: { ...hero.equipment, [slot]: null } },
    },
  }
}

const STAT_KEYS = [
  'maxHP',
  'pAtk',
  'mAtk',
  'pDef',
  'mDef',
  'spd',
  'critPct',
  'evaPct',
  'accPct',
  'statusRes',
] as const

/**
 * The combined flat bonus from a hero's equipped items: summed stat block, the
 * weapon's element override (if any), and all keyword tags concatenated. PURE.
 * Items absent from `inventory` are silently skipped (defensive).
 */
export function equipmentBonus(
  hero: OwnedHero,
  inventory: readonly EquipmentItem[],
): { stats: Partial<DerivedStats>; element?: Element; keywords: KeywordTag[] } {
  const byId = new Map(inventory.map((i) => [i.id, i]))
  const stats: Partial<DerivedStats> = {}
  let element: Element | undefined
  const keywords: KeywordTag[] = []

  // Weapon first so its element wins the override.
  for (const slot of ['weapon', 'armor', 'accessory'] as const) {
    const id = hero.equipment[slot]
    if (id === null) continue
    const item = byId.get(id)
    if (item === undefined) continue
    for (const k of STAT_KEYS) {
      const v = item.statBonus[k]
      if (v !== undefined) stats[k] = (stats[k] ?? 0) + v
    }
    if (item.element !== undefined && element === undefined) element = item.element
    if (item.keywords !== undefined) keywords.push(...item.keywords)
  }

  return { stats, element, keywords }
}
