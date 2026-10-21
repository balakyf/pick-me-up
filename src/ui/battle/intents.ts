/**
 * Telegraphed enemy intents (spec 2026-10-12, S17; WP2). The fight is resolved before
 * playback, so the replay can read ahead and warn about a big blow before it lands, the
 * way Slay the Spire shows intents: "HEAVY → Mira", two actions ahead. That turns
 * Protect and Retreat into answers to a visible threat. Pure.
 */
import type { CombatEvent, CombatLog } from '../../engine/types'
import { SKILLS } from '../../engine/content'

/** A blow worth this share of the target's max HP is telegraphed as HEAVY. */
export const HEAVY_SHARE = 0.3
/** How many actions ahead the intent appears. */
export const INTENT_LEAD_ACTIONS = 2

export interface Intent {
  actorId: string
  targetId: string
  /** 'skill' = an authored skill; 'heavy' = a basic blow worth ≥30% of the target's life. */
  kind: 'skill' | 'heavy'
  skillId: string
  /** Total damage the action deals to its target. */
  amount: number
  /** amount / target max HP. */
  share: number
  /** First frame cursor the intent shows on. */
  showCursor: number
  /** Frame cursor of the act itself (the intent shows until just before it). */
  actCursor: number
}

/** True for a named skill (basic attacks — 'basic', 'e_basic' — are not in SKILLS). */
export function isAuthoredSkill(skillId: string): boolean {
  return skillId in SKILLS
}

/**
 * Every enemy action against the party that deserves a warning: any authored skill, or
 * a blow worth ≥30% of the target's max HP. Each intent shows from the frame of the
 * action two actions earlier (or from the enemy's arrival, if it came later), and goes
 * away when the blow starts.
 */
export function findIntents(log: CombatLog): Intent[] {
  const unit = new Map(log.unitsInit.map((u) => [u.id, u]))
  const ev = log.events
  // When each enemy enters the stage (frame cursor).
  const arrives = new Map<string, number>()
  ev.forEach((e, i) => {
    if (e.kind === 'battle-start' || e.kind === 'wave-spawn') for (const id of e.enemyIds) if (!arrives.has(id)) arrives.set(id, i + 1)
  })
  const acts: number[] = []
  ev.forEach((e, i) => {
    if (e.kind === 'act') acts.push(i)
  })
  const out: Intent[] = []
  acts.forEach((a, j) => {
    const act = ev[a] as Extract<CombatEvent, { kind: 'act' }>
    const actor = unit.get(act.actorId)
    const target = unit.get(act.targetId)
    if (actor?.side !== 'enemy' || target?.side !== 'hero') return
    // Damage this action deals to its target (hits until the next act).
    let amount = 0
    for (let i = a + 1; i < ev.length && ev[i]!.kind !== 'act'; i++) {
      const e = ev[i]!
      if (e.kind === 'hit' && e.actorId === act.actorId && e.targetId === act.targetId) amount += e.amount
    }
    const share = amount / Math.max(1, target.maxHP)
    const skill = isAuthoredSkill(act.skillId)
    if (!skill && share < HEAVY_SHARE) return
    const lead = j - INTENT_LEAD_ACTIONS
    const fromLead = lead >= 0 ? acts[lead]! + 1 : 1
    const showCursor = Math.min(a + 1, Math.max(fromLead, arrives.get(act.actorId) ?? 1))
    out.push({ actorId: act.actorId, targetId: act.targetId, kind: skill ? 'skill' : 'heavy', skillId: act.skillId, amount, share, showCursor, actCursor: a + 1 })
  })
  return out
}

/**
 * The intents on screen at frame `cursor`, soonest first, at most `max`, and one per
 * foe (a fast foe with two big blows queued shows the next one; two tags on one sprite
 * would print over each other).
 */
export function intentsAt(intents: readonly Intent[], cursor: number, max = 2): Intent[] {
  const seen = new Set<string>()
  return intents
    .filter((it) => cursor >= it.showCursor && cursor < it.actCursor)
    .sort((a, b) => a.actCursor - b.actCursor)
    .filter((it) => !seen.has(it.actorId) && !!seen.add(it.actorId))
    .slice(0, max)
}
