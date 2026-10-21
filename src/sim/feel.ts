/**
 * The climb's FEEL, measured (plan 2026-10-16 "fun tension tuning"; spec 2026-10-12 §1
 * RC2/RC3, §3 S12, S13, S16, S19, S20): does the first ~25 floors read as a sawtooth of
 * tension and release — Path mostly Safe/Fair, the Skull a real risk, every Boss a peak,
 * the Breather a breath — with the honest scout and real fights?
 *
 * The player is the NAIVE one who called the original game "not fun": the free tutorial
 * pull, Suggest every floor, always `doors[0]` (Path, or the Breather after a boss), the
 * first Boon (and the first option of any event), no summons, no promotions, nothing else.
 * It plays in sessions of `SESSION_ATTEMPTS` attempts, three a day (the heroes rest between).
 * The one free thing it does take is a New Arrival bell (S23: the lobby rings it after a
 * loss shrinks the roster, and claiming it is one tap). A lost floor is retried at once,
 * up to `maxTries` times; then the run ends there (a wall).
 *
 * Three variants walk the climb:
 *   - `naive`: never gives an order (the fight as the engine resolves it);
 *   - `decisive`: in any fight where a hero would die, takes the Decisive Moment (S16) the
 *     way the UI offers it — `findDecisive` on the log, then a Protect order on the first
 *     doomed hero at the moment's `orderTick` — and re-resolves the attempt with it (the
 *     same `orders` path the battle scene's `store.revise` uses). It keeps that result.
 *   - `typical`: a TYPICAL player rather than the naive one (reviewer pass, 2026-10-16). It
 *     also summons with spare gold (one Normal pull at a time, keeping one pull in reserve),
 *     takes the Skull door when the scout calls that Skull floor Safe or Fair, and takes the
 *     Decisive Moment as the UI re-arms it: Protect (or Pull back with no order left), then
 *     Pull back a second, different doomed hero. Its roster is stronger than the naive
 *     one's, so the static curve binds where the naive player's mercy cap does: the guard
 *     against a boss that is a peak for the naive player but a cliff for this one.
 *
 * Every fight Door the naive player walks past is measured too: on each floor that offers
 * the Skull, the Skull floor is scouted and fought ONCE as a counterfactual on the same
 * state (pure: nothing is committed), so the Skull's numbers describe the roster that
 * would have opened it.
 *
 * Everything is seeded and pure (the engine's `reduce` / `attemptFloorWithResult`), so a
 * run is repeatable. src/sim/feel.test.ts asserts the targets; `npx vite-node
 * src/sim/feelRun.ts [seeds]` prints the tables.
 */
import { createAccount } from '../engine/account'
import { reduce, attemptFloorWithResult } from '../engine/store'
import { scoutFloor, suggestParty, type Threat } from '../engine/scout'
import { ordersAllowed } from '../engine/tower'
import { floorKindBase, isFightable } from '../engine/climb'
import { toWorldTime } from '../engine/time'
import { TUNING } from '../engine/tuning'
import { findDecisive } from '../ui/battle/decisive'
import type { BattleOrder, Command, FloorKind, FloorResult, GameState } from '../engine/types'

/** The kinds the feel report groups fights by: the Act I-II bosses (F5/F10/F15) are pooled
 *  as `boss`; F20 (Halgiraf, the act gate) and F25 (the first boss past it) get rows of
 *  their own. */
export type FeelKind = 'tutorial' | 'path' | 'elite' | 'boss' | 'f20' | 'f25' | 'breather'
export const FEEL_KINDS: readonly FeelKind[] = ['tutorial', 'path', 'elite', 'boss', 'f20', 'f25', 'breather']

export type Variant = 'naive' | 'decisive' | 'typical'

