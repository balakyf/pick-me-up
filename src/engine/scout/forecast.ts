/**
 * The war-room forecast (O3, B1): the crystal runs the REAL fight many times and tells the
 * Master the truth before they press Enter.
 *
 * Because the engine is pure and deterministic, the forecast does not estimate anything:
 * it builds exactly the battle the attempt will fight (tower.prepareFloorBattle — the same
 * function playFloor calls, so the two can never drift: deploy rails, morale, refusals,
 * the rebellion draw, the real anchor/Wall encounter, loop scars, floor conditions, bonds,
 * the Shrine's blessing, the ballista wound, the orders) and runs it K times on its own
 * seed stream — hash(seed, 'forecast', floor, attemptIndex, i) — never the attempt's combat
 * seed, so it predicts without spoiling.
 *
 * From those runs: win %, the outcome mix, each hero's chance to fall, the expected
 * deaths, the median length, the enemy that hurts the party most (and its wave), what is
 * left of the boss when the party loses, the escort's odds, and a threat band. Then "what
 * would change the odds": the suggested party, the unfit swapped for the best of the
 * bench, a free pre-battle mark on the deadliest enemy (lane G; an opening Focus order once
 * a mark is set elsewhere), and a standing Guard against foes that wind up big moves —
 * each forecast the same way.
 *
 * PURE and DETERMINISTIC. Memoized on the exact battle input (an FNV hash of it), so the
 * war room can ask as often as it renders.
 */
import type {
  BattleOrder,
  BattleResult,
  FocusDirective,
  CombatOutcome,
  DeployReason,
  Encounter,
  FloorModifierId,
  GameState,
  HeroId,
  Line,
  Mission,
  OwnedHero,
} from '../types'
import { TUNING } from '../tuning'
import { prepareFloorBattle, ordersAllowed, type PreparedFloorBattle } from '../tower/tower'
import { deployReport, fitToDeploy } from '../tower/deploy'
import { runBattle } from '../combat'
import { hash } from '../rng/rng'
import { panicChance } from '../kitchen'
import { FORECAST } from './forecastTuning'
import { suggestParty, type Threat } from './scout'
import { heroCpFull } from '../unit/trueCp'

export { FORECAST } from './forecastTuning'

/** What the Master plans to send (everything optional: the Party Board as it stands). */
export interface ForecastPlan {
  /** The party to send instead of the Party Board's. */
  slots?: readonly (HeroId | null)[]
  lines?: readonly Line[]
  /** Orders given before the first blow (an opening Focus at tick 1). */
  opening?: readonly BattleOrder[]
  /** The free pre-battle mark and Protects (lane G: the Tactical Center's slots). */
  focus?: FocusDirective
  /** A played ballista shot (default: the Master's tracked skill, as when it is skipped). */
  ballista?: number
  /** Forecast the subversion of F90. */
  subvert?: boolean
}

/** One party slot, as the forecast reads it. */
export interface ForecastHero {
  slot: number
  heroId: HeroId
  line: Line
  /** Fights this attempt (the deploy rails, the rebellion draw included). */
  fights: boolean
  /** Why not. */
  reason?: DeployReason
  sanity: number
  /** % of the runs this hero fell in (0 when they stay home). */
  deathPct: number
  /** Chance (%) to lose a turn to panic, each turn (low Sanity). 0 when steady. */
  panicPct: number
  /** Under the low-Sanity line (the Enter sheet asks). */
  lowSanity: boolean
}

/** The enemy that hurt the party most across the runs. */
export interface ForecastFoe {
  unitId: string
  name: string
  templateId?: string
  /** 1-based wave. */
  wave: number
  level: number
  /** Share (%) of all the damage the party took. */
  sharePct: number
  /** Heroes (and escorts) it struck down, per run on average. */
  killsPerRun: number
  /** It sleeps until it wakes (focus would be wasted). */
  looming: boolean
}

export interface ForecastEscort {
  unitId: string
  name: string
  /** % of runs the escort fell in. */
  fallsPct: number
}

