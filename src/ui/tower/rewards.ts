/**
 * Reward-cascade data (spec 2026-10-12 S6 Sweep, S11, S15; WP4). Pure helpers the
 * Tower and Results screens render from: level-ups, the "Next summon" bar, the "Next:"
 * teaser, material names, the Sweep decision and the Sortie streak.
 */
import type { FloorKind, FloorResult, GameState, HeroId, MaterialId, OwnedHero, Sortie } from '../../engine/types'
import type { ScoutReport } from '../../engine/scout'
import { ANCHORS } from '../../engine/content'
import { TUNING } from '../../engine/tuning'
import { t } from '../i18n/i18n'
import { ELEMENT_VIS } from '../bits'
import { DOOR_TITLE, KIND_ICON, KIND_LABEL, currentKind } from './kinds'

// ── Level-ups ────────────────────────────────────────────────────────────────

/** Every hero's level, keyed by id (captured just before a fight). */
export function levelsOf(state: GameState): Record<HeroId, number> {
  const out: Record<string, number> = {}
  for (const h of Object.values(state.heroes)) out[h.id] = h.xp.level
  return out as Record<HeroId, number>
}

export interface LevelUp {
  hero: OwnedHero
  from: number
  to: number
}

/** Living heroes whose level rose since `before` (roster order). */
export function levelUps(before: Readonly<Record<string, number>> | undefined, state: GameState): LevelUp[] {
  if (!before) return []
  const out: LevelUp[] = []
  for (const h of Object.values(state.heroes)) {
    const from = before[h.id]
    if (from !== undefined && h.alive && h.xp.level > from) out.push({ hero: h, from, to: h.xp.level })
  }
  return out
}

// ── Next summon ──────────────────────────────────────────────────────────────

export interface SummonProgress {
  cost: number
  /** Fill before this floor's gold (0..1). */
  fromPct: number
  /** Fill now (0..1). */
  toPct: number
  /** A Normal summon is affordable now. */
  ready: boolean
  /** Gold still missing (0 when ready). */
  missing: number
}

/** Progress toward the next Normal summon, before and after `gained` gold. */
export function summonProgress(gold: number, gained: number, cost: number = TUNING.gacha.normalCostGold): SummonProgress {
  const clamp = (x: number) => Math.max(0, Math.min(1, x))
  return {
    cost,
    fromPct: clamp((gold - Math.max(0, gained)) / cost),
    toPct: clamp(gold / cost),
    ready: gold >= cost,
    missing: Math.max(0, cost - gold),
  }
}

// ── "Next:" teaser ───────────────────────────────────────────────────────────

/** One line on what waits next, to leave an open loop at the end of the results. */
export function nextTeaser(state: GameState): string | null {
  const tw = state.tower
  const f = tw.currentFloor
  if (f > TUNING.tower.sliceTopFloor) return null
  if (tw.event?.kind === 'boon') return t('Next: choose a Boon, then Floor {n}.', { n: f })
  if (tw.event) return t('Next: an event floor, then Floor {n}.', { n: f })
  if (tw.doors && tw.doors.length > 0) {
    const names = tw.doors.map((d) => `${KIND_ICON[d.kind]} ${t(DOOR_TITLE[d.kind])}`).join(t(' or '))
    return t('Next: Floor {n}. Choose your door: {doors}.', { n: f, doors: names })
  }
  const kind = currentKind(state)
  const anchor = ANCHORS[f]
  if (anchor) return t('Next: Floor {n}, {mission}. A guardian floor.', { n: f, mission: t(anchor.missionType) })
  let toBoss = 0
  for (let g = f + 1; g <= Math.min(f + 5, TUNING.tower.sliceTopFloor); g++) {
    if (ANCHORS[g]) {
      toBoss = g - f
      break
    }
  }
  const head = t('Next: Floor {n} · {kind}.', { n: f, kind: `${KIND_ICON[kind]} ${t(KIND_LABEL[kind])}` })
  if (toBoss === 1) return `${head} ${t('The guardian floor is right after.')}`
  if (toBoss > 1) return `${head} ${t('Guardian floor in {n}.', { n: toBoss })}`
  return head
}

// ── Materials ────────────────────────────────────────────────────────────────

const MAT_LABEL: Record<string, string> = {
  promotionStone: '🪨 Stone',
  rankMaterial: '📦 Rank Mat',
  bookOfReverseHeaven: '📕 Book of Reverse Heaven',
}

