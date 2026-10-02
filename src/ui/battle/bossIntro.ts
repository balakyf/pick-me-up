/**
 * Boss presentation (lane I), pure: who gets a title card when they step onto the field
 * (BOSS_INTRO, keyed by template id), which beats of a replay carry an intro, a finisher
 * (the killing blow on a boss) or the Lv999 Creature waking, and how much longer each of
 * those beats holds the screen. BattleScene plays them (BossIntro.tsx, BossShatter.tsx);
 * nothing here touches the DOM.
 */
import type { CombatEvent, CombatLog, CombatUnitInit, PhaseKeyword } from '../../engine/types'
import { ENEMY_TEMPLATES } from '../../engine/content'
import { ANCHORS } from '../../engine/content/anchors'
import { t } from '../i18n/i18n'

/**
 * - `boss`: the floor's master — the full title card, the boss bar, the finisher.
 * - `lieutenant`: a named foe who fights beside one (Rodvick, the Kraken) — a smaller card.
 * - `echo`: one of Tell's echoes, called back by a draft — a smaller card.
 */
export type IntroTier = 'boss' | 'lieutenant' | 'echo'

export interface BossIntro {
  /** The name on the card (English; the UI translates). */
  name: string
  /** The epithet after the dot: 'EL CID · THE FALLEN RANKER'. */
  epithet: string
  /** The card's colour (the rule, the glow). */
  color: string
  tier: IntroTier
}

/** Every anchor boss, raid boss, lieutenant and echo, by template id. */
export const BOSS_INTRO: Record<string, BossIntro> = {
  // Act I–II
  black_priest: { name: 'The Black Priest', epithet: 'Shepherd of the Falling City', color: '#c8405a', tier: 'boss' },
  lv999_creature: { name: 'Lv999 Creature', epithet: 'Do Not Wake It', color: '#b07adb', tier: 'boss' },
  halgiraf: { name: 'Halgiraf', epithet: 'The Half Black Dragon', color: '#9a7ad8', tier: 'boss' },
  mimic: { name: 'The Mimic', epithet: 'That Was Never a Chest', color: '#d4a02a', tier: 'lieutenant' },
  // Act III
  lizard_chief: { name: 'The Lizardman Chief', epithet: 'Lord of the Drowned Reeds', color: '#6aa85a', tier: 'boss' },
  kurushahr: { name: 'Kurushahr', epithet: 'Keeper of the Truth', color: '#7af0ff', tier: 'boss' },
  stone_statue: { name: 'The Ancient Stone Statue', epithet: 'Older Than the Tower', color: '#ff7a4a', tier: 'boss' },
  // Act IV
  kthat: { name: 'Kthat', epithet: 'The Water Dragon', color: '#4aa3ff', tier: 'boss' },
  jewel_guardian: { name: 'The Jewel Guardian', epithet: 'Bearer of the Blue Jewel', color: '#3a6aff', tier: 'lieutenant' },
  kraken: { name: 'The Kraken', epithet: 'Terror of the Undertow', color: '#b05aa0', tier: 'lieutenant' },
  // Act V
  rodvick: { name: 'Rodvick', epithet: "Valention's Hammer", color: '#d0602a', tier: 'lieutenant' },
  lazenca: { name: 'Lazenca', epithet: "Valention's Knife", color: '#4a8a5e', tier: 'lieutenant' },
  valention: { name: 'Valention', epithet: 'Of Iron Blood', color: '#e04040', tier: 'boss' },
  versace: { name: 'Versace', epithet: 'Of Silver Lightning', color: '#7af0ff', tier: 'boss' },
  darkan: { name: 'Darkan', epithet: 'Of Destruction', color: '#9a5ad0', tier: 'boss' },
  the_egg: { name: 'The Egg', epithet: 'Mother of the Brood', color: '#ff5a3a', tier: 'boss' },
  order_inquisitor: { name: 'The Order Inquisitor', epithet: 'Hand of the Purge', color: '#e0c870', tier: 'boss' },
  el_cid: { name: 'El Cid', epithet: 'The Fallen Ranker', color: '#f2c75c', tier: 'boss' },
  order_saint: { name: "The Order's Saint", epithet: 'Light of the Crusade', color: '#fffbd0', tier: 'boss' },
  // Act VI
  chimera_matriarch: { name: 'The Chimera Matriarch', epithet: 'Mother of Monsters', color: '#e0aa5a', tier: 'boss' },
  // Act VII
  pryos: { name: 'Pryos Al Ragna', epithet: 'Commander of the Wall', color: '#ff5a5a', tier: 'boss' },
  fragment_colossus: { name: 'The Fragment Colossus', epithet: 'The Wall Given Legs', color: '#c8b8ff', tier: 'boss' },
  // Act VIII
  herald_of_end: { name: 'The Herald', epithet: 'Of the End', color: '#ff3aff', tier: 'boss' },
  tell: { name: 'Tell', epithet: 'The Architect', color: '#ffe07a', tier: 'boss' },
  echo_halgiraf: { name: 'Echo of Halgiraf', epithet: 'The First Draft', color: '#d8e4ff', tier: 'echo' },
  echo_el_cid: { name: 'Echo of El Cid', epithet: 'The Second Draft', color: '#d8e4ff', tier: 'echo' },
  echo_valention: { name: 'Echo of Valention', epithet: 'The Second Draft', color: '#d8e4ff', tier: 'echo' },
  echo_pryos: { name: 'Echo of Pryos', epithet: 'The Last Draft', color: '#d8e4ff', tier: 'echo' },
  echo_herald: { name: 'Echo of the Herald', epithet: 'The Last Draft', color: '#d8e4ff', tier: 'echo' },
}

