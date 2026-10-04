/**
 * The endgame's words and choices for the screens (lane O), pure: when the epilogue is due,
 * Act VIII's card after the fate, the credits' roll as lines, the fate's consequences in
 * the war room, a post-Wall floor's briefing, and Reliving's floors.
 *
 * Once-per-save beats latch through lane M's story latch (`storyStep`/`storySeen`, the
 * guide list): `epilogue:<fate>` and `act:void:<fate>`. No new command for presentation.
 */
import { ACTS } from '../../engine/content/acts'
import { ANCHORS } from '../../engine/content/anchors'
import { HIDDEN_OBJECTIVES } from '../../engine/content/hidden'
import { ACT_STORY_AFTER, ANCHOR_STORY, EPILOGUE, POST_WALL_STORY, type ActStory, type AnchorStory } from '../../engine/content/story'
import type { ActDef } from '../../engine/content/acts'
import { ENDGAME, POST_WALL, creditsOf, cycleOf, endgameOf, fateOf, missedTruths, relivableFloors } from '../../engine/endgame'
import type { FallenRecord, GameState, HiddenObjective, Legend, OwnedHero, ReliveDifficulty, WorldFate } from '../../engine/types'
import { TUNING } from '../../engine/tuning'
import { worldDayIndex } from '../../engine/daily'
import { toWorldTime } from '../../engine/time'
import { t } from '../i18n/i18n'
import { tn } from '../text'
import { storySeen } from '../story/storyText'
import { iselFor } from '../results/memorialBand'
import { lastWordsTogether } from '../life/speech'
import { classLabel } from '../bits'

// ── The epilogue ────────────────────────────────────────────────────────────

export function epilogueKey(fate: WorldFate): string {
  return `epilogue:${fate}`
}

/** The epilogue waiting to play once: the fate is sealed and it has not been seen. */
export function epilogueDue(state: GameState): WorldFate | null {
  const fate = fateOf(state)
  return fate && !storySeen(state, epilogueKey(fate)) ? fate : null
}

/** The epilogue's slides (stills over act backdrops), its title and Isel's last word. */
export function epilogueOf(fate: WorldFate): { title: string; stills: { act: ActDef; line: string }[]; isel: string } {
  const e = EPILOGUE[fate]
  return {
    title: e.title,
    stills: e.stills.map((s) => ({ act: ACTS.find((a) => a.id === s.id) ?? ACTS[0]!, line: s.line })),
    isel: e.isel,
  }
}

/** Roman numerals for the cycle counter ("Cycle II"). */
export function cycleNumeral(cycle: number): string {
  const R = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
  return R[cycle] ?? String(cycle + 1)
}

// ── Act VIII, after the fate ────────────────────────────────────────────────

/** Act VIII's card again once the fate is sealed, on the first floor past ninety (once). */
export function afterActDue(state: GameState): (ActDef & { story: ActStory; latch: string }) | null {
  const fate = fateOf(state)
  const floor = state.tower.currentFloor
  if (!fate || floor <= TUNING.tower.worldEndFloor || floor > TUNING.tower.sliceTopFloor) return null
  const latch = `act:void:${fate}`
  if (storySeen(state, latch)) return null
  const act = ACTS.find((a) => a.id === 'void')!
  return { ...act, story: ACT_STORY_AFTER[fate], latch }
}

// ── The credits ─────────────────────────────────────────────────────────────

export interface RollFallen {
  id: string
  name: string
  /** "3★ Warrior · fell on F42 · day 12" */
  meta: string
  lastWords: string
  eulogy: string
}

export interface RollLegend {
  id: string
  name: string
  meta: string
  eulogy: string
}

export interface CreditRoll {
  fallen: RollFallen[]
  survivors: { id: string; name: string; meta: string }[]
  legends: RollLegend[]
  stats: string[]
}

function classOf(c: FallenRecord['heroClass'] | OwnedHero['heroClass']): string {
  return classLabel(c ?? null)
}

