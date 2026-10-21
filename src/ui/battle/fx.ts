/**
 * Battle feel, as pure math (spec 2026-10-12, S6 + S7; WP2). Presentation only: none of
 * this touches the engine, and none of it uses Math.random, so every number here is
 * unit-tested and replays the same way twice.
 *
 *  - Pacing: how long each replay frame is held, the death hold, overtime.
 *  - Hitstop: the freeze on impact, scaled by how much the blow matters (Sakurai).
 *  - Trauma: Eiserloh's camera shake (shake = trauma², smooth noise, linear decay).
 *  - Highlights: the ~2 s "Sweep" reel for a won fight nobody died in.
 */
import type { CombatEvent, CombatLog, CombatUnitInit } from '../../engine/types'
import { hashString } from '../pixel/rand'

// ── Speeds ───────────────────────────────────────────────────────────────────

/** Replay speeds offered in the battle controls (keys 1-4). */
export const SPEEDS = [1, 2, 4, 8] as const
export type Speed = (typeof SPEEDS)[number]

/** A stored preference that is not one of SPEEDS falls back to the 2× default. */
export function normalizeSpeed(n: unknown): Speed {
  return (SPEEDS as readonly number[]).includes(n as number) ? (n as Speed) : 2
}

// ── Hitstop ──────────────────────────────────────────────────────────────────

export interface HitstopInput {
  amount: number
  /** The target's max HP (the blow is weighed against it). */
  maxHP: number
  crit: boolean
  /** The blow killed its target. */
  kill: boolean
  /** Replay speed multiplier (≥1). */
  speed: number
  /** Reduced motion halves the freeze. */
  reducedMotion?: boolean
}

/** Hitstop floor for a killing blow, at 1×. */
export const KILL_HITSTOP_MS = 180

/**
 * Real milliseconds the scene freezes on impact:
 * `40 + 140·min(1, dmg/maxHP)`, +100 on a crit, at least 180 on a kill, divided by √speed
 * (so a fast replay still feels the big blows), halved under reduced motion.
 */
export function hitstopMs(h: HitstopInput): number {
  const frac = h.maxHP > 0 ? Math.min(1, Math.max(0, h.amount) / h.maxHP) : 0
  let ms = 40 + 140 * frac
  if (h.crit) ms += 100
  if (h.kill) ms = Math.max(ms, KILL_HITSTOP_MS)
  ms /= Math.sqrt(Math.max(1, h.speed))
  if (h.reducedMotion) ms *= 0.5
  return Math.round(ms)
}

// ── Trauma (screen shake) ────────────────────────────────────────────────────

/** Trauma added per kind of moment. Clamped to [0, 1] when added. */
export const TRAUMA = {
  /** A blow worth ≥50% of the target's max HP. (Spec says 0.15; at trauma² that is a
   *  0.2-stage-pixel shake, which nobody sees — 0.25 gives a visible 0.5 px nudge.) */
  bigHit: 0.25,
  crit: 0.35,
  kill: 0.5,
  heroDeath: 0.5,
} as const

/** Trauma lost per second (Eiserloh: linear decay). */
export const TRAUMA_DECAY_PER_S = 1.5
/** Max shake offset in stage pixels at trauma 1. */
export const SHAKE_MAX_PX = 8

export function clampTrauma(t: number): number {
  return Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0
}

export function addTrauma(t: number, amount: number): number {
  return clampTrauma(t + amount)
}

export function decayTrauma(t: number, dtMs: number): number {
  return clampTrauma(t - (TRAUMA_DECAY_PER_S * Math.max(0, dtMs)) / 1000)
}

/**
 * How much trauma an event adds (0 = no shake). Shake is reserved for moments that
 * matter: crits, kills (and a hero's death), and blows worth half a life bar. An
 * ordinary hit does not shake the stage.
 */
export function traumaFor(e: CombatEvent | undefined, unit: (id: string) => CombatUnitInit | undefined): number {
  if (!e) return 0
  if (e.kind === 'death') {
    const u = unit(e.unitId)
    return u?.side === 'hero' && !u.isNpc ? TRAUMA.heroDeath : TRAUMA.kill
  }
  if (e.kind !== 'hit') return 0
  if (e.crit) return TRAUMA.crit
  const max = unit(e.targetId)?.maxHP ?? 0
  return max > 0 && e.amount >= max * 0.5 ? TRAUMA.bigHit : 0
}

/** Smooth 1-D value noise in [-1, 1] (hash lattice, smoothstep blend). */
export function smoothNoise(seed: string, x: number): number {
  const i = Math.floor(x)
  const f = x - i
  const a = (hashString(`${seed}:${i}`) / 4294967295) * 2 - 1
  const b = (hashString(`${seed}:${i + 1}`) / 4294967295) * 2 - 1
  const s = f * f * (3 - 2 * f)
  return a + (b - a) * s
}

