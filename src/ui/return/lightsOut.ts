/**
 * "Lights Out" — a good place to stop (spec 2026-10-12 S27). The pure half: what is
 * brewing, who is on the edge of a friendship, what the next floor holds, how close the
 * next goals are, and Isel's sign-off. Everything reads GameState; nothing dispatches.
 *
 * Tone (docs/research/fun-retention.md §1): an open loop and a warm goodbye. Never
 * "don't leave", never "your heroes will suffer".
 */
import { TUNING } from '../../engine/tuning'
import { scoutFloor, type ScoutReport } from '../../engine/scout'
import { masterXpToNext } from '../../engine/master'
import { lifeOf } from '../../engine/life'
import { SKILLS } from '../../engine/content'
import { stampCard } from '../../engine/return'
import { nextRestedChargeIn } from '../../engine/return'
import type { FacilityId, GameState, HeroId, OwnedHero } from '../../engine/types'
import type { PlaceId } from '../world/lobbyMap'
import { hashString } from '../pixel/rand'

const R = TUNING.life.relation

/** The lobby place that holds a facility (the Forge is the Armory's room). */
export function facilityPlace(fid: FacilityId): PlaceId {
  return fid === 'forge' ? 'armory' : (fid as PlaceId)
}

// ─────────────────────────────────────────────────────────────────────────────
// Brewing timers
// ─────────────────────────────────────────────────────────────────────────────

export type TimerKind = 'promotion' | 'training' | 'build' | 'expedition'

export interface Brewing {
  key: string
  kind: TimerKind
  completesAtWorld: number
  heroId?: HeroId
  facility?: FacilityId
  /** The drill's skill (training). */
  skillId?: string
  place: PlaceId
}

/** Every timer the Master started that is still running at `nowWorld`, soonest first. */
export function brewingTimers(state: GameState, nowWorld: number, max = Infinity): Brewing[] {
  const out: Brewing[] = []
  for (const h of Object.values(state.heroes) as OwnedHero[]) {
    if (!h.alive) continue
    if (h.promotion && h.promotion.completesAtWorld > nowWorld)
      out.push({ key: `promotion|${h.id}`, kind: 'promotion', completesAtWorld: h.promotion.completesAtWorld, heroId: h.id, place: 'promotionChamber' })
    if (h.training && h.training.completesAtWorld > nowWorld)
      out.push({ key: `training|${h.id}`, kind: 'training', completesAtWorld: h.training.completesAtWorld, heroId: h.id, skillId: h.training.skillId, place: 'trainingCenter' })
    if (h.expedition && h.expedition.completesAtWorld > nowWorld)
      out.push({ key: `expedition|${h.id}`, kind: 'expedition', completesAtWorld: h.expedition.completesAtWorld, heroId: h.id, place: 'rift' })
  }
  for (const fid of Object.keys(state.facilities).sort() as FacilityId[]) {
    const b = state.facilities[fid].build
    if (b && b.completesAtWorld > nowWorld) out.push({ key: `build|${fid}`, kind: 'build', completesAtWorld: b.completesAtWorld, facility: fid, place: facilityPlace(fid) })
  }
  out.sort((a, b) => a.completesAtWorld - b.completesAtWorld || a.key.localeCompare(b.key))
  return out.slice(0, max)
}

/** A drill's skill name (English, for `t()`). */
export function skillName(skillId: string | undefined): string {
  return (skillId && SKILLS[skillId]?.name) || 'a new skill'
}

// ─────────────────────────────────────────────────────────────────────────────
// One relationship on the edge
// ─────────────────────────────────────────────────────────────────────────────

export interface EdgeRelation {
  a: HeroId
  b: HeroId
  toward: 'friends' | 'closeFriends'
  /** Good evenings (socialize gains) still needed. */
  evenings: number
}

/** The living pair closest to becoming friends (or close friends): within three good
 *  evenings of the threshold. Ties break on the pair's ids, so it is stable. */
export function edgeRelation(state: GameState): EdgeRelation | null {
  const step = R.socializeGain
  const reach = 3 * step
  let best: (EdgeRelation & { gap: number; k: string }) | null = null
  for (const [k, rel] of Object.entries(state.life.relations).sort(([x], [y]) => x.localeCompare(y))) {
    const [a, b] = k.split('|') as [HeroId, HeroId]
    if (!state.heroes[a]?.alive || !state.heroes[b]?.alive) continue
    const target = rel.affinity < R.friend ? R.friend : rel.affinity < R.closeFriend ? R.closeFriend : null
    if (target === null) continue
    const gap = target - rel.affinity
    if (gap <= 0 || gap > reach || rel.affinity < 0) continue
    if (!best || gap < best.gap) {
      best = { a, b, toward: target === R.friend ? 'friends' : 'closeFriends', evenings: Math.max(1, Math.ceil(gap / step)), gap, k }
    }
  }
  if (!best) return null
  return { a: best.a, b: best.b, toward: best.toward, evenings: best.evenings }
}

