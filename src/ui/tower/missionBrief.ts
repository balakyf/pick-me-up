/**
 * The filler floor's briefing (lane P), pure: before a floor between the anchors, the war room
 * says what the mission is, what wins it, what loses it, and a line of the act's story. The
 * objective lines are the forecast's own (`missionLines`), so the two never disagree; the
 * fail lines are new — every mission is readable before entering (pillar 1: never an
 * ambush).
 */
import type { Encounter, GameState, Mission } from '../../engine/types'
import { ACT_STORY, FILLER_FLOOR_STORY, FILLER_STORY } from '../../engine/content/story'
import { ANCHORS, actForFloor } from '../../engine/content'
import { isPostWallFloor } from '../../engine/endgame'
import { FILLER_MISSION_KINDS, MISSION_LABEL, MISSION_TAGS, type FillerMissionKind } from '../../engine/content/missions'
import { t } from '../i18n/i18n'
import { hashString } from '../pixel/rand'
import { floorName } from './floorNames'
import { missionLines } from './warRoomText'

/** The filler kind a mission label names (null for an anchor's or the legacy mix's own). */
export function missionKindOf(type: string): FillerMissionKind | null {
  return FILLER_MISSION_KINDS.find((k) => MISSION_LABEL[k] === type) ?? null
}

/** How a mission's tagged unit is named in the war room ("the marked Goblin"). */
export function missionName(tag: string | undefined, unitName: string): string {
  if (tag === MISSION_TAGS.leader) return t('the marked {name}', { name: unitName })
  if (tag === MISSION_TAGS.vault) return t('the vault’s keeper, {name}', { name: unitName })
  return unitName
}

/** What loses the floor, clause by clause ("the whole party falls", "Refugee falls"…). */
export function failLines(m: Mission, waves: number, names: Record<string, string>): string[] {
  const out: string[] = []
  const who = (tag: string) => names[tag] ?? tag
  for (const o of m.objectives) {
    if (o.kind === 'protect') out.push(t('{name} falls: the mission fails at once.', { name: who(o.targetTag) }))
  }
  const kinds = new Set(m.objectives.map((o) => o.kind))
  if (kinds.has('survive')) out.push(t('The whole party falls before the bell.'))
  else if (kinds.has('reach')) out.push(t('The whole party falls before it gets out.'))
  else if (kinds.has('defend')) out.push(t('The line breaks: the whole party falls before the waves are held.'))
  else if (kinds.has('defeat')) {
    const o = m.objectives.find((x) => x.kind === 'defeat')!
    out.push(t('The whole party falls before {name} does.', { name: who((o as { targetTag: string }).targetTag) }))
  } else if (kinds.has('acquire')) out.push(t('The whole party falls before the prize is taken.'))
  else out.push(waves > 1 ? t('The whole party falls before the last wave does.') : t('The whole party falls.'))
  if (m.timer !== null && !kinds.has('survive')) out.push(t('{n} ticks pass first.', { n: m.timer }))
  return out
}

export interface FillerBrief {
  floor: number
  /** The canon label (translated). */
  mission: string
  kind: FillerMissionKind | null
  /** The floor's name ("Stair of Wolfsong"), or a set piece's title. */
  title: string
  /** Why this floor (the act's line for the mission, or the set piece's). */
  why: string | null
  /** What the party finds there (the act's flavour, picked per floor). */
  flavour: string | null
  objectives: string[]
  fails: string[]
  /** Isel's word as the party goes in (one floor in three; the act's events). */
  isel: string | null
}

/** Pick one of `list` for this account's floor (deterministic). */
function pickFor(seed: number, floor: number, salt: string, list: readonly string[]): string | null {
  if (list.length === 0) return null
  return list[hashString(`${salt}|${seed}|${floor}`) % list.length]!
}

/** The briefing for a filler floor (null on an anchor; anchors have lane M's). Translated. */
export function fillerBrief(state: GameState, floor: number, enc: Encounter | null, names: Record<string, string>): FillerBrief | null {
  // Floors behind the Wall carry lane O's own briefing (EndgameBriefing).
  if (ANCHORS[floor] !== undefined || enc === null || isPostWallFloor(floor)) return null
  const act = actForFloor(floor)
  const kind = missionKindOf(enc.mission.type)
  const story = FILLER_STORY[act.id]
  const special = FILLER_FLOOR_STORY[floor]
  const why = special?.line ?? (kind !== null ? story?.missions[kind] : undefined) ?? ACT_STORY[act.id]?.epigraph ?? null
  const flavour = story ? pickFor(state.seed, floor, 'filler-flavour', story.lines) : null
  const isel = story && hashString(`filler-event|${state.seed}|${floor}`) % 3 === 0 ? pickFor(state.seed, floor, 'filler-event-line', story.events) : null
  return {
    floor,
    mission: t(enc.mission.type),
    kind,
    title: special?.title !== undefined ? t(special.title) : (floorName(state.seed, floor) ?? t('Floor {n}', { n: floor })),
    why: why !== null ? t(why) : null,
    flavour: flavour !== null ? t(flavour) : null,
    objectives: missionLines({ mission: enc.mission, waves: enc.waves.length }, names),
    fails: failLines(enc.mission, enc.waves.length, names),
    isel: isel !== null ? t(isel) : null,
  }
}
