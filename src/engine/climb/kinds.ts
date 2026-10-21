/**
 * Floor kinds and the floor budget: the sawtooth climb and its mercy director
 * (spec 2026-10-12 S13, S20). Owner: WP3. Numbers live in `TUNING.climb`.
 *
 *   pathLift(f)            the early climb's lift over floorPower: climb.earlyLift at
 *                          the foot of the tower, fading quadratically to ×1 at the
 *                          inflection floor.
 *   staticBudget(f, kind)  the authored curve for a kind: Path floors follow floorPower ×
 *                          pathLift with every Path→Path step capped at +maxStepPct; Elite
 *                          and Breather are that Path curve × their kindMult relative to
 *                          Path; a Boss anchor is the uncapped lifted target × its relative
 *                          kindMult × anchorBudgetMult; tutorial floors (F1-F2) are plain
 *                          floorPower, untouched.
 *   floorBudget(f, kind)   min(staticBudget, directorCp × mercyBand[kind]) from
 *                          `directorFromFloor` on (a Boss's both × its `anchorFeel`). The
 *                          director is a MERCY CAP ONLY: it never raises a floor for a
 *                          strong roster. Its bands are relative to the roster: Path a
 *                          little under it, the Skull and the Boss above it (the peaks).
 *
 * Which kind a floor is fought as (`kindForFloor`): F1-F2 are tutorial floors, authored
 * anchors (every 5th, plus F41/F42) are bosses, and the current floor takes the Door the
 * Master chose (`tower.kind`, defaulting to the first Door offered). `tower.kind` is set
 * from `floorKindBase` / `doors[0]` whenever the floor advances or rolls back, and from the
 * chosen Door on CHOOSE_DOOR (see doors.ts and tower.ts).
 *
 * PURE and DETERMINISTIC (no RNG at all here).
 */
import { TUNING } from '../tuning'
import { floorPower, mobLevel } from '../tower/power'
import { ANCHORS, SKILLS } from '../content'
import { buildCombatUnit } from '../unit'
import { legacyPct } from '../legacy'
import type { DerivedStats, FloorKind, GameState, OwnedHero } from '../types'

const CL = TUNING.climb
const T = TUNING.tower

/** The six stats an all-stat bonus (Last Stand, the Memorial plaques) lifts. */
export const ALL_STATS = ['maxHP', 'pAtk', 'mAtk', 'pDef', 'mDef', 'spd'] as const

/** Display names for each floor kind (English source strings for `t()`). */
export const FLOOR_KIND_LABEL: Readonly<Record<FloorKind, string>> = {
  tutorial: 'Tutorial',
  breather: 'Breather',
  path: 'Path',
  elite: 'Elite',
  rest: 'Rest stop',
  cache: 'Cache',
  boss: 'Boss',
}

/** Is `f` an authored anchor (every 5th floor, plus the F41/F42 tournament floors)? */
export function isAnchorFloor(f: number): boolean {
  return ANCHORS[f] !== undefined
}

/** The kind a floor has before any Door is chosen: F1-F2 tutorial, authored anchors
 *  (every 5th floor, F41, F42) bosses, else Path. */
export function floorKindBase(f: number): FloorKind {
  if (f <= 2) return 'tutorial'
  if (f % 5 === 0 || isAnchorFloor(f)) return 'boss'
  return 'path'
}

/** Kinds that are fought (Rest and Cache resolve on CHOOSE_DOOR with no battle). */
export function isFightKind(kind: FloorKind): boolean {
  return kind !== 'rest' && kind !== 'cache'
}

/**
 * The kind floor `f` is fought as for this state. Tutorial floors and anchors are fixed;
 * the current floor takes `tower.kind` when it is a Door kind (Path, Elite, Breather);
 * anything else (an old save's default, a floor other than the current one) is Path.
 */
export function kindForFloor(state: GameState, f: number): FloorKind {
  const base = floorKindBase(f)
  if (base !== 'path') return base
  if (f === state.tower.currentFloor) {
    const k = state.tower.kind
    if (k === 'path' || k === 'elite' || k === 'breather') return k
  }
  return 'path'
}

// ─────────────────────────────────────────────────────────────────────────────
// The roster the director reads
// ─────────────────────────────────────────────────────────────────────────────

/**
 * THE deployability predicate: can this hero be sent into a battle right now? Alive, not
 * broken (Sanity 0), not training, not away on an expedition, not held captive and not
 * mid-promotion. playFloor's deploy filter, the mercy director (`rosterCp`), the scout
 * (`canFight`), `suggestParty`, the tournament and the UI's "deployable" checks all read
 * this one predicate, so the director and the battle always see the same heroes.
 */
