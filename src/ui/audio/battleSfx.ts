/**
 * What a battle beat sounds like, as pure data: the events of one beat in, a list of cues
 * (with their delay, detune and level) out. useBattleAudio plays them. Keeping the mapping
 * pure means it is unit-tested, and new event kinds (a later lane's telegraphs and boss
 * phases) only need a line here.
 *
 * A sweep's blows land one after another (popupDelay), and so do their sounds; past a few
 * blows the rest are dropped and the kept ones taper, so an AoE over eight foes is a
 * rolling crunch, not a machine gun. CueLimiter caps any family across beats too (4×).
 */
import type { CombatEvent, CombatUnitInit, Element } from '../../engine/types'
import { SKILLS } from '../../engine/content'
import { popupDelay } from '../battle/battleFrames'
import type { CueName, CueOpts } from './cues'

export interface CueCall {
  cue: CueName
  /** Milliseconds after the beat starts (at 1×). */
  delayMs: number
  opts: CueOpts
}

export interface BeatSfxContext {
  byId: Record<string, Pick<CombatUnitInit, 'side' | 'element'> & { isNpc?: boolean }>
  /** The element of the beat's action (snap.element). */
  element: Element
  /** A trial: a hero who drops is only out. */
  nonLethal?: boolean
}

/** Most blow sounds one beat plays (the rest of a sweep is carried by these). */
export const MAX_BLOWS = 4
/** Most misses, heals, statuses per beat. */
const MAX_SMALL = 2

/** ±30 cents, stable per event (a flurry never sounds copy-pasted, a replay sounds the same). */
export function detuneFor(seq: number, salt = 0): number {
  let h = (seq * 2654435761 + salt * 40503) >>> 0
  h = (h ^ (h >>> 15)) >>> 0
  h = Math.imul(h, 2246822519) >>> 0
  h = (h ^ (h >>> 13)) >>> 0
  return (h % 61) - 30
}

const NOT_A_CAST = new Set(['basic', 'e_spell'])

/** The cues for one beat. Pure. */
export function cuesForBeat(beat: readonly CombatEvent[], ctx: BeatSfxContext): CueCall[] {
  const out: CueCall[] = []
  let blows = 0
  let critPlayed = false
  let misses = 0
  let heals = 0
  let statuses = 0
  let dots = 0
  const add = (cue: CueName, delayMs: number, opts: CueOpts = {}) => out.push({ cue, delayMs, opts })
  const side = (id: string) => ctx.byId[id]?.side

  for (const e of beat) {
    switch (e.kind) {
      case 'battle-start':
        add('battle-start', 0)
        break
      case 'wave-spawn':
        add('wave-start', 0)
        break
      case 'act': {
        if (NOT_A_CAST.has(e.skillId)) break
        const el = SKILLS[e.skillId]?.element ?? ctx.byId[e.actorId]?.element ?? ctx.element
        add('cast', 0, { element: el, detune: detuneFor(e.seq) })
        break
      }
      case 'hit': {
        const i = blows++
        if (i >= MAX_BLOWS) break
        const at = popupDelay(i)
        const gain = 1 / (1 + 0.22 * i)
        const pan = side(e.targetId) === 'hero' ? 0.35 : -0.35
        if (e.eff === 'immune') {
          add('immune', at, { gain, pan })
          break
        }
        const crit = e.crit && !critPlayed
        if (crit) critPlayed = true
        add(crit ? 'crit' : 'hit', at, { element: ctx.element, detune: detuneFor(e.seq), gain, pan })
        if (e.eff === 'weak') add('weak', at + 30, { gain })
        else if (e.eff === 'resist') add('resist', at + 20, { gain })
        break
      }
      case 'miss': {
        const i = blows++
        if (misses++ >= MAX_SMALL || i >= MAX_BLOWS) break
        add('miss', popupDelay(i), { detune: detuneFor(e.seq), gain: 0.9 })
        break
      }
      case 'guard': {
        const i = blows++
        if (i >= MAX_BLOWS) break
        add('guard', popupDelay(i), { detune: detuneFor(e.seq) })
        break
      }
      case 'heal': {
        const i = blows++
        if (heals++ >= 1) break
        add(e.status === 'regen' ? 'regen' : 'heal', popupDelay(Math.min(i, MAX_BLOWS)), { detune: detuneFor(e.seq) })
        break
      }
      case 'status': {
        // A war cry over the whole party sounds once (its later targets carry `nth`).
        if (e.nth !== undefined || statuses++ >= MAX_SMALL) break
        if (e.status === 'shield') add('shield', 60)
        else add('status', 60, { status: e.status })
        break
      }
      case 'status-end':
        if (e.status === 'shield' && e.reason === 'broken') add('shield-break', 0)
        break
      case 'dot':
        if (dots++ >= 1) break
        add('dot', 0, { status: e.status, gain: 0.7 })
        break
      case 'shield':
        add('shield', 0, { gain: 0.45 })
        break
      case 'death': {
        const u = ctx.byId[e.unitId]
        const hero = u?.side === 'hero' && !(ctx.nonLethal && !u.isNpc)
        add(hero ? 'hero-death' : 'death', hero ? 0 : 80, { detune: detuneFor(e.seq) })
        break
      }
      case 'mission': {
        const cue = missionCue(e.code)
        if (cue) add(cue, 0)
        break
      }
      case 'order':
        add('order', 0)
        break
      case 'cover':
        add('cover', 0)
        break
      case 'followup':
        add('followup', 0)
        break
      case 'rivalry':
        add('rivalry', 0)
        break
      case 'floor-mods':
        add('floor-mods', 0)
        break
      case 'panic':
        add('panic', 0)
        break
      case 'hp-cost':
        add('hp-cost', 0)
        break
      case 'sp':
      case 'end':
        // SP ticks are too frequent to sound; the end is the music's (victory / defeat).
        break
      default: {
        // Kinds a later lane adds (telegraphs, boss phases) sound without a change here.
        const k = (e as { kind: string }).kind
        if (k === 'telegraph') add('telegraph', 0)
        else if (k === 'phase') add('phase', 0)
      }
    }
  }
  return out
}

