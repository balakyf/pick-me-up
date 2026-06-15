/**
 * Shared engine contracts. EVERY engine module imports its cross-module types from
 * here and never redeclares them. This single source of truth is what keeps the
 * stats / combat / gacha / tower / account / store seams connected.
 *
 * Pure types only — no logic, no imports, no runtime values except const enums of
 * string/number literals expressed as union types.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Branded primitives
// ─────────────────────────────────────────────────────────────────────────────

/** A 32-bit unsigned integer; the account's single entropy point. */
export type Seed = number & { readonly __brand: 'Seed' }

/** Stable per-account unique hero identity. Prefixed (e.g. "h_000123") so that
 *  Record<HeroId, ...> iteration stays insertion-ordered (never numeric-reordered). */
export type HeroId = string & { readonly __brand: 'HeroId' }

// ─────────────────────────────────────────────────────────────────────────────
// Core domain enums (single classless representation = null, not "None")
// ─────────────────────────────────────────────────────────────────────────────

export type Star = 1 | 2 | 3 | 4 | 5 | 6 | 7

export type Element = 'fire' | 'wind' | 'earth' | 'water' | 'light' | 'dark' | 'physical'

/** Five canon classes. A hero may be classless (null) — all 1★/2★ heroes are. */
export type HeroClass = 'warrior' | 'spearman' | 'thief' | 'archer' | 'mage'

export type Line = 'front' | 'mid' | 'back'

export type DamageType = 'physical' | 'magic'

export type GradeLetter = 'F' | 'E' | 'D' | 'C' | 'B' | 'A' | 'S' | 'SS'

export type AttrKey = 'str' | 'agi' | 'vit' | 'int' | 'wil'

export type WorldGrade = 'C' | 'B' | 'A' | 'S'

export type HeroOrigin = 'procedural' | 'cameo'

export type FacilityId = 'kitchen' | 'promotionChamber' | 'tacticalCenter'

/** Material bucket key, e.g. 'promotionStone', 'attrStone_fire', 'rankMaterial'. */
export type MaterialId = string

// ─────────────────────────────────────────────────────────────────────────────
// Stat model (Layer 0)
// ─────────────────────────────────────────────────────────────────────────────

export interface PrimaryAttrs {
  str: number
  agi: number
  vit: number
  int: number
  wil: number
}

/** Per-attribute 0..10 growth grade (the canon training scale). */
export interface GrowthGrades {
  str: number
  agi: number
  vit: number
  int: number
  wil: number
}

/** What the combat sim reads. Integers (rounded) per the round-half-up policy. */
export interface DerivedStats {
  maxHP: number
  pAtk: number
  mAtk: number
  pDef: number
  mDef: number
  spd: number
  critPct: number
  evaPct: number
  accPct: number
  statusRes: number
}

/** Read-only rarity envelope: gacha rolls within it, this layer validates against it. */
export interface StarEnvelope {
  star: Star
  baseAttrRange: readonly [min: number, max: number]
  gradeCeiling: number
  levelCap: number
}

/** Per-hero leveling progress. heldXp accumulates once at the star level cap
 *  (the canon "Lv.???" held-XP state, released later by Promotion — out of slice). */