export interface Forecast {
  floor: number
  attemptIndex: number
  /** Battles run (0 when nobody can fight). */
  runs: number
  /** Heroes who will fight. */
  fielded: number
  /** Every slotted hero, in slot order. */
  heroes: ForecastHero[]
  /** Empty party slots. */
  emptySlots: number
  /** % of runs won. */
  winPct: number
  /** How the runs ended (counts). */
  outcomes: Record<CombatOutcome, number>
  /** Heroes lost an attempt, on average (one decimal). */
  expectedDeaths: number
  /** Median battle length, in ticks. */
  medianTicks: number
  deadliest: ForecastFoe | null
  /** The mission's boss (a defeat/acquire target) and what is left of it when the party loses. */
  boss: { unitId: string; name: string; templateId?: string; wave: number; hpLeftPct: number | null } | null
  escorts: ForecastEscort[]
  /** The mission, as plain data (the UI words it). */
  mission: Mission
  enemyCount: number
  waves: number
  modifiers: FloorModifierId[]
  /** The party's CP as fielded, and the CP of the encounter actually built. */
  partyCp: number
  enemyCp: number
  threat: Threat
  /** Orders given before the first blow in this plan. */
  opening: BattleOrder[]
  /** The pre-battle mark and free Protects this plan fights with (lane G). */
  directive?: FocusDirective
}

export interface ForecastAlternative {
  kind: 'suggested' | 'swap' | 'focus' | 'mark' | 'guard'
  slots: (HeroId | null)[]
  lines: Line[]
  /** Orders before the first blow (the 'focus' and 'guard' alternatives). */
  opening: BattleOrder[]
  /** The pre-battle mark and Protects this plan fights with (the 'mark' alternative sets it). */
  directive?: FocusDirective
  /** Who comes in for whom ('swap'; also listed for 'suggested'). */
  swaps: { out: HeroId | null; in: HeroId | null }[]
  /** The enemy to focus ('focus'). */
  focus?: { unitId: string; name: string }
  forecast: Forecast
}

// ─────────────────────────────────────────────────────────────────────────────
// Bands
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The threat band from the forecast itself (replaces the old CP-ratio guess; the names are
 * kept): Safe wins nearly always and costs (almost) nobody; Fair usually wins at a small
 * cost; Risky is a real gamble; Deadly loses more than it wins or kills the party.
 */
export function threatFor(winPct: number, expectedDeaths: number): Threat {
  const B = FORECAST.bands
  if (winPct >= B.safeWinPct && expectedDeaths < B.safeDeaths) return 'safe'
  if (winPct >= B.fairWinPct && expectedDeaths < B.fairDeaths) return 'fair'
  if (winPct > B.riskyWinPct && expectedDeaths < B.riskyDeaths) return 'risky'
  return 'deadly'
}

// ─────────────────────────────────────────────────────────────────────────────
// The battle input
// ─────────────────────────────────────────────────────────────────────────────

/** The state with the plan's party on the board (exactly what SET_PARTY would make). */
export function withPlanParty(state: GameState, plan: ForecastPlan): GameState {
  if (plan.slots === undefined && plan.lines === undefined) return state
  return {
    ...state,
    party: {
      slots: [...(plan.slots ?? state.party.slots)],
      lines: [...(plan.lines ?? state.party.lines)],
    },
  }
}

/** The battle the forecast runs — the attempt's own, from prepareFloorBattle. */
export interface ForecastInput {
  state: GameState
  plan: ForecastPlan
  prepared: PreparedFloorBattle
  /** Hash of the exact battle input + the forecast's seed parts (the memo key). */
  key: string
  runs: number
}

/** The forecast's seed for run `i` (never the attempt's 'combat' seed). */
export function forecastSeed(state: GameState, i: number): number {
  return hash(state.seed, 'forecast', state.tower.currentFloor, state.tower.attemptIndex, i)
}

/** Build the battle a plan would fight, or null past the summit. */
export function forecastInput(state: GameState, plan: ForecastPlan = {}): ForecastInput | null {
  if (state.tower.currentFloor > TUNING.tower.sliceTopFloor) return null
  const planned = withPlanParty(state, plan)
  const prepared = prepareFloorBattle(planned, {
    focus: plan.focus,
    ballista: plan.ballista,
    subvert: plan.subvert,
    orders: plan.opening && plan.opening.length > 0 ? [...plan.opening] : undefined,
  })
  const runs = FORECAST.runs
  const sig = JSON.stringify([state.seed, prepared.floor, prepared.attemptIndex, runs, prepared.battleUnits, prepared.encounter, prepared.refusals, planned.party])
  const key = `${hash(sig)}:${sig.length}`
  return { state: planned, plan, prepared, key, runs }
}

