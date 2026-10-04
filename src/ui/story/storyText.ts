/**
 * The story's war-room and lobby side (lane M), pure: which act card is due, an anchor's
 * briefing, the Priasis arc as far as the Master has climbed, and what Isel says about it.
 *
 * What the Master has already seen (an act card, a letter) is latched in the save's guide
 * list (`life.guide.done`, through the existing GUIDE_STEP command) under a `story:` key,
 * and read back through `storySeen`, a defaulting reader: an old save without the list, or
 * without the key, simply has not seen it. No schema bump, no new command.
 */
import type { ActDef } from '../../engine/content/acts'
import { ACTS, actForFloor } from '../../engine/content/acts'
import { ANCHORS } from '../../engine/content/anchors'
import { ACT_STORY, ANCHOR_STORY, PRIASIS_ARC, type ActStory, type AnchorStory, type PriasisBeat } from '../../engine/content/story'
import type { GameState } from '../../engine/types'
import { TUNING } from '../../engine/tuning'
import { t } from '../i18n/i18n'
import { introOf } from '../battle/bossIntro'

/** The guide-list prefix every story latch carries. */
export const STORY_PREFIX = 'story:'

/** The guide step that latches `key` (dispatch `{ type: 'GUIDE_STEP', step }`). */
export function storyStep(key: string): string {
  return `${STORY_PREFIX}${key}`
}

/** Has the Master seen this story beat? (Defaults to no for any save without the list.) */
export function storySeen(state: Pick<GameState, 'life'>, key: string): boolean {
  const done = state.life?.guide?.done
  return Array.isArray(done) && done.includes(storyStep(key))
}

// ── Act cards ───────────────────────────────────────────────────────────────

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

/** "Act III" for an act (its place in ACTS). */
export function actNumeral(act: Pick<ActDef, 'id'>): string {
  const i = ACTS.findIndex((a) => a.id === act.id)
  return NUMERALS[i] ?? String(i + 1)
}

export function actKey(act: Pick<ActDef, 'id'>): string {
  return `act:${act.id}`
}

/** The act card waiting for the Master: the act of the floor they stand on, once per save
 *  (null past the summit, or once seen). */
export function actCardDue(state: GameState): (ActDef & { story: ActStory }) | null {
  const floor = state.tower.currentFloor
  if (floor > TUNING.tower.sliceTopFloor) return null
  const act = actForFloor(floor)
  const story = ACT_STORY[act.id]
  if (!story || storySeen(state, actKey(act))) return null
  return { ...act, story }
}

// ── Anchor briefings ────────────────────────────────────────────────────────

export interface Briefing extends AnchorStory {
  floor: number
  mission: string
  /** The template whose face goes on the card: the mission's target, else its escort. */
  face: { kind: 'enemy' | 'ally'; templateId: string } | null
}

/** The briefing for an anchor floor (null on a filler floor). English; the card translates. */
export function anchorBriefing(floor: number): Briefing | null {
  const def = ANCHORS[floor]
  const story = ANCHOR_STORY[floor]
  if (!def || !story) return null
  const tags = new Set(def.objectives.flatMap((o) => ('targetTag' in o && o.targetTag ? [o.targetTag] : [])))
  // The floor's boss (the mission's own target first: F10's Priest, not the creature).
  const bosses = def.waves.flat().filter((g) => introOf(g.templateId)?.tier === 'boss')
  const boss = bosses.find((g) => g.targetTag !== undefined && tags.has(g.targetTag)) ?? bosses[0]
  // Else the person the mission protects (Priasis, the key's bearer; not an object).
  const ally = def.allies?.find((a) => a.targetTag !== undefined && tags.has(a.targetTag) && a.templateId !== 'sealed_object')
  const face = boss ? { kind: 'enemy' as const, templateId: boss.templateId } : ally ? { kind: 'ally' as const, templateId: ally.templateId } : null
  return { ...story, floor, mission: def.missionType, face }
}

// ── The Priasis arc ─────────────────────────────────────────────────────────

/** The beats the Master has reached, in order (the world's fate decides the last ones). */
export function priasisBeats(state: GameState): PriasisBeat[] {
  const high = state.tower.highestCleared
  return PRIASIS_ARC.filter((b) => {
    if (b.after > high) return false
    if (b.when === 'ended') return state.tower.worldEnded
    if (b.when === 'saved') return state.tower.worldSaved
    return true
  })
}

/** The newest beat reached (null before the princess). */
export function latestPriasis(state: GameState): PriasisBeat | null {
  const all = priasisBeats(state)
  return all[all.length - 1] ?? null
}

export function priasisKey(b: Pick<PriasisBeat, 'id'>): string {
  return `priasis:${b.id}`
}

/** The newest letter of the arc the Master has not read yet (older ones are passed over:
 *  a Master who climbed past several reads the latest). */
export function priasisUnread(state: GameState): PriasisBeat | null {
  const withLetters = priasisBeats(state).filter((b) => b.letter)
  const newest = withLetters[withLetters.length - 1]
  return newest && !storySeen(state, priasisKey(newest)) ? newest : null
}

/** Isel's story word in the lobby (translated), or null before the arc begins. */
export function iselStoryWord(state: GameState): string | null {
  const b = latestPriasis(state)
  return b ? t(b.lobby) : null
}
