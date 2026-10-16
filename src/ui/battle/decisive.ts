/**
 * The Decisive Moment (spec 2026-10-12, S16; WP2). The engine resolved the whole fight
 * before playback, so the replay knows which hero is about to die before it happens.
 * BattleScene pauses just before the fatal tick and offers the Master a real choice;
 * any order re-resolves the fight through the existing `orders.give` → `store.revise`
 * path (never a dispatch). Pure and unit-tested.
 */
import type { CombatEvent, CombatLog, GameState } from '../../engine/types'

export interface Decisive {
  /** Index into log.events of the last event before the fatal tick. */
  eventIndex: number
  /** Frame cursor to pause on (frame c shows events[c - 1]), i.e. eventIndex + 1. */
  cursorIndex: number
  /** The hero about to fall. */
  heroId: string
  /** The enemy that lands the last hit on that hero before the death, if any. */
  killerId: string | null
  /** Index into log.events of the hero's death. */
  deathIndex: number
  /** The tick the hero dies on. */
  deathTick: number
  /** The tick an order given now lands on (before anyone acts on the fatal tick). */
  orderTick: number
  /** 'death' = a hero will fall; 'danger' = the tutorial's teaching moment (no death). */
  kind: 'death' | 'danger'
}

/**
 * Scan ahead for the first death of one of `heroIds` (the Master's heroes; mission NPCs
 * and foes are not passed in) at or after event `fromIndex`, and return where to pause:
 * the last event whose tick is before the fatal tick, so an order given there
 * (at that event's tick + 1) lands no later than the fatal tick. Heroes in `exclude`
 * (already offered a moment this battle) are skipped, and so is a death with no pause
 * point left at or after `fromIndex` (its tick is already under way). Null when no hero
 * dies, or when there is no moment left to pause on.
 */
export function findDecisive(log: CombatLog, heroIds: readonly string[], fromIndex = 0, exclude: readonly string[] = []): Decisive | null {
  const heroes = new Set(heroIds.filter((id) => !exclude.includes(id)))
  const ev = log.events
  for (let deathIndex = Math.max(0, fromIndex); deathIndex < ev.length; deathIndex++) {
    const death = ev[deathIndex]!
    if (death.kind !== 'death' || !heroes.has(death.unitId)) continue
    let eventIndex = -1
    for (let i = deathIndex - 1; i >= 0; i--) {
      if (ev[i]!.tick < death.tick) {
        eventIndex = i
        break
      }
    }
    // A death on a tick already under way (the replay resumed mid-tick) cannot be changed
    // any more: look past it for the next one.
    if (eventIndex < 0 || eventIndex + 1 < fromIndex) continue
    return {
      eventIndex,
      cursorIndex: eventIndex + 1,
      heroId: death.unitId,
      killerId: killerOf(log, death.unitId, deathIndex),
      deathIndex,
      deathTick: death.tick,
      orderTick: ev[eventIndex]!.tick + 1,
      kind: 'death',
    }
  }
  return null
}

/** The enemy whose hit last struck `heroId` before event `beforeIndex` (null if none). */
export function killerOf(log: CombatLog, heroId: string, beforeIndex: number): string | null {
  const enemies = new Set(log.unitsInit.filter((u) => u.side === 'enemy').map((u) => u.id))
  for (let i = Math.min(beforeIndex, log.events.length) - 1; i >= 0; i--) {
    const e = log.events[i]!
    if (e.kind === 'hit' && e.targetId === heroId && enemies.has(e.actorId)) return e.actorId
  }
  return null
}

/**
 * The tutorial's teaching moment for a fight in which nobody dies (S5, "F3 at the
 * latest"): just before the heaviest blow (by share of max HP) a foe lands on one of
 * the party, provided it takes more than `minShare` of that hero's life. Null when no
 * foe ever touches the party.
 */