export function isFightable(h: OwnedHero): boolean {
  return h.alive && h.sanity > 0 && h.training === null && h.expedition === null && !h.captiveOf && h.promotion === null
}

/** Fightable and rested (Sanity at or above `climb.restedSanity`): a hero `suggestParty`
 *  sends. A tired hero can still fight, but the game will not recommend it. */
export function isRested(h: OwnedHero): boolean {
  return isFightable(h) && h.sanity >= CL.restedSanity
}

/** Living, deployable heroes on the roster. */
export function fightableCount(state: GameState): number {
  let n = 0
  for (const h of Object.values(state.heroes)) if (isFightable(h)) n++
  return n
}

/**
 * The heroes the director reads: every RESTED hero (whom Suggest would send) plus every
 * fightable hero actually in the party (a tired hero sent to fight does fight, so it
 * counts). A tired hero left on the bench is not counted, so the director never sizes a
 * floor for heroes the game itself will not send; and since rested heroes always count
 * and the party only ever adds, fielding a weak party (or tiring the carries and sending
 * them anyway) never lowers a floor.
 */
export function directorHeroes(state: GameState): OwnedHero[] {
  const sent = new Set<string>()
  for (const id of state.party.slots) if (id) sent.add(id)
  return Object.values(state.heroes).filter((h) => isRested(h) || (sent.has(h.id) && isFightable(h)))
}

/**
 * The director's read of the roster: the summed unit CP of the top `partySize` heroes it
 * reads (`directorHeroes`: rested, or fightable and in the party), as `buildCombatUnit`
 * builds them, so Sanity, favor, gear, passives and echoes count. Temporary aids (Last
 * Stand, Boons) are left out, so the director never cancels them. 0 for a roster with
 * nobody fit to fight.
 */
export function rosterCp(state: GameState): number {
  const cps: number[] = []
  for (const h of directorHeroes(state)) cps.push(buildCombatUnit(h, 'front', SKILLS, state.inventory).cp)
  cps.sort((a, b) => b - a)
  let sum = 0
  for (let i = 0; i < Math.min(TUNING.account.partySize, cps.length); i++) sum += cps[i]!
  return sum
}

/**
 * How much of an under-levelled hero's CP the director counts on floor `f`: CP prices a
 * hero's stats, but combat's mitigation is level-scaled (`combat.defenseKPerLevel`), so a
 * hero far below the floor's mob level fights well under its CP — the 1★ capped at Lv10
 * on F20, the New Arrival at Lv1. Beyond `levelLag.grace` levels under the mob level,
 * each level counts `levelLag.perLevel` less, down to `levelLag.min`. 1 at or near level,
 * and 1 past `levelLag.untilFloor` (the late climb keeps the plain-CP director).
 */
export function levelLagMult(level: number, f: number, worldMult = 1): number {
  const L = CL.levelLag
  if (f > L.untilFloor) return 1
  const gap = mobLevel(f, worldMult) - level - L.grace
  return gap <= 0 ? 1 : Math.max(L.min, 1 - L.perLevel * gap)
}

/**
 * The strength the mercy director sizes floor `f` for: the same five heroes `rosterCp`
 * reads (the strongest by unit CP), each counted at `levelLagMult` of its CP. A party of
 * capped or freshly recruited heroes is read at what it can really do, so a roster that
 * has bled (its carries dead, the bench promoted to the front) gets the relief the climb
 * promises (spec S13, S20). Never above `rosterCp`.
 */
export function directorCp(state: GameState, f: number): number {
  const wm = T.worldMult[state.worldGrade] ?? 1
  let sum = 0
  for (const u of directorUnits(state)) sum += u.cp * levelLagMult(u.level, f, wm)
  return sum
}

/** The five heroes the director reads (`directorHeroes`, strongest unit CP first), as
 *  `buildCombatUnit` builds them: CP, level and speed. */
function directorUnits(state: GameState): { cp: number; level: number; spd: number }[] {
  const units: { cp: number; level: number; spd: number }[] = []
  for (const h of directorHeroes(state)) {
    const u = buildCombatUnit(h, 'front', SKILLS, state.inventory)
    units.push({ cp: u.cp, level: h.xp.level, spd: u.stats.spd })
  }
  units.sort((a, b) => b.cp - a.cp)
  return units.slice(0, TUNING.account.partySize)
}

/** The mean speed of the heroes the director reads (0 for nobody fit to fight): the
 *  tempo an enemy's speed is judged against (`tempoMult`). */
export function directorSpd(state: GameState): number {
  const units = directorUnits(state)
  return units.length === 0 ? 0 : units.reduce((n, u) => n + u.spd, 0) / units.length
}

