/**
 * The goal stack (spec 2026-10-12 S4): "what do I do next?" in one glance.
 *
 *   short  — the very next thing: an onboarding step, or the next floor with its threat
 *            and its reward ("Floor 7 · a fair fight", "◆ gold ×2");
 *   medium — the nearest thing worth working toward, picked on a goal gradient: a
 *            waiting New Arrival or Echo, a facility one or two floors away, a boss,
 *            the next summon, a timer about to finish;
 *   long   — the act being climbed and the collection being filled;
 *   cta    — a gold "Summon now!" chip whenever a Normal summon is affordable;
 *   request— one hero asking for something the state says they need.
 *
 * PURE: derived from the state on every render (nothing is persisted), apart from
 * `t()` reading the active locale. `nowWorld` only measures timers.
 */
import type { GameState, HeroClass, Element, FacilityId, OwnedHero, FloorKind } from '../../engine/types'
import { TUNING } from '../../engine/tuning'
import { scoutFloor, canFight, type Threat } from '../../engine/scout'
import { actForFloor } from '../../engine/content/acts'
import { floorKindBase } from '../../engine/climb'
import { canPromote } from '../../engine/promotion'
import { tutorialPullAvailable } from '../../engine/gacha'
import { JOBS, JOB_FACILITY, jobFeeling, jobHolders, jobOpen, jobSeats } from '../../engine/life'
import { GUIDE_STEPS, guideComplete } from '../life/FirstSteps'
import { PLACE_LABEL, type PlaceId } from '../world/lobbyMap'
import { nextUnlock, type NextUnlock } from './unlocks'
import { isPlaceOpen } from '../../engine/unlocks'
import { t } from '../i18n/i18n'

export type GoalTarget = { kind: 'place'; place: PlaceId } | { kind: 'hero'; heroId: string; action: 'talk' | 'profile' }

export type GoalTone = 'cta' | 'safe' | 'fair' | 'risky' | 'deadly' | 'reward' | 'info' | 'request'

export interface Goal {
  /** Stable id (for keys and tests), e.g. 'floor', 'unlock:kitchen', 'summon-now'. */
  id: string
  icon: string
  /** The line itself (translated). */
  text: string
  /** A second, quieter line (translated). */
  detail?: string
  /** Goal-gradient bar. */
  progress?: { cur: number; max: number; label: string }
  tone: GoalTone
  /** Where a click takes the Master; null = informational only. */
  go: GoalTarget | null
}

export interface GoalStack {
  short: Goal
  medium: Goal | null
  long: Goal
  cta: Goal | null
  request: Goal | null
  /** The next first step when it is NOT the short goal (a side step: talk, a job, a
   *  building), shown under the short line until onboarding is done. */
  step: Goal | null
  /** Onboarding progress while the first steps are incomplete. */
  onboarding: { done: number; total: number } | null
}

const place = (p: PlaceId): GoalTarget => ({ kind: 'place', place: p })
const label = (p: PlaceId): string => t(PLACE_LABEL[p])
const firstName = (h: OwnedHero): string => h.name.split(/\s+/)[0] ?? h.name
const living = (s: GameState): OwnedHero[] => (Object.values(s.heroes) as OwnedHero[]).filter((h) => h.alive)
const fmt = (n: number): string => n.toLocaleString('en-US')

/** The place a facility's panel lives at. */
export function placeOfFacility(f: FacilityId): PlaceId {
  return f === 'forge' ? 'armory' : f
}