function missionCue(code: string | undefined): CueName | null {
  switch (code) {
    case 'wave-cleared':
      return 'wave-clear'
    case 'defeated':
    case 'taken':
    case 'horde-spent':
      return 'mission-good'
    case 'escort-low':
    case 'futile':
      return 'mission-bad'
    case 'hold':
    case 'deadline':
    case 'escape':
      return 'tick'
    case 'shield-down':
      return 'shield-break'
    case 'wakes':
      return 'phase'
    default:
      return null
  }
}

/** Which family a cue counts against (the limiter's buckets). */
export function cueFamily(cue: CueName): string {
  if (cue === 'hit' || cue === 'crit' || cue === 'immune') return 'blow'
  if (cue === 'weak' || cue === 'resist') return 'accent'
  if (cue === 'status' || cue === 'shield' || cue === 'shield-break') return 'status'
  return cue
}

/** Per family: at most `max` cues inside any `windowMs`. */
export const LIMITS: Record<string, { max: number; windowMs: number }> = {
  blow: { max: 6, windowMs: 320 },
  accent: { max: 3, windowMs: 320 },
  status: { max: 3, windowMs: 400 },
  miss: { max: 2, windowMs: 300 },
  dot: { max: 2, windowMs: 300 },
  heal: { max: 2, windowMs: 300 },
  death: { max: 3, windowMs: 300 },
  cast: { max: 2, windowMs: 250 },
}
const DEFAULT_LIMIT = { max: 4, windowMs: 300 }

/**
 * A sliding-window rate limit across beats (at 4× beats come fast and an AoE floor would
 * otherwise machine-gun). Pure: the caller passes the clock.
 */
export class CueLimiter {
  private played = new Map<string, number[]>()
  constructor(private readonly limits: Record<string, { max: number; windowMs: number }> = LIMITS) {}

  /** May `cue` play at `nowMs`? (Records it when it may.) */
  allow(cue: CueName, nowMs: number): boolean {
    const fam = cueFamily(cue)
    const lim = this.limits[fam] ?? DEFAULT_LIMIT
    const times = (this.played.get(fam) ?? []).filter((t) => nowMs - t < lim.windowMs)
    if (times.length >= lim.max) {
      this.played.set(fam, times)
      return false
    }
    times.push(nowMs)
    this.played.set(fam, times)
    return true
  }

  reset(): void {
    this.played.clear()
  }
}
