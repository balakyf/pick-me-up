/**
 * "While you were away": the welcome-back ledger (spec 2026-10-12 S26). Owner: WP6.
 *
 * `summarizeAway(before, after)` diffs the stale state the app hydrated with against the
 * state after the arrival TICK (`advanceTime` already simulated the heroes' lives, the
 * timers, the Interference charges). Everything it reports actually happened in the
 * simulation — nothing is invented, and nothing is framed as a loss the Master caused.
 *
 * PURE and DETERMINISTIC: it reads both states and returns a fresh summary.
 */
import { TUNING } from '../tuning'
import { loginClaimed } from '../shop'
import { stampReady } from './stamps'
import { dailyAttemptsLeft, dailyUnlocked } from '../daily'
import { expeditionHaul } from '../rift/haul'
import type { ChronicleKind, FacilityId, GameState, HeroId, LifeTally, OwnedHero } from '../types'

const W = TUNING.return.welcome

/** One line of what happened while the Master was away, ranked by emotional weight. */
export interface AwayVignette {
  kind: ChronicleKind | 'completion' | 'levelUp'
  /** Higher = shown first. */
  weight: number
  heroIds: HeroId[]
  /** World-time ms it happened. */
  at: number
  /** Chronicle detail; for 'levelUp' `master:<level>` or `hero:<level>`; for 'completion'
   *  `expedition:<gems>`. */
  detail?: string
  /** The floor (chronicle entries that have one). */
  floor?: number
}

export interface AwaySummary {
  /** World-ms between `before.meta.lastSeenAtWorld` and `after.meta.lastSeenAtWorld`. */
  awayWorld: number
  /** At most `TUNING.return.welcome.maxVignettes`, sorted by weight (highest first). */
  vignettes: AwayVignette[]
  /** Things to collect. `gold` is what the heroes earned at work (already in the purse);
   *  `loginReady`: today's login gift is unclaimed; `stampReady`: claiming it stamps the card. */
  collect: { gold: number; restedCharges: number; loginReady: boolean; stampReady: boolean }
  /** Things finished and waiting. */
  ready: {
    promotions: HeroId[]
    drills: HeroId[]
    builds: FacilityId[]
    /** A Normal summon became affordable while the Master was away. */
    summonAffordable: boolean
    dailyAttempts: number
  }
  /** What the heroes kept busy with (the life tally gained while away). */
  busy: LifeTally
}

/** An empty summary (nothing happened). */
export function emptyAwaySummary(): AwaySummary {
  return {
    awayWorld: 0,
    vignettes: [],
    collect: { gold: 0, restedCharges: 0, loginReady: false, stampReady: false },
    ready: { promotions: [], drills: [], builds: [], summonAffordable: false, dailyAttempts: 0 },
    busy: { jobGold: 0, meals: 0, forged: 0, trainXp: 0, research: 0, healed: 0 },
  }
}

/** Emotional weight of each kind of news (presentation order, not balance). Losses rank
 *  first because hiding them would be dishonest; warm news follows. */
export const VIGNETTE_WEIGHT: Record<AwayVignette['kind'], number> = {
  death: 100,
  revenge: 95,
  bequest: 90,
  closeFriends: 75,
  arrival: 70,
  friends: 65,
  masterwork: 60,
  levelUp: 55,
  completion: 55,
  jobTier: 50,
  mourning: 48,
  research: 40,
  grudge: 38,
  rivals: 35,
  argument: 30,
  forged: 22,
  stalled: 12,
}

/** At most this many vignettes of one kind; every kind gets one before any gets two
 *  (variety beats five forge reports). */
const PER_KIND = 2

/** Is there anything at all to show? */
export function awayHasNews(s: AwaySummary): boolean {
  const r = s.ready
  return (
    s.vignettes.length > 0 ||
    s.collect.gold > 0 ||
    s.collect.restedCharges > 0 ||
    s.collect.loginReady ||
    r.promotions.length + r.drills.length + r.builds.length > 0 ||
    Object.values(s.busy).some((n) => n > 0)
  )
}

function byWeight(a: AwayVignette, b: AwayVignette): number {
  return b.weight - a.weight || b.at - a.at || a.kind.localeCompare(b.kind)
}

function living(state: GameState): OwnedHero[] {
  return (Object.values(state.heroes) as OwnedHero[]).filter((h) => h.alive)
}

