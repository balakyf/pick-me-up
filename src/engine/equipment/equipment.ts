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
  FallenRecord,
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
export function nextEquipmentId(inventory: readonly EquipmentItem[]): EquipmentId {
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

/**
 * Every item id currently worn by a LIVING hero. The fallen carry nothing: whatever a
 * dead hero's record still points at (saves from before gear was released at death) is
 * free inventory, so no item is ever stranded.
 */
export function equippedItemIds(state: GameState): Set<EquipmentId> {
  const ids = new Set<EquipmentId>()
  for (const hero of Object.values(state.heroes) as OwnedHero[]) {
    if (!hero.alive) continue
    for (const id of [hero.equipment.weapon, hero.equipment.armor, hero.equipment.accessory]) {
      if (id !== null) ids.add(id)
    }
  }
  return ids
}

/** The living hero wearing an item, if any. */
export function wearerOf(state: GameState, itemId: EquipmentId): OwnedHero | null {
  for (const h of Object.values(state.heroes) as OwnedHero[]) {
    if (h.alive && (h.equipment.weapon === itemId || h.equipment.armor === itemId || h.equipment.accessory === itemId)) return h
  }
  return null
}

/**
 * Is an item still bound to someone else? An Oath-Blade is bound to its hero for life —
 * and when that hero falls, the binding passes with them and the blade can be handed on.
 */
export function boundElsewhere(state: GameState, item: EquipmentItem, heroId: HeroId): boolean {
  if (item.exclusiveTo === undefined || item.exclusiveTo === heroId) return false
  return state.heroes[item.exclusiveTo]?.alive === true
}

/** Could this hero take up this item right now (not bound elsewhere, not worn by another
 *  living hero)? The pickers' filter. */
export function wieldable(state: GameState, item: EquipmentItem, heroId: HeroId): boolean {
  if (boundElsewhere(state, item, heroId)) return false
  const w = wearerOf(state, item.id)
  return w === null || w.id === heroId
}

/** A hero with empty hands: what the death sites apply (the gear goes back to the armory). */
export function releaseGear<H extends OwnedHero>(hero: H): H {
  const e = hero.equipment
  if (e.weapon === null && e.armor === null && e.accessory === null) return hero
  return { ...hero, equipment: { weapon: null, armor: null, accessory: null } }
}

/** What a hero carried (slot order), for the Memorial's record. */
export function carriedGear(hero: OwnedHero, inventory: readonly EquipmentItem[]): { slot: EquipmentSlot; itemId: EquipmentId; name: string; grade: EquipmentGrade }[] {
  const out: { slot: EquipmentSlot; itemId: EquipmentId; name: string; grade: EquipmentGrade }[] = []
  for (const slot of ['weapon', 'armor', 'accessory'] as const) {
    const id = hero.equipment[slot]
    if (id === null) continue
    const item = inventory.find((i) => i.id === id)
    if (item) out.push({ slot, itemId: id, name: item.name, grade: item.grade })
  }
  return out
}

/**
 * A fallen hero's gear and who carries it now (null = waiting in the armory) — for the
 * Memorial: "their blade was passed on to …". Items since lost are left out.
 */
export function heirlooms(
  state: GameState,
  rec: Pick<FallenRecord, 'carried'>,
): { slot: EquipmentSlot; itemId: EquipmentId; name: string; grade: EquipmentGrade; wielder: OwnedHero | null }[] {
  return (rec.carried ?? [])
    .filter((c) => state.inventory.some((i) => i.id === c.itemId))
    .map((c) => {
      const item = state.inventory.find((i) => i.id === c.itemId)!
      return { ...c, name: item.name, grade: item.grade, wielder: wearerOf(state, c.itemId) }
    })
}

/**
 * Equip an owned item onto its hero. The item routes by its OWN slot, replacing
 * whatever sat there (the replaced item returns to free inventory). Validates the
 * hero is alive, the item exists, it is not bound to another LIVING hero, and it is
 * not already worn by another LIVING hero (the fallen hold nothing). PURE.
 */
export function equipItem(state: GameState, heroId: HeroId, itemId: EquipmentId): GameState {
  const hero = state.heroes[heroId]
  if (hero === undefined) throw new Error(`equipItem: unknown hero ${heroId}`)
  if (!hero.alive) throw new Error(`equipItem: hero ${heroId} is not alive`)
  const item = state.inventory.find((i) => i.id === itemId)
  if (item === undefined) throw new Error(`equipItem: unknown item ${itemId}`)
  if (boundElsewhere(state, item, heroId)) {
    throw new Error(`equipItem: ${itemId} is bound to another hero`)
  }

  const wearer = wearerOf(state, itemId)
  if (wearer !== null && wearer.id !== heroId) {
    throw new Error(`equipItem: ${itemId} is already equipped by ${wearer.id}`)
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
 * An item's stat block as combat reads it (B42). Combat never reads evasion or accuracy,
 * so no item source rolls EVA/ACC; an older item that still carries them has them folded
 * into SPD and CRIT (TUNING.lobby.equipment.legacySubstats) instead of wasting the roll.
 * Returns the same object when there is nothing to fold.
 */
export function combatSubstats(block: Partial<DerivedStats>): Partial<DerivedStats> {
  const eva = block.evaPct ?? 0
  const acc = block.accPct ?? 0
  if (eva === 0 && acc === 0 && block.evaPct === undefined && block.accPct === undefined) return block
  const L = E.legacySubstats
  const { evaPct: _e, accPct: _a, ...rest } = block
  void _e
  void _a
  const out: Partial<DerivedStats> = { ...rest }
  if (eva !== 0) out.spd = (out.spd ?? 0) + Math.round(eva * L.evaToSpd)
  if (acc !== 0) out.critPct = (out.critPct ?? 0) + Math.round(acc * L.accToCrit)
  return out
}

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
    const bonus = combatSubstats(item.statBonus)
    for (const k of STAT_KEYS) {
      const v = bonus[k]
      if (v !== undefined) stats[k] = (stats[k] ?? 0) + v
    }
    if (item.element !== undefined && element === undefined) element = item.element
    if (item.keywords !== undefined) keywords.push(...item.keywords)
  }

  return { stats, element, keywords }
}