/** A real-time span, short and language-neutral ("45 min", "2h05"). */
export function formatEta(realMs: number): string {
  const min = Math.max(1, Math.ceil(realMs / 60_000))
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h}h${String(m).padStart(2, '0')}`
}

// ── Collection: the class × element pairs the Master has met ──────────────────

const CLASSES: (HeroClass | null)[] = [null, 'warrior', 'spearman', 'thief', 'archer', 'mage']
const ELEMENTS: Element[] = ['physical', 'fire', 'water', 'wind', 'earth', 'light', 'dark']
/** Every class (and the classless) in every element. */
export const COLLECTION_SIZE = CLASSES.length * ELEMENTS.length

/** Distinct class × element pairs among every hero ever summoned (the fallen count). */
export function collectionCount(state: GameState): number {
  const seen = new Set<string>()
  for (const h of Object.values(state.heroes) as OwnedHero[]) seen.add(`${h.heroClass ?? '-'}|${h.element}`)
  for (const r of state.life.memorial) seen.add(`${r.heroClass ?? '-'}|${r.element}`)
  return Math.min(COLLECTION_SIZE, seen.size)
}

// ── Short: the next floor ──────────────────────────────────────────────────────

const THREAT_TEXT: Record<Threat, string> = {
  safe: 'Floor {n} · looks safe',
  fair: 'Floor {n} · a fair fight',
  risky: 'Floor {n} · risky',
  deadly: 'Floor {n} · deadly',
}

/** The kind the next floor will be fought as (a chosen door wins over the base kind). */
function kindOf(state: GameState, f: number): FloorKind {
  const base = floorKindBase(f)
  const k = state.tower.kind
  return k === undefined || k === 'path' ? base : k
}

function rewardText(state: GameState, f: number, kind: FloorKind): string {
  const firstClear = f > state.tower.highestCleared
  let r: string
  switch (kind) {
    case 'boss':
      r = firstClear ? t('Reward: a boss, then a bonus room') : t('Reward: ◆ gold')
      break
    case 'elite':
      r = t('Reward: double ◆ gold, stones and a boon')
      break
    case 'rest':
      r = t('A rest: the party recovers Sanity')
      break
    case 'cache':
      r = t('A cache: ◆ gold and stones')
      break
    default:
      r = firstClear ? t('Reward: ◆ gold and Master XP') : t('Reward: ◆ gold')
  }
  const charges = state.meta.rested?.charges ?? 0
  if (charges > 0 && kind !== 'rest') r += ` · ${t('Pent-up Interference: ◆ ×2 ({n} left)', { n: charges })}`
  return r
}

function floorGoal(state: GameState): Goal {
  const f = state.tower.currentFloor
  if (state.tower.worldEnded || f > TUNING.tower.sliceTopFloor) {
    return { id: 'floor-top', icon: '🗼', text: t('The top of the tower'), tone: 'info', go: place('tower') }
  }
  if (state.tower.event) {
    return { id: 'floor-event', icon: '✦', text: t('Floor {n}: an event awaits', { n: f }), tone: 'reward', go: place('tower') }
  }
  if (state.tower.doors && state.tower.doors.length > 1) {
    return { id: 'floor-doors', icon: '🚪', text: t('Floor {n}: choose your door', { n: f }), tone: 'reward', go: place('tower') }
  }
  const report = scoutFloor(state)
  const threat: Threat = report?.threat ?? 'fair'
  const kind = kindOf(state, f)
  const detail = report?.nemesis ? t('{name} waits here', { name: report.nemesis }) : rewardText(state, f, kind)
  return {
    id: 'floor',
    icon: kind === 'boss' ? '☠' : '🗼',
    text: t(THREAT_TEXT[threat], { n: f }),
    detail,
    tone: threat,
    go: place('tower'),
  }
}

/** The first steps that ARE the core loop (summon, party, climb): while one is next it
 *  is the short goal. The side steps after them never hide the next floor. */
const CORE_STEPS: ReadonlySet<string> = new Set(['pull', 'party', 'floor'])

function stepGoal(state: GameState, step: (typeof GUIDE_STEPS)[number], done: number): Goal {
  return {
    id: `guide:${step.id}`,
    icon: '✧',
    text: t(step.label),
    detail: t(step.hint),
    progress: { cur: done, max: GUIDE_STEPS.length, label: `${done}/${GUIDE_STEPS.length}` },
    tone: 'info',
    go: step.target(state),
  }
}

interface ShortPick {
  goal: Goal
  step: Goal | null
  onboarding: GoalStack['onboarding']
}

function shortGoal(state: GameState, heroes: OwnedHero[]): ShortPick {
  let step: Goal | null = null
  let onboarding: GoalStack['onboarding'] = null
  if (!guideComplete(state)) {
    const done = GUIDE_STEPS.filter((g) => g.done(state)).length
    const next = GUIDE_STEPS.find((g) => !g.done(state))!
    onboarding = { done, total: GUIDE_STEPS.length }
    const goal = stepGoal(state, next, done)
    if (CORE_STEPS.has(next.id)) return { goal, step: null, onboarding }
    // A side line: the "First steps n/6" toggle under it already counts.
    const { progress: _count, ...side } = goal
    step = side
  }
  return { ...loopGoal(state, heroes), step, onboarding }
}

/** The core loop's next move: summon, set the party, rest, or climb. */
function loopGoal(state: GameState, heroes: OwnedHero[]): { goal: Goal } {
  if (heroes.length === 0) {
    return {
      goal: { id: 'no-heroes', icon: '🔮', text: t('Summon new heroes'), detail: t('Every hero has fallen. The crystal can call more.'), tone: 'deadly', go: place('summon') },
    }
  }
  const members = state.party.slots.map((id) => (id ? state.heroes[id] : undefined)).filter((h): h is OwnedHero => h !== undefined && h.alive)
  if (!members.some(canFight)) {
    if (members.length > 0 && members.every((h) => h.sanity <= 0)) {
      return {
        goal: { id: 'party-rest', icon: '🍲', text: t('Your party needs rest'), detail: t('No one climbs at 0 Sanity. A meal in the Kitchen helps.'), tone: 'risky', go: place('kitchen') },
      }
    }
    const detail = members.length === 0 ? t('Pick who climbs at the party board.') : t('Everyone in the party is busy right now.')
    return {
      goal: { id: 'no-party', icon: '🛡', text: t('Set your party'), detail, tone: 'risky', go: place('party') },
    }
  }
  return { goal: floorGoal(state) }
}

// ── Medium: the nearest thing worth working toward ────────────────────────────

function unlockGoal(u: NextUnlock): Goal {
  const text =
    u.unlockAt !== null
      ? t('{place} opens at Floor {n}', { place: label(u.place), n: u.unlockAt })
      : t('{place} opens at Master Lv {n}', { place: label(u.place), n: u.progress?.need ?? 0 })
  const goal: Goal = { id: `unlock:${u.place}`, icon: '🔒', text, tone: 'info', go: place('tower') }
  if (u.progress) goal.progress = { cur: u.progress.cur, max: u.progress.need, label: `${u.progress.cur}/${u.progress.need}` }
  if (u.also.length > 0) goal.detail = t('Also: {places}', { places: u.also.map(label).join(', ') })
  return goal
}

function bossGoal(state: GameState): Goal | null {
  const f = state.tower.currentFloor
  if (f > TUNING.tower.sliceTopFloor || state.tower.worldEnded) return null
  // The floor being climbed is the short goal; this looks past it.
  let boss = f + 1
  while (floorKindBase(boss) !== 'boss' && boss < f + 5) boss++
  if (floorKindBase(boss) !== 'boss' || boss > TUNING.tower.sliceTopFloor) return null
  const gap = boss - f
  const text = gap === 1 ? t('Boss on the next floor') : t('Boss in {n} floors', { n: gap })
  return {
    id: 'boss',
    icon: '☠',
    text,
    progress: { cur: 5 - gap, max: 5, label: t('Floor {n}', { n: boss }) },
    tone: 'risky',
    go: place('tower'),
  }
}

interface Timer {
  at: number
  goal: Goal
}

function timerGoal(state: GameState, heroes: OwnedHero[], nowWorld: number): Goal | null {
  const timers: Timer[] = []
  const eta = (at: number) => formatEta((at - nowWorld) / TUNING.time.worldTimeFactor)
  for (const h of heroes) {
    const name = firstName(h)
    if (h.promotion && h.promotion.completesAtWorld > nowWorld)
      timers.push({ at: h.promotion.completesAtWorld, goal: { id: `timer:promo:${h.id}`, icon: '⛩', text: t('{name} is promoted in {time}', { name, time: eta(h.promotion.completesAtWorld) }), tone: 'info', go: place('promotionChamber') } })
    if (h.training && h.training.completesAtWorld > nowWorld)
      timers.push({ at: h.training.completesAtWorld, goal: { id: `timer:drill:${h.id}`, icon: '⚔', text: t('{name}’s drill ends in {time}', { name, time: eta(h.training.completesAtWorld) }), tone: 'info', go: place('trainingCenter') } })
    if (h.expedition && h.expedition.completesAtWorld > nowWorld)
      timers.push({ at: h.expedition.completesAtWorld, goal: { id: `timer:exp:${h.id}`, icon: '⟡', text: t('{name} is back from the Ruins in {time}', { name, time: eta(h.expedition.completesAtWorld) }), tone: 'info', go: place('rift') } })
  }
  for (const [f, fs] of Object.entries(state.facilities) as [FacilityId, GameState['facilities'][FacilityId]][]) {
    if (fs.build && fs.build.completesAtWorld > nowWorld) {
      const p = placeOfFacility(f)
      timers.push({ at: fs.build.completesAtWorld, goal: { id: `timer:build:${f}`, icon: '🔨', text: t('{place} is built in {time}', { place: label(p), time: eta(fs.build.completesAtWorld) }), tone: 'info', go: place(p) } })
    }
  }
  if (timers.length === 0) return null
  timers.sort((a, b) => a.at - b.at || (a.goal.id < b.goal.id ? -1 : 1))
  return timers[0]!.goal
}

function summonProgress(state: GameState): Goal {
  const cost = TUNING.gacha.normalCostGold
  return {
    id: 'summon-progress',
    icon: '🔮',
    text: t('Next summon'),
    progress: { cur: Math.min(state.gold, cost), max: cost, label: `${fmt(Math.min(state.gold, cost))}/${fmt(cost)}` },
    tone: 'reward',
    go: place('summon'),
  }
}

function mediumGoal(state: GameState, heroes: OwnedHero[], nowWorld: number): Goal | null {
  const legacy = state.life.legacy
  if (legacy && legacy.recruitTokens > 0) {
    return {
      id: 'recruit',
      icon: '🔔',
      text: t('A new face answers the bell'),
      detail: t('A free summon waits at the Memorial'),
      tone: 'reward',
      go: place('memorial'),
    }
  }
  if (legacy && legacy.pending.length > 0) {
    const p = legacy.pending[0]!
    return {
      id: `echo:${p.fallenId}`,
      icon: '🕯',
      text: t('{name}’s echo waits for an heir', { name: p.fallenName.split(/\s+/)[0] ?? p.fallenName }),
      detail: t('Choose who carries it, at the Memorial'),
      tone: 'reward',
      go: place('memorial'),
    }
  }
  const nu = nextUnlock(state)
  const near = (n: number) => nu !== null && nu.unlockAt !== null && nu.unlockAt - state.tower.highestCleared <= n
  if (near(2)) return unlockGoal(nu!)
  const boss = bossGoal(state)
  if (boss && boss.progress && boss.progress.max - boss.progress.cur <= 2) return boss
  // (No gold bar while the free ten-pull waits: the call to action says so.)
  if (state.gold < TUNING.gacha.normalCostGold && !tutorialPullAvailable(state)) return summonProgress(state)
  if (nu) return unlockGoal(nu)
  return timerGoal(state, heroes, nowWorld) ?? boss
}

// ── Long: the act and the collection ──────────────────────────────────────────

function longGoal(state: GameState): Goal {
  const f = Math.min(state.tower.currentFloor, TUNING.tower.sliceTopFloor)
  const act = actForFloor(f)
  const len = act.to - act.from + 1
  const cleared = Math.max(0, Math.min(len, state.tower.highestCleared - act.from + 1))
  return {
    id: `act:${act.id}`,
    icon: '📜',
    text: t(act.title),
    detail: t('Collection {n}/{max}', { n: collectionCount(state), max: COLLECTION_SIZE }),
    progress: { cur: cleared, max: len, label: `${cleared}/${len}` },
    tone: 'info',
    go: place('tower'),
  }
}

// ── The call to action and hero requests ──────────────────────────────────────

function ctaGoal(state: GameState, short: Goal): Goal | null {
  const cost = TUNING.gacha.normalCostGold
  // The free ten-pull is still on offer (a new Master, or a veteran whose save predates
  // it): "you can afford 5" would mislead. While it is the short goal, the short line
  // already says so; otherwise the chip says it is free, whatever the gold.
  if (tutorialPullAvailable(state)) {
    if (short.id === 'guide:pull') return null
    return { id: 'summon-now', icon: '🔮', text: t('Free summon!'), detail: t('The crystal owes you ten heroes'), tone: 'cta', go: place('summon') }
  }
  if (state.gold < cost) return null
  const n = Math.floor(state.gold / cost)
  return {
    id: 'summon-now',
    icon: '🔮',
    text: t('Summon now!'),
    detail: n === 1 ? t('You can afford one hero') : t('You can afford {n} heroes', { n }),
    tone: 'cta',
    go: place('summon'),
  }
}

/** Grief at or above this reads as "this hero needs the Memorial". */
export const GRIEF_REQUEST_AT = 40

/** One hero asking for something the state says they need (null when no one is). */
export function heroRequest(state: GameState): Goal | null {
  const heroes = living(state).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const promo = heroes.find((h) => canPromote(h))
  if (promo) {
    return {
      id: `request:promote:${promo.id}`,
      icon: '⛩',
      text: t('{name}: “Promote me!”', { name: firstName(promo) }),
      detail: t('At the level cap. The Promotion Chamber can raise them a star.'),
      tone: 'request',
      go: place('promotionChamber'),
    }
  }
  const grieving = heroes.find((h) => (h.life?.grief ?? 0) >= GRIEF_REQUEST_AT)
  if (grieving) {
    return {
      id: `request:grief:${grieving.id}`,
      icon: '🕯',
      text: t('{name} is grieving: visit the Memorial', { name: firstName(grieving) }),
      tone: 'request',
      go: place('memorial'),
    }
  }
  for (const h of heroes) {
    if (h.life?.job || !h.life) continue
    for (const job of JOBS) {
      if (jobFeeling(h, job) !== 'likes' || !jobOpen(state, job)) continue
      if (jobHolders(state, job).length >= jobSeats(state, job)) continue
      // Never point at a place the campus has not opened yet (the medium line says when).
      if (!isPlaceOpen(state, placeOfFacility(JOB_FACILITY[job]))) continue
      return {
        id: `request:job:${h.id}:${job}`,
        icon: '⚒',
        text: t('Assign {name} to the {place}', { name: firstName(h), place: label(placeOfFacility(JOB_FACILITY[job])) }),
        detail: t('They would like the work.'),
        tone: 'request',
        go: { kind: 'hero', heroId: h.id, action: 'profile' },
      }
    }
  }
  return null
}

/** The whole stack, derived from the state. */
export function nextGoals(state: GameState, nowWorld: number): GoalStack {
  const heroes = living(state)
  const { goal: short, step: side, onboarding } = shortGoal(state, heroes)
  const request = heroRequest(state)
  // "Assign Kael to the Kitchen" says the same as "Give a hero a job", only better.
  const step = side?.id === 'guide:job' && request?.id.startsWith('request:job:') ? null : side
  let medium = mediumGoal(state, heroes, nowWorld)
  // Never repeat the short goal's destination-and-message on the medium line.
  if (medium && medium.id === short.id) medium = null
  return {
    short,
    medium,
    long: longGoal(state),
    cta: ctaGoal(state, short),
    request,
    step,
    onboarding,
  }
}