// ─────────────────────────────────────────────────────────────────────────────
// One run
// ─────────────────────────────────────────────────────────────────────────────

/** What one forecast battle showed (the log itself is dropped). */
export interface ForecastRun {
  outcome: CombatOutcome
  ticks: number
  fallen: HeroId[]
  /** Effective damage dealt to the party (heroes and escorts), by enemy unit id. */
  dmgBy: Record<string, number>
  /** Party members (and escorts) struck down, by enemy unit id. */
  killsBy: Record<string, number>
  /** Escort unit ids that fell. */
  npcFell: string[]
  /** What is left of the boss, % (null when the floor has none). */
  bossHpPct: number | null
}

function bossIdsOf(enc: Encounter): string[] {
  const tags = new Set(enc.mission.objectives.flatMap((o) => (o.kind === 'defeat' || o.kind === 'acquire' ? [o.targetTag] : [])))
  if (tags.size === 0) return []
  return enc.waves.flatMap((w) => w.units.filter((u) => u.targetTag !== undefined && tags.has(u.targetTag)).map((u) => u.id))
}

/** Read one battle's log into the numbers the forecast needs. */
export function analyzeRun(res: BattleResult, bossIds: readonly string[]): ForecastRun {
  const side = new Map(res.log.unitsInit.map((u) => [u.id, u]))
  const isParty = (id: string) => side.get(id)?.side === 'hero'
  const hp = new Map<string, number>()
  for (const id of bossIds) {
    const u = side.get(id)
    if (u) hp.set(id, u.startHP ?? u.maxHP)
  }
  const dmgBy: Record<string, number> = {}
  const killsBy: Record<string, number> = {}
  const lastHit = new Map<string, string>()
  const npcFell: string[] = []
  for (const e of res.log.events) {
    if (e.kind === 'hit') {
      if (isParty(e.targetId) && !isParty(e.actorId)) {
        const before = e.hpAfter + e.amount
        const eff = Math.max(0, Math.min(e.amount, before))
        dmgBy[e.actorId] = (dmgBy[e.actorId] ?? 0) + eff
        lastHit.set(e.targetId, e.actorId)
      }
      if (hp.has(e.targetId)) hp.set(e.targetId, e.hpAfter)
    } else if (e.kind === 'dot' || e.kind === 'heal') {
      // A DoT pulse or a heal (lane F) moves a boss's HP as well; a foe's poison is its harm.
      if (e.kind === 'dot' && isParty(e.unitId) && !isParty(e.sourceId)) {
        dmgBy[e.sourceId] = (dmgBy[e.sourceId] ?? 0) + Math.max(0, Math.min(e.amount, e.hpAfter + e.amount))
        lastHit.set(e.unitId, e.sourceId)
      }
      if (hp.has(e.unitId)) hp.set(e.unitId, e.hpAfter)
    } else if (e.kind === 'death' && isParty(e.unitId)) {
      const by = lastHit.get(e.unitId)
      if (by !== undefined) killsBy[by] = (killsBy[by] ?? 0) + 1
      if (side.get(e.unitId)?.isNpc) npcFell.push(e.unitId)
    }
  }
  let bossHpPct: number | null = null
  if (hp.size > 0) {
    let left = 0
    let max = 0
    for (const [id, h] of hp) {
      left += Math.max(0, h)
      max += side.get(id)!.maxHP
    }
    bossHpPct = max > 0 ? Math.round((left / max) * 100) : 0
  }
  return { outcome: res.outcome, ticks: res.ticksElapsed, fallen: [...res.fallenHeroIds], dmgBy, killsBy, npcFell, bossHpPct }
}

