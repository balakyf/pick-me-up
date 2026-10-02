/**
 * The battle replay's timeline, pure: the stage layout (where each unit stands), the
 * frame list (one snapshot of the field per beat) and how long each beat holds the
 * screen. A beat is one event, except a sweep: every blow of one act lands in a single
 * beat, with its numbers staggered over the targets. BattleScene plays these frames;
 * nothing here touches the DOM.
 */
import type { CombatEvent, CombatLog, CombatUnitInit, Element, Line } from '../../engine/types'
import { ENEMY_TEMPLATES, SKILLS } from '../../engine/content'
import { ELEMENT_VIS } from '../bits'
import { t } from '../i18n/i18n'
import { DEPTH_DURATION, depthSnap } from './synergyCaptions'
import { missionCaption, missionDuration } from './missionCaptions'
import { STATUS_DURATION, statusDuration, statusSnap, type StatusView } from './statusCaptions'
import { afterCharged, BOSS_DURATION, bossDuration, bossSnap, chargedCaption, orderCaption, type BossView } from './bossCaptions'
import { bossShows, showHolds } from './bossIntro'

/** One frame of the replay: the field as it stands after a beat. */
export interface Snap {
  hp: Record<string, number>
  dead: Record<string, boolean>
  visible: Record<string, boolean>
  actor: string | null
  target: string | null
  panic: string | null
  caption: string
  /** The authored skill being cast this action (kept through its hits). */
  skill: { name: string; color: string; caster: string } | null
  /** The element of the current action (colours its hit sparks). */
  element: Element
  /** Statuses on the field and their pops (lane F, statusCaptions.ts). */
  status?: StatusView
  /** Moves being wound up, the latest phase (lane G, bossCaptions.ts). */
  boss?: BossView
  /** The events this frame plays: log.events[from..to] (frame 0, the empty field, is -1..-1). */
  from: number
  to: number
  /** Everyone struck in this beat (a sweep's whole line; one unit otherwise). */
  targets: string[]
  /** SP left per unit (maxSP less the cost of every skill cast so far). */
  sp: Record<string, number>
}

export const SPEEDS = [1, 2, 4] as const

/** Real milliseconds each event is held on screen at 1× speed. */
export const DURATION: Record<CombatEvent['kind'], number> = {
  'battle-start': 700,
  'wave-spawn': 800,
  act: 340,
  hit: 460,
  miss: 400,
  'hp-cost': 450,
  panic: 650,
  guard: 420,
  heal: 380,
  death: 600,
  mission: 900,
  order: 900,
  end: 600,
  ...DEPTH_DURATION,
  ...STATUS_DURATION,
  ...BOSS_DURATION,
}

/** How long one event holds the screen at 1× (each mission beat has its own timing). */
export function eventDuration(e: CombatEvent): number {
  return e.kind === 'mission' ? missionDuration(e) : bossDuration(e) ?? statusDuration(e) ?? DURATION[e.kind]
}

/** A hero's death holds the scene: the moment is not skipped past at speed. */
export const HERO_DEATH_MS = 2600
/** Hit-stop: a critical blow freezes the frame this long before the impact lands. */
export const HITSTOP_MS = 120
/** The fallen hero's last words linger this long after the scene moves on. */
export const MOURN_LINGER_MS = 1200

const HERO_X: Record<Line, number> = { front: 250, mid: 286, back: 322 }
const ENEMY_X: Record<Line, number> = { front: 140, mid: 102, back: 64 }
/** A sprite this tall (a boss) is laid out abreast of its rank (see `layout`). */
const TALL = 48
/** The middle of the 384px canon: a squeezed layout draws the two sides in toward it. */
export const CANON_MID = 192

/** The level a unit shows: an enemy template may override it (the F10 Lv999 Creature). */
export function shownLevel(u: Pick<CombatUnitInit, 'level' | 'templateId'>): number {
  return (u.templateId !== undefined ? ENEMY_TEMPLATES[u.templateId]?.displayLevel : undefined) ?? u.level
}

export function skillName(id: string): string {
  if (id === 'basic') return t('Attack')
  // A caster foe's basic attack (engine/unit ENEMY_SPELL_ID).
  if (id === 'e_spell') return t('Spell')
  // A hero bracing under the Master's Guard (engine/combat BRACE_ID).
  if (id === 'brace') return t('Brace')
  return t(SKILLS[id]?.name ?? 'Strike')
}