export interface FeelFight {
  seed: number
  floor: number
  kind: FeelKind
  /** The fight was a counterfactual (the Skull the naive player walked past). */
  counterfactual: boolean
  /** First attempt at this floor (as this kind). */
  first: boolean
  /** The scout's band for the attempt (naive and typical variants; null when not scouted). */
  threat: Threat | null
  /** Heroes deployed. */
  deployed: number
  /** The fight as the engine resolves it with no orders. */
  won: boolean
  /** Heroes lost with no orders (a would-be death when > 0). */
  wouldDie: number
  /** Did the party rout (no orders)? */
  routed: boolean
  /** Heroes lost in the fight this variant keeps (naive: = wouldDie; decisive: after the
   *  Protect order, when one was given). */
  deaths: number
  /** Won, in the fight this variant keeps. */
  keptWon: boolean
  /** The Decisive variant gave a Protect order in this fight. */
  protected: boolean
}

export interface FeelRun {
  seed: number
  variant: Variant
  fights: FeelFight[]
  /** Highest floor cleared when the run stopped. */
  reached: number
  /** The floor the run gave up on (`maxTries` losses in a row), or null. */
  walledAt: number | null
  /** Living heroes (alive, not captive) when the run stopped. */
  living: number
  /** Heroes lost over the whole run (committed fights only). */
  dead: number
}

export interface FeelOptions {
  /** Stop once this floor is cleared. */
  top?: number
  /** Attempts at one floor before the run gives up there. */
  maxTries?: number
  /** Scout every committed attempt (the bands; costs 8 trial fights each). */
  scout?: boolean
  /** Fight the Skull counterfactual on floors that offer one. */
  skull?: boolean
  /** Called with the state just before each attempt (party set, time ticked): every
   *  committed attempt, and (`counterfactual`) every Skull fought on the side. */
  onAttempt?: (pre: GameState, counterfactual: boolean) => void
}

const REAL_EPOCH = Date.UTC(2026, 0, 5)
const MINUTE = 60_000
/** Real time one attempt takes (a fight, its replay and the walk back to the Tower). */
const ATTEMPT_MS = 10 * MINUTE
/** A thin bench waits in steps of this (real time). */
const WAIT_MS = 60 * MINUTE
/** The naive player opens the game for a session of this many attempts… */
const SESSION_ATTEMPTS = 5
/** …and comes back this much later (real time; 3 sessions a day, the heroes rest between). */
const SESSION_GAP_MS = 6 * 60 * MINUTE

/** The seed the feel harness gives run `i`. */
export const feelSeed = (i: number): number => 7000 + i * 104_729

/** Fold a floor's kind as fought into the report's rows. */
export function feelKind(floor: number, kind: FloorKind): FeelKind {
  if (kind === 'boss') return floor === 20 ? 'f20' : floor >= 25 ? 'f25' : 'boss'
  if (kind === 'tutorial' || kind === 'elite' || kind === 'breather') return kind
  return 'path'
}

/** The hero units of the Master's own (mission NPCs aside) that a battle log fielded. */
function heroUnitIds(r: FloorResult): string[] {
  return r.result.log.unitsInit.filter((u) => u.side === 'hero' && !u.isNpc).map((u) => u.id)
}

/**
 * The Decisive Moment's Protect order for a fight, as the battle scene would give it:
 * the first hero death in the log (`findDecisive`), protected from the moment's
 * `orderTick`. Null when nobody dies, or the Tactical Center can relay no order.
 */
export function protectOrderFor(state: GameState, r: FloorResult): BattleOrder | null {
  if (ordersAllowed(state) < 1) return null
  const d = findDecisive(r.result.log, heroUnitIds(r))
  if (d === null) return null
  return { tick: d.orderTick, kind: 'protect', allyId: d.heroId }
}

/** One attempt, resolved with no orders and — for the Decisive variant, when a hero
 *  would die — again with the Protect order. Pure. */
function resolve(pre: GameState, variant: Variant): { plain: { state: GameState; result: FloorResult }; kept: { state: GameState; result: FloorResult }; protectedOrder: boolean } {
  const plain = attemptFloorWithResult(pre)
  if (variant === 'naive' || plain.result.fallenHeroIds.length === 0) return { plain, kept: plain, protectedOrder: false }
  if (variant === 'typical') return { plain, ...typicalOrders(pre, plain.result) }
  const order = protectOrderFor(pre, plain.result)
  if (order === null) return { plain, kept: plain, protectedOrder: false }
  return { plain, kept: attemptFloorWithResult(pre, undefined, undefined, undefined, [order]), protectedOrder: true }
}