export interface XpProgress {
  level: number
  xpIntoLevel: number
  heldXp: number
  atCap: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Skills (slice subset)
// ─────────────────────────────────────────────────────────────────────────────

export type SkillTarget = 'single' | 'all-enemies'

/** The effect block the combat sim reads. `element: null` means "inherit the
 *  unit's element". Every unit also has an implicit basic attack synthesized at
 *  build time, so skillIds may be empty. */
export interface SkillEffect {
  id: string
  name: string
  skillMult: number
  damageType: DamageType
  element: Element | null
  target: SkillTarget
  spCost: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Heroes: static identity (Hero) vs persisted runtime (OwnedHero)
// ─────────────────────────────────────────────────────────────────────────────

/** Immutable identity produced by the gacha. Carries NO level/XP/HP/alive. */
export interface Hero {
  id: HeroId
  name: string
  star: Star
  heroClass: HeroClass | null
  element: Element
  baseAttrs: PrimaryAttrs
  growthGrades: GrowthGrades
  skillIds: string[]
  /** Deterministic portrait token (a color/glyph seed) — no art assets. */
  portraitToken: string
  origin: HeroOrigin
}

/** What the account persists: a Hero plus mutable runtime state. */
export interface OwnedHero extends Hero {
  xp: XpProgress
  alive: boolean
  /** 0..100; drains in the tower, regens in the lobby (Phase 3). */
  sanity: number
  /** In-progress promotion timer; null when not promoting (Phase 4). */
  promotion: { completesAtWorld: number } | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Party / account state (canonical GameState lives here)
// ─────────────────────────────────────────────────────────────────────────────

export interface PartyState {
  /** Length 5; null = empty slot. */
  slots: (HeroId | null)[]
  /** Length 5, parallel to slots; the line each slot fights on. */
  lines: Line[]
}

export interface TowerState {
  /** Persistent per-account position, never reset. Starts at 1. */
  currentFloor: number
  /** Highest floor cleared at least once; firstClear = (floor > highestCleared). */
  highestCleared: number
  /** Per-floor retry counter for the CURRENT floor; folded into the combat seed
   *  so each wipe-retry is independently reproducible. Reset to 0 on advance. */
  attemptIndex: number
}

export interface GachaState {
  /** Consecutive pulls that have not yet hit the pool's pity-guarantee star. */
  pity: number
  /** Monotonic total Normal pulls; doubles as the gacha sub-stream index. */
  pullCount: number
}

export interface RngCursors {
  /** Monotonic id for the next combat encounter (a global fallback stream). */
  combatCounter: number
}

export interface FacilityState {
  /** 0 = locked / not yet built. */
  level: number
  /** An in-progress upgrade; null when idle. completesAtWorld is world-time ms. */
  build: { toLevel: number; completesAtWorld: number } | null
}

export interface MetaState {
  masterLevel: number
  masterXp: number
  /** World-time ms of the last advanceTime() catch-up. */
  lastSeenAtWorld: number
}

export interface DailiesState {
  attemptsUsed: number
  /** World-day index of the last reset (floor(worldMs / worldDayMs)). */
  lastResetWorldDay: number
}

/** THE canonical game state. Every module imports this; none redeclare it.
 *  All set-like fields are persisted as SORTED arrays for stable round-trips. */
export interface GameState {
  schemaVersion: number
  accountId: string
  seed: Seed
  worldGrade: WorldGrade
  /** Bootstrap-supplied; display only, never feeds RNG. */
  createdAt: number
  gold: number
  gems: number
  materials: Record<MaterialId, number>
  meta: MetaState
  facilities: Record<FacilityId, FacilityState>
  dailies: DailiesState
  heroes: Record<HeroId, OwnedHero>
  /** Every HeroId ever issued on this account — enforces no-dupe sampling. */
  consumedHeroIds: string[]
  /** Procedural names already used — keeps generated names unique. */
  usedNames: string[]
  /** Authored cameo template ids already issued — keeps cameos no-dupe. */
  consumedTemplateIds: string[]
  party: PartyState
  tower: TowerState
  gacha: GachaState
  rng: RngCursors
}

export interface SaveEnvelope {
  schemaVersion: number
  savedAt: number
  state: GameState
}

// ─────────────────────────────────────────────────────────────────────────────
// Combat (Layer 0 §2)
// ─────────────────────────────────────────────────────────────────────────────

export type CombatSide = 'hero' | 'enemy'

/** Boss/enemy keyword gimmicks as data (Layer 0 §2.6). Slice uses phased + enrage. */
export type KeywordTag =
  | { kind: 'immune'; damageType: DamageType }
  | { kind: 'vulnerable'; element: Element }
  | { kind: 'phased' } // untargetable until all non-phased enemies in the wave are down
  | { kind: 'enrage'; afterTick: number; multiplier: number }

/** A fully-assembled combatant. Heroes AND enemies share this shape; the sim
 *  treats them identically. Built fresh per battle by the `unit` module. */
export interface CombatUnit {
  id: string
  name: string
  side: CombatSide
  unitClass: HeroClass | null
  element: Element
  line: Line
  level: number
  stats: DerivedStats
  maxSP: number
  currentHP: number
  currentSP: number
  actionGauge: number
  alive: boolean
  skills: SkillEffect[]
  keywords: KeywordTag[]
  cp: number
  /** Present for heroes (links back to OwnedHero for XP/permadeath); absent for enemies. */
  sourceHeroId?: HeroId
  /** Hero Sanity (0..100) carried in for the low-Sanity panic check; absent for enemies. */
  sanity?: number
  /** Stable enemy template id for Defeat(target) missions; absent for heroes. */
  targetTag?: string
}

/** Master levers carried into a battle (combat resolves once, then the UI replays
 *  the log — so these are pre-battle directives, never mid-fight mutations). */
export interface FocusDirective {
  /** All hero attackers prioritize this enemy id while it lives. */
  focusEnemyId?: string
  /** These ally ids are deprioritized as enemy targets. */
  overlookedAllyIds?: string[]
}

// ── Missions (Layer 2 §4, slice subset of the 8 primitives) ──────────────────

export type Objective =
  | { kind: 'annihilate' }
  | { kind: 'survive'; ticks: number }
  | { kind: 'defend'; waves: number }
  | { kind: 'defeat'; targetTag: string }

export interface Mission {
  type: string
  objectives: Objective[]
  /** Tick budget; null = no limit. */
  timer: number | null
}

export interface EnemyWave {
  units: CombatUnit[]
}

export interface Encounter {
  floor: number
  mission: Mission
  waves: EnemyWave[]
  focus?: FocusDirective
  /** Decides permadeath policy; combat only flags it. */
  encounterContext: 'tower'
}

// ── Combat log (one schema; the producer's; UI replays it) ───────────────────

export interface CombatUnitInit {
  id: string
  name: string
  side: CombatSide
  line: Line
  unitClass: HeroClass | null
  element: Element
  level: number
  maxHP: number
  maxSP: number
  cp: number
}

export type CombatOutcome = 'win' | 'wipe' | 'timeout'

export type CombatEvent = { seq: number; tick: number } & (
  | { kind: 'battle-start'; heroIds: string[]; enemyIds: string[] }
  | { kind: 'wave-spawn'; wave: number; enemyIds: string[] }
  | { kind: 'act'; actorId: string; skillId: string; targetId: string }
  | { kind: 'hit'; actorId: string; targetId: string; amount: number; crit: boolean; hpAfter: number }
  | { kind: 'miss'; actorId: string; targetId: string }
  /** A low-Sanity hero panicked and lost its turn (Layer 3 §3.2). */
  | { kind: 'panic'; unitId: string }
  | { kind: 'death'; unitId: string }
  | { kind: 'mission'; note: string }
  | { kind: 'end'; outcome: CombatOutcome }
)

export interface CombatLog {
  seed: number
  floor: number
  encounterContext: 'tower'
  unitsInit: CombatUnitInit[]
  events: CombatEvent[]
  outcome: CombatOutcome
  /** Total RNG draws consumed — asserted in snapshot tests to catch reordering. */
  rngDraws: number
}

export interface BattleResult {
  outcome: CombatOutcome
  ticksElapsed: number
  wavesCleared: number
  defeatedTargetTags: string[]
  survivorHeroIds: HeroId[]
  fallenHeroIds: HeroId[]
  log: CombatLog
}

// ── Floor resolution (tower → account) ───────────────────────────────────────

export interface FloorResult {
  floor: number
  cleared: boolean
  firstClear: boolean
  goldAwarded: number
  xpAwarded: number
  fallenHeroIds: HeroId[]
  result: BattleResult
}

// ─────────────────────────────────────────────────────────────────────────────
// Content templates (authored data → built into Heroes / CombatUnits)
// ─────────────────────────────────────────────────────────────────────────────

/** Authored cameo blueprint. The gacha turns this into a Hero/OwnedHero. */
export interface HeroTemplate {
  templateId: string
  name: string
  star: Star
  heroClass: HeroClass | null
  element: Element
  baseAttrs: PrimaryAttrs
  growthGrades: GrowthGrades
  skillIds: string[]
  portraitToken: string
}

/** Enemy archetype. tower derives a statline as attrMult[attr] × level, then
 *  runs it through the same deriveStats the heroes use. */
export interface EnemyTemplate {
  id: string
  name: string
  element: Element
  attrMult: PrimaryAttrs
  keywords?: KeywordTag[]
}

/** One enemy group inside an authored anchor wave. */
export interface AnchorWaveSpec {
  templateId: string
  count: number
  /** Added to the floor's mobLevel for this group (e.g. a boss is tougher). */
  levelBonus?: number
  /** Overrides/extra keywords for this group (e.g. the F10 Lv999 Enrage boss). */
  keywords?: KeywordTag[]
  /** Marks this group as a Defeat(target) objective subject. */
  targetTag?: string
}

/** Authored set-piece floor (F5, F10). tower builds an Encounter from it. */
export interface AnchorDef {
  floor: number
  missionType: string
  objectives: Objective[]
  timer: number | null
  waves: AnchorWaveSpec[][]
}

export type SkillRegistry = Record<string, SkillEffect>

// ─────────────────────────────────────────────────────────────────────────────
// Persistence + store command surface
// ─────────────────────────────────────────────────────────────────────────────

export interface StoragePort {
  read(key: string): string | null
  write(key: string, value: string): void
  clear(key: string): void
}

export type Command =
  | { type: 'NEW_ACCOUNT'; seed: number; now?: number }
  | { type: 'SUMMON' }
  | { type: 'SET_PARTY'; slots: (HeroId | null)[]; lines: Line[] }
  | { type: 'ATTEMPT_FLOOR'; focus?: FocusDirective }
  /** Explicit world-time catch-up; advances the clock with no other state change. */
  | { type: 'TICK' }
  /** Kitchen Banquet: spend gold to restore Sanity across the living roster. */
  | { type: 'BANQUET' }
  /** Testing-only: grant free gold. Not part of the real economy. */
  | { type: 'ADD_GOLD'; amount: number }