/**
 * How much more an enemy of speed `spd` is worth than its CP says, against a party whose
 * mean speed is `refSpd`. CP adds speed in (`cp.weights.spd`) like any other stat, but an
 * ATB unit acts in proportion to its speed: Versace of Silver Lightning (F41) at ~3× the
 * party's speed hits ~3× as often as a unit of the same CP at the party's pace, so CP
 * prices him far under what he does. Past `climb.tempo.grace` × the party's speed, the
 * excess counts as (spd / (refSpd × grace)) ^ exp — offense only, so a square root; 1 at
 * or under it (the biome mobs never get there: p90 ≈ 1.2× the party). 1 for an empty party.
 */
export function tempoMult(spd: number, refSpd: number): number {
  const { grace, exp } = CL.tempo
  if (!(refSpd > 0)) return 1
  const r = spd / (refSpd * grace)
  return r <= 1 ? 1 : r ** exp
}

// ─────────────────────────────────────────────────────────────────────────────
// Budgets
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The Path lift over floorPower on floor `f`: `TUNING.climb.earlyLift` at the foot of the tower,
 * fading (quadratically) to ×1 at the inflection floor, the same window the tower's
 * `earlyBudgetBoost` tapers over. The lift can't live in floorPower itself: an
 * earlyBudgetBoost above ~4.2 breaks floorPower's monotonicity near F69. The fade leaves
 * the late tower (tuned by the 2026-09-29 balance pass) as it was.
 */
export function pathLift(f: number): number {
  const lift = CL.earlyLift
  const span = T.inflectionFloor
  const t = span > 0 ? Math.max(0, span - f) / span : 0
  return 1 + (lift - 1) * t * t
}

/** The uncapped Path target of floor `f`: floorPower × the Path lift. */
export function pathTarget(f: number, worldMult: number): number {
  return floorPower(f, worldMult) * pathLift(f)
}

/** Memo of the step-capped Path curve, by worldMult then floor (pure, so safe to cache). */
const pathMemo = new Map<number, number[]>()

/**
 * The Path curve: the lifted target (`pathTarget`), but each Path floor asks at most
 * `maxStepPct` more than the Path floor before it, and never less (anchors are skipped:
 * F4 → F6 is one step). Starts at `directorFromFloor`; below it this is plain floorPower
 * (the tutorial floors). The cap only flattens an anchor's step bonus; the curve rejoins
 * the target within a few floors.
 */
export function pathBudget(f: number, worldMult: number): number {
  const start = CL.directorFromFloor
  if (f < start) return floorPower(f, worldMult)
  if (f === start) return pathTarget(f, worldMult)
  let memo = pathMemo.get(worldMult)
  if (memo === undefined) {
    memo = []
    pathMemo.set(worldMult, memo)
  }
  const cached = memo[f]
  if (cached !== undefined) return cached
  let prev = pathTarget(start, worldMult)
  let value = prev
  for (let g = start + 1; g <= f; g++) {
    const known = memo[g]
    const cur = known ?? Math.min(Math.max(pathTarget(g, worldMult), prev), prev * (1 + CL.maxStepPct))
    memo[g] = cur
    value = cur
    // An anchor floor is not a Path floor: the next Path floor steps from the last one.
    if (!isAnchorFloor(g)) prev = cur
  }
  return value
}

/** A kind's budget relative to Path (`kindMult[kind] / kindMult.path`): Elite 1.6×,
 *  Breather 0.6×, Boss 1× (each anchor then × its `anchorFeel`). */
export function kindRel(kind: FloorKind): number {
  const path = CL.kindMult.path ?? 1
  const mult = CL.kindMult[kind] ?? path
  return path > 0 ? mult / path : mult
}

/**
 * The static (pre-director) budget of floor `f` for `kind`; Rest and Cache have no fight (0).
 *   - Tutorial floors (F1-F2): floorPower × kindMult.tutorial, untouched by the climb.
 *   - Path, Elite, Breather: the step-capped Path curve × the kind's relative multiplier.
 *   - Boss: the uncapped Path target at its floor × its relative multiplier ×
 *     anchorBudgetMult — the sawtooth's peak.
 */
export function staticBudget(state: GameState, f: number, kind: FloorKind): number {
  const wm = T.worldMult[state.worldGrade] ?? 1
  const mult = CL.kindMult[kind] ?? 1
  if (!isFightKind(kind) || mult <= 0) return 0
  if (kind === 'tutorial' || f < CL.directorFromFloor) return floorPower(f, wm) * mult
  if (kind === 'boss') return pathTarget(f, wm) * kindRel('boss') * T.anchorBudgetMult * anchorFeel(f)
  return pathBudget(f, wm) * kindRel(kind) * (kind === 'path' ? pathFeel(f) : 1)
}