/** The typical player's Decisive Moments (S16: one prompt, re-armed once for a different
 *  doomed hero): Protect the first (Pull back when no order is left), then Pull back the
 *  next. Keeps whichever resolution loses fewer heroes. Pure. */
function typicalOrders(pre: GameState, plain: FloorResult): { kept: { state: GameState; result: FloorResult }; protectedOrder: boolean } {
  const d = findDecisive(plain.result.log, heroUnitIds(plain))
  if (d === null) return { kept: { state: pre, result: plain }, protectedOrder: false }
  const first: BattleOrder = ordersAllowed(pre) >= 1 ? { tick: d.orderTick, kind: 'protect', allyId: d.heroId } : { tick: d.orderTick, kind: 'withdraw', allyId: d.heroId }
  let kept = attemptFloorWithResult(pre, undefined, undefined, undefined, [first])
  if (kept.result.fallenHeroIds.length > 0) {
    const d2 = findDecisive(kept.result.result.log, heroUnitIds(kept.result), 0, [d.heroId])
    if (d2 !== null) {
      const again = attemptFloorWithResult(pre, undefined, undefined, undefined, [first, { tick: d2.orderTick, kind: 'withdraw', allyId: d2.heroId }])
      if (again.result.fallenHeroIds.length <= kept.result.fallenHeroIds.length) kept = again
    }
  }
  return { kept, protectedOrder: true }
}

function sample(seed: number, floor: number, kind: FloorKind, first: boolean, counterfactual: boolean, threat: Threat | null, plain: FloorResult, kept: FloorResult, prot: boolean): FeelFight {
  return {
    seed,
    floor,
    kind: feelKind(floor, kind),
    counterfactual,
    first,
    threat,
    deployed: heroUnitIds(plain).length,
    won: plain.cleared,
    wouldDie: plain.fallenHeroIds.length,
    routed: plain.routed === true,
    deaths: kept.fallenHeroIds.length,
    keptWon: kept.cleared,
    protected: prot,
  }
}