/** Run forecast battle `i` of an input. */
export function forecastRun(input: ForecastInput, i: number): ForecastRun {
  const p = input.prepared
  const res = runBattle(p.battleUnits, p.encounter, forecastSeed(input.state, i))
  return analyzeRun(res, bossIdsOf(p.encounter))
}

// ─────────────────────────────────────────────────────────────────────────────
// The summary
// ─────────────────────────────────────────────────────────────────────────────

function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 === 1 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2)
}

/** Fold the runs into the forecast. */
export function summarizeForecast(input: ForecastInput, runs: readonly ForecastRun[]): Forecast {
  const { state, prepared: p } = input
  const enc = p.encounter
  const n = runs.length
  const waveOf = new Map<string, number>()
  enc.waves.forEach((w, i) => w.units.forEach((u) => waveOf.set(u.id, i)))
  const unitOf = new Map(enc.waves.flatMap((w) => w.units.map((u) => [u.id, u] as const)))

  const outcomes: Record<CombatOutcome, number> = { win: 0, wipe: 0, failed: 0, timeout: 0, retreat: 0 }
  const fallenCount = new Map<string, number>()
  const dmg = new Map<string, number>()
  const kills = new Map<string, number>()
  const npcFalls = new Map<string, number>()
  let deaths = 0
  const lossBossHp: number[] = []
  for (const r of runs) {
    outcomes[r.outcome]++
    deaths += r.fallen.length
    for (const id of r.fallen) fallenCount.set(id, (fallenCount.get(id) ?? 0) + 1)
    for (const [id, d] of Object.entries(r.dmgBy)) dmg.set(id, (dmg.get(id) ?? 0) + d)
    for (const [id, k] of Object.entries(r.killsBy)) kills.set(id, (kills.get(id) ?? 0) + k)
    for (const id of r.npcFell) npcFalls.set(id, (npcFalls.get(id) ?? 0) + 1)
    if (r.outcome !== 'win' && r.bossHpPct !== null) lossBossHp.push(r.bossHpPct)
  }
  const pct = (k: number) => (n > 0 ? Math.round((k / n) * 100) : 0)
  const winPct = pct(outcomes.win)
  const expectedDeaths = n > 0 ? Math.round((deaths / n) * 10) / 10 : 0

  // Every slotted hero: the deploy rails' verdict, their odds and their nerve.
  const fielded = new Map(p.battleUnits.map((u) => [u.sourceHeroId as string, u]))
  const report = deployReport(state)
  const heroes: ForecastHero[] = []
  let emptySlots = 0
  for (const row of report) {
    if (row.heroId === null) {
      emptySlots++
      continue
    }
    const unit = fielded.get(row.heroId)
    const sanity = row.sanity
    heroes.push({
      slot: row.slot,
      heroId: row.heroId,
      line: row.line,
      fights: row.fit,
      ...(row.reason !== undefined && row.reason !== 'empty' ? { reason: row.reason } : {}),
      sanity,
      deathPct: pct(fallenCount.get(row.heroId) ?? 0),
      panicPct: unit ? Math.round(panicChance(unit.sanity ?? sanity, unit.stats.statusRes) * 100) : 0,
      lowSanity: row.fit && sanity < FORECAST.lowSanity,
    })
  }

  // The deadliest enemy: most damage dealt to the party, then most kills.
  let deadliest: ForecastFoe | null = null
  let totalDmg = 0
  for (const d of dmg.values()) totalDmg += d
  if (totalDmg > 0) {
    let best: string | null = null
    for (const [id, d] of dmg) {
      if (best === null || d > dmg.get(best)! || (d === dmg.get(best)! && (kills.get(id) ?? 0) > (kills.get(best) ?? 0))) best = id
    }
    const u = unitOf.get(best!)
    if (u) {
      deadliest = {
        unitId: u.id,
        name: u.name,
        ...(u.templateId !== undefined ? { templateId: u.templateId } : {}),
        wave: (waveOf.get(u.id) ?? 0) + 1,
        level: u.level,
        sharePct: Math.round((dmg.get(u.id)! / totalDmg) * 100),
        killsPerRun: n > 0 ? Math.round(((kills.get(u.id) ?? 0) / n) * 10) / 10 : 0,
        looming: u.keywords.some((k) => k.kind === 'looming'),
      }
    }
  }

  const bossIds = bossIdsOf(enc)
  const bossUnit = bossIds.length > 0 ? unitOf.get(bossIds[0]!) : undefined
  const boss = bossUnit
    ? {
        unitId: bossUnit.id,
        name: bossUnit.name,
        ...(bossUnit.templateId !== undefined ? { templateId: bossUnit.templateId } : {}),
        wave: (waveOf.get(bossUnit.id) ?? 0) + 1,
        hpLeftPct: lossBossHp.length > 0 ? median(lossBossHp) : null,
      }
    : null

  const escorts: ForecastEscort[] = (enc.allies ?? []).map((a) => ({ unitId: a.id, name: a.name, fallsPct: pct(npcFalls.get(a.id) ?? 0) }))
  const enemyCp = enc.waves.reduce((s, w) => s + w.units.reduce((m, u) => m + u.cp, 0), 0)
  const partyCp = p.battleUnits.reduce((s, u) => s + u.cp, 0)

  return {
    floor: p.floor,
    attemptIndex: p.attemptIndex,
    runs: n,
    fielded: p.battleUnits.length,
    heroes,
    emptySlots,
    winPct,
    outcomes,
    expectedDeaths,
    medianTicks: median(runs.map((r) => r.ticks)),
    deadliest,
    boss,
    escorts,
    mission: enc.mission,
    enemyCount: enc.waves.reduce((s, w) => s + w.units.length, 0),
    waves: enc.waves.length,
    modifiers: enc.modifiers ?? [],
    partyCp: Math.round(partyCp),
    enemyCp: Math.round(enemyCp),
    threat: p.battleUnits.length === 0 ? 'deadly' : threatFor(winPct, expectedDeaths),
    opening: [...(input.plan.opening ?? [])],
    ...(input.plan.focus !== undefined ? { directive: { ...input.plan.focus } } : {}),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The forecast (memoized)
// ─────────────────────────────────────────────────────────────────────────────

const CACHE = new Map<string, Forecast>()

/** A forecast already computed for this exact battle, if any (cheap: no battle is run). */
export function cachedForecast(input: ForecastInput): Forecast | undefined {
  return CACHE.get(input.key)
}

/** Keep a forecast (the UI's worker/chunked runs hand theirs back here too). */
export function rememberForecast(key: string, f: Forecast): void {
  if (CACHE.has(key)) CACHE.delete(key)
  CACHE.set(key, f)
  while (CACHE.size > FORECAST.cacheSize) CACHE.delete(CACHE.keys().next().value!)
}

/** Forget every memoized forecast (tests). */
export function clearForecastCache(): void {
  CACHE.clear()
}

/** Forecast an input: every run, folded (memoized on the input's key). */
export function runForecast(input: ForecastInput): Forecast {
  const hit = CACHE.get(input.key)
  if (hit) return hit
  const runs: ForecastRun[] = []
  if (input.prepared.battleUnits.length > 0) for (let i = 0; i < input.runs; i++) runs.push(forecastRun(input, i))
  const f = summarizeForecast(input, runs)
  rememberForecast(input.key, f)
  return f
}

/**
 * The forecast of the next attempt at the current floor for a plan (default: the Party
 * Board as it stands). Null past the summit. Never touches the attempt's own seed.
 */
export function forecastFloor(state: GameState, plan: ForecastPlan = {}): Forecast | null {
  const input = forecastInput(state, plan)
  return input ? runForecast(input) : null
}

// ─────────────────────────────────────────────────────────────────────────────
// What would change the odds
// ─────────────────────────────────────────────────────────────────────────────

/** The plan's party, resolved (slots and lines). */
function planParty(state: GameState, plan: ForecastPlan): { slots: (HeroId | null)[]; lines: Line[] } {
  return { slots: [...(plan.slots ?? state.party.slots)], lines: [...(plan.lines ?? state.party.lines)] }
}

function sameParty(a: { slots: readonly (HeroId | null)[]; lines: readonly Line[] }, b: { slots: readonly (HeroId | null)[]; lines: readonly Line[] }): boolean {
  return a.slots.length === b.slots.length && a.slots.every((s, i) => (s ?? null) === (b.slots[i] ?? null) && a.lines[i] === b.lines[i])
}

/** Is `alt` a real improvement on `base` (more wins, or fewer deaths)? */
export function improves(base: Forecast, alt: Forecast): boolean {
  return alt.winPct >= base.winPct + FORECAST.minWinGain || (alt.winPct >= base.winPct && alt.expectedDeaths <= base.expectedDeaths - FORECAST.minDeathsSaved)
}

/** How much better (for sorting): win points first, a death saved worth 20 points. */
function gain(base: Forecast, alt: Forecast): number {
  return alt.winPct - base.winPct + (base.expectedDeaths - alt.expectedDeaths) * 20
}

/**
 * The plan's unfit slots — refusing, away, broken down, or under the low-Sanity line — and
 * the empty ones, each filled by the strongest rested bench hero the rails would send.
 */
export function benchSwaps(state: GameState, base: Forecast, plan: ForecastPlan = {}): { slots: (HeroId | null)[]; lines: Line[]; swaps: { out: HeroId | null; in: HeroId }[] } | null {
  const party = planParty(state, plan)
  const planned = withPlanParty(state, plan)
  const inParty = new Set(party.slots.filter((s): s is HeroId => s !== null))
  const bench = (Object.values(state.heroes) as OwnedHero[])
    .filter((h) => !inParty.has(h.id) && h.sanity >= FORECAST.benchMinSanity && fitToDeploy(planned, h).ok)
    .sort((a, b) => heroCpFull(state, b) - heroCpFull(state, a) || (a.id < b.id ? -1 : 1))
  const out: number[] = []
  for (let s = 0; s < party.slots.length; s++) {
    const id = party.slots[s] ?? null
    if (id === null) {
      out.push(s)
      continue
    }
    const row = base.heroes.find((h) => h.slot === s)
    if (row && (!row.fights || row.lowSanity)) out.push(s)
  }
  if (out.length === 0 || bench.length === 0) return null
  // The worst first: refusers and the absent, then the shakiest.
  const rank = (s: number) => {
    const row = base.heroes.find((h) => h.slot === s)
    return row === undefined ? 1 : !row.fights ? 0 : 2 + row.sanity / 1000
  }
  out.sort((a, b) => rank(a) - rank(b) || a - b)
  const slots = [...party.slots]
  const swaps: { out: HeroId | null; in: HeroId }[] = []
  for (const s of out) {
    const next = bench.shift()
    if (!next) break
    swaps.push({ out: slots[s] ?? null, in: next.id })
    slots[s] = next.id
  }
  return swaps.length > 0 ? { slots, lines: party.lines, swaps } : null
}

/** Up to FORECAST.maxAlternatives plans that would improve the odds, best first, each forecast
 *  (when nobody on the board can fight, every plan that fields someone is shown). */
export function forecastAlternatives(state: GameState, base: Forecast, plan: ForecastPlan = {}): ForecastAlternative[] {
  const party = planParty(state, plan)
  const opening = [...(plan.opening ?? [])]
  const out: ForecastAlternative[] = []
  const tryPlan = (alt: Omit<ForecastAlternative, 'forecast'>) => {
    const f = forecastFloor(state, { ...plan, slots: alt.slots, lines: alt.lines, opening: alt.opening, ...(alt.directive !== undefined ? { focus: alt.directive } : {}) })
    // With nobody fit on the board, any party that can fight is news (even a grim one).
    if (f && f.fielded > 0 && (base.fielded === 0 || improves(base, f))) out.push({ ...alt, forecast: f })
  }

  // 1. The suggested party (counter-picked, the boss's weakness, true CP).
  const sug = suggestParty(state)
  if (sug.slots.some(Boolean) && !sameParty(sug, party)) {
    const was = new Set(party.slots.filter(Boolean))
    const now = new Set(sug.slots.filter(Boolean))
    const ins = sug.slots.filter((id): id is HeroId => !!id && !was.has(id))
    const outs = party.slots.filter((id): id is HeroId => !!id && !now.has(id))
    const swaps = Array.from({ length: Math.max(ins.length, outs.length) }, (_, i) => ({ out: outs[i] ?? null, in: ins[i] ?? null }))
    tryPlan({ kind: 'suggested', slots: [...sug.slots], lines: [...sug.lines], opening, swaps })
  }

  // 2. The unfit and the shaky swapped for the best of the bench.
  const sw = benchSwaps(state, base, plan)
  if (sw && !(out[0] && sameParty(out[0], sw))) tryPlan({ kind: 'swap', slots: sw.slots, lines: sw.lines, opening, swaps: sw.swaps })

  // 3. A free pre-battle mark on the enemy that hurts the party most (lane G) — or, when the
  //    plan already marks someone else, an opening Focus (one of the battle's orders).
  const foe = base.deadliest
  const ordersUsed = opening.filter((o) => o.kind !== 'retreat').length
  const marked = plan.focus?.focusEnemyId
  if (foe && !foe.looming && marked === undefined) {
    tryPlan({
      kind: 'mark',
      slots: party.slots,
      lines: party.lines,
      opening,
      directive: { ...(plan.focus ?? {}), focusEnemyId: foe.unitId },
      swaps: [],
      focus: { unitId: foe.unitId, name: foe.name },
    })
  } else if (foe && !foe.looming && marked !== foe.unitId && ordersUsed < ordersAllowed(state) && !opening.some((o) => o.kind === 'focus' && o.enemyId === foe.unitId)) {
    const focusOrder: BattleOrder = { tick: 1, kind: 'focus', enemyId: foe.unitId }
    tryPlan({
      kind: 'focus',
      slots: party.slots,
      lines: party.lines,
      opening: [...opening.filter((o) => o.kind !== 'focus'), focusOrder],
      swaps: [],
      focus: { unitId: foe.unitId, name: foe.name },
    })
  }

  // 4. A standing Guard (lane G): brace the moment a foe winds up a big move (one of the orders).
  const telegraphs = forecastInput(state, plan)?.prepared.encounter.waves.some((w) => w.units.some((u) => u.skills.some((k) => k.charge !== undefined)))
  if (telegraphs && ordersUsed < ordersAllowed(state) && !opening.some((o) => o.kind === 'guard')) {
    tryPlan({ kind: 'guard', slots: party.slots, lines: party.lines, opening: [...opening, { tick: 1, kind: 'guard', onTelegraph: true }], swaps: [] })
  }

  return out.sort((a, b) => gain(base, b.forecast) - gain(base, a.forecast)).slice(0, FORECAST.maxAlternatives)
}

/** The whole war-room read for a plan: the forecast and what would change it. */
export function warRoomForecast(state: GameState, plan: ForecastPlan = {}): { forecast: Forecast | null; alternatives: ForecastAlternative[] } {
  const forecast = forecastFloor(state, plan)
  if (!forecast) return { forecast: null, alternatives: [] }
  return { forecast, alternatives: forecastAlternatives(state, forecast, plan) }
}

/** Why the Enter sheet should ask before this attempt, if it should. */
export interface EnterConcern {
  /** Fewer than a full party will fight. */
  short: boolean
  /** Slotted heroes who will not fight, with why. */
  refusing: { heroId: HeroId; reason: DeployReason }[]
  /** Fit heroes under the low-Sanity line. */
  shaky: { heroId: HeroId; sanity: number; panicPct: number }[]
  /** The forecast is grim (≤ the confirm line, or Deadly). */
  grim: boolean
}

/** What the Enter sheet would name; null when a healthy, safe party can simply go. */
export function enterConcerns(f: Forecast): EnterConcern | null {
  const size = TUNING.account.partySize
  const c: EnterConcern = {
    short: f.fielded < size,
    refusing: f.heroes.filter((h) => !h.fights).map((h) => ({ heroId: h.heroId, reason: h.reason ?? 'dead' })),
    shaky: f.heroes.filter((h) => h.lowSanity).map((h) => ({ heroId: h.heroId, sanity: h.sanity, panicPct: h.panicPct })),
    grim: f.winPct <= FORECAST.confirmWinPct || f.threat === 'deadly',
  }
  return c.short || c.refusing.length > 0 || c.shaky.length > 0 || c.grim ? c : null
}