export function findDangerMoment(log: CombatLog, heroIds: readonly string[], fromIndex = 0, minShare = 0): Decisive | null {
  const heroes = new Set(heroIds)
  const maxHP = new Map(log.unitsInit.map((u) => [u.id, u.maxHP]))
  const enemies = new Set(log.unitsInit.filter((u) => u.side === 'enemy').map((u) => u.id))
  let bestIndex = -1
  let bestShare = 0
  for (let i = Math.max(0, fromIndex); i < log.events.length; i++) {
    const e = log.events[i]!
    if (e.kind !== 'hit' || !heroes.has(e.targetId) || !enemies.has(e.actorId)) continue
    const share = e.amount / Math.max(1, maxHP.get(e.targetId) ?? 1)
    if (share > minShare && share > bestShare) {
      bestIndex = i
      bestShare = share
    }
  }
  if (bestIndex < 0) return null
  const hit = log.events[bestIndex] as Extract<CombatEvent, { kind: 'hit' }>
  let eventIndex = -1
  for (let i = bestIndex - 1; i >= 0; i--) {
    if (log.events[i]!.tick < hit.tick) {
      eventIndex = i
      break
    }
  }
  if (eventIndex < 0 || eventIndex + 1 < fromIndex) return null
  return {
    eventIndex,
    cursorIndex: eventIndex + 1,
    heroId: hit.targetId,
    killerId: hit.actorId,
    deathIndex: -1,
    deathTick: hit.tick,
    orderTick: log.events[eventIndex]!.tick + 1,
    kind: 'danger',
  }
}

/** A way out of a Decisive Moment, as its preview shows it. */
export interface WayOut {
  /** The fight as it would go. */
  log: CombatLog
  /** Party heroes who fall in it and did not in the fight as it stands (someone else
   *  taking the doomed hero's place). */
  fallsInstead: string[]
  /** The fight as it stands is won, and this way out loses the floor. */
  floorLost: boolean
}

/**
 * Judge a previewed order for the Decisive Moment (review finding #13: every way out the
 * card offers must really change fate). Null — not offered — unless the doomed hero lives
 * through the whole previewed fight (not just past the fatal tick). Otherwise what it
 * costs beyond the order itself: who falls in their place, and whether the floor is lost.
 */
export function wayOut(now: CombatLog, next: CombatLog | null, d: Decisive, partyIds: readonly string[]): WayOut | null {
  if (!next || !survives(next, d.heroId)) return null
  const party = new Set(partyIds)
  const fell = (l: CombatLog) => new Set(l.events.flatMap((e) => (e.kind === 'death' && party.has(e.unitId) ? [e.unitId] : [])))
  const before = fell(now)
  return {
    log: next,
    fallsInstead: [...fell(next)].filter((id) => id !== d.heroId && !before.has(id)),
    floorLost: now.outcome === 'win' && next.outcome !== 'win',
  }
}

/** Does `heroId` survive this (re-resolved) fight? */
export function survives(log: CombatLog, heroId: string): boolean {
  return !log.events.some((e) => e.kind === 'death' && e.unitId === heroId)
}

/**
 * Where the "Saved!" callout belongs in a re-resolved log: the first frame at or past
 * the tick the hero would have died on (or the last frame, if the fight ended sooner,
 * e.g. on a retreat). Null if the hero still dies in this log.
 */
export function savedCursor(log: CombatLog, heroId: string, deathTick: number): number | null {
  if (!survives(log, heroId)) return null
  const i = log.events.findIndex((e) => e.tick >= deathTick && e.kind !== 'order')
  return i < 0 ? log.events.length : Math.min(log.events.length, i + 1)
}

/** Most Decisive Moments one battle may offer (the first, plus one re-arm). */
export const MAX_DECISIVE_PROMPTS = 2

/** The `life.guide.done` step that marks the scripted first Decisive Moment as seen (S5). */
export const DECISIVE_TUTORIAL_STEP = 'decisive-tutorial'

/** Floor by which the scripted first Decisive Moment shows even if nobody would die. */
export const DECISIVE_TUTORIAL_BY_FLOOR = 3

/**
 * Should this battle carry the scripted first Decisive Moment (S5)? True on the first
 * fight in which a hero would die, or on F3 at the latest, until the Master has seen it.
 * The caller (TowerScreen) passes the answer as BattleScene's `tutorialPrompt` and, once
 * that battle closes, dispatches `GUIDE_STEP 'decisive-tutorial'` (never mid-battle).
 */
export function decisiveTutorialDue(state: GameState | null, log: CombatLog): boolean {
  if (!state || state.life.guide.done.includes(DECISIVE_TUTORIAL_STEP)) return false
  const heroIds = log.unitsInit.filter((u) => u.side === 'hero' && !u.isNpc).map((u) => u.id)
  if (findDecisive(log, heroIds) !== null) return true
  // From F3 on, any fight with a blow to teach on (a fight no foe touches has nothing to show).
  return log.floor >= DECISIVE_TUTORIAL_BY_FLOOR && findDangerMoment(log, heroIds) !== null
}