/** Play one naive (or Decisive) climb from a new account. Deterministic for a seed. */
export function playFeelRun(seed: number, variant: Variant, opts: FeelOptions = {}): FeelRun {
  const top = opts.top ?? 25
  const maxTries = opts.maxTries ?? 4
  const scout = opts.scout ?? variant !== 'decisive'
  const typical = variant === 'typical'
  // The typical player walks through the Skull it picks; it is not measured on the side.
  const skull = opts.skull ?? !typical
  let now = REAL_EPOCH
  let s: GameState = createAccount(seed, { now })
  const tryCmd = (cmd: Command): boolean => {
    try {
      s = reduce(s, cmd, toWorldTime(now))
      return true
    } catch {
      return false
    }
  }
  // The free tutorial ten-pull (S1): the one summon the naive player makes.
  tryCmd({ type: 'SUMMON', pool: 'normal', count: 10 })
  const fights: FeelFight[] = []
  const tries = new Map<number, number>()
  let walledAt: number | null = null
  let dead = 0
  let attempts = 0
  for (let guard = 0; guard < 400; guard++) {
    if (s.tower.highestCleared >= top) break
    // New Arrival bells (S23): one tap each.
    for (let k = 0; k < 3 && (s.life.legacy?.recruitTokens ?? 0) > 0; k++) if (!tryCmd({ type: 'CLAIM_RECRUIT' })) break
    // The typical player spends spare gold on Normal pulls (one pull's worth kept back).
    if (typical) for (let k = 0; k < 10 && s.gold >= 2 * TUNING.gacha.normalCostGold; k++) if (!tryCmd({ type: 'SUMMON', pool: 'normal' })) break
    // An event floor or a Boon choice: the first option.
    if (s.tower.event !== null) {
      const ev = s.tower.event
      if (!ev.options.some((o) => tryCmd({ type: 'RESOLVE_EVENT', option: o }))) break
      continue
    }
    const floor = s.tower.currentFloor
    // A thin bench waits to rest (but a lone starter still climbs).
    const fightable = Object.values(s.heroes).filter(isFightable).length
    if (fightable === 0) break
    for (let w = 0; w < 48 && suggestParty(s).slots.filter(Boolean).length < Math.min(3, fightable); w++) {
      now += WAIT_MS
      tryCmd({ type: 'TICK' })
    }
    // The Skull this floor offers, fought once on the side (pure) before the naive pick.
    const doors = s.tower.doors
    const skullAt = doors?.findIndex((d) => d.kind === 'elite') ?? -1
    if (skull && skullAt >= 0 && !tries.has(floor)) {
      const e0: GameState = { ...s, tower: { ...s.tower, kind: 'elite', doors: null } }
      const e = reduce(e0, { type: 'SET_PARTY', ...suggestParty(e0) }, toWorldTime(now))
      const report = scout ? scoutFloor(e) : null
      opts.onAttempt?.(e, true)
      const r = resolve(e, variant)
      fights.push(sample(seed, floor, 'elite', true, true, report?.threat ?? null, r.plain.result, r.kept.result, r.protectedOrder))
    }
    // The naive pick: doors[0] (Path, or the Breather after a boss). The typical player
    // takes the Skull when the scout calls it Safe or Fair (as the Door picker previews it).
    if (doors !== null) {
      let pick = 0
      if (typical && skullAt >= 0) {
        const e0: GameState = { ...s, tower: { ...s.tower, kind: 'elite', doors: null } }
        const e = reduce(reduce(e0, { type: 'SET_PARTY', ...suggestParty(e0) }, toWorldTime(now)), { type: 'TICK' }, toWorldTime(now))
        const t = scoutFloor(e)?.threat
        if (t === 'safe' || t === 'fair') pick = skullAt
      }
      if (!tryCmd({ type: 'CHOOSE_DOOR', index: pick })) break
      if (s.tower.currentFloor !== floor) continue // a Rest stop or Cache (never doors[0])
    }
    tryCmd({ type: 'SET_PARTY', ...suggestParty(s) })
    const pre = reduce(s, { type: 'TICK' }, toWorldTime(now))
    const kind = pre.tower.kind ?? floorKindBase(floor)
    const report = scout ? scoutFloor(pre) : null
    opts.onAttempt?.(pre, false)
    const n = tries.get(floor) ?? 0
    tries.set(floor, n + 1)
    let r
    try {
      r = resolve(pre, variant)
    } catch {
      break
    }
    fights.push(sample(seed, floor, r.plain.result.kind ?? kind, n === 0, false, report?.threat ?? null, r.plain.result, r.kept.result, r.protectedOrder))
    s = r.kept.state
    dead += r.kept.result.fallenHeroIds.length
    now += ATTEMPT_MS
    if (++attempts % SESSION_ATTEMPTS === 0) now += SESSION_GAP_MS
    if (!r.kept.result.cleared && n + 1 >= maxTries) {
      walledAt = floor
      break
    }
  }
  const living = Object.values(s.heroes).filter((h) => h.alive && !h.captiveOf).length
  return { seed, variant, fights, reached: s.tower.highestCleared, walledAt, living, dead }
}

export interface KindRow {
  kind: FeelKind
  fights: number
  firsts: number
  band: Record<Threat, number>
  /** Share of fights won (no orders). */
  winRate: number
  /** Share of fights with a would-be death (no orders). */
  wouldDie: number
  /** Same, first attempts only. */
  wouldDieFirst: number
  /** Share of fights with a death in the fight the variant kept. */
  died: number
  /** Heroes lost per fight with no orders / in the kept fight. */
  wouldDeaths: number
  deaths: number
}

