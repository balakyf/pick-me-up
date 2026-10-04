/**
 * The coach (lane P · the teaching curve): Isel teaches one mechanic at a time, at the moment
 * it first matters. A pure function from the game state and the floor ahead to the next
 * lesson, shown as a short tip in the war room before a floor that features it (or, for a
 * few lessons, the first time it happens in a battle).
 *
 * The rules:
 *  - **Order.** The lessons come in LESSONS order (the order the systems unlock and the
 *    teaching floors in `engine/content/missions.ts` are laid out): elements, lines, skills,
 *    the mission, big moves and Guard, Mark/Focus/Protect, Retreat, heals and shields,
 *    statuses, boss phases, morale. Only the first lesson not yet seen can show; it waits
 *    until its moment comes (each has a floor it falls back to, so the curve never stalls).
 *  - **Once per save.** A lesson the Master has seen (or dismissed) is latched in the save's
 *    guide list under `coach:<id>` through the existing GUIDE_STEP command, as lane M latches
 *    `story:` keys. The First Steps checklist counts only its own `step:` keys, so it is not
 *    disturbed.
 *  - **Retired.** A Master already far past a lesson's floors (an old save, a whale) is not
 *    taught it: it is skipped.
 *  - **Off.** The Settings toggle (`coachTips`) silences every tip.
 *
 * Every string is English source text; the card translates it with t() (French in
 * `ui/i18n/slices/frMissions.ts`).
 */
import type { CombatEvent, CombatUnitInit, Encounter, GameState } from '../../engine/types'
import type { LessonId } from '../../engine/content/missions'
import { SKILLS } from '../../engine/content'

/** The guide-list prefix every coach latch carries. */
export const COACH_PREFIX = 'coach:'

/** The guide step that latches a lesson (dispatch `{ type: 'GUIDE_STEP', step }`). */
export function coachStep(id: LessonId): string {
  return `${COACH_PREFIX}${id}`
}

/** Has the Master seen this lesson? (Defaults to no for any save without the list.) */
export function coachSeen(state: Pick<GameState, 'life'>, id: LessonId): boolean {
  const done = state.life?.guide?.done
  return Array.isArray(done) && done.includes(coachStep(id))
}

/** What the coach reads: the state, the floor ahead and its encounter (the war room builds it). */
export interface CoachContext {
  state: GameState
  floor: number
  encounter: Encounter | null
}

export interface Lesson {
  id: LessonId
  /** The tip's title. */
  title: string
  /** Isel's words (two or three short sentences). */
  tip: string
  /** Past this floor (highest cleared) the lesson is retired: not taught any more. */
  until: number
  /** Is this the moment, in the war room before `floor`? */
  due: (ctx: CoachContext) => boolean
  /** In battle: is this beat the first time it happens? (Only for a few lessons.) */
  happens?: (e: CombatEvent, byId: Readonly<Record<string, CombatUnitInit>>) => boolean
}

// ── What a floor features (pure reads of the encounter) ─────────────────────

const units = (enc: Encounter | null) => (enc === null ? [] : enc.waves.flatMap((w) => w.units))

/** A foe on the floor winds up a big move (its own kit, or one a phase teaches it). */
export function featuresBigMove(enc: Encounter | null): boolean {
  return units(enc).some(
    (u) =>
      u.skills.some((s) => s.charge !== undefined) ||
      u.keywords.some((k) => k.kind === 'phase' && (k.skills ?? []).some((id) => SKILLS[id]?.charge !== undefined)),
  )
}

/** The mission names someone: a target to defeat, a carrier to take from, an escort. */
export function featuresTarget(enc: Encounter | null): boolean {
  return (enc?.mission.objectives ?? []).some((o) => o.kind === 'defeat' || o.kind === 'acquire' || o.kind === 'protect')
}

/** The mission is more than "defeat every enemy". */
export function featuresMission(enc: Encounter | null): boolean {
  return (enc?.mission.objectives ?? []).some((o) => o.kind !== 'annihilate')
}

/** A boss on the floor changes phase. */
export function featuresPhases(enc: Encounter | null): boolean {
  return units(enc).some((u) => u.keywords.some((k) => k.kind === 'phase'))
}

/** A foe on the floor inflicts a status (a poison, a bleed, a stun, a curse). */
export function featuresStatus(enc: Encounter | null): boolean {
  return units(enc).some((u) => u.skills.some((s) => (s.effects ?? []).some((e) => e.kind === 'dot' || e.kind === 'stun' || e.kind === 'debuff')))
}

/** An escort walks with the party. */
export function featuresEscort(enc: Encounter | null): boolean {
  return (enc?.mission.objectives ?? []).some((o) => o.kind === 'protect')
}

const HARMS = new Set(['stun', 'poison', 'burn', 'bleed'])
const isFoe = (byId: Readonly<Record<string, CombatUnitInit>>, id: string) => byId[id]?.side === 'enemy'
const isHero = (byId: Readonly<Record<string, CombatUnitInit>>, id: string) => byId[id]?.side === 'hero' && !byId[id]?.isNpc

// ── The curriculum ─────────────────────────────────────────────────────────

