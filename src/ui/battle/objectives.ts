/**
 * The mission as the objective HUD shows it, pure: what to do in plain words, how far the
 * clock or the road has come, who must be kept alive and who must fall, read from the
 * log's mission (lane D's CombatLog.mission) and the events played so far.
 */
import type { CombatEvent, CombatLog, LogObjective } from '../../engine/types'
import { t } from '../i18n/i18n'
import { tn } from '../text'

export interface ObjectiveLine {
  text: string
  /** Met (a target down, waves held) / lost (the escort fell). */
  state: 'open' | 'done' | 'failed'
}

export interface ObjectiveView {
  /** The canon mission label (Survival, Escort…), translated. */
  label: string
  lines: ObjectiveLine[]
  /** A countdown (a survival's bell or a mission timer): 0–1 of the time behind the party. */
  clock: { share: number; survive: boolean } | null
  /** The road to the exit: 0–1. */
  road: { share: number; steps: number; distance: number } | null
  /** Wave n of total (only when the fight has more than one). */
  wave: { n: number; total: number } | null
  /** Mission NPCs to keep alive (unit ids). */
  escorts: string[]
  /** Units whose fall is the objective (crowned on the stage). */
  marked: string[]
  /** A survival whose horde ran out: the floor is held. */
  hordeSpent: boolean
}

const objectiveUnits = (o: LogObjective, log: CombatLog): string[] =>
  'targetTag' in o ? (o.unitIds ?? log.unitsInit.filter((u) => u.targetTag === o.targetTag).map((u) => u.id)) : []

/** The mission label in the player's language (the canon names are content). */
export function missionLabel(type: string): string {
  return t(type)
}

/**
 * The HUD's view after the first `applied` events. Null for a log saved before missions
 * were logged.
 */
export function objectiveView(log: CombatLog, applied: number, nameOf: (id: string) => string): ObjectiveView | null {
  const m = log.mission
  if (!m) return null
  const played: CombatEvent[] = log.events.slice(0, Math.min(applied, log.events.length))
  const dead = new Set(played.flatMap((e) => (e.kind === 'death' ? [e.unitId] : [])))
  const tick = played.length > 0 ? played[played.length - 1]!.tick : 0
  const spawned = played.filter((e) => e.kind === 'wave-spawn').length
  const hordeSpent = played.some((e) => e.kind === 'mission' && e.code === 'horde-spent')
  const won = played.some((e) => e.kind === 'end' && e.outcome === 'win')
  const heroIds = new Set(log.unitsInit.filter((u) => u.side === 'hero' && !u.isNpc).map((u) => u.id))
  const names = (ids: string[]) => ids.map(nameOf).filter((n, i, all) => all.indexOf(n) === i).join(', ')

  const lines: ObjectiveLine[] = []
  let clock: ObjectiveView['clock'] = null
  let road: ObjectiveView['road'] = null
  const escorts: string[] = []
  const marked: string[] = []
  for (const o of m.objectives) {
    const ids = objectiveUnits(o, log)
    switch (o.kind) {
      case 'annihilate':
        lines.push({ text: m.waves > 1 ? t('Defeat every foe — {n} waves', { n: m.waves }) : t('Defeat every foe'), state: won ? 'done' : 'open' })
        break
      case 'survive': {
        const share = hordeSpent || won ? 1 : Math.min(1, tick / Math.max(1, o.ticks))
        clock = { share, survive: true }
        lines.push({ text: t('Survive until the bell'), state: share >= 1 ? 'done' : 'open' })
        break
      }
      case 'defend': {
        const held = played.filter((e) => e.kind === 'mission' && e.code === 'wave-cleared').length
        lines.push({ text: tn(o.waves, 'Hold off 1 wave', 'Hold off {n} waves'), state: held >= o.waves ? 'done' : 'open' })
        break
      }
      case 'defeat':
        marked.push(...ids)
        lines.push({ text: t('Defeat {name}', { name: names(ids) || t('the target') }), state: ids.length > 0 && ids.every((id) => dead.has(id)) ? 'done' : 'open' })
        break
      case 'acquire':
        marked.push(...ids)
        lines.push({ text: t('Take the prize from {name}', { name: names(ids) || t('its bearer') }), state: ids.length > 0 && ids.every((id) => dead.has(id)) ? 'done' : 'open' })
        break
      case 'protect':
        escorts.push(...ids)
        lines.push({ text: t('Keep {name} alive', { name: names(ids) || t('the escort') }), state: ids.some((id) => dead.has(id)) ? 'failed' : won ? 'done' : 'open' })
        break
      case 'reach': {
        // Every hero's turn presses one step toward the exit; the engine's quarter beats
        // say exactly where the party stands.
        const acts = played.filter((e) => e.kind === 'act' && heroIds.has(e.actorId)).length
        const beat = played.reduce((n, e) => (e.kind === 'mission' && e.code === 'escape' ? Math.max(n, e.params?.steps ?? 0) : n), 0)
        const steps = won ? o.distance : Math.min(o.distance, Math.max(acts, beat))
        road = { share: o.distance > 0 ? steps / o.distance : 1, steps, distance: o.distance }
        lines.push({ text: t('Escape — reach the exit'), state: won ? 'done' : 'open' })
        break
      }
    }
  }
  // A plain mission timer (not a survival's bell) is a deadline the party races.
  if (!clock && m.timerTicks !== undefined && !won) clock = { share: Math.min(1, tick / Math.max(1, m.timerTicks)), survive: false }
  return {
    label: missionLabel(m.type),
    lines,
    clock,
    road,
    wave: m.waves > 1 ? { n: Math.min(m.waves, spawned + 1), total: m.waves } : null,
    escorts,
    marked,
    hordeSpent,
  }
}
