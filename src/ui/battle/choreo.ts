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
  // A caster foe's Spell (engine/unit ENEMY_SPELL_ID) flies as a bolt.
  if (skillId === 'e_spell' || ENEMY_CASTER.test(u.name) || elemental) return 'magic'
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
  /** Everyone a sweep strikes in this beat: each is knocked back, not only the first. */
  struck: readonly string[] = [],
): { poses: Record<string, Pose>; shot: Shot | null } {
  const poses: Record<string, Pose> = {}
  if (!e || (e.kind !== 'act' && e.kind !== 'hit' && e.kind !== 'miss' && e.kind !== 'guard' && e.kind !== 'followup')) return { poses, shot: null }
  // A follow-up is the friend's own strike: they move (or loose a shot) like an 'act'.
  const actorId = e.kind === 'followup' ? e.unitId : e.actorId
  const a = pos[actorId]
  const tgt = pos[e.targetId]
  const actor = byId[actorId]
  if (!a || !tgt || !actor || actorId === e.targetId) return { poses, shot: null }
  const toward = Math.sign(tgt.x - a.x) || (actor.side === 'hero' ? -1 : 1)
  const s = style ?? 'melee'
  if (s === 'melee') {
    // Stop just short of the target, on the attacker's side of it.
    const gap = Math.round(widthOf(e.targetId) / 2 + widthOf(actorId) / 2 - 4)
    poses[actorId] = { dx: tgt.x - toward * gap - a.x, dy: tgt.y - a.y, z: tgt.y + 1 }
  } else {
    poses[actorId] = { dx: toward * (s === 'lunge' ? 14 : 6), dy: 0 }
  }
  if (e.kind === 'hit') poses[e.targetId] = { dx: toward * (e.crit ? 8 : 4), dy: 0 }
  for (const id of struck) if (id !== actorId && !poses[id] && pos[id]) poses[id] = { dx: toward * 4, dy: 0 }
  const shot: Shot | null =
    (e.kind === 'act' || e.kind === 'followup') && (s === 'arrow' || s === 'magic')
      ? {
          style: s,
          from: { x: a.x + toward * 8, y: a.y - Math.round(heightOf(actorId) * 0.6) },
          to: { x: tgt.x, y: tgt.y - Math.round(heightOf(e.targetId) / 2) },
          element,
          key: e.seq,
        }
      : null
  return { poses, shot }
}

/** A damage number's box on the stage: centred on `x`, its top at `y`, before lifting. */
export interface PopupBox {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Lanes for damage numbers: how many px each one rises so that no two boxes overlap —
 * neither on the same target (they stack) nor on neighbours standing side by side (a
 * crit on one and a hit on the next never merge into one long number). The newest
 * popup keeps its place; older ones make way, upward, in small steps.
 */
export function popupLanes(boxes: readonly PopupBox[], step = 3, maxLift = 90): number[] {
  return popupPlaces(boxes, step, maxLift, 0).map((p) => p.lift)
}

/**
 * Lanes that may also slide sideways: each box rises the least it can, and on the way
 * tries a step left or right of its unit (up to `slide` × its width, in thirds) before rising
 * further — a sweep's crowded column of numbers fans out instead of towering. Newest first,
 * as `popupLanes`.
 */
export function popupPlaces(
  boxes: readonly PopupBox[],
  step = 3,
  maxLift = 90,
  slide = 0.9,
  /** Boxes already on screen that popups must keep clear of (a skill's name banner). */
  fixed: readonly PopupBox[] = [],
  /** The visible stretch (stage px): a sideways slide never pushes a box off it. */
  bounds: { left: number; right: number } = { left: -Infinity, right: Infinity },
): { dx: number; lift: number }[] {
  const placed: { l: number; r: number; t: number; b: number }[] = fixed.map((p) => ({ l: p.x - p.w / 2, r: p.x + p.w / 2, t: p.y, b: p.y + p.h }))
  const out: { dx: number; lift: number }[] = boxes.map(() => ({ dx: 0, lift: 0 }))
  const at = (p: PopupBox, dx: number, lift: number) => ({ l: p.x + dx - p.w / 2, r: p.x + dx + p.w / 2, t: p.y - lift, b: p.y - lift + p.h })
  const clash = (r: { l: number; r: number; t: number; b: number }) =>
    placed.some((q) => r.l < q.r + 1 && q.l < r.r + 1 && r.t < q.b + 1 && q.t < r.b + 1)
  for (let i = boxes.length - 1; i >= 0; i--) {
    const p = boxes[i]!
    const s = Math.round((p.w * slide) / 3)
    // A slide may not carry the box off the visible stretch (unless it was off it already).
    const inside = (dx: number) => dx === 0 || (p.x + dx - p.w / 2 >= bounds.left && p.x + dx + p.w / 2 <= bounds.right)
    const shifts = (s > 0 ? [0, -s, s, -2 * s, 2 * s, -3 * s, 3 * s] : [0]).filter(inside)
    let best = { dx: 0, lift: 0 }
    search: for (let lift = 0; ; lift += step) {
      for (const dx of shifts) {
        if (!clash(at(p, dx, lift)) || lift >= maxLift) {
          best = { dx: lift >= maxLift && clash(at(p, dx, lift)) ? 0 : dx, lift: Math.min(lift, maxLift) }
          break search
        }
      }
    }
    placed.push(at(p, best.dx, best.lift))
    out[i] = best
  }
  return out
}