/** The lessons, in the order the climb teaches them. */
export const LESSONS: readonly Lesson[] = [
  {
    id: 'elements',
    title: 'Elements',
    tip: 'Every hero and every foe has an element. Fire beats Wind, Wind beats Earth, Earth beats Water, Water beats Fire; Light and Dark wound each other. A WEAK hit lands half again as hard, a RESIST hit a quarter softer.',
    until: 15,
    due: () => true,
  },
  {
    id: 'lines',
    title: 'Front and back',
    tip: 'The front line takes the blows; the back line strikes from behind it. Put your sturdiest in front and your frailest at the back on the Party Board. Wolves always go for the front.',
    until: 20,
    due: ({ floor }) => floor >= 2,
  },
  {
    id: 'skills',
    title: 'Skills and SP',
    tip: 'Skills cost SP, and every action wins a little back. Your heroes pick the skill that hurts most on their own: a sweep over a crowd, one big blow on a lone brute. The skills they use most grow.',
    until: 25,
    due: ({ floor }) => floor >= 3,
  },
  {
    id: 'missions',
    title: 'Read the mission',
    tip: 'Not every floor is won by killing everything. The briefing says what wins and what loses: hold until the bell, hold the waves, take the prize, reach the exit, keep someone alive.',
    until: 30,
    due: ({ floor, encounter }) => featuresMission(encounter) || floor >= 7,
  },
  {
    id: 'telegraph',
    title: 'Big moves and Guard',
    tip: 'Something here winds up a big move: a "!" and a countdown over its head. Order Guard as it winds up and the party braces for it. Or give a standing Guard before the fight.',
    until: 40,
    due: ({ floor, encounter }) => featuresBigMove(encounter) || floor >= 10,
    happens: (e, byId) => e.kind === 'telegraph' && isFoe(byId, e.unitId),
  },
  {
    id: 'focus',
    title: 'Mark, Focus, Protect',
    tip: 'This floor names someone. Mark a foe before the fight (it is free) and every hero strikes it from the first blow. In battle, Focus does the same, and Protect makes foes look past a hero or an escort.',
    until: 40,
    due: ({ floor, encounter }) => featuresTarget(encounter) || floor >= 10,
  },
  {
    id: 'retreat',
    title: 'Retreat',
    tip: 'When a fight turns, Retreat brings everyone still standing home. Nothing is won, but nobody else dies. A retreat is never a waste, Master. A grave is.',
    until: 45,
    due: ({ state, floor }) => state.tower.attemptIndex > 0 || floor >= 10,
  },
  {
    id: 'healing',
    title: 'Heals and shields',
    tip: 'A healer mends whoever is lowest; a shield soaks a blow before it lands. On a long fight or an escort, bring one. The forecast shows who falls without them.',
    until: 50,
    due: ({ floor, encounter }) => featuresEscort(encounter) || floor >= 11,
  },
  {
    id: 'statuses',
    title: 'Statuses',
    tip: 'Poison and burns tick every turn; a stun costs a turn; a curse weakens a blow. The little icons over a unit show what it carries and for how long. End a poisoned fight quickly.',
    until: 55,
    due: ({ floor, encounter }) => (floor >= 13 && featuresStatus(encounter)) || floor >= 18,
    happens: (e, byId) => e.kind === 'status' && HARMS.has(e.status) && isHero(byId, e.unitId),
  },
  {
    id: 'phases',
    title: 'Boss phases',
    tip: 'Bosses change as they bleed. At a mark on their bar they turn: a new move, a new speed, or friends called in. The war room lists when. Keep an order for the turn.',
    until: 60,
    due: ({ floor, encounter }) => featuresPhases(encounter) || floor >= 20,
    happens: (e) => e.kind === 'phase',
  },
  {
    id: 'morale',
    title: 'Morale',
    tip: 'Your heroes are people. Tiredness, grief and fear show as morale; a shaken hero fights worse and may refuse the tower. Rest them, feed them, and let them grieve.',
    until: 70,
    due: ({ state, floor }) => floor >= 21 || state.life.memorial.length > 0,
  },
]

export function lessonById(id: LessonId): Lesson {
  return LESSONS.find((l) => l.id === id)!
}

/** The first lesson not seen and not retired: the only one that may show (null when done). */
export function pendingLesson(state: GameState): Lesson | null {
  const high = state.tower.highestCleared
  return LESSONS.find((l) => !coachSeen(state, l.id) && high <= l.until) ?? null
}

/**
 * The war room's tip before `ctx.floor`: the pending lesson, if this is its moment. Null
 * when tips are off, the curriculum is done, or the moment has not come.
 */
export function coachTip(ctx: CoachContext, enabled: boolean): Lesson | null {
  if (!enabled) return null
  const l = pendingLesson(ctx.state)
  return l !== null && l.due(ctx) ? l : null
}

/** The lesson a battle may teach as it happens (the pending one, when it has a battle moment). */
export function battleLesson(state: GameState, enabled: boolean): Lesson | null {
  if (!enabled) return null
  const l = pendingLesson(state)
  return l !== null && l.happens !== undefined ? l : null
}

/** Does this beat (the events playing now) carry the lesson's moment? */
export function happensIn(lesson: Lesson | null, beat: readonly CombatEvent[], byId: Readonly<Record<string, CombatUnitInit>>): boolean {
  if (lesson === null || lesson.happens === undefined) return false
  return beat.some((e) => lesson.happens!(e, byId))
}