export interface FeelReport {
  variant: Variant
  runs: FeelRun[]
  rows: Record<FeelKind, KindRow>
  /** Heroes lost (kept fights) per 10 floors cleared. */
  deathsPer10: number
  /** Share of lost fights (every fight measured, as the variant keeps it) that cost at most
   *  2 heroes: a loss is a rout, not a wipe. */
  routShare: number
  /** Share of runs that end with at least 5 living heroes. */
  living5: number
  /** Median floor reached. */
  medianReached: number
  /** Runs that reached `top`. */
  finished: number
}

/** Group fights into per-kind rows. `from` keeps floors at or above it (F3+ by default
 *  for every kind but the tutorial). */
export function kindRows(fights: readonly FeelFight[], from = 3): Record<FeelKind, KindRow> {
  const rows = {} as Record<FeelKind, KindRow>
  for (const kind of FEEL_KINDS) {
    const xs = fights.filter((f) => f.kind === kind && (kind === 'tutorial' || f.floor >= from))
    const firsts = xs.filter((f) => f.first)
    const share = (ys: readonly FeelFight[], p: (f: FeelFight) => boolean) => (ys.length === 0 ? 0 : ys.filter(p).length / ys.length)
    const band: Record<Threat, number> = { safe: 0, fair: 0, risky: 0, deadly: 0 }
    for (const f of xs) if (f.threat !== null) band[f.threat]++
    rows[kind] = {
      kind,
      fights: xs.length,
      firsts: firsts.length,
      band,
      winRate: share(xs, (f) => f.won),
      wouldDie: share(xs, (f) => f.wouldDie > 0),
      wouldDieFirst: share(firsts, (f) => f.wouldDie > 0),
      died: share(xs, (f) => f.deaths > 0),
      wouldDeaths: xs.length === 0 ? 0 : xs.reduce((a, f) => a + f.wouldDie, 0) / xs.length,
      deaths: xs.length === 0 ? 0 : xs.reduce((a, f) => a + f.deaths, 0) / xs.length,
    }
  }
  return rows
}

/** Play `seeds` runs of `variant` and summarise them. */
export function feelReport(variant: Variant, seeds: number, opts: FeelOptions = {}): FeelReport {
  const runs: FeelRun[] = []
  for (let i = 0; i < seeds; i++) runs.push(playFeelRun(feelSeed(i), variant, opts))
  const all = runs.flatMap((r) => r.fights)
  const committed = all.filter((f) => !f.counterfactual)
  const losses = all.filter((f) => !f.keptWon)
  const cleared = runs.reduce((a, r) => a + r.reached, 0)
  const dead = runs.reduce((a, r) => a + r.dead, 0)
  const reached = runs.map((r) => r.reached).sort((a, b) => a - b)
  return {
    variant,
    runs,
    rows: kindRows(all),
    deathsPer10: cleared === 0 ? 0 : (dead / cleared) * 10,
    routShare: losses.length === 0 ? 1 : losses.filter((f) => f.deaths <= 2).length / losses.length,
    living5: runs.filter((r) => r.living >= 5).length / Math.max(1, runs.length),
    medianReached: reached[Math.floor(reached.length / 2)] ?? 0,
    finished: runs.filter((r) => r.reached >= (opts.top ?? 25)).length,
  }
}

const pct = (x: number) => `${Math.round(x * 100)}%`

/** One authored boss, by floor: how its committed attempts went. */
export interface BossRow {
  floor: number
  /** First attempts. */
  firsts: number
  /** Share of first attempts with a would-be death (no orders). */
  wouldDieFirst: number
  /** Lost attempts (retries) per first attempt. */
  lossesPerRun: number
  /** Share of fights with a would-be death that the kept fight (orders, if any) brought home whole. */
  saved: number
}

export const BOSS_FLOORS = [5, 10, 15, 20, 25] as const