/**
 * The shake offset (stage pixels) for a trauma level at time `tMs`:
 * `8px · trauma² · noise`, no rotation (rotated pixel art shimmers). `strength` is the
 * player's shake slider (0..1); 0 or reduced motion means no shake at all.
 */
export function shakeOffset(trauma: number, tMs: number, strength = 1): { x: number; y: number } {
  const t = clampTrauma(trauma)
  const k = SHAKE_MAX_PX * t * t * Math.min(1, Math.max(0, strength))
  if (k === 0) return { x: 0, y: 0 }
  const x = tMs / 45 // ~22 Hz noise
  return { x: k * smoothNoise('sx', x), y: k * smoothNoise('sy', x + 17.3) }
}

// ── Pacing ───────────────────────────────────────────────────────────────────

/** A hero's death holds the scene: never rushed past, whatever the speed. */
export const HERO_DEATH_MS = 2600
/** Extra slow motion on the blow that kills a hero (real ms, not divided by speed). */
export const HERO_FALL_SLOWMO_MS = 300
/** Replay time after which overtime starts ramping the speed up (TFT). */
export const OVERTIME_AFTER_MS = 20_000
/** Overtime ramps up to this speed over OVERTIME_RAMP_MS. */
export const OVERTIME_SPEED = 4
export const OVERTIME_RAMP_MS = 2_000

/**
 * Real milliseconds each kind of frame is held at 1×, keyed by the event the frame
 * SHOWS (the old table was keyed by the next event, which made `hit` the wind-up).
 * The dull beats are short; skills, crits, kills and deaths keep full time.
 */
export const HOLD_1X = {
  start: 300,
  'battle-start': 700,
  'wave-spawn': 800,
  /** A basic attack's wind-up: anticipation pull-back, then the lunge. */
  act: 240,
  /** An authored skill's wind-up: the name banner needs reading time. */
  actSkill: 480,
  /** An ordinary hit lands in 120..180 ms, longer for a heavier blow. */
  hitMin: 120,
  hitMax: 180,
  /** A crit, a kill or a skill's hit keeps the old full beat. */
  hitBig: 460,
  miss: 220,
  'hp-cost': 450,
  panic: 650,
  guard: 360,
  heal: 280,
  /** An enemy's death stays quick. */
  death: 380,
  mission: 900,
  order: 700,
  end: 600,
} as const

export interface PaceCtx {
  /** Effective speed (after overtime). */
  speed: number
  reducedMotion?: boolean
  unit: (id: string) => CombatUnitInit | undefined
  /** The shown event belongs to an authored-skill action (a named skill, not a basic attack). */
  skillAction?: boolean
}

/** Is this unit one of the Master's heroes (not a mission NPC, not a foe)? */
export function isPartyHero(u: CombatUnitInit | undefined): boolean {
  return !!u && u.side === 'hero' && !u.isNpc
}

/** Did this hit kill its target? (hpAfter ≤ 0, or the next event is that unit's death.) */
export function isKill(shown: CombatEvent, next: CombatEvent | undefined): boolean {
  if (shown.kind !== 'hit') return false
  return shown.hpAfter <= 0 || (next?.kind === 'death' && next.unitId === shown.targetId)
}

/**
 * Real milliseconds to hold the frame that shows `shown` before advancing to `next`.
 * Base time / speed, plus hitstop (/√speed) on hits, plus the hero-death hold (at least
 * 2600 / min(speed, 2), so 1300 ms even at 4× and 8×) and 300 ms of slow motion on the
 * blow that fells a hero.
 */
export function frameHoldMs(shown: CombatEvent | undefined, next: CombatEvent | undefined, ctx: PaceCtx): number {
  const speed = Math.max(1, ctx.speed)
  if (!shown) return Math.round(HOLD_1X.start / speed)
  switch (shown.kind) {
    case 'act':
      return Math.round((ctx.skillAction ? HOLD_1X.actSkill : HOLD_1X.act) / speed)
    case 'hit': {
      const target = ctx.unit(shown.targetId)
      const maxHP = target?.maxHP ?? 1
      const kill = isKill(shown, next)
      const frac = Math.min(1, Math.max(0, shown.amount) / Math.max(1, maxHP))
      const base = shown.crit || kill || ctx.skillAction ? HOLD_1X.hitBig : HOLD_1X.hitMin + (HOLD_1X.hitMax - HOLD_1X.hitMin) * frac
      let ms = base / speed + hitstopMs({ amount: shown.amount, maxHP, crit: shown.crit, kill, speed, reducedMotion: ctx.reducedMotion })
      if (kill && isPartyHero(target)) ms += HERO_FALL_SLOWMO_MS
      return Math.round(ms)
    }
    case 'death': {
      const u = ctx.unit(shown.unitId)
      if (isPartyHero(u)) return Math.round(Math.max(HOLD_1X.death / speed, HERO_DEATH_MS / Math.min(speed, 2)))
      return Math.round(HOLD_1X.death / speed)
    }
    default:
      return Math.round(HOLD_1X[shown.kind] / speed)
  }
}