/** Diff the state before the arrival TICK against the state after it. PURE. */
export function summarizeAway(before: GameState, after: GameState): AwaySummary {
  const since = before.meta.lastSeenAtWorld
  const awayWorld = Math.max(0, after.meta.lastSeenAtWorld - since)
  if (awayWorld === 0) return emptyAwaySummary()

  // ── Vignettes: the chronicle, hero and Master level-ups, expeditions home ──
  const candidates: AwayVignette[] = []
  for (const e of after.life.chronicle) {
    if (e.at <= since) continue
    const v: AwayVignette = { kind: e.kind, weight: VIGNETTE_WEIGHT[e.kind], heroIds: [...e.heroIds], at: e.at }
    if (e.detail !== undefined) v.detail = e.detail
    if (e.floor !== undefined) v.floor = e.floor
    candidates.push(v)
  }
  const at = after.meta.lastSeenAtWorld
  if (after.meta.masterLevel > before.meta.masterLevel) {
    candidates.push({ kind: 'levelUp', weight: VIGNETTE_WEIGHT.levelUp + 3, heroIds: [], at, detail: `master:${after.meta.masterLevel}` })
  }
  const promotions: HeroId[] = []
  const drills: HeroId[] = []
  for (const h of living(after)) {
    const was = before.heroes[h.id]
    if (!was) continue
    if (h.xp.level > was.xp.level) {
      candidates.push({ kind: 'levelUp', weight: VIGNETTE_WEIGHT.levelUp - 10, heroIds: [h.id], at, detail: `hero:${h.xp.level}` })
    }
    if (was.expedition && !h.expedition) {
      // This expedition's own haul (several can come home in one absence).
      const gems = expeditionHaul(was, before.seed).gems
      candidates.push({ kind: 'completion', weight: VIGNETTE_WEIGHT.completion, heroIds: [h.id], at, detail: `expedition:${gems}` })
    }
    if (was.promotion && !h.promotion) promotions.push(h.id)
    if (was.training && !h.training) drills.push(h.id)
  }
  candidates.sort(byWeight)
  // Variety first: the best of each kind, then second helpings (at most PER_KIND a kind).
  const chosen = new Set<AwayVignette>()
  const perKind = new Map<string, number>()
  for (let round = 1; round <= PER_KIND && chosen.size < W.maxVignettes; round++) {
    for (const v of candidates) {
      if (chosen.size >= W.maxVignettes) break
      if (chosen.has(v) || (perKind.get(v.kind) ?? 0) >= round) continue
      perKind.set(v.kind, (perKind.get(v.kind) ?? 0) + 1)
      chosen.add(v)
    }
  }
  const vignettes = [...chosen].sort(byWeight)

  // ── Ready: builds that finished ──
  const builds: FacilityId[] = []
  for (const fid of Object.keys(after.facilities).sort() as FacilityId[]) {
    const was = before.facilities[fid]
    if (was?.build && !after.facilities[fid].build) builds.push(fid)
  }

  // ── Collect and busy: the life tally gained (the tally only resets when the letter is read) ──
  const tb = before.life.tally
  const ta = after.life.tally
  const gain = (k: keyof LifeTally) => Math.max(0, Math.round(ta[k] - tb[k]))
  const busy: LifeTally = { jobGold: gain('jobGold'), meals: gain('meals'), forged: gain('forged'), trainXp: gain('trainXp'), research: gain('research'), healed: gain('healed') }

  return {
    awayWorld,
    vignettes,
    collect: {
      gold: busy.jobGold,
      restedCharges: Math.max(0, (after.meta.rested?.charges ?? 0) - (before.meta.rested?.charges ?? 0)),
      loginReady: !loginClaimed(after, at),
      stampReady: stampReady(after, at),
    },
    ready: {
      promotions: promotions.sort(),
      drills: drills.sort(),
      builds,
      // News only when the absence made it so (the heroes' work filled the purse): a Master who
      // could already afford a pull is not told so on every return.
      summonAffordable: after.gold >= TUNING.gacha.normalCostGold && before.gold < TUNING.gacha.normalCostGold,
      dailyAttempts: dailyUnlocked(after) ? dailyAttemptsLeft(after) : 0,
    },
    busy,
  }
}