/** A material's display name (reuses the Daily Dungeon's labels). */
export function materialLabel(id: MaterialId): string {
  if (MAT_LABEL[id] !== undefined) return t(MAT_LABEL[id])
  if (id.startsWith('attrStone_')) {
    const el = id.slice('attrStone_'.length) as keyof typeof ELEMENT_VIS
    const vis = ELEMENT_VIS[el]
    return vis ? `🔹 ${t('{element} stone', { element: t(vis.label) })}` : `🔹 ${el}`
  }
  return id
}

/** The materials a result dropped, largest first, with display names. */
export function materialRows(result: FloorResult): { id: string; label: string; n: number }[] {
  return Object.entries(result.materialsAwarded)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id, n]) => ({ id, label: materialLabel(id), n }))
}

// ── Sweep (S6) ───────────────────────────────────────────────────────────────

export interface SweepInput {
  /** The scout report for the floor, read before the fight (null when unscoutable). */
  report: Pick<ScoutReport, 'threat' | 'kind'> | null
  result: FloorResult
  /** The player's `prefs.autoSweep`. */
  autoSweep: boolean
}

/**
 * Whether a fight plays as a short highlight ('highlights') or in full. A Breather or a
 * Safe floor, won with nobody lost, sweeps when the player allows it. Never swept: any
 * fight in which a hero died, the tutorial floors (a new Master's first fights are worth
 * watching), a guardian (boss/anchor) floor, and a fight that avenged a Nemesis (the
 * revenge is the show).
 */
export function sweepMode({ report, result, autoSweep }: SweepInput): 'full' | 'highlights' {
  if (!autoSweep || !result.cleared || result.fallenHeroIds.length > 0) return 'full'
  if (result.result.outcome !== 'win') return 'full'
  const kind: FloorKind | undefined = result.kind ?? report?.kind
  if (kind === 'tutorial' || report?.kind === 'tutorial') return 'full'
  if (kind === 'boss' || ANCHORS[result.floor] !== undefined) return 'full'
  if ((result.nemesisDefeated ?? []).length > 0) return 'full'
  const easy = kind === 'breather' || report?.kind === 'breather' || report?.threat === 'safe'
  return easy ? 'highlights' : 'full'
}

// ── Sortie (S15) ─────────────────────────────────────────────────────────────

const S = TUNING.climb.sortie

/** The streak bonus a clear adds when it is the `k`-th in a row (fraction of its gold). */
export function streakPct(k: number): number {
  return Math.min(S.streakCap, Math.max(0, k) * S.streakPctPerFloor)
}

/** What a rout or wipe would keep of the purse. */
export function keptOnRout(purse: number): number {
  return Math.round(purse * S.keepOnRout)
}

/** True when a Sortie is underway (a floor has been attempted since leaving campus). */
export function sortieActive(sortie: Sortie | null | undefined): sortie is Sortie {
  return sortie !== null && sortie !== undefined
}

// ── No-fight Doors ───────────────────────────────────────────────────────────

/** What a Rest or Cache Door just gave, read from the state before and after CHOOSE_DOOR. */
export function doorOutcome(before: GameState, after: GameState, kind: FloorKind): string {
  const parts: string[] = []
  const gold = after.gold - before.gold
  if (gold > 0) parts.push(t('+{n} gold', { n: gold.toLocaleString() }))
  const stones = (after.materials.promotionStone ?? 0) - (before.materials.promotionStone ?? 0)
  if (stones > 0) parts.push(stones === 1 ? t('+1 Promotion Stone') : t('+{n} Promotion Stones', { n: stones }))
  let sanity = 0
  for (const h of Object.values(after.heroes)) {
    const was = before.heroes[h.id]
    if (was && h.alive) sanity = Math.max(sanity, h.sanity - was.sanity)
  }
  if (sanity > 0) parts.push(t('+{n} Sanity', { n: sanity }))
  const meals = (after.life.pantry ?? 0) - (before.life.pantry ?? 0)
  if (meals > 0) parts.push(meals === 1 ? t('+1 meal') : t('+{n} meals', { n: meals }))
  const head = kind === 'rest' ? t('The party rests.') : kind === 'cache' ? t('A cache, unguarded.') : t('The door opens.')
  return parts.length > 0 ? `${head} ${parts.join(' · ')}` : head
}

// ── Revenge ──────────────────────────────────────────────────────────────────

/** The names of the Banes a result avenged ("Mira's Bane"), from the legacy records. */
export function avengedNames(result: FloorResult, state: GameState): { bane: string; hero: string }[] {
  return (result.nemesisDefeated ?? []).map((id) => {
    const n = state.life.legacy.nemeses.find((x) => x.id === id)
    return n ? { bane: n.name, hero: n.heroName } : { bane: t('A Bane'), hero: '' }
  })
}
