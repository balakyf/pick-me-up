/**
 * Captions, timings and the field's boss state for lane G's events: a foe winding up a big
 * move (a telegraph), the move coming to nothing (stunned, or its caster fell), the move
 * firing, a boss changing phase, units summoned onto the field, and the Master's orders 2.0.
 * BattleScene's frames call `bossSnap` for any event kind they don't handle themselves (the
 * synergyCaptions / statusCaptions pattern), so these stay out of the scene's own switch.
 * Pure.
 */
import type { BattleOrder, CombatEvent } from '../../engine/types'
import { SKILLS } from '../../engine/content'
import { t } from '../i18n/i18n'

/** How long each boss event holds the screen at 1× (merged into the scene's durations). */
export const BOSS_DURATION = {
  /** A wind-up: long enough to read the line and reach for an order. */
  telegraph: 1400,
  'telegraph-end': 1000,
  /** The phase cinematic: the flash, the title card, the boss's line. */
  phase: 2800,
  summon: 1000,
} as const

/** A charged move landing holds a little longer than a plain cast. */
export const CHARGED_ACT_MS = 760

export type BossEventKind = keyof typeof BOSS_DURATION
type BossEvent = Extract<CombatEvent, { kind: BossEventKind }>

function isBossEvent(e: CombatEvent): e is BossEvent {
  return e.kind in BOSS_DURATION
}

/** How long a boss event holds the screen at 1× (a charged blow too); undefined otherwise. */
export function bossDuration(e: CombatEvent): number | undefined {
  if (e.kind === 'act' && e.charged) return CHARGED_ACT_MS
  return isBossEvent(e) ? BOSS_DURATION[e.kind] : undefined
}

/** A move being wound up, as the replay shows it. */
export interface ChargeMark {
  unitId: string
  skillId: string
  /** The tick it was wound up on, and the tick it fires. */
  fromTick: number
  firesAtTick: number
  /** Whom it threatens. */
  targets: string[]
}

/** The latest phase change (the cinematic plays on its own beat). */
export interface PhaseMark {
  unitId: string
  phase: number
  phases: number
  title?: string
  line?: string
  seq: number
}

/** What the boss layer of a frame holds. */
export interface BossView {
  charges: ChargeMark[]
  phase?: PhaseMark
  /** Phases each boss has passed (unit id → count), for the boss's pips. */
  passed: Record<string, number>
}

const EMPTY: BossView = { charges: [], passed: {} }

/** The skill's display name (an enemy's kit or a hero's). */
export function moveName(skillId: string): string {
  return t(SKILLS[skillId]?.name ?? 'Strike')
}

/** The wind-up line a skill authors ('{name} draws a deep breath…'), filled in. */
export function chargeLine(skillId: string, name: string, target: string): string {
  const line = SKILLS[skillId]?.charge?.line
  if (line === undefined) return t('{name} gathers strength for {move}…', { name, move: moveName(skillId) })
  return t(line, { name, target })
}

/** The phase title, translated (or "Phase n"). */
export function phaseTitle(p: Pick<PhaseMark, 'phase' | 'title'>): string {
  return p.title !== undefined ? t(p.title) : t('Phase {n}', { n: p.phase + 1 })
}

/** What the Master's order says on screen. */
export function orderCaption(o: BattleOrder, nameOf: (id: string) => string): string {
  switch (o.kind) {
    case 'retreat':
      return t('The Master sounds the retreat!')
    case 'focus':
      return t('The Master: “Everyone on {name}!”', { name: nameOf(o.enemyId) })
    case 'protect':
      return t('The Master: “Cover {name}!”', { name: nameOf(o.allyId) })
    case 'unleash':
      return t('The Master: “{name} — now, everything you have!”', { name: nameOf(o.allyId) })
    case 'guard':
      return o.onTelegraph ? t('The Master: “Watch its big moves — brace when it winds up!”') : t('The Master: “Brace yourselves!”')
    case 'hold':
      return t('The Master: “Save your strength for the big one!”')
    case 'swap':
      return t('The Master: “{a}, {b} — change places!”', { a: nameOf(o.a), b: nameOf(o.b) })
  }
}

