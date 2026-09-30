/**
 * How the estate reaches into the life sim (stepLife). Built once per catch-up from the
 * estate slice, then consulted per hero per slot — so it is all Sets and numbers:
 *
 * - decorations nudge needs and Sanity (rugs → sleep, hearth → company, flower beds and
 *   statues → calm, tapestries → morale, fountain → strolls, lanterns → nights, pennants
 *   → training XP);
 * - the weather sends heroes indoors, and the withdrawn skip company;
 * - heroes out on a bounty are away; burnt-out veterans teach better.
 *
 * Imports no life module at runtime (life imports this), so there is no cycle.
 */
import type { ActivityKind, GameState, HeroId, HeroLife, LifePlace, OwnedHero, XpProgress } from '../types'
import { DECOR_EFFECT as E, STATUE, TRAUMA } from './constants'
import { isOutdoor, outdoorPenalty, type Weather } from './weather'

export interface EstateLifeMods {
  lv: Record<string, number>
  statues: ReadonlySet<HeroId>
  /** Heroes out on a bounty. */
  away: ReadonlySet<HeroId>
  withdrawn: ReadonlySet<HeroId>
  veterans: ReadonlySet<HeroId>
  /** Training XP multiplier (pennants). */
  trainMult: number
  /** Guard power the lanterns add. */
  guard: number
}

/** The mods for one catch-up. Tolerates an older estate slice missing the new fields. */
export function estateLifeMods(state: GameState): EstateLifeMods {
  const e = state.estate
  const lv = e?.decor ?? {}
  const withdrawn = new Set<HeroId>()
  const veterans = new Set<HeroId>()
  for (const [id, t] of Object.entries(e?.trauma ?? {}) as [HeroId, NonNullable<GameState['estate']['trauma'][HeroId]>][]) {
    if (t.withdrawn) withdrawn.add(id)
    if (t.veteran) veterans.add(id)
  }
  const away = new Set<HeroId>()
  for (const b of e?.bounties ?? []) for (const id of b.heroIds) away.add(id)
  return {
    lv,
    statues: new Set(e?.statues ?? []),
    away,
    withdrawn,
    veterans,
    trainMult: 1 + E.bannersXp * (lv.banners ?? 0),
    guard: E.lanternGuard * (lv.lanterns ?? 0),
  }
}

/** A utility adjustment for choosing `kind` at `place` (added to the score). */
export function activityNudge(m: EstateLifeMods, heroId: HeroId, kind: ActivityKind, place: LifePlace, weather: Weather): number {
  let v = 0
  if (kind === 'socialize' && m.withdrawn.has(heroId)) v -= 1.5
  if (kind !== 'work' && kind !== 'sleep' && isOutdoor(place)) v -= outdoorPenalty(weather)
  if (kind === 'wander') v += 0.05 * (m.lv.fountain ?? 0)
  if (kind === 'socialize') v += 0.04 * (m.lv.hearth ?? 0)
  return v
}

/** The part of a life-sim hero the estate may touch in one slot. */
export interface EstateWorking {
  hero: OwnedHero
  life: HeroLife
  sanity: number
  xp: XpProgress
}

/**
 * Apply the estate to one living hero for one slot (after the activity's own effect).
 * `night` = the hero's own sleeping hours.
 */
export function estateLive(m: EstateLifeMods, w: EstateWorking, kind: ActivityKind, night: boolean): void {
  const lv = m.lv
  const n = w.life.needs
  const place = w.life.doing.place
  if (kind === 'sleep' && place === 'dormitory') n.energy += E.rugsEnergy * (lv.rugs ?? 0)
  if (kind === 'socialize' && place === 'tavern') {
    n.social += E.hearthSocial * (lv.hearth ?? 0)
    n.fun += E.hearthFun * (lv.hearth ?? 0)
  }
  if (kind === 'wander') {
    n.fun += E.fountainFun * (lv.fountain ?? 0)
    n.social += E.fountainSocial * (lv.fountain ?? 0)
  }
  if (place === 'garden') w.sanity += E.gardenSanity * (lv.flowerbeds ?? 0)
  if (night && kind !== 'sleep') w.sanity += E.lanternNight * (lv.lanterns ?? 0)
  if ((lv.tapestries ?? 0) > 0 && n.energy >= 60 && n.hunger >= 60 && n.social >= 60 && n.fun >= 60) w.sanity += E.tapestriesContent * lv.tapestries!
  if (m.statues.size > 0) {
    if (place === 'memorial') w.sanity += Math.min(STATUE.memorialSanityCap, STATUE.memorialSanity * m.statues.size)
    if (w.life.grief > 0 && w.life.memories.some((x) => x.kind === 'friendDied' && x.other && m.statues.has(x.other))) {
      w.life.grief = Math.max(0, w.life.grief - STATUE.griefDecay)
    }
  }
}

/** Instructor power multiplier (a burnt-out veteran teaches with the scars to show for it). */
export function instructorMult(m: EstateLifeMods, heroId: HeroId): number {
  return m.veterans.has(heroId) ? TRAUMA.veteranInstructor : 1
}
