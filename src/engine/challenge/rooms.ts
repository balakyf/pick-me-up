/**
 * Side rooms after anchors (Layer 2 §5.1, deferred until now). The existing event floor
 * (rest / treasure / merchant / gamble) still blocks the climb after every anchor; these
 * rooms are OPTIONAL extras: an anchor's first clear may reveal one side door, which waits
 * on the Tower screen until the Master takes it, leaves it, or clears the next anchor.
 *
 *   Treasure Vault     — gold and Promotion Stones.
 *   Cursed Shrine      — the party pays Sanity; the next floor they fight at +12% stats.
 *   Lost Hero          — a free Normal-pool hero joins (the gacha's own builder).
 *   Wandering Merchant — stones, attribute stones, rank material and a piece of gear for
 *                        gold, priced by floor (a gold sink); each ware once.
 *   Training Grounds   — the party earns 1.5× the floor's clear XP.
 *   Mimic              — a small fight (it's the tower: permadeath applies) for loot.
 *
 * Deterministic per account + floor: rngFor(seed, 'room', floor, …). PURE.
 */
import type {
  BonusRoom,
  BonusRoomKind,
  CombatLog,
  CombatUnit,
  Element,
  EquipmentGrade,
  EquipmentItem,
  EquipmentSlot,
  FloorResult,
  GameState,
  HeroId,
  MaterialId,
  OwnedHero,
} from '../types'
import { TUNING } from '../tuning'
import { ANCHORS, ENEMY_TEMPLATES, SKILLS } from '../content'
import { buildCombatUnit, buildEnemyUnit } from '../unit'
import { runBattle } from '../combat'
import { summon } from '../gacha'
import { floorXp, mobLevel } from '../tower'
import { applyXp } from '../stats'
import { clampSanity } from '../kitchen'
import { attrStoneId } from '../promotion'
import { itemName, nextEquipmentId, releaseGear, statBlockFor } from '../equipment'
import { rngFor, hash, chance, weightedPick, pick } from '../rng/rng'
import { CHALLENGE } from './tuning'
import { challengeOf, fitToFight } from './challenge'
import { applyPartyBonuses } from './bonds'
import { recordBattle } from '../codex'
import { refusesDeploy } from '../estate/deploy'

const R = CHALLENGE.rooms

export const ROOM_KINDS: readonly BonusRoomKind[] = ['vault', 'shrine', 'lostHero', 'merchant', 'training', 'mimic']

/** The side room an anchor's first clear reveals on this account, or null. */
export function rollBonusRoom(state: GameState, floor: number): BonusRoomKind | null {
  if (ANCHORS[floor] === undefined || floor >= TUNING.tower.sliceTopFloor) return null
  let r = rngFor(state.seed, 'room', floor)
  const open = chance(r, R.chance)
  r = open.rng
  if (!open.value) return null
  return weightedPick(r, R.weights).value
}

/**
 * The store's hook after every floor attempt: the Shrine's blessing is spent on the attempt
 * it was bought for, and an anchor's first clear may open a side room (replacing any old
 * one). PURE.
 */
export function afterFloor(r: { state: GameState; result: FloorResult }): { state: GameState; result: FloorResult } {
  const ch = challengeOf(r.state)
  let next = ch
  if (ch.blessing !== null && ch.blessing.floor === r.result.floor) next = { ...next, blessing: null }
  if (r.result.firstClear) {
    const kind = rollBonusRoom(r.state, r.result.floor)
    if (kind !== null) next = { ...next, room: { kind, floor: r.result.floor, bought: [] } }
  }
  return next === ch ? r : { state: { ...r.state, challenge: next }, result: r.result }
}

// ─────────────────────────────────────────────────────────────────────────────
// The merchant's wares
// ─────────────────────────────────────────────────────────────────────────────

export type WareId = 'stones' | 'attr' | 'rank' | 'gear'

export interface Ware {
  id: WareId
  price: number
  materials: Record<MaterialId, number>
  /** The gear on offer (for 'gear'). */
  item?: { slot: EquipmentSlot; grade: EquipmentGrade }
}

const ATTR_ELEMENTS: Element[] = ['fire', 'water', 'wind', 'earth', 'light', 'dark']
const SLOTS: EquipmentSlot[] = ['weapon', 'armor', 'accessory']

/** The grade of gear found (or sold) around a floor. */
export function gearGradeFor(floor: number): EquipmentGrade {
  return floor < 20 ? 'D' : floor < 40 ? 'C' : floor < 60 ? 'B' : floor < 80 ? 'A' : 'S'
}

