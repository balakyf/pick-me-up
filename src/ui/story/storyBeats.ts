/**
 * Boss lines in battle (lane M), pure: which beat of a replay carries a line of the story
 * and who says it. Lines hang on beats the battle already plays — no new CombatEvent kind:
 *
 * - entrance: as a boss's title card (lane I's intro show) lifts, its first arrival;
 * - phase: lane G's `phase` event (only where the story has a line for that phase);
 * - telegraph: a big move wound up, keyed by the move (the first few, then in silence);
 * - defeat: a boss's finisher (its death);
 * - opening: an anchor's escort, or Isel through the crystal, on the fight's first action;
 * - victory: over a party that lost, said once the replay ends.
 *
 * Each kind holds the text box for STORY_MS (at 1×; the box divides by the replay speed),
 * the captions-module pattern of lane rule 8: the box rides its beat and lingers a little
 * past it, and a newer line replaces it.
 */
import type { CombatEvent, CombatLog, CombatUnitInit } from '../../engine/types'
import { ANCHORS } from '../../engine/content/anchors'
import { ANCHOR_STORY, BOSS_LINES, type StorySpeaker } from '../../engine/content/story'
import { bossShows, introOf } from '../battle/bossIntro'

export type StoryKind = 'entrance' | 'phase' | 'telegraph' | 'defeat' | 'opening' | 'victory'

/** How long each kind of line holds the text box at 1× (ms). A victory line stays until
 *  the Master leaves the battle (0 = no timer). */
export const STORY_MS: Record<StoryKind, number> = {
  entrance: 3000,
  phase: 2800,
  telegraph: 1800,
  defeat: 2400,
  opening: 2600,
  victory: 0,
}

/** A boss speaks over the first few wind-ups of each big move; after that the ring and the
 *  caption still warn, in silence. */
export const TELEGRAPH_LINES_PER_MOVE = 2

export interface StoryLine {
  kind: StoryKind
  /** English source; the box translates. */
  text: string
  /** A boss speaks (its unit), or an escort / Isel / the narrator. */
  speaker: StorySpeaker | 'boss'
  unitId?: string
  /** Narration (a beast, a thing): italics, no name. */
  narrated: boolean
}

function bossLine(kind: StoryKind, u: CombatUnitInit, text: string | undefined): StoryLine | null {
  if (text === undefined) return null
  const lines = BOSS_LINES[u.templateId ?? '']
  if (!lines) return null
  const narrated = lines.voice === 'narrated'
  return { kind, text, speaker: narrated ? 'narrator' : 'boss', unitId: u.id, narrated }
}

/** Is this log the anchor's own fight (not a raid or a trial on the same floor number)? */
function anchorFight(log: CombatLog): boolean {
  const def = ANCHORS[log.floor]
  return def !== undefined && log.mission?.type === def.missionType
}

/** Every story line of a replay, keyed by event index. */
export function storyBeats(log: CombatLog, byId: Record<string, CombatUnitInit>): Map<number, StoryLine> {
  const out = new Map<number, StoryLine>()
  const put = (i: number, line: StoryLine | null): boolean => {
    if (!line || out.has(i)) return false
    out.set(i, line)
    return true
  }
  /** Put a line on the first free beat from `i` on (several speakers can share a cue). */
  const putFrom = (i: number, line: StoryLine | null): boolean => {
    if (!line) return false
    let at = Math.min(i, log.events.length - 1)
    while (out.has(at) && at < log.events.length - 1) at++
    return put(at, line)
  }
  const defeated = new Set<string>()
  // Entrances and defeats ride lane I's shows. The entrance comes as the title card lifts
  // (the beat after it): the card names the boss, then the boss speaks — and on a phone the
  // box never covers the card.
  for (const [i, show] of bossShows(log, byId)) {
    if (show.kind === 'intro') {
      // Every speaker of the show gets its entrance, one beat after another.
      for (const id of show.units) {
        const u = byId[id]
        if (u && BOSS_LINES[u.templateId ?? '']) putFrom(i + 1, bossLine('entrance', u, BOSS_LINES[u.templateId!]!.entrance))
      }
    } else if (show.kind === 'finisher') {
      const u = byId[show.unitId]
      if (u && put(i, bossLine('defeat', u, BOSS_LINES[u.templateId ?? '']?.defeat))) defeated.add(u.id)
    }
  }
  // A lieutenant or a beast has no finisher show: its defeat line rides its death.
  log.events.forEach((e: CombatEvent, i) => {
    if (e.kind !== 'death' || defeated.has(e.unitId)) return
    const u = byId[e.unitId]
    if (u && putFrom(i, bossLine('defeat', u, BOSS_LINES[u.templateId ?? '']?.defeat))) defeated.add(u.id)
  })
  const told = new Map<string, number>()
  let firstAct = -1
  log.events.forEach((e: CombatEvent, i) => {
    if (e.kind === 'phase') {
      const u = byId[e.unitId]
      if (u) put(i, bossLine('phase', u, BOSS_LINES[u.templateId ?? '']?.phases?.[e.phase]))
    } else if (e.kind === 'telegraph') {
      const u = byId[e.unitId]
      const line = u ? BOSS_LINES[u.templateId ?? '']?.telegraph?.[e.skillId] : undefined
      if (!u || line === undefined) return
      const key = `${u.id}|${e.skillId}`
      // (A wind-up that gives way to another line on its beat is not counted as spoken.)
      const n = told.get(key) ?? 0
      if (n < TELEGRAPH_LINES_PER_MOVE && put(i, bossLine('telegraph', u, line))) told.set(key, n + 1)
    } else if (e.kind === 'act' && firstAct < 0) firstAct = i
  })
  // The opening: on the first action, unless a boss already speaks there.
  const opening = anchorFight(log) ? ANCHOR_STORY[log.floor]?.opening : undefined
  if (opening && firstAct >= 0) {
    let at = firstAct
    while (out.has(at) && at < log.events.length - 1) at++
    put(at, { kind: 'opening', text: opening.line, speaker: opening.speaker, narrated: opening.speaker === 'narrator' })
  }
  return out
}

/** The line a beat (events from..to) carries, if any (the first in the range). */
export function storyAt(lines: ReadonlyMap<number, StoryLine>, from: number, to: number): { at: number; line: StoryLine } | null {
  if (from < 0) return null
  for (let i = from; i <= to; i++) {
    const line = lines.get(i)
    if (line) return { at: i, line }
  }
  return null
}

/**
 * What a boss says over a party that lost to it: the floor's boss still standing at the
 * end (it must have stepped onto the field), the mission's target first. Null on a win.
 */
export function victoryLine(log: CombatLog, byId: Record<string, CombatUnitInit>): StoryLine | null {
  if (log.outcome === 'win') return null
  const came = new Set<string>()
  const dead = new Set<string>()
  for (const e of log.events) {
    if (e.kind === 'battle-start' || e.kind === 'wave-spawn' || e.kind === 'summon') for (const id of e.enemyIds) came.add(id)
    else if (e.kind === 'death') dead.add(e.unitId)
  }
  const standing = log.unitsInit.filter(
    (u) => u.side === 'enemy' && came.has(u.id) && !dead.has(u.id) && introOf(u.templateId)?.tier === 'boss' && BOSS_LINES[u.templateId ?? '']?.victory !== undefined,
  )
  standing.sort((a, b) => (b.targetTag ? 1 : 0) - (a.targetTag ? 1 : 0))
  const u = standing[0]
  return u ? bossLine('victory', u, BOSS_LINES[u.templateId!]!.victory) : null
}
