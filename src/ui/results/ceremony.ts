/**
 * The results ceremony's timeline (lane K): which beat appears when, how long a count-up
 * runs, and which sound marks it. PURE — the screen asks it where it stands at `elapsed`
 * ms, so a skip is just "elapsed = total" and the tests can walk the clock by hand.
 *
 * Order: the banner; the fallen (a victory with losses mourns before it counts); the
 * gold and XP counting up; the first-clear stamp; drops; truths found; skill milestones;
 * then the report. An anchor's banner holds longer. The battle-speed setting divides
 * every duration; reduced motion shows everything at once with no count-up.
 */
import type { CueName } from '../audio/cues'

export type CeremonyStepKind =
  | 'banner'
  | 'memorial'
  | 'gold'
  | 'xp'
  | 'first-clear'
  | 'drop'
  | 'hidden'
  | 'skill'
  | 'report'

export interface CeremonyStep {
  /** Unique within the plan: `${kind}` or `${kind}:${index}`. */
  id: string
  kind: CeremonyStepKind
  /** When it appears (ms from the start). */
  at: number
  /** How long its own animation runs (a count-up's length). */
  dur: number
}

export interface CeremonyCue {
  at: number
  cue: CueName
  gain?: number
}

export interface CeremonyPlan {
  steps: CeremonyStep[]
  cues: CeremonyCue[]
  /** When the last beat has finished. */
  total: number
  /** Reduced motion: everything is shown at once. */
  instant: boolean
}

/** What the screen has to celebrate (or mourn). */
export interface CeremonyInput {
  won: boolean
  anchor: boolean
  firstClear: boolean
  gold: number
  xp: number
  /** Number of material drops (each gets a beat). */
  drops: number
  /** Indices of drops that are rare (a chime instead of a flip). */
  rareDrops?: readonly number[]
  hidden: number
  /** Skill milestone kinds, in order. */
  skills: readonly ('level-up' | 'merge' | 'unlock' | 'achievement')[]
  /** Heroes who fell (each gets a band). */
  fallen: number
}

export interface CeremonyOpts {
  speed: number
  reduced: boolean
}

/** Base timings at 1× (ms). */
export const CEREMONY_MS = {
  banner: 900,
  anchorBanner: 1500,
  memorial: 1200,
  goldMin: 700,
  goldPerDigit: 140,
  goldMax: 1500,
  xp: 600,
  firstClear: 650,
  drop: 380,
  hidden: 600,
  skill: 480,
  report: 300,
  /** The pause between beats. */
  gap: 120,
  /** A coin tick every… while gold counts. */
  coinTick: 110,
  /** At most this many coin ticks per count. */
  coinTicks: 9,
} as const

/** How long the gold counts for a given amount (longer for more digits, capped). */
export function goldCountMs(gold: number): number {
  if (gold <= 0) return 0
  const digits = String(Math.floor(gold)).length
  return Math.min(CEREMONY_MS.goldMax, CEREMONY_MS.goldMin + digits * CEREMONY_MS.goldPerDigit)
}

/** Build the timeline. */
export function ceremonyPlan(input: CeremonyInput, opts: CeremonyOpts): CeremonyPlan {
  const M = CEREMONY_MS
  const speed = Math.max(1, opts.speed)
  const steps: CeremonyStep[] = []
  const cues: CeremonyCue[] = []
  let at = 0
  const push = (id: string, kind: CeremonyStepKind, dur: number, cue?: CueName, gain?: number) => {
    const d = Math.round(dur / speed)
    steps.push({ id, kind, at, dur: d })
    if (cue) cues.push({ at, cue, ...(gain !== undefined ? { gain } : {}) })
    at += d + Math.round(M.gap / speed)
  }
  // A loss is quiet: no sound over the dead but the jingle the battle already played.
  const mourning = input.fallen > 0

  push('banner', 'banner', input.anchor && input.won ? M.anchorBanner : M.banner)
  for (let i = 0; i < input.fallen; i++) push(`memorial:${i}`, 'memorial', M.memorial)
  if (input.gold > 0) {
    const start = at
    const dur = goldCountMs(input.gold)
    push('gold', 'gold', dur)
    // Coins rattle as the gold counts up (softer when someone fell).
    const ticks = Math.min(M.coinTicks, Math.max(1, Math.floor(dur / M.coinTick)))
    for (let k = 0; k < ticks; k++) cues.push({ at: start + Math.round((k * dur) / ticks / speed), cue: 'coins', gain: mourning ? 0.25 : 0.55 })
  }
  if (input.xp > 0) push('xp', 'xp', M.xp)
  if (input.firstClear && input.won) push('first-clear', 'first-clear', M.firstClear, 'confirm', mourning ? 0.5 : 1)
  const rare = new Set(input.rareDrops ?? [])
  for (let i = 0; i < input.drops; i++) push(`drop:${i}`, 'drop', M.drop, rare.has(i) ? 'rare' : 'flip', mourning ? 0.5 : 0.8)
  for (let i = 0; i < input.hidden; i++) push(`hidden:${i}`, 'hidden', M.hidden, 'rare', mourning ? 0.5 : 0.9)
  // A defeat's survivors still learn, but no fanfare plays over a lost fight.
  input.skills.forEach((k, i) => push(`skill:${i}`, 'skill', M.skill, !input.won ? undefined : k === 'merge' || k === 'achievement' ? 'legend' : 'levelup', mourning ? 0.5 : 0.8))
  push('report', 'report', M.report)
  const total = Math.max(0, at - Math.round(M.gap / speed))

  if (opts.reduced) {
    // Everything at once; one sound for the haul, none over the dead.
    return {
      steps: steps.map((s) => ({ ...s, at: 0, dur: 0 })),
      cues: input.gold > 0 && !mourning ? [{ at: 0, cue: 'coins', gain: 0.55 }] : [],
      total: 0,
      instant: true,
    }
  }
  cues.sort((a, b) => a.at - b.at)
  return { steps, cues, total, instant: false }
}

export type StepPhase = 'waiting' | 'running' | 'done'

/** Where a step stands at `elapsed`, and how far its own animation has run (0..1). */
export function stepAt(step: CeremonyStep, elapsed: number): { phase: StepPhase; progress: number } {
  if (elapsed < step.at) return { phase: 'waiting', progress: 0 }
  if (step.dur <= 0 || elapsed >= step.at + step.dur) return { phase: 'done', progress: 1 }
  return { phase: 'running', progress: (elapsed - step.at) / step.dur }
}

/** A count-up's shown value: eases out (fast first, settling on the target). */
export function countUp(target: number, progress: number): number {
  if (progress >= 1) return target
  if (progress <= 0) return 0
  const inv = 1 - progress
  return Math.round(target * (1 - inv * inv * inv))
}

/** The cues due between two clock readings (from exclusive, to inclusive; the first
 *  reading, from < 0, includes the cues at 0). */
export function cuesBetween(plan: CeremonyPlan, from: number, to: number): CeremonyCue[] {
  return plan.cues.filter((c) => c.at > from && c.at <= to)
}

/** Is the whole ceremony over at `elapsed`? */
export function ceremonyDone(plan: CeremonyPlan, elapsed: number): boolean {
  return plan.instant || elapsed >= plan.total
}