/**
 * Overtime: after 20 s of replay, a slow replay ramps to 4× over 2 s (a long fight is a
 * dull fight; TFT). A speed already at or above 4× is left alone.
 */
export function overtimeSpeed(speed: number, replayMs: number): number {
  if (speed >= OVERTIME_SPEED || replayMs <= OVERTIME_AFTER_MS) return speed
  const ramp = Math.min(1, (replayMs - OVERTIME_AFTER_MS) / OVERTIME_RAMP_MS)
  return speed + (OVERTIME_SPEED - speed) * ramp
}

// ── Highlights (the Sweep reel) ──────────────────────────────────────────────

export interface HighlightShot {
  /** Frame cursor to show (frame c shows events[c - 1]). */
  cursor: number
  /** Real ms to hold it (the reel ignores the speed setting). */
  ms: number
}

/** Hold per shot in the highlight reel. Total stays ≤ HIGHLIGHT_BUDGET_MS. */
export const HIGHLIGHT_MS = { open: 200, hit: 360, kill: 420, end: 700 } as const
export const HIGHLIGHT_BUDGET_MS = 2_500

/**
 * The ~2 s Sweep reel: the opening, the party's 3 heaviest hits, the final kill and the
 * end, in battle order. Returns null when a hero of the party dies in the log: a fight
 * with a death is never swept.
 */
export function highlightPlan(log: CombatLog): HighlightShot[] | null {
  const unit = new Map(log.unitsInit.map((u) => [u.id, u]))
  if (log.events.some((e) => e.kind === 'death' && isPartyHero(unit.get(e.unitId)))) return null
  const shots = new Map<number, number>() // cursor → ms
  const start = log.events.findIndex((e) => e.kind === 'battle-start')
  if (start >= 0) shots.set(start + 1, HIGHLIGHT_MS.open)
  const heroHits = log.events
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.kind === 'hit' && unit.get(e.actorId)?.side === 'hero')
    .sort((a, b) => (b.e as { amount: number }).amount - (a.e as { amount: number }).amount || a.i - b.i)
    .slice(0, 3)
  for (const { i } of heroHits) shots.set(i + 1, HIGHLIGHT_MS.hit)
  let lastKill = -1
  log.events.forEach((e, i) => {
    if (e.kind === 'death' && unit.get(e.unitId)?.side === 'enemy') lastKill = i
  })
  if (lastKill >= 0) shots.set(lastKill + 1, HIGHLIGHT_MS.kill)
  shots.set(log.events.length, HIGHLIGHT_MS.end) // the last frame shows 'end'
  const plan = [...shots.entries()].sort((a, b) => a[0] - b[0]).map(([cursor, ms]) => ({ cursor, ms }))
  // Never over budget, whatever the log: squeeze every shot proportionally.
  const total = plan.reduce((s, p) => s + p.ms, 0)
  if (total > HIGHLIGHT_BUDGET_MS) {
    const k = HIGHLIGHT_BUDGET_MS / total
    for (const p of plan) p.ms = Math.floor(p.ms * k)
  }
  return plan
}

/** Total real time of a highlight reel. */
export function highlightTotalMs(plan: readonly HighlightShot[]): number {
  return plan.reduce((s, p) => s + p.ms, 0)
}

// ── Whole-replay estimate ────────────────────────────────────────────────────

/** Events that keep the action's skill banner (and so its skill pacing). */
const KEEPS_SKILL: ReadonlySet<CombatEvent['kind']> = new Set(['hit', 'miss', 'hp-cost', 'guard', 'heal'])

/**
 * For every frame (index c shows events[c - 1]), whether it belongs to an authored-skill
 * action — the same rule BattleScene's frames use for the skill banner.
 */
export function skillActionFrames(log: CombatLog, isSkill: (skillId: string) => boolean): boolean[] {
  const out: boolean[] = [false]
  let on = false
  for (const e of log.events) {
    if (e.kind === 'act') on = isSkill(e.skillId)
    else if (!KEEPS_SKILL.has(e.kind)) on = false
    out.push(on)
  }
  return out
}

/**
 * Real milliseconds a full replay takes at `speed` with no pauses and no orders, using
 * exactly BattleScene's scheduler rules (holds, hitstop, death holds, overtime).
 */
export function replayDurationMs(log: CombatLog, speed: number, isSkill: (skillId: string) => boolean, reducedMotion = false): number {
  const unit = new Map(log.unitsInit.map((u) => [u.id, u]))
  const skill = skillActionFrames(log, isSkill)
  let clock = 0
  for (let c = 0; c < log.events.length; c++) {
    const shown = c > 0 ? log.events[c - 1] : undefined
    clock += frameHoldMs(shown, log.events[c], {
      speed: overtimeSpeed(speed, clock),
      reducedMotion,
      unit: (id) => unit.get(id),
      skillAction: skill[c],
    })
  }
  return clock
}
