/**
 * Battle choreography: how each unit moves for the event on screen. Melee fighters run
 * across the field, strike and run back; archers loose an arrow and casters a bolt that
 * flies to the target; big or rooted foes lunge where they stand. The blow knocks the
 * target back. Pure: it only reads the event and the layout.
 */
import type { CombatEvent, CombatUnitInit, Element } from '../../engine/types'
import { SKILLS } from '../../engine/content'

export type AttackStyle = 'melee' | 'arrow' | 'magic' | 'lunge'

const ENEMY_ARCHER = /marksman|archer/i
const ENEMY_CASTER = /disciple|priest|shaman|mage|witch|sorcer|core/i
/** Foes this wide are too big (or too rooted) to run across the field. */
const BIG = 56

/** How a unit delivers `skillId`. */
export function attackStyle(u: CombatUnitInit, skillId: string | null, width: number): AttackStyle {
  const def = skillId ? SKILLS[skillId] : undefined
  const elemental = def !== undefined && (def.damageType === 'magic' || (def.element != null && def.element !== 'physical'))
  if (u.side === 'hero' || u.isNpc) {
    if (u.unitClass === 'archer') return elemental ? 'magic' : 'arrow'
    if (u.unitClass === 'mage') return 'magic'
    return 'melee'
  }
  if (ENEMY_ARCHER.test(u.name)) return 'arrow'
  if (ENEMY_CASTER.test(u.name) || elemental) return 'magic'
  return width >= BIG ? 'lunge' : 'melee'
}

export interface Pose {
  /** Offset from the unit's place, stage px. */
  dx: number
  dy: number
  /** Stack above the target while striking it. */
  z?: number
}

export interface Shot {
  style: 'arrow' | 'magic'
  from: { x: number; y: number }
  to: { x: number; y: number }
  element: Element
  key: number
}

type Pos = Record<string, { x: number; y: number }>

/**
 * Where everyone stands for this event, and the projectile in flight (if any).
 * `styleOf` says how each unit attacks for the action; `widthOf` how wide it is.
 */
export function choreograph(
  e: CombatEvent | undefined,
  pos: Pos,
  byId: Record<string, CombatUnitInit>,
  style: AttackStyle | null,
  widthOf: (id: string) => number,
  heightOf: (id: string) => number,
  element: Element,
): { poses: Record<string, Pose>; shot: Shot | null } {
  const poses: Record<string, Pose> = {}
  if (!e || (e.kind !== 'act' && e.kind !== 'hit' && e.kind !== 'miss' && e.kind !== 'guard')) return { poses, shot: null }
  const a = pos[e.actorId]
  const tgt = pos[e.targetId]
  const actor = byId[e.actorId]
  if (!a || !tgt || !actor || e.actorId === e.targetId) return { poses, shot: null }
  const toward = Math.sign(tgt.x - a.x) || (actor.side === 'hero' ? -1 : 1)
  const s = style ?? 'melee'
  if (s === 'melee') {
    // Stop just short of the target, on the attacker's side of it.
    const gap = Math.round(widthOf(e.targetId) / 2 + widthOf(e.actorId) / 2 - 4)
    poses[e.actorId] = { dx: tgt.x - toward * gap - a.x, dy: tgt.y - a.y, z: tgt.y + 1 }
  } else {
    poses[e.actorId] = { dx: toward * (s === 'lunge' ? 14 : 6), dy: 0 }
  }
  if (e.kind === 'hit') poses[e.targetId] = { dx: toward * (e.crit ? 8 : 4), dy: 0 }
  const shot: Shot | null =
    e.kind === 'act' && (s === 'arrow' || s === 'magic')
      ? {
          style: s,
          from: { x: a.x + toward * 8, y: a.y - Math.round(heightOf(e.actorId) * 0.6) },
          to: { x: tgt.x, y: tgt.y - Math.round(heightOf(e.targetId) / 2) },
          element,
          key: e.seq,
        }
      : null
  return { poses, shot }
}

/** Damage numbers on one target stack upward instead of piling on each other. */
export function popupOffsets<T extends { target: string }>(popups: readonly T[]): number[] {
  const seen = new Map<string, number>()
  const out: number[] = []
  for (let i = popups.length - 1; i >= 0; i--) {
    const k = seen.get(popups[i]!.target) ?? 0
    seen.set(popups[i]!.target, k + 1)
    out[i] = k
  }
  return out
}