/** The credits as lines (translated): every one of the fallen, every survivor, the legends, the numbers. */
export function creditRoll(state: GameState): CreditRoll {
  const c = creditsOf(state)
  const taken = new Set<string>()
  // Last words for heroes who fell together never repeat (lane A's rule); a grave whose hero is
  // gone from the roster (synthesis) keeps silence.
  const words = lastWordsTogether(
    state,
    c.fallen.filter((g) => state.heroes[g.heroId] !== undefined),
  )
  const nameOf = (id: string) => state.heroes[id as OwnedHero['id']]?.name.split(' ')[0] ?? ''
  // Graves keep the absolute world-day; the roll counts days from the Master's first.
  const day1 = worldDayIndex(toWorldTime(state.createdAt))
  const dayOf = (d: number) => Math.max(1, d - day1 + 1)
  const fellHow = (g: FallenRecord) =>
    g.cause === 'synthesis'
      ? t('{star}★ {cls} · given to the Synthesis · day {day}', { star: g.star, cls: classOf(g.heroClass), day: dayOf(g.day) })
      : g.cause === 'captor'
        ? t('{star}★ {cls} · lost to a rival’s captors · day {day}', { star: g.star, cls: classOf(g.heroClass), day: dayOf(g.day) })
        : t('{star}★ {cls} · fell on F{floor} · day {day}', { star: g.star, cls: classOf(g.heroClass), floor: g.floor, day: dayOf(g.day) })
  const fallen: RollFallen[] = c.fallen.map((g) => ({
    id: g.heroId,
    name: g.name,
    meta: fellHow(g),
    lastWords: words.get(g.heroId) ?? t('…'),
    eulogy: iselFor(g.name.split(' ')[0]!, g, g.mourners.map(nameOf).filter((n) => n !== ''), taken),
  }))
  const survivors = c.survivors.map((h) => ({
    id: h.id,
    name: h.name,
    meta: t('{star}★ {cls} · Lv{level}', { star: h.star, cls: classOf(h.heroClass), level: h.xp.level }),
  }))
  const legends: RollLegend[] = c.legends.map((l: Legend) => ({
    id: `${l.cycle}:${l.heroId}`,
    name: l.name,
    meta:
      l.cause === 'battle'
        ? t('Cycle {n} · {star}★ {cls} · fell on F{floor}', { n: cycleNumeral(l.cycle), star: l.star, cls: classOf(l.heroClass), floor: l.floor })
        : t('Cycle {n} · {star}★ {cls}', { n: cycleNumeral(l.cycle), star: l.star, cls: classOf(l.heroClass) }),
    eulogy: iselFor(l.name.split(' ')[0]!, l, [], taken),
  }))
  const s = c.stats
  const stats = [
    t('Cycle {n}', { n: cycleNumeral(s.cycle) }),
    s.fate === 'saved' ? t('The world was spared') : s.fate === 'ended' ? t('The world ended') : t('The world still waits'),
    ...(s.day !== null ? [t('Decided on day {n}', { n: dayOf(s.day) })] : []),
    t('Highest floor: F{n}', { n: s.highestCleared }),
    tn(s.heroesCalled, '1 hero answered the crystal', '{n} heroes answered the crystal'),
    tn(s.fallen, '1 fell', '{n} fell'),
    tn(s.survivors, '1 survived', '{n} survived'),
    t('Truths known: {n}', { n: s.truths }),
    t('Master Level {n}', { n: s.masterLevel }),
  ]
  return { fallen, survivors, legends, stats }
}

// ── The fate in the war room and the lobby ──────────────────────────────────

/** The lobby's tint once the fate is sealed: grey for an ended world, warm for a spared one. */
export function fateTint(state: Pick<GameState, 'tower'>): string {
  const fate = fateOf(state)
  return fate ? `fate-tint-${fate}` : ''
}

/** What the fate changed, for the war room's banner (translated lines), or null before it. */
export function fateConsequences(state: GameState): { title: string; lines: string[] } | null {
  const fate = fateOf(state)
  if (!fate) return null
  const F = ENDGAME.fate
  if (fate === 'ended') {
    return {
      title: t('The world has ended'),
      lines: [
        t('The void is sated: every foe on F91–100 fights at {pct}% of its strength.', { pct: Math.round(F.endedPowerMult * 100) }),
        t('No one is left below to pay: floors past ninety give {pct}% of their gold.', { pct: Math.round(F.endedGoldMult * 100) }),
        t('The waiting room has gone grey. Isel keeps the ledger of the dead.'),
      ],
    }
  }
  return {
    title: t('The world was spared'),
    lines: [
      t('The world sent its tribute: {gems} 💎 and {gold} ◆.', { gems: F.savedTribute.gems, gold: F.savedTribute.gold.toLocaleString() }),
      t('Tell cannot call back the Herald you refused: her last draft is one echo short.'),
      t('The floors past ninety are as hard as they were written.'),
    ],
  }
}