/** The authored boss on floor `f`'s feel multiplier (`climb.anchorFeel[f]`, default 1):
 *  authored anchors differ in how hard they hit for their CP (F5's Survive is soft,
 *  Halgiraf on F20 is hard), so each Boss's budget — static curve and mercy cap alike — is
 *  evened out by floor and every Boss reads as the sawtooth's peak. */
export function anchorFeel(f: number): number {
  return CL.anchorFeel[f] ?? 1
}

/** The Path on floor `f`'s feel multiplier (`climb.pathFeel[f]`, default 1): × that Path
 *  floor's static budget and its mercy cap alike, outside the step-capped Path curve (so it
 *  never carries into the floors after it). Act I's Paths sat at ~0.75× the roster, under
 *  every cap, and read 100% Safe; these give them a gentle sawtooth up to the F5 and F10
 *  bosses. Only the Path: the Skull and the Breather keep their own curves. */
export function pathFeel(f: number): number {
  return CL.pathFeel[f] ?? 1
}

/** A kind's feel multiplier on floor `f`: the Boss's `anchorFeel`, the Path's `pathFeel`,
 *  1 for every other kind. */
export function kindFeel(f: number, kind: FloorKind): number {
  return kind === 'boss' ? anchorFeel(f) : kind === 'path' ? pathFeel(f) : 1
}

/** The director's mercy band for `kind`: budget ≤ directorCp × mercyBand(kind) (× the
 *  floor's `kindFeel`: a Boss's `anchorFeel`, a Path's `pathFeel`). */
export function mercyBand(kind: FloorKind): number {
  return CL.mercyBand[kind] ?? 1
}

/** The director's cap for this roster and kind, or null when it does not apply (tutorial
 *  floors, an empty roster, a band of 0). */
export function mercyCap(state: GameState, f: number, kind: FloorKind): number | null {
  if (f < CL.directorFromFloor || kind === 'tutorial') return null
  const band = mercyBand(kind)
  if (band <= 0) return null
  const cp = directorCp(state, f)
  return cp > 0 ? cp * band * kindFeel(f, kind) : null
}

/** The budget a floor of `kind` is built to: the static curve × kind, capped by the
 *  mercy director. Never above `staticBudget`. */
export function floorBudget(state: GameState, f: number, kind: FloorKind): number {
  const stat = staticBudget(state, f, kind)
  const cap = mercyCap(state, f, kind)
  return cap === null ? stat : Math.min(stat, cap)
}

/** Did the mercy director lower this floor's budget for the roster? */
export function isMercyCapped(state: GameState, f: number, kind: FloorKind): boolean {
  return floorBudget(state, f, kind) < staticBudget(state, f, kind)
}

// ─────────────────────────────────────────────────────────────────────────────
// Last Stand (S20) and the all-stat bonuses passed to buildCombatUnit
// ─────────────────────────────────────────────────────────────────────────────

/** Heroes still standing for Last Stand: alive, not held captive and not broken (Sanity
 *  0). A hero away by the Master's choice (training, an expedition, a promotion) still
 *  stands, so sending heroes off never buys the bonus. */
export function standingCount(state: GameState): number {
  let n = 0
  for (const h of Object.values(state.heroes)) if (h.alive && !h.captiveOf && h.sanity > 0) n++
  return n
}

/** Last Stand: the all-stat bonus a shrunken roster fights with on `floor` (0 = none).
 *  Applies from `directorFromFloor` (the tutorial floors are untouched) when at most
 *  `rosterAtMost` heroes still stand (`standingCount`: the fallen, the captured and the
 *  broken shrink the roster; heroes away training do not). */
export function lastStandPct(state: GameState, floor: number = state.tower.currentFloor): number {
  if (floor < CL.directorFromFloor) return 0
  const n = standingCount(state)
  if (n < 1 || n > CL.lastStand.rosterAtMost) return 0
  return CL.lastStand.pctByCount[n] ?? 0
}

/** The relative all-stat map every deployed hero gets on `floor`: Last Stand plus the
 *  Memorial's plaques (`legacyPct`). Empty when both are 0 (units stay byte-identical). */
export function climbExtraPct(state: GameState, floor: number = state.tower.currentFloor): Partial<Record<keyof DerivedStats, number>> {
  const pct = lastStandPct(state, floor) + legacyPct(state)
  if (pct === 0) return {}
  const out: Partial<Record<keyof DerivedStats, number>> = {}
  for (const k of ALL_STATS) out[k] = pct
  return out
}