/** The caption a charged move says as it lands (how the party met it, if it did). */
export function chargedCaption(e: Extract<CombatEvent, { kind: 'act' }>, nameOf: (id: string) => string): string {
  const move = moveName(e.skillId)
  if (e.answered === 'guard') return t('{name} unleashes {move} — the party has braced for it!', { name: nameOf(e.actorId), move })
  if (e.answered === 'protect') return t('{name} unleashes {move} — the party covers {target}!', { name: nameOf(e.actorId), move, target: nameOf(e.targetId) })
  return t('{name} unleashes {move}!', { name: nameOf(e.actorId), move })
}

/** The boss view after a charged move fires: its mark is gone. */
export function afterCharged(view: BossView | undefined, actorId: string): BossView {
  const v = view ?? EMPTY
  return { ...v, charges: v.charges.filter((c) => c.unitId !== actorId) }
}

/**
 * What the scene shows for a boss event: the caption, and who acts on whom. It also moves
 * the frame on: summoned units become visible, the charges and the phase into `next.boss`.
 * Null for any other kind (BattleScene handles those).
 */
export function bossSnap(
  e: CombatEvent,
  nameOf: (id: string) => string,
  next: { visible: Record<string, boolean>; caption: string; boss?: BossView },
): { caption: string; actor: string | null; target: string | null } | null {
  if (!isBossEvent(e)) return null
  const v = next.boss ?? EMPTY
  switch (e.kind) {
    case 'telegraph': {
      const charges = [...v.charges.filter((c) => c.unitId !== e.unitId), { unitId: e.unitId, skillId: e.skillId, fromTick: e.tick, firesAtTick: e.firesAtTick, targets: [...e.targets] }]
      next.boss = { ...v, charges }
      const target = e.targets[0] !== undefined ? nameOf(e.targets[0]) : ''
      return { caption: chargeLine(e.skillId, nameOf(e.unitId), target), actor: e.unitId, target: e.targets.length === 1 ? e.targets[0]! : null }
    }
    case 'telegraph-end': {
      next.boss = { ...v, charges: v.charges.filter((c) => c.unitId !== e.unitId) }
      const move = moveName(e.skillId)
      return {
        caption:
          e.reason === 'stunned'
            ? t('{name} is staggered — the {move} dies in its throat!', { name: nameOf(e.unitId), move })
            : t('{name} falls — the {move} never comes.', { name: nameOf(e.unitId), move }),
        actor: null,
        target: e.unitId,
      }
    }
    case 'phase': {
      const phase: PhaseMark = { unitId: e.unitId, phase: e.phase, phases: e.phases, seq: e.seq, ...(e.title !== undefined ? { title: e.title } : {}), ...(e.line !== undefined ? { line: e.line } : {}) }
      next.boss = { ...v, phase, passed: { ...v.passed, [e.unitId]: e.phase } }
      const title = phaseTitle(phase)
      return {
        caption: e.line !== undefined ? `${nameOf(e.unitId)} — ${title}: “${t(e.line)}”` : `${nameOf(e.unitId)} — ${title}`,
        actor: e.unitId,
        target: null,
      }
    }
    case 'summon': {
      for (const id of e.enemyIds) next.visible[id] = true
      next.boss = v
      return {
        caption:
          e.enemyIds.length === 1
            ? t('{name} calls {other} to its side!', { name: nameOf(e.unitId), other: nameOf(e.enemyIds[0]!) })
            : t('{name} calls {n} to its side!', { name: nameOf(e.unitId), n: e.enemyIds.length }),
        actor: e.unitId,
        target: null,
      }
    }
  }
}

/** One unit's slice: the move it winds up (if any), and the moves aimed at it. */
export function chargeOn(view: BossView | undefined, unitId: string): { winding: ChargeMark | null; threatened: ChargeMark[] } {
  if (view === undefined || view.charges.length === 0) return { winding: null, threatened: [] }
  return {
    winding: view.charges.find((c) => c.unitId === unitId) ?? null,
    threatened: view.charges.filter((c) => c.targets.includes(unitId)),
  }
}

/** How far a wind-up has run at `tick` (0..1): the countdown ring's fill. */
export function chargeProgress(c: Pick<ChargeMark, 'fromTick' | 'firesAtTick'>, tick: number): number {
  const span = Math.max(1, c.firesAtTick - c.fromTick)
  return Math.max(0, Math.min(1, (tick - c.fromTick) / span))
}

/** Is a foe winding up a move right now (the Guard button pulses)? */
export function anyCharge(view: BossView | undefined): boolean {
  return (view?.charges.length ?? 0) > 0
}