/** Per-boss rows for a report (committed fights only). */
export function bossRows(x: FeelReport): BossRow[] {
  const all = x.runs.flatMap((r) => r.fights).filter((f) => !f.counterfactual)
  return BOSS_FLOORS.map((floor) => {
    const xs = all.filter((f) => f.floor === floor)
    const firsts = xs.filter((f) => f.first)
    const doomed = xs.filter((f) => f.wouldDie > 0)
    return {
      floor,
      firsts: firsts.length,
      wouldDieFirst: firsts.length === 0 ? 0 : firsts.filter((f) => f.wouldDie > 0).length / firsts.length,
      lossesPerRun: firsts.length === 0 ? 0 : xs.filter((f) => !f.keptWon).length / firsts.length,
      saved: doomed.length === 0 ? 1 : doomed.filter((f) => f.deaths === 0).length / doomed.length,
    }
  })
}

/** The per-boss table for one or more reports. */
export function formatBosses(...xs: FeelReport[]): string {
  const lines = ['| player | boss | first tries | 1st-try would-be death | losses per run | would-be deaths the kept fight saved |', '|---|---|---|---|---|---|']
  for (const x of xs) for (const b of bossRows(x)) lines.push(`| ${x.variant} | F${b.floor} | ${b.firsts} | ${pct(b.wouldDieFirst)} | ${b.lossesPerRun.toFixed(2)} | ${pct(b.saved)} |`)
  return lines.join('\n')
}

/** The report as Markdown tables (naive bands and deaths; the Decisive column alongside). */
export function formatFeel(naive: FeelReport, decisive: FeelReport | null, typical: FeelReport | null = null): string {
  const lines: string[] = []
  lines.push('| kind | fights (1st) | Safe | Fair | Risky | Deadly | win | would-be death | 1st-try would-be death | deaths/fight | Decisive: death after Protect (would-be) |')
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|')
  for (const k of FEEL_KINDS) {
    const r = naive.rows[k]
    if (r.fights === 0) continue
    const banded = r.band.safe + r.band.fair + r.band.risky + r.band.deadly
    const b = (n: number) => (banded === 0 ? '—' : `${n} (${pct(n / banded)})`)
    const d = decisive?.rows[k]
    const dec = d && d.fights > 0 ? `${pct(d.died)} (${pct(d.wouldDie)}) of ${d.fights}` : '—'
    lines.push(
      `| ${k} | ${r.fights} (${r.firsts}) | ${b(r.band.safe)} | ${b(r.band.fair)} | ${b(r.band.risky)} | ${b(r.band.deadly)} | ${pct(r.winRate)} | ${pct(r.wouldDie)} | ${pct(r.wouldDieFirst)} | ${r.wouldDeaths.toFixed(2)} | ${dec} |`,
    )
  }
  const sum = (x: FeelReport) =>
    `${x.variant}: ${x.finished}/${x.runs.length} reach F25 (median F${x.medianReached}; walls ${x.runs.filter((r) => r.walledAt !== null).map((r) => `F${r.walledAt}`).join(' ') || 'none'}) · ${x.deathsPer10.toFixed(2)} deaths per 10 floors · losses that are routs (≤2 dead): ${pct(x.routShare)} · ≥5 living at the end: ${pct(x.living5)}`
  lines.push('')
  lines.push(`- ${sum(naive)}`)
  if (decisive) lines.push(`- ${sum(decisive)}`)
  if (typical) {
    lines.push('', 'typical player:', '', '| kind | fights (1st) | Safe | Fair | Risky | Deadly | win | would-be death | deaths/fight (kept) |', '|---|---|---|---|---|---|---|---|---|')
    for (const k of FEEL_KINDS) {
      const r = typical.rows[k]
      if (r.fights === 0) continue
      const banded = r.band.safe + r.band.fair + r.band.risky + r.band.deadly
      const b = (n: number) => (banded === 0 ? '—' : `${n} (${pct(n / banded)})`)
      lines.push(`| ${k} | ${r.fights} (${r.firsts}) | ${b(r.band.safe)} | ${b(r.band.fair)} | ${b(r.band.risky)} | ${b(r.band.deadly)} | ${pct(r.winRate)} | ${pct(r.wouldDie)} | ${r.deaths.toFixed(2)} |`)
    }
    lines.push('', `- ${sum(typical)}`)
  }
  lines.push('', formatBosses(naive, ...(typical ? [typical] : [])))
  return lines.join('\n')
}