/** What the Wandering Merchant sells after `floor` (fixed per account + floor). */
export function merchantWares(state: GameState, floor: number): Ware[] {
  const M = R.merchant
  const price = (w: { base: number; perFloor: number }) => w.base + w.perFloor * floor
  let r = rngFor(state.seed, 'room', floor, 'merchant')
  const el = pick(r, ATTR_ELEMENTS)
  r = el.rng
  const slot = pick(r, SLOTS)
  return [
    { id: 'stones', price: price(M.stones), materials: { promotionStone: M.stones.qty } },
    { id: 'attr', price: price(M.attr), materials: { [attrStoneId(el.value)]: M.attr.qty } },
    { id: 'rank', price: price(M.rank), materials: { rankMaterial: M.rank.qty } },
    { id: 'gear', price: price(M.gear), materials: {}, item: { slot: slot.value, grade: gearGradeFor(floor) } },
  ]
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolution
// ─────────────────────────────────────────────────────────────────────────────

/** What acting in a room did (for the results card). */
export interface RoomOutcome {
  kind: BonusRoomKind
  choice: string
  gold: number
  materials: Record<MaterialId, number>
  /** Sanity each affected hero gained (+) or paid (−). */
  sanity: number
  /** XP each party hero earned. */
  xp: number
  recruit?: OwnedHero
  item?: EquipmentItem
  /** The Mimic fight. */
  log?: CombatLog
  won?: boolean
  fallen: HeroId[]
  note: string
}

/** The choices a room offers (every room can be left). */
export function roomChoices(room: BonusRoom): string[] {
  switch (room.kind) {
    case 'vault':
      return ['take', 'leave']
    case 'shrine':
      return ['accept', 'leave']
    case 'lostHero':
      return ['accept', 'leave']
    case 'training':
      return ['train', 'leave']
    case 'mimic':
      return ['fight', 'leave']
    case 'merchant':
      return (['stones', 'attr', 'rank', 'gear'] as string[]).filter((w) => !room.bought.includes(w)).concat('leave')
  }
}

/** The party heroes fit to act (in slot order, with their lines). */
function partyFit(state: GameState): { hero: OwnedHero; line: CombatUnit['line'] }[] {
  const out: { hero: OwnedHero; line: CombatUnit['line'] }[] = []
  state.party.slots.forEach((id, i) => {
    const h = id ? state.heroes[id] : undefined
    if (fitToFight(h, state)) out.push({ hero: h, line: state.party.lines[i] ?? 'front' })
  })
  return out
}

function addMaterials(mats: Record<MaterialId, number>, add: Record<MaterialId, number>): Record<MaterialId, number> {
  const out = { ...mats }
  for (const [k, n] of Object.entries(add)) out[k] = (out[k] ?? 0) + n
  return out
}

function makeItem(state: GameState, slot: EquipmentSlot, grade: EquipmentGrade): EquipmentItem {
  return { id: nextEquipmentId(state.inventory), slot, grade, name: itemName(slot, grade), statBonus: statBlockFor(slot, grade) }
}

/** The Mimic: one chest-bound brute a little below the floor's own enemies. */
export function buildMimic(floor: number, worldMult: number): CombatUnit {
  const level = Math.max(1, Math.round(mobLevel(floor, worldMult) * R.mimicLevelShare))
  return buildEnemyUnit(ENEMY_TEMPLATES.mimic!, level, `mimic_${floor}`, { targetTag: 'mimic' })
}

/**
 * Act in the open side room. `leave` closes it; the merchant stays open until left (each
 * ware once). Throws when no room is open, the choice isn't offered, the Master can't pay,
 * or a room that needs the party has nobody fit in it. PURE.
 */
export function resolveBonusRoom(state: GameState, choice: string): { state: GameState; outcome: RoomOutcome } {
  const ch = challengeOf(state)
  const room = ch.room
  if (room === null) throw new Error('bonusRoom: no side room is open')
  if (!roomChoices(room).includes(choice)) throw new Error(`bonusRoom: '${choice}' is not offered here`)
  const floor = room.floor
  const outcome: RoomOutcome = { kind: room.kind, choice, gold: 0, materials: {}, sanity: 0, xp: 0, fallen: [], note: '' }
  let next: GameState = state
  let keepOpen = false
  const party = partyFit(state)
  const needParty = () => {
    if (party.length === 0) throw new Error('bonusRoom: no one in the party is fit to go in')
  }

  if (choice === 'leave') {
    outcome.note = 'The side door closes behind you.'
  } else if (room.kind === 'vault') {
    outcome.gold = R.vaultGoldPerFloor * floor
    outcome.materials = { promotionStone: R.vaultStones + Math.floor(floor / 20) }
    outcome.note = 'A vault the tower forgot. Coins and stones, still warm.'
  } else if (room.kind === 'shrine') {
    needParty()
    const heroes = { ...next.heroes }
    for (const { hero } of party) heroes[hero.id] = { ...hero, sanity: clampSanity(hero.sanity - R.shrineSanity) }
    // The blessing waits for the next floor the Master attempts (spent on that attempt).
    const blessing = { floor: next.tower.currentFloor, pct: R.shrineBuff }
    next = { ...next, heroes, challenge: { ...challengeOf(next), blessing } }
    outcome.sanity = -R.shrineSanity
    outcome.note = 'The shrine drinks their nerve. On the next floor, they fight like something else.'
  } else if (room.kind === 'lostHero') {
    const cost = TUNING.gacha.normalCostGold
    const pulled = summon({ ...next, gold: next.gold + cost })
    next = { ...pulled.state, gold: next.gold }
    outcome.recruit = pulled.hero
    outcome.note = 'A hero from a party that never came back. They ask to join yours.'
  } else if (room.kind === 'training') {
    needParty()
    const xp = Math.round(floorXp(floor) * R.trainingXpMult)
    const heroes = { ...next.heroes }
    for (const { hero } of party) heroes[hero.id] = { ...hero, xp: applyXp(hero.xp, xp, hero.star) }
    next = { ...next, heroes }
    outcome.xp = xp
    outcome.note = 'An old drill yard, its dummies still standing. The party trains until dusk.'
  } else if (room.kind === 'merchant') {
    const ware = merchantWares(state, floor).find((w) => w.id === choice)!
    if (next.gold < ware.price) throw new Error(`bonusRoom: the merchant wants ${ware.price} gold`)
    next = { ...next, gold: next.gold - ware.price }
    outcome.gold = -ware.price
    outcome.materials = { ...ware.materials }
    if (ware.item) {
      const item = makeItem(next, ware.item.slot, ware.item.grade)
      next = { ...next, inventory: [...next.inventory, item] }
      outcome.item = item
    }
    keepOpen = true
    outcome.note = 'The merchant wraps it in oilcloth. "Anything else?"'
  } else if (room.kind === 'mimic') {
    needParty()
    const units = applyPartyBonuses(
      party.map((p) => buildCombatUnit(p.hero, p.line, SKILLS, state.inventory)),
      state,
      { blessing: false },
    )
    const mimic = buildMimic(floor, TUNING.tower.worldMult[state.worldGrade])
    const res = runBattle(
      units,
      {
        floor,
        mission: { type: 'Mimic', objectives: [{ kind: 'defeat', targetTag: 'mimic' }], timer: 500 },
        waves: [{ units: [mimic] }],
        encounterContext: 'tower',
        label: 'mimic',
      },
      hash(state.seed, 'room', floor, 'mimic'),
    )
    outcome.log = res.log
    outcome.won = res.outcome === 'win'
    next = { ...next, codex: recordBattle(next.codex, res.log) }
    outcome.fallen = [...res.fallenHeroIds]
    const heroes = { ...next.heroes }
    for (const id of res.fallenHeroIds) heroes[id] = releaseGear({ ...heroes[id]!, alive: false, blessed: false })
    next = { ...next, heroes }
    if (outcome.won) {
      outcome.gold = R.mimicGoldPerFloor * floor
      outcome.materials = { promotionStone: R.mimicStones }
      const slot = pick(rngFor(state.seed, 'room', floor, 'mimic-loot'), SLOTS).value
      const item = makeItem(next, slot, gearGradeFor(floor + 10))
      next = { ...next, inventory: [...next.inventory, item] }
      outcome.item = item
      outcome.note = 'The chest had teeth. Inside the teeth: treasure.'
    } else {
      outcome.note = 'The chest snaps shut and scuttles off into the dark.'
    }
  }

  if (room.kind !== 'merchant' && outcome.gold > 0) next = { ...next, gold: next.gold + outcome.gold }
  next = { ...next, materials: addMaterials(next.materials, outcome.materials) }
  const room2: BonusRoom | null = keepOpen ? { ...room, bought: [...room.bought, choice] } : null
  const done = keepOpen && roomChoices(room2!).length === 1 ? null : room2
  return { state: { ...next, challenge: { ...challengeOf(next), room: done } }, outcome }
}