/** The cycle line for the war room ("Cycle II · the tower is 12% harder"), or null in the first world. */
export function cycleLine(state: GameState): string | null {
  const c = cycleOf(state)
  if (c === 0) return null
  return t('Cycle {n} · this world’s tower is {pct}% harder than the first', { n: cycleNumeral(c), pct: Math.round(ENDGAME.cycle.powerStep * c * 100) })
}

/** What a New Cycle carries over, for its confirmation (translated). */
export function newCycleCarries(state: GameState): { keeps: string[]; loses: string[] } {
  const legends = Math.min(ENDGAME.cycle.legendsCarried, state.life.memorial.length)
  return {
    keeps: [
      t('Your Master Level ({n}) and the Enemy Codex', { n: state.meta.masterLevel }),
      t('Your gems ({n} 💎), purchases and login streak', { n: state.gems.toLocaleString() }),
      tn(legends, '1 of the fallen, remembered as a legend', '{n} of the fallen, remembered as legends'),
    ],
    loses: [
      t('Every hero, the gold, the gear and the buildings'),
      t('The tower: back to the first floor, {pct}% harder', { pct: Math.round(ENDGAME.cycle.powerStep * (cycleOf(state) + 1) * 100) }),
    ],
  }
}

// ── Behind the Wall ─────────────────────────────────────────────────────────

/** A post-Wall floor's briefing (F81–84, F86–89), like an anchor's; null elsewhere. */
export function postWallBriefing(floor: number): (AnchorStory & { floor: number; mission: string }) | null {
  const def = POST_WALL[floor]
  const story = POST_WALL_STORY[floor]
  if (!def || !story || ANCHORS[floor]) return null
  return { ...story, floor, mission: def.missionType }
}

// ── Memories of the Tower (Reliving) ────────────────────────────────────────

/** A relivable floor's title (its story's), else "Floor n". */
export function memoryTitle(floor: number): string {
  const s = ANCHOR_STORY[floor] ?? POST_WALL_STORY[floor]
  return s ? t(s.title) : t('Floor {n}', { n: floor })
}

export interface MemoryRow {
  floor: number
  title: string
  missed: HiddenObjective[]
  found: HiddenObjective[]
}

/** The memories the Master can relive, missed truths first. */
export function memoryRows(state: GameState): MemoryRow[] {
  const found = new Set(state.tower.hiddenFound)
  return relivableFloors(state)
    .map((floor) => ({
      floor,
      title: memoryTitle(floor),
      missed: missedTruths(state, floor),
      found: HIDDEN_OBJECTIVES.filter((h) => h.floor === floor && found.has(h.id)),
    }))
    .sort((a, b) => Number(b.missed.length > 0) - Number(a.missed.length > 0) || a.floor - b.floor)
}

export const DIFFICULTY_LABEL: Record<ReliveDifficulty, string> = { faded: 'Faded', true: 'As it was', vivid: 'Vivid' }

export function difficultyBlurb(d: ReliveDifficulty): string {
  const D = ENDGAME.relive.difficulties[d]
  const pct = Math.round(D.power * 100)
  if (d === 'faded') return t('The foes at {pct}% of their strength. A faded memory keeps no truths.', { pct })
  if (d === 'true') return t('The floor as it was. A missed truth can be found again.')
  return t('The foes at {pct}% of their strength, for more gold. Truths can be found.', { pct })
}

/** How many truths the Master is short of Subverting F90 (0 once enough are known). */
export function truthsShort(state: GameState): number {
  return Math.max(0, TUNING.lifecycle.subvertTruths - state.tower.hiddenFound.length)
}

/** Whether the endgame slice has recovered anything (for the Chronicle-style tally). */
export function recoveredCount(state: GameState): number {
  return endgameOf(state).recovered?.length ?? 0
}