/**
 * Where each unit stands (feet position) on the 384×216 stage. `squeeze` (≤ 1) draws both
 * sides in toward the middle, so a narrow phone can crop the empty edges and zoom in.
 */
export function layout(
  log: CombatLog,
  squeeze = 1,
  /** Lane I: a unit's sprite size, so a rank holding a towering boss gives it room. */
  sizeOf?: (id: string) => { w: number; h: number },
): Record<string, { x: number; y: number }> {
  const waveOf: Record<string, number> = {}
  for (const e of log.events) {
    if (e.kind === 'battle-start') for (const id of e.enemyIds) waveOf[id] = 0
    if (e.kind === 'wave-spawn') for (const id of e.enemyIds) waveOf[id] = e.wave
    // Lane G: summoned units stand with the wave they were called into.
    if (e.kind === 'summon') for (const id of e.enemyIds) waveOf[id] = e.wave
  }
  // A reserve never called keeps out of the ranks of those who were.
  const reserve = new Set(log.events.flatMap((e) => (e.kind === 'summon' ? e.enemyIds : [])))
  const unseen = (u: CombatUnitInit) => u.side === 'enemy' && waveOf[u.id] === undefined && /_r[^_]*_\d+$/.test(u.id) && !reserve.has(u.id)
  const groups = new Map<string, CombatUnitInit[]>()
  for (const u of log.unitsInit) {
    const key = `${u.side}|${u.side === 'enemy' ? (unseen(u) ? 'r' : waveOf[u.id] ?? 0) : 0}|${u.line}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(u)
  }
  const pos: Record<string, { x: number; y: number }> = {}
  for (const [key, units] of groups) {
    const side = key.split('|')[0]
    // Lane I: a rank with a towering foe in it (a boss and the echoes or guards it calls)
    // stands abreast, front to back, instead of stacking bodies twice a hero's height.
    const tall = sizeOf ? units.filter((u) => sizeOf(u.id).h >= TALL) : []
    if (side === 'enemy' && sizeOf && units.length > 1 && tall.length > 0) {
      const big = [...tall, ...units.filter((u) => !tall.includes(u))]
      const front = ENEMY_X[units[0]!.line]
      const xs: number[] = []
      big.forEach((u, i) => xs.push(i === 0 ? front : xs[i - 1]! - ((sizeOf(big[i - 1]!.id).w + sizeOf(u.id).w) * 0.32 + 6)))
      // A crowd that would run off the stage's edge closes ranks to fit.
      const last = big[big.length - 1]!
      const minX = sizeOf(last.id).w / 2 + 4
      const k = xs[xs.length - 1]! < minX ? (front - minX) / Math.max(1, front - xs[xs.length - 1]!) : 1
      big.forEach((u, i) => {
        const x = front - (front - xs[i]!) * k
        pos[u.id] = { x: Math.round(CANON_MID + (x - CANON_MID) * squeeze), y: i % 2 === 0 ? 176 : 150 }
      })
      continue
    }
    // A crowded enemy line splits into two ranks so late-floor waves stay readable.
    const cols = side === 'enemy' && units.length > 3 ? 2 : 1
    const n = Math.ceil(units.length / cols)
    const top = 134
    const bottom = 200
    units.forEach((u, idx) => {
      const col = idx % cols
      const i = Math.floor(idx / cols)
      const y = n === 1 ? 168 : top + ((bottom - top) * i) / (n - 1)
      const stagger = (i % 2) * 8
      const x = side === 'hero' ? HERO_X[u.line] + stagger : ENEMY_X[u.line] - stagger - col * 34
      pos[u.id] = { x: Math.round(CANON_MID + (x - CANON_MID) * squeeze), y: Math.round(y) }
    })
  }
  return pos
}

/**
 * The stretch of the canon the units occupy (left and right edge, stage px), from their
 * feet positions and half-widths: a narrow screen crops the stage to this and zooms in.
 */
export function unitSpan(pos: Record<string, { x: number; y: number }>, halfWidth: (id: string) => number): { left: number; right: number } {
  let left = Infinity
  let right = -Infinity
  for (const [id, p] of Object.entries(pos)) {
    left = Math.min(left, p.x - halfWidth(id))
    right = Math.max(right, p.x + halfWidth(id))
  }
  return Number.isFinite(left) ? { left, right } : { left: 0, right: 384 }
}

export interface FrameOpts {
  /** A trial (the weekly echo): heroes who drop are out, not dead. */
  nonLethal?: boolean
}

/** The events that throw a number (or a word) over a unit. */
type BlowEvent = Extract<CombatEvent, { kind: 'hit' | 'miss' | 'guard' | 'heal' }>
const POPUP_KINDS = new Set<CombatEvent['kind']>(['hit', 'miss', 'guard', 'heal'])

/**
 * Whether an event may fold into a sweep's beat: its blows, misses, guards and heals, and a
 * foe falling to it. A hero's death never folds (it holds the scene on its own), nor does an
 * escort's (the mission may hang on it); in a trial a hero who drops is only out, so it folds.
 */
function foldable(e: CombatEvent, byId: Record<string, CombatUnitInit>, opts: FrameOpts): boolean {
  if (POPUP_KINDS.has(e.kind)) return true
  if (e.kind !== 'death') return false
  const u = byId[e.unitId]
  if (!u || u.side === 'enemy') return true
  return !!opts.nonLethal && !u.isNpc
}

/**
 * The beats of a replay, as [from, to] event ranges. Every event is its own beat, except
 * that a run of consecutive foldable events on one tick carrying two or more blows (a sweep over the
 * whole line, or several hits of one act) plays as ONE beat. Hero and escort deaths split
 * such a run, so the death moment still holds the scene between the sweep's halves.
 */
export function beatRanges(log: CombatLog, byId: Record<string, CombatUnitInit>, opts: FrameOpts = {}): [number, number][] {
  const ev = log.events
  const out: [number, number][] = []
  let i = 0
  while (i < ev.length) {
    if (!foldable(ev[i]!, byId, opts)) {
      out.push([i, i])
      i++
      continue
    }
    let j = i
    let blows = 0
    // One act's blows all land on one tick.
    while (j < ev.length && ev[j]!.tick === ev[i]!.tick && foldable(ev[j]!, byId, opts)) {
      if (POPUP_KINDS.has(ev[j]!.kind)) blows++
      j++
    }
    if (blows >= 2) out.push([i, j - 1])
    else for (let k = i; k < j; k++) out.push([k, k])
    i = j
  }
  return out
}

/** The frames of a replay: frame 0 is the empty field; frame k follows beat k − 1. */
export function buildFrames(
  log: CombatLog,
  byId: Record<string, CombatUnitInit>,
  nameOf: (id: string) => string,
  opts: FrameOpts = {},
): Snap[] {
  const out: Snap[] = []
  let cur: Snap = {
    hp: Object.fromEntries(log.unitsInit.map((u) => [u.id, u.startHP ?? u.maxHP])),
    dead: {},
    visible: {},
    actor: null,
    target: null,
    panic: null,
    caption: t('Floor {n}', { n: log.floor }),
    skill: null,
    element: 'physical',
    from: -1,
    to: -1,
    targets: [],
    sp: Object.fromEntries(log.unitsInit.map((u) => [u.id, u.maxSP])),
  }
  out.push(cur)
  for (const [from, to] of beatRanges(log, byId, opts)) {
    let next = cur
    for (let i = from; i <= to; i++) next = step(next, log.events[i]!, byId, nameOf, opts)
    if (to > from) {
      // A sweep: one beat. The caster's caption and skill stay up; every target was struck.
      const blows = log.events.slice(from, to + 1).filter((e): e is BlowEvent => POPUP_KINDS.has(e.kind))
      const lead = blows.find((e) => e.kind !== 'heal') ?? blows[0]!
      next = {
        ...next,
        caption: cur.caption,
        skill: cur.skill,
        actor: lead.kind === 'heal' ? null : lead.actorId,
        target: lead.kind === 'heal' ? lead.unitId : lead.targetId,
        targets: [...new Set(blows.flatMap((e) => (e.kind === 'heal' ? [] : [e.targetId])))],
      }
    }
    next = { ...next, from, to }
    out.push(next)
    cur = next
  }
  return out
}

/** The field after one event. */
function step(cur: Snap, e: CombatEvent, byId: Record<string, CombatUnitInit>, nameOf: (id: string) => string, opts: FrameOpts): Snap {
  const keepSkill = e.kind === 'hit' || e.kind === 'miss' || e.kind === 'hp-cost' || e.kind === 'guard' || e.kind === 'heal'
  const next: Snap = {
    ...cur,
    hp: { ...cur.hp },
    dead: { ...cur.dead },
    visible: { ...cur.visible },
    actor: null,
    target: null,
    panic: null,
    skill: keepSkill ? cur.skill : null,
    targets: [],
  }
  switch (e.kind) {
    case 'battle-start':
      for (const id of [...e.heroIds, ...e.enemyIds]) next.visible[id] = true
      next.caption = t('Enemies approach!')
      break
    case 'wave-spawn':
      for (const id of e.enemyIds) next.visible[id] = true
      next.caption = t('Wave {n} appears!', { n: e.wave + 1 })
      break
    case 'act': {
      next.actor = e.actorId
      next.target = e.targetId
      next.caption = `${nameOf(e.actorId)} — ${skillName(e.skillId)}`
      const def = SKILLS[e.skillId]
      const el = def?.element ?? byId[e.actorId]?.element ?? 'physical'
      next.element = el
      if (def) {
        next.skill = { name: t(def.name), color: ELEMENT_VIS[el].color, caster: e.actorId }
        if (e.spAfter === undefined && def.spCost > 0) next.sp = { ...cur.sp, [e.actorId]: Math.max(0, (cur.sp[e.actorId] ?? 0) - def.spCost) }
      }
      // The engine says what SP the cast left (regen included); older logs fall back above.
      if (e.spAfter !== undefined) next.sp = { ...cur.sp, [e.actorId]: e.spAfter }
      // A wound-up move landing (lane G): its mark comes down, and the caption says how it was met.
      if (e.charged) {
        next.boss = afterCharged(cur.boss, e.actorId)
        next.caption = chargedCaption(e, nameOf)
      }
      break
    }
    case 'hit':
      next.hp[e.targetId] = e.hpAfter
      next.actor = e.actorId
      next.target = e.targetId
      next.targets = [e.targetId]
      next.caption = cur.caption
      break
    case 'miss':
      next.actor = e.actorId
      next.target = e.targetId
      next.targets = [e.targetId]
      next.caption = cur.caption
      break
    case 'hp-cost':
      next.hp[e.unitId] = e.hpAfter
      next.actor = e.unitId
      next.caption = t('{name} pays {n} HP!', { name: nameOf(e.unitId), n: e.amount })
      break
    case 'panic':
      next.panic = e.unitId
      next.caption = t('{name} panics and freezes!', { name: nameOf(e.unitId) })
      break
    case 'guard':
      next.actor = e.actorId
      next.target = e.targetId
      next.targets = [e.targetId]
      next.caption = t("{name}'s scales turn the blow!", { name: nameOf(e.targetId) })
      break
    case 'heal':
      next.hp[e.unitId] = e.hpAfter
      next.caption = cur.caption
      break
    case 'death':
      next.dead[e.unitId] = true
      next.caption =
        opts.nonLethal && byId[e.unitId]?.side === 'hero'
          ? t('{name} is out of the trial.', { name: nameOf(e.unitId) })
          : t('{name} falls!', { name: nameOf(e.unitId) })
      break
    case 'mission':
      next.caption = missionCaption(e, nameOf)
      break
    case 'order':
      next.caption = orderCaption(e.order, nameOf)
      break
    case 'end':
      next.caption =
        opts.nonLethal && e.outcome !== 'win'
          ? t('The trial ends. Nobody dies here.')
          : e.outcome === 'win'
          ? t('Victory!')
          : e.outcome === 'wipe'
            ? t('The party has fallen…')
            : e.outcome === 'failed'
              ? t('The mission has failed…')
              : e.outcome === 'retreat'
                ? t('The party falls back through the gate.')
                : t('Time is up…')
      break
    default: {
      // Combat depth: cover, follow-ups, rivalry and the floor's conditions.
      const d = depthSnap(e, nameOf) ?? statusSnap(e, nameOf, next) ?? bossSnap(e, nameOf, next)
      if (d) Object.assign(next, d)
      // A follow-up is the friend's own strike: their element colours the sparks.
      if (e.kind === 'followup') {
        next.element = byId[e.unitId]?.element ?? 'physical'
        next.skill = null
      }
      // An SP drain or restore moves the bar.
      if (e.kind === 'sp') next.sp = { ...next.sp, [e.unitId]: e.spAfter }
    }
  }
  return next
}

// ── Frames ↔ events ──────────────────────────────────────────────────────────

/** The last frame whose beats played at most `applied` events (an order resumes there). */
export function frameAtEvents(frames: readonly Snap[], applied: number): number {
  let k = 0
  for (let i = 0; i < frames.length; i++) if (frames[i]!.to + 1 <= applied) k = i
  return k
}

/** Events the replay has played through frame `k`. */
export function eventsThrough(frames: readonly Snap[], k: number): number {
  return (frames[k]?.to ?? -1) + 1
}

/** The events of a beat. */
export function beatEvents(events: readonly CombatEvent[], snap: Pick<Snap, 'from' | 'to'>): CombatEvent[] {
  return snap.from < 0 ? [] : events.slice(snap.from, snap.to + 1)
}

/** The event a beat is about: its first blow for a sweep, the event itself otherwise. */
export function beatLead(events: readonly CombatEvent[], snap: Pick<Snap, 'from' | 'to'>): CombatEvent | undefined {
  if (snap.from < 0) return undefined
  if (snap.to === snap.from) return events[snap.from]
  const evs = events.slice(snap.from, snap.to + 1)
  return evs.find((e) => e.kind === 'hit' || e.kind === 'miss' || e.kind === 'guard') ?? evs[0]
}

// ── Beat timing ──────────────────────────────────────────────────────────────

/** A sweep's beat at 1×: the swing itself… */
export const SWEEP_MS = 560
/** …plus this much per extra target (the popups land one after another)… */
export const SWEEP_STAGGER_MS = 60
/** …(the stagger never stretches a beat past this)… */
export const SWEEP_STAGGER_MAX_MS = 480
/** …and a moment for the foes it felled to dissolve. */
export const SWEEP_DEATH_MS = 260
/** The empty field before the parties march in. */
export const OPENING_MS = 300
/** A grade B+ skill's portrait cut-in lengthens its cast by this much (skipped at 4× and
 *  under reduced motion). */
export const CUTIN_MS = 520

/** The skill grades that earn a portrait cut-in. */
const CUTIN_GRADES = new Set(['B', 'A', 'S', 'U'])

/** Grades so rare that every cast earns its cut-in (a B is only cut in the first time). */
const ALWAYS_CUTIN_GRADES = new Set(['A', 'S', 'U'])

/** Whether this act is a hero's grade B+ skill (a portrait cut-in may play). */
export function cutInSkill(e: CombatEvent | undefined, byId: Record<string, CombatUnitInit>): boolean {
  if (!e || e.kind !== 'act') return false
  const u = byId[e.actorId]
  if (!u || u.side !== 'hero' || u.isNpc) return false
  const def = SKILLS[e.skillId]
  return def !== undefined && CUTIN_GRADES.has(def.grade)
}

/**
 * The acts (event indices) whose cut-in plays: a hero's grade B skill the first time that
 * hero casts it in the fight, an A-or-better skill every time. A late fight casts its B
 * sweeps a dozen times; the cut-in stays an event instead of a toll.
 */
export function cutInActs(log: CombatLog, byId: Record<string, CombatUnitInit>): Set<number> {
  const out = new Set<number>()
  const seen = new Set<string>()
  log.events.forEach((e, i) => {
    if (e.kind !== 'act' || !cutInSkill(e, byId)) return
    const key = `${e.actorId}|${e.skillId}`
    if (seen.has(key) && !ALWAYS_CUTIN_GRADES.has(SKILLS[e.skillId]!.grade)) return
    seen.add(key)
    out.add(i)
  })
  return out
}

/** Delay (ms at 1×) of the n-th popup of a beat: a sweep's numbers land one after another. */
export function popupDelay(n: number): number {
  return Math.min(Math.max(0, n) * SWEEP_STAGGER_MS, SWEEP_STAGGER_MAX_MS)
}

export interface HoldOpts {
  speed: number
  nonLethal?: boolean
  /** The acts whose cut-in plays (`cutInActs`); none at 4× or under reduced motion. */
  cutIns?: ReadonlySet<number>
  /** Lane I: extra hold (ms at 1×) per beat, keyed by its first event — a boss's title card,
   *  a finisher's slow motion, the Lv999 Creature waking (`showHoldsFor`). */
  shows?: ReadonlyMap<number, number>
}

/** The extra holds a replay's boss shows add, per beat (see bossIntro.bossShows). */
export function showHoldsFor(log: CombatLog, byId: Record<string, CombatUnitInit>, opts: FrameOpts = {}): Map<number, number> {
  return showHolds(bossShows(log, byId), beatRanges(log, byId, opts))
}

/**
 * How long (real ms) frame `snap` holds the screen before the next one: its beat's own
 * duration at the replay speed, a crit's hit-stop, a cut-in, and a hero's death, which is
 * never rushed (a trial's knock-out is).
 */
export function frameHold(snap: Snap, events: readonly CombatEvent[], byId: Record<string, CombatUnitInit>, opts: HoldOpts): number {
  const speed = opts.speed
  if (snap.from < 0) return OPENING_MS / speed
  const evs = events.slice(snap.from, snap.to + 1)
  let ms: number
  if (evs.length === 1) {
    ms = eventDuration(evs[0]!)
    if (opts.cutIns?.has(snap.from)) ms += CUTIN_MS
  } else {
    const blows = evs.filter((e) => POPUP_KINDS.has(e.kind)).length
    ms = SWEEP_MS + popupDelay(blows - 1) + (evs.some((e) => e.kind === 'death') ? SWEEP_DEATH_MS : 0)
  }
  ms += opts.shows?.get(snap.from) ?? 0
  ms /= speed
  if (evs.some((e) => e.kind === 'hit' && e.crit)) ms += HITSTOP_MS
  const last = evs[evs.length - 1]!
  if (!opts.nonLethal && last.kind === 'death' && byId[last.unitId]?.side === 'hero' && !byId[last.unitId]?.isNpc) {
    ms = Math.max(ms, HERO_DEATH_MS / Math.min(speed, 2))
  }
  return ms
}

/** The replay's length at 1× (ms), as the scene plays it: beats, hit-stops, cut-ins, deaths. */
export function replayLength(log: CombatLog, opts: { nonLethal?: boolean; cutIns?: boolean; shows?: boolean } = {}): number {
  const byId = Object.fromEntries(log.unitsInit.map((u) => [u.id, u]))
  const frames = buildFrames(log, byId, (id) => id, opts)
  const hold: HoldOpts = {
    speed: 1,
    nonLethal: opts.nonLethal,
    cutIns: opts.cutIns ? cutInActs(log, byId) : undefined,
    shows: opts.shows ? showHoldsFor(log, byId, opts) : undefined,
  }
  let ms = 0
  for (let k = 0; k < frames.length - 1; k++) ms += frameHold(frames[k]!, log.events, byId, hold)
  return ms
}

/** Who strikes in this event: the actor of an act, hit, miss or guard; the friend of a follow-up. */
export function eventActor(e: CombatEvent | undefined): string | null {
  if (!e) return null
  if (e.kind === 'act' || e.kind === 'hit' || e.kind === 'miss' || e.kind === 'guard') return e.actorId
  if (e.kind === 'followup') return e.unitId
  return null
}

/**
 * The skill behind the event at `index`: its action's 'act', or the basic strike of a
 * follow-up (a friend pressing the attack has no 'act' of their own). Null for none.
 */
export function actionSkillId(events: readonly CombatEvent[], index: number, actorId: string): string | null {
  for (let i = index; i >= 0; i--) {
    const ev = events[i]!
    if (ev.kind === 'followup' && ev.unitId === actorId) return 'basic'
    if (ev.kind === 'act' && ev.actorId === actorId) return ev.skillId
    if (ev.kind === 'act') break
  }
  return null
}

/** The element a blow at `index` carries: its skill's, else the striker's own. */
export function blowElement(events: readonly CombatEvent[], index: number, byId: Record<string, CombatUnitInit>): Element {
  const e = events[index]
  const actor = eventActor(e)
  if (!actor) return 'physical'
  const sid = actionSkillId(events, index, actor)
  return (sid ? SKILLS[sid]?.element : null) ?? byId[actor]?.element ?? 'physical'
}
