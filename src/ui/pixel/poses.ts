/**
 * Living sprites: the pure helpers behind battle poses and idle life
 * (spec 2026-10-12 S10). Nothing here touches the DOM.
 *
 *  - `battlePose`: which art pose a battle unit shows this frame.
 *  - `idlePhase` / `idleStyle`: a per-unit breathing and blinking rhythm, hashed
 *    from the unit's id, so a party no longer bobs in lockstep. Delivered as CSS
 *    custom properties that the `.idle-life` and `.blink-stack` rules in ui.css read:
 *
 *      <span className="blink-stack idle-life" style={idleStyle(unit.id)}>
 *        <img className="px" src={heroPoseUrl(hero, 'idle')} />
 *        <img className="px blink" src={heroBlinkUrl(hero)} alt="" />
 *      </span>
 *
 *    (`LivingSprite` in ./LivingSprite.tsx renders exactly that.)
 *
 * Hash-based, never Math.random: the same unit always breathes the same way, and
 * tests stay stable.
 */
import type { ArtPose } from './sprites'
import { hashString } from './rand'

/** Breathing: a 1-px bob. Periods in ms. */
export const BREATH_MS: readonly [number, number] = [900, 1400]
/** Blinks happen every 2–5 s. */
export const BLINK_EVERY_MS: readonly [number, number] = [2000, 5000]
/** How long the lids stay shut (the blink keyframe is the last 4% of a period). */
export const BLINK_SHUT_FRACTION = 0.04

export interface IdlePhase {
  /** one breath (down and up), ms */
  breathMs: number
  /** negative start offset into the breath cycle, ms (so units start mid-breath) */
  breathDelayMs: number
  /** time between blinks, ms */
  blinkEveryMs: number
  /** negative start offset into the blink cycle, ms */
  blinkDelayMs: number
}

function within(h: number, [lo, hi]: readonly [number, number]): number {
  return lo + (h % (hi - lo + 1))
}

/** A unit's idle rhythm: a pure function of its id. */
export function idlePhase(id: string): IdlePhase {
  const a = hashString(`breath|${id}`)
  const b = hashString(`blink|${id}`)
  const breathMs = Math.round(within(a, BREATH_MS) / 10) * 10
  const blinkEveryMs = Math.round(within(b, BLINK_EVERY_MS) / 10) * 10
  return {
    breathMs,
    breathDelayMs: -((a >>> 11) % breathMs),
    blinkEveryMs,
    blinkDelayMs: -((b >>> 13) % blinkEveryMs),
  }
}

/** The CSS custom properties `.idle-life` / `.blink-stack` read. Spread into `style`. */
export interface IdleStyle {
  '--idle-period': string
  '--idle-delay': string
  '--blink-period': string
  '--blink-delay': string
}

const ms = (n: number) => `${n}ms`

/** Per-unit idle variables for a React `style` prop (cast as needed: `style={idleStyle(id) as CSSProperties}`). */
export function idleStyle(id: string): IdleStyle {
  const p = idlePhase(id)
  return {
    '--idle-period': ms(p.breathMs),
    '--idle-delay': ms(p.breathDelayMs),
    '--blink-period': ms(p.blinkEveryMs),
    '--blink-delay': ms(p.blinkDelayMs),
  }
}

/** What a battle unit is doing on the current replay frame. */
export interface UnitMoment {
  dead?: boolean
  /** took a hit this frame */
  hurt?: boolean
  /** is the actor this frame */
  acting?: boolean
  /** the action is a skill / spell (shows `cast` rather than `attack`) */
  casting?: boolean
  /** the anticipation beat before the action lands */
  windingUp?: boolean
}

/**
 * The pose for a battle unit this frame. Priority: KO > hurt > the action itself
 * (wind-up, then cast or attack) > idle. A unit hit while acting (a counter) shows
 * hurt: the reaction reads more clearly than the swing.
 */
export function battlePose(m: UnitMoment): ArtPose {
  if (m.dead) return 'ko'
  if (m.hurt) return 'hurt'
  if (m.acting) {
    if (m.windingUp) return 'windup'
    return m.casting ? 'cast' : 'attack'
  }
  return 'idle'
}
