/**
 * Captions for the combat-depth events (cover, follow-up, rivalry, the floor's
 * conditions). BattleScene calls `depthSnap` for any event kind it doesn't handle itself,
 * so these stay out of the scene's own switch.
 */
import type { CombatEvent } from '../../engine/types'
import { t } from '../i18n/i18n'
import { modifierName } from '../depth/floorModText'

/** How long each depth event holds the screen at 1× (merged into the scene's durations). */
export const DEPTH_DURATION = {
  cover: 900,
  followup: 520,
  rivalry: 800,
  'floor-mods': 1100,
} as const

export type DepthEventKind = keyof typeof DEPTH_DURATION

/** What the scene shows for a depth event: the caption, and who acts on whom. */
export function depthSnap(
  e: CombatEvent,
  nameOf: (id: string) => string,
): { caption: string; actor: string | null; target: string | null } | null {
  switch (e.kind) {
    case 'cover':
      return {
        caption: t('{name} throws themself in front of {friend}!', { name: nameOf(e.unitId), friend: nameOf(e.allyId) }),
        actor: e.unitId,
        target: e.allyId,
      }
    case 'followup':
      return {
        caption: t('{name} follows up for {friend}!', { name: nameOf(e.unitId), friend: nameOf(e.allyId) }),
        actor: e.unitId,
        target: e.targetId,
      }
    case 'rivalry':
      return {
        caption: t('{name} ignores the order — no kill goes to {rival}!', { name: nameOf(e.unitId), rival: nameOf(e.rivalId) }),
        actor: e.unitId,
        target: e.targetId,
      }
    case 'floor-mods':
      return { caption: e.modifiers.map((m) => modifierName(m)).join(' · '), actor: null, target: null }
    default:
      return null
  }
}
