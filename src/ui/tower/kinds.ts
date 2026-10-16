/**
 * Floor kinds, Doors and Boons as the player sees them (spec 2026-10-12 S13/S14, WP4).
 * Pure display data: icons, English source labels (translated with `t()` at render) and
 * one-line blurbs. The engine owns the rules; this file only names them.
 */
import type { BoonId, Door, DoorReward, FloorKind, GameState } from '../../engine/types'
import { floorKindBase } from '../../engine/climb'
import { BOONS } from '../../engine/climb'
import { TUNING } from '../../engine/tuning'
import { t } from '../i18n/i18n'

const R = TUNING.climb.reward

/** The pictogram on a floor-kind badge and on a Door. */
export const KIND_ICON: Record<FloorKind, string> = {
  tutorial: '✎',
  breather: '🍃',
  path: '⚔',
  elite: '💀',
  rest: '⛺',
  cache: '📦',
  boss: '👑',
}

/** The floor kind's name (scout badge, results). English source for `t()`. */
export const KIND_LABEL: Record<FloorKind, string> = {
  tutorial: 'Tutorial',
  breather: 'Breather',
  path: 'Path',
  elite: 'Elite',
  rest: 'Rest',
  cache: 'Cache',
  boss: 'Boss',
}

/** The Door's own name (the Elite door is the Skull). Never contains "Enter" or "Treasure". */
export const DOOR_TITLE: Record<FloorKind, string> = {
  tutorial: 'Tutorial',
  breather: 'Breather',
  path: 'Path',
  elite: 'Skull',
  rest: 'Rest',
  cache: 'Cache',
  boss: 'Boss',
}

/** The reward pictogram on a Door (Hades-style). */
export const REWARD_ICON: Record<DoorReward, string> = {
  gold: '◆',
  stones: '🪨',
  boon: '✦',
  sanity: '♥',
  xp: '★',
}

export const REWARD_LABEL: Record<DoorReward, string> = {
  gold: 'Gold',
  stones: 'Stones',
  boon: 'Boon',
  sanity: 'Sanity',
  xp: 'XP',
}

/** Kinds that are fought (Rest and Cache resolve with no battle). */
export function isFightKind(kind: FloorKind): boolean {
  return kind !== 'rest' && kind !== 'cache'
}

/**
 * The kind of the floor the party stands on. `tower.kind` is the truth once the climb
 * engine sets it; until then its 'path' default is refined by the floor's base kind, so
 * F1-F2 read as Tutorial and every 5th floor as Boss.
 */
export function currentKind(state: GameState): FloorKind {
  const k = state.tower.kind
  return k === 'path' ? floorKindBase(state.tower.currentFloor) : k
}

/** The world-grade multiplier the engine applies to floor rewards (C = 1). */
export function worldMultOf(state: GameState): number {
  return TUNING.tower.worldMult[state.worldGrade] ?? 1
}

/** Gold a Cache Door pays on `floor` (scaled like the engine's, by the world grade). */
export function cacheGold(floor: number, worldMult: number = 1): number {
  return Math.round(R.cacheGoldPerFloor * floor * worldMult)
}

/** One line on what a Door asks and what it pays, for the door card. Translated. `boon`:
 *  can the clear still earn a Boon (engine `canEarnBoon`)? With the Sortie's Boons full
 *  the Skull promises none. */
export function doorBlurb(door: Door, floor: number, worldMult: number = 1, boon: boolean = true): string {
  switch (door.kind) {
    case 'elite':
      return boon
        ? t('Hits much harder. ×{m} gold, +{s} Promotion Stone and a Boon.', { m: R.eliteGoldMult, s: R.eliteStones })
        : t('Hits much harder. ×{m} gold, +{s} Promotion Stone (Boons full).', { m: R.eliteGoldMult, s: R.eliteStones })
    case 'breather':
      return t('An easy floor to catch your breath.')
    case 'rest':
      return t('+{n} Sanity for the party and a hot meal.', { n: R.restSanity })
    case 'cache':
      return t('{g} gold and +{s} Promotion Stone.', { g: cacheGold(floor, worldMult).toLocaleString(), s: R.cacheStones })
    case 'boss':
      return t('The floor’s guardian waits.')
    case 'tutorial':
      return t('A gentle floor to learn the ropes.')
    case 'path':
    default:
      // Not "a fair fight": the threat line under it may well say Deadly.
      return t('The steady road. Standard rewards.')
  }
}

/** Pictograms for the starting twelve Boons (spec S14); unknown ids fall back to ✦. */
const BOON_ICON: Record<string, string> = {
  ironVow: '🛡',
  huntersMark: '🎯',
  secondWind: '💨',
  quartermaster: '📯',
  warChest: '💰',
  scholarsLamp: '🕯',
  shieldwall: '🧱',
  volley: '🏹',
  arcaneTide: '🌊',
  sanctuary: '✚',
  underdog: '🐾',
  calmMind: '🍵',
}

export function boonIcon(id: BoonId): string {
  return BOON_ICON[id] ?? BOON_ICON[camel(id)] ?? '✦'
}

/** 'iron_vow' / 'iron-vow' → 'ironVow'. */
function camel(id: string): string {
  return id.replace(/[-_ ]+(\w)/g, (_, c: string) => c.toUpperCase())
}

/** 'ironVow' / 'iron_vow' → 'Iron Vow' (a readable fallback before the Boon list exists). */
export function humanizeId(id: string): string {
  const spaced = id
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase())
}

/** A Boon's translated name and description (falls back to a readable id). */
export function boonText(id: BoonId): { name: string; description: string } {
  const def = BOONS[id]
  if (def) return { name: t(def.name), description: t(def.description) }
  return { name: t(humanizeId(id)), description: '' }
}
