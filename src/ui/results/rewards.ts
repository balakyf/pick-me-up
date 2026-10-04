/**
 * What a floor paid, as the results ceremony shows it (lane K): every drop with its rarity
 * (the glow it gets), and the anchor's headline (its mission and the boss brought down).
 * PURE.
 */
import type { CombatLog, FloorResult, MaterialId } from '../../engine/types'
import { ANCHORS } from '../../engine/content'
import { introOf } from '../battle/bossIntro'

export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary'

/** Rarity of a material (its glow on the results card). */
export function materialRarity(id: MaterialId, firstClearDrop = false): Rarity {
  if (id === 'bookOfReverseHeaven') return 'legendary'
  if (firstClearDrop) return 'rare'
  if (id === 'rankMaterial') return 'rare'
  if (id.startsWith('attrStone_')) return 'uncommon'
  return 'common'
}

export interface RewardDrop {
  id: MaterialId
  n: number
  rarity: Rarity
}

const RANK: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, legendary: 3 }

/** The drops of a result, rarest last (the ceremony ends on its best). */
export function rewardDrops(result: Pick<FloorResult, 'materialsAwarded' | 'floor' | 'firstClear'>): RewardDrop[] {
  const authored = result.firstClear ? ANCHORS[result.floor]?.firstClearDrops ?? {} : {}
  return Object.entries(result.materialsAwarded)
    .filter(([, n]) => n > 0)
    .map(([id, n]) => ({ id, n, rarity: materialRarity(id, authored[id] !== undefined) }))
    .sort((a, b) => RANK[a.rarity] - RANK[b.rarity] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** Indices (in `rewardDrops` order) of the drops that deserve a chime. */
export function rareDropIndices(drops: readonly RewardDrop[]): number[] {
  return drops.flatMap((d, i) => (RANK[d.rarity] >= RANK.rare ? [i] : []))
}

export interface AnchorHeadline {
  /** The canon mission ('Subjugation', 'Escort'…), English. */
  mission: string
  /** The boss the floor was built around, when it has a card (English name and epithet). */
  boss: { name: string; epithet: string; color: string } | null
}

/** An anchor floor's headline; null for a filler floor. */
export function anchorHeadline(floor: number, log: CombatLog): AnchorHeadline | null {
  const anchor = ANCHORS[floor]
  if (!anchor) return null
  // The mission's own target first (F10's Black Priest, not the creature), else any boss.
  const tags = new Set(anchor.objectives.flatMap((o) => ('targetTag' in o && o.targetTag ? [o.targetTag] : [])))
  const enemies = log.unitsInit.filter((u) => u.side === 'enemy')
  const carded = enemies.filter((u) => introOf(u.templateId)?.tier === 'boss')
  const pick = carded.find((u) => u.targetTag !== undefined && tags.has(u.targetTag)) ?? carded[0]
  const intro = pick ? introOf(pick.templateId) : undefined
  return { mission: anchor.missionType, boss: intro ? { name: intro.name, epithet: intro.epithet, color: intro.color } : null }
}