/** The card of a template (undefined for a foe that has none). */
export function introOf(templateId: string | undefined): BossIntro | undefined {
  return templateId === undefined ? undefined : BOSS_INTRO[templateId]
}

/** The name a boss goes by on its card and its bar, translated: the table's, unless the
 *  fight renamed the unit (the guild's Colossus). */
export function bossName(u: Pick<CombatUnitInit, 'name' | 'templateId'>): string {
  const intro = introOf(u.templateId)
  const tpl = u.templateId !== undefined ? ENEMY_TEMPLATES[u.templateId] : undefined
  if (!intro || (tpl !== undefined && tpl.name !== u.name)) return t(u.name)
  return t(intro.name)
}

/** The card's title line: 'EL CID · THE FALLEN RANKER' (upper-cased by CSS). */
export function introTitle(u: Pick<CombatUnitInit, 'name' | 'templateId'>): { name: string; epithet: string } {
  const intro = introOf(u.templateId)
  return { name: bossName(u), epithet: intro ? t(intro.epithet) : '' }
}

/** A template's phases, in order (lane G's `phase` keywords). */
export function phasesOf(templateId: string | undefined): PhaseKeyword[] {
  const kws = templateId !== undefined ? ENEMY_TEMPLATES[templateId]?.keywords ?? [] : []
  return kws.filter((k): k is PhaseKeyword => k.kind === 'phase')
}

const TIER_RANK: Record<IntroTier, number> = { boss: 0, lieutenant: 1, echo: 2 }

// ── The beats that carry a show ─────────────────────────────────────────────

/** A boss (or several) steps onto the field: `units` in card order (the first is the main). */
export interface IntroShow {
  kind: 'intro'
  units: string[]
  tier: IntroTier
}
/** The killing blow on a boss. */
export interface FinisherShow {
  kind: 'finisher'
  unitId: string
}
/** The Lv999 Creature (a looming foe) wakes. */
export interface WakesShow {
  kind: 'wakes'
  unitId: string
}
export type BossShow = IntroShow | FinisherShow | WakesShow

/** Extra time (ms at 1×) each show adds to its beat. The card at 4× is a glance. */
export const INTRO_MS = 2000
export const MINOR_INTRO_MS = 1300
export const FINISHER_MS = 1500
export const WAKES_MS = 1500

export function showMs(s: BossShow): number {
  if (s.kind === 'intro') return s.tier === 'boss' ? INTRO_MS : MINOR_INTRO_MS
  return s.kind === 'finisher' ? FINISHER_MS : WAKES_MS
}

function arrivals(e: CombatEvent): string[] {
  if (e.kind === 'battle-start' || e.kind === 'wave-spawn' || e.kind === 'summon') return e.enemyIds
  return []
}

/**
 * The shows of a replay, keyed by event index: an intro on the beat a boss first appears
 * (battle start, a wave, a summon — once per template per fight), a finisher on a boss's
 * death, and the moment a looming foe wakes.
 */
export function bossShows(log: CombatLog, byId: Record<string, CombatUnitInit>): Map<number, BossShow> {
  const out = new Map<number, BossShow>()
  const seen = new Set<string>()
  log.events.forEach((e, i) => {
    const come = arrivals(e)
    if (come.length > 0) {
      const fresh = come
        .map((id) => byId[id])
        .filter((u): u is CombatUnitInit => u !== undefined && introOf(u.templateId) !== undefined && !seen.has(u.templateId!))
      for (const u of fresh) seen.add(u.templateId!)
      if (fresh.length > 0) {
        fresh.sort((a, b) => {
          const ra = TIER_RANK[introOf(a.templateId)!.tier]
          const rb = TIER_RANK[introOf(b.templateId)!.tier]
          if (ra !== rb) return ra - rb
          return (b.targetTag ? 1 : 0) - (a.targetTag ? 1 : 0)
        })
        out.set(i, { kind: 'intro', units: fresh.map((u) => u.id), tier: introOf(fresh[0]!.templateId)!.tier })
      }
      return
    }
    if (e.kind === 'death' && introOf(byId[e.unitId]?.templateId)?.tier === 'boss') out.set(i, { kind: 'finisher', unitId: e.unitId })
    else if (e.kind === 'mission' && e.code === 'wakes' && e.params?.unitId !== undefined) out.set(i, { kind: 'wakes', unitId: e.params.unitId })
  })
  return out
}

/** The show a beat (events from..to) carries, if any (the first in the range). */
export function showIn(shows: ReadonlyMap<number, BossShow>, from: number, to: number): { at: number; show: BossShow } | null {
  if (from < 0) return null
  for (let i = from; i <= to; i++) {
    const s = shows.get(i)
    if (s) return { at: i, show: s }
  }
  return null
}

/** Extra hold per beat (keyed by the beat's first event): what frameHold adds at 1×. */
export function showHolds(shows: ReadonlyMap<number, BossShow>, beats: readonly (readonly [number, number])[]): Map<number, number> {
  const out = new Map<number, number>()
  for (const [from, to] of beats) {
    const s = showIn(shows, from, to)
    if (s) out.set(from, showMs(s.show))
  }
  return out
}

// ── Anchor data the bar reads ───────────────────────────────────────────────

/** Keywords the anchor adds to a template's group on this floor (the F10 creature's enrage). */
export function anchorKeywords(floor: number, templateId: string | undefined) {
  if (templateId === undefined) return []
  const def = ANCHORS[floor]
  if (!def) return []
  return def.waves.flat().filter((g) => g.templateId === templateId).flatMap((g) => g.keywords ?? [])
}