// ─────────────────────────────────────────────────────────────────────────────
// The next floor, and the goals within reach
// ─────────────────────────────────────────────────────────────────────────────

export interface FloorTeaser {
  floor: number
  mission: string
  /** Null when no one in the party can fight (no honest rating to give). */
  threat: ScoutReport['threat'] | null
  /** The headline enemy group ("Bone Choir", ×3). */
  headline: { name: string; count: number } | null
  /** A Nemesis waiting on that floor, or a named threat from the scout. */
  nemesis: string | null
  namedThreat: { name: string; why: string } | null
}

/** The real scouting report for the floor the party will climb next (S12). */
export function nextFloorTeaser(state: GameState): FloorTeaser | null {
  if (state.tower.worldEnded) return null
  const r = scoutFloor(state)
  if (!r) return null
  const top = [...r.enemies].sort((x, y) => Number(y.target) - Number(x.target) || y.level * y.count - x.level * x.count)[0]
  return {
    floor: r.floor,
    mission: r.mission,
    threat: r.partyCp > 0 ? r.threat : null,
    headline: top ? { name: top.name, count: top.count } : null,
    nemesis: r.nemesis,
    namedThreat: r.threats[0] ?? null,
  }
}

export interface GoalBar {
  key: 'summon' | 'boss' | 'master' | 'stamps'
  value: number
  max: number
  place: PlaceId
  /** Numbers for the label. */
  vars: Record<string, number>
}

/** Up to four goal-gradient bars: the next summon, the next boss floor, the next Master
 *  Level and the stamp card. A goal already reached is left out. */
export function goalBars(state: GameState): GoalBar[] {
  const out: GoalBar[] = []
  const cost = TUNING.gacha.normalCostGold
  if (state.gold < cost) out.push({ key: 'summon', value: state.gold, max: cost, place: 'summon', vars: { n: cost - state.gold } })
  const hc = state.tower.highestCleared
  const boss = (Math.floor(hc / 5) + 1) * 5
  if (!state.tower.worldEnded && boss <= TUNING.tower.sliceTopFloor) out.push({ key: 'boss', value: 5 - (boss - hc), max: 5, place: 'tower', vars: { floor: boss, n: boss - hc } })
  const ml = state.meta.masterLevel
  out.push({ key: 'master', value: state.meta.masterXp, max: masterXpToNext(ml), place: 'tower', vars: { level: ml + 1 } })
  const card = stampCard(state)
  out.push({ key: 'stamps', value: card.onCard, max: card.perCard, place: 'shop', vars: { n: card.onCard, of: card.perCard } })
  return out
}

/** Interference charges stored, and real ms until the next (null when full). */
export function restedOutlook(state: GameState): { charges: number; max: number; nextInRealMs: number | null } {
  const next = nextRestedChargeIn(state.meta)
  return {
    charges: state.meta.rested?.charges ?? 0,
    max: TUNING.return.rested.maxCharges,
    nextInRealMs: next === null ? null : Math.ceil(next / TUNING.time.worldTimeFactor),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Isel's sign-off
// ─────────────────────────────────────────────────────────────────────────────

/** English source lines (translated at render). Warm; never a plea to stay. */
export const ISEL_SIGNOFFS: readonly string[] = [
  'Rest well, Master. I will keep the lamps lit.',
  'Go on — the tower will still be there tomorrow. So will we.',
  'A good place to stop. I will tell them you said goodnight.',
  'Sleep, Master. I will write down anything worth telling.',
  'Thank you for today. Come back whenever you like — your seat stays warm.',
]

/** The sign-off for this moment (stable for a life slot, so it does not flicker). */
export function iselSignoff(state: GameState): string {
  return ISEL_SIGNOFFS[hashString(`signoff|${state.seed}|${state.life.slot}`) % ISEL_SIGNOFFS.length]!
}

/** A hero who is up and about (for the "who waves goodbye" line): the warmest living one. */
export function farewellHero(state: GameState): OwnedHero | null {
  const living = (Object.values(state.heroes) as OwnedHero[]).filter((h) => h.alive && !h.captiveOf)
  if (living.length === 0) return null
  return [...living].sort((a, b) => lifeOf(b).bestFloor - lifeOf(a).bestFloor || a.id.localeCompare(b.id))[0]!
}
