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

export type FacilityId =
  | 'kitchen'
  | 'promotionChamber'
  | 'tacticalCenter'
  | 'trainingCenter'
  | 'transferStation'
  | 'hallOfMagic'
  // The Living Lobby (schema v10): buildings heroes live and work in.
  | 'dormitory'
  | 'tavern'
  | 'infirmary'
  | 'garden'
  | 'memorial'
  | 'forge'
  | 'library'
  | 'watchtower'
  | 'market'

/** Material bucket key, e.g. 'promotionStone', 'attrStone_fire', 'rankMaterial'. */
export type MaterialId = string

/** Equipment grade ladder (Layer 1 §5.1). Slice forges E…S; SS/SSS reserved. */
export type EquipmentGrade = 'E' | 'D' | 'C' | 'B' | 'A' | 'S' | 'SS' | 'SSS'

/** The three equipment slots (Layer 1 §5.2). */
export type EquipmentSlot = 'weapon' | 'armor' | 'accessory'

/** Account-unique equipment identity (e.g. 'eq_000007'). */
export type EquipmentId = string & { readonly __brand: 'EquipmentId' }

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

/** Skill grade ladder (Layer 1 §2.1). Grade sets the level cap and the CP weight. */
export type SkillGrade = 'F' | 'E' | 'D' | 'C' | 'B' | 'A' | 'S' | 'U'

/** The effect block the combat sim reads. `element: null` means "inherit the
 *  unit's element". Every unit also has an implicit basic attack synthesized at
 *  build time, so a hero's skill list may be empty. `skillMult` is the already
 *  leveled multiplier; `hpCost` (when present) is paid from current HP on cast. */
export interface SkillEffect {
  id: string
  name: string
  skillMult: number
  damageType: DamageType
  element: Element | null
  target: SkillTarget
  spCost: number
  /** HP spent per cast (the canon "consumes vitality" ultimates). Absent = none. */
  hpCost?: number
}

/** A passive skill's effect: never cast; resolved into keywords / stat bonuses at unit
 *  build, magnitude = base + perLevel × (level − 1). */
export type PassiveEffect =
  /** −X% damage taken (optionally only from ranged attackers or one element). */
  | { kind: 'guard'; base: number; perLevel: number; vs?: GuardSource }
  /** +X% to one derived stat. */
  | { kind: 'stat'; stat: keyof DerivedStats; base: number; perLevel: number }
  /** ×(1 + X) damage against an enemy family. */
  | { kind: 'bane'; family: EnemyFamily; base: number; perLevel: number }

/** Authored, static skill definition (the registry entry). Levels resolve it into a SkillEffect. */
export interface SkillDef {
  id: string
  name: string
  grade: SkillGrade
  damageType: DamageType
  element: Element | null
  target: SkillTarget
  spCost: number
  /** skillMult at level 1. */
  baseMult: number
  /** skillMult added per level above 1. */
  perLevel: number
  /** HP cost at level 1 (HP-cost ultimates only). */
  hpCost?: number
  /** HP cost added per level above 1 — strong enough ultimates price themselves out. */
  hpCostPerLevel?: number
  /** Can a promotion grant this skill? (Merge-only / achievement skills cannot.) */
  learnable: boolean
  /** Can the Training Center teach this skill from scratch? (canon "trained" skills) */
  trainable: boolean
  /** Present on passive skills: never cast, resolved at unit build. */
  passive?: PassiveEffect
  /** Achievement skills are bound: never trained, transferred or copied. */
  bound?: boolean
}

/** A hero's copy of a skill: it levels by being cast (auto-learn, Layer 1 §2.4). */
export interface HeroSkill {
  id: string
  level: number
  /** Use-XP banked toward the next level. */
  xp: number
}

/** Conditional unlock (Layer 1 §2.2): a hero reaching `minLevel` (after the account has
 *  cleared `minFloorCleared`, when set) learns `skillId` at Lv1. */
export interface SkillUnlock {
  skillId: string
  minLevel: number
  minFloorCleared?: number
}

/** Achievement skill (Layer 1 §2.1): granted to every deployed survivor of a WON battle
 *  that meets the condition. */
export interface AchievementDef {
  id: string
  skillId: string
  label: string
  condition: { kind: 'defeat'; targetTag: string } | { kind: 'clearFloor'; floor: number }
}

/** Manual-only evolution (Transfer Station): `from` at its max level becomes `result` (Lv1). */
export interface EvolutionRecipe {
  from: string
  result: string
}

/** Auto-merge recipe: holding both inputs at ≥ minLevel fuses them into `result` (Lv1). */
export interface MergeRecipe {
  inputs: readonly [string, string]
  minLevel: number
  result: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Equipment (Layer 1 §5) — flat derived-stat blocks + tags; never touch attributes
// ─────────────────────────────────────────────────────────────────────────────

/** An owned piece of equipment. Grants a flat DerivedStats block (Layer 0 §5.4);
 *  a weapon may also override the wielder's element and/or carry keyword tags. */
export interface EquipmentItem {
  id: EquipmentId
  slot: EquipmentSlot
  grade: EquipmentGrade
  name: string
  /** Flat additions to the wielder's combat stats. */
  statBonus: Partial<DerivedStats>
  /** Weapon element override (combat uses this instead of the wielder's element). */
  element?: Element
  /** Conditional-effect tags fed through the Layer 0 keyword system. */
  keywords?: KeywordTag[]
  /** A bound exclusive weapon (4★+ summons): only this hero may equip it. */
  exclusiveTo?: HeroId
  /** Blacksmithing attempts made on this item (seeds its next roll). */
  refines?: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Engravings / Imprints (Layer 1 §5.4) — the 4★+ identity layer
// ─────────────────────────────────────────────────────────────────────────────

export type EngravingGrade = 'C' | 'B' | 'A' | 'S'

/** One grade's resolved effect: keyword tags + optional % bonuses to derived stats. */
export interface EngravingEffect {
  keywords: KeywordTag[]
  statPct?: Partial<Record<keyof DerivedStats, number>>
}

/** Authored engraving (the registry entry). */
export interface EngravingDef {
  id: string
  name: string
  /** Relative roll weight among engravings (True Black Dragon's Blood = 2 of 100). */
  weight: number
  blurb: string
  byGrade: Record<EngravingGrade, EngravingEffect>
}

/** A hero's engraving. */
export interface HeroEngraving {
  id: string
  grade: EngravingGrade
}

/** A hero's three equipment slots; each references an inventory item or is empty. */
export interface HeroEquipment {
  weapon: EquipmentId | null
  armor: EquipmentId | null
  accessory: EquipmentId | null
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

/** What the account persists: a Hero plus mutable runtime state. The innate
 *  `skillIds` become leveled `skills` once the hero is owned (schema v4). */
export interface OwnedHero extends Omit<Hero, 'skillIds'> {
  /** The hero's skills with their levels (Layer 1 §2). */
  skills: HeroSkill[]
  xp: XpProgress
  alive: boolean
  /** 0..100; drains in the tower, regens in the lobby (Phase 3). */
  sanity: number
  /** In-progress promotion timer; null when not promoting (Phase 4). */
  promotion: { completesAtWorld: number } | null
  /** Equipped item ids per slot (Layer 1 §5); each references GameState.inventory. */
  equipment: HeroEquipment
  /** In-progress Training Center drill; null when not training (schema v5). */
  training: TrainingDrill | null
  /** The hero's engraving/imprint (4★+ identity layer); null when none (schema v6). */
  engraving: HeroEngraving | null
  /** Favorability 0..100 (Layer 3 §C1; schema v8). */
  favor: number
  /** Highest favor tier ever reached (0 Wary … 4 Bonded) — IP milestones pay once. */
  bondTier: number
  /** Intervention Points (Layer 3 §D2). */
  ip: number
  /** The last gift given and how many times in a row (repeat gifts decay). */
  gift: { last: string | null; streak: number }
  /** Whale-bait inflation: the star the summon SHOWED (engine always uses `star`). */
  displayStar?: Star
  /** Guarantee an action: the next tower battle's first strike lands ×2. */
  blessed: boolean
  /** Away on a Ruins expedition until this world-time; null when home. */
  expedition: { completesAtWorld: number } | null
  /** Kidnapped by a raiding Master (Layer 4 §2): held until ransomed, rescued or synthesized. */
  captiveOf: CaptiveHold | null
  /** Quanton Life (schema v10): needs, job, current activity, memories. Absent until the
   *  life clock first sees the hero (a fresh summon) — read through life.lifeOf(). */
  life?: HeroLife
}

// ─────────────────────────────────────────────────────────────────────────────
// Quanton Life — the Living Lobby (schema v10)
// ─────────────────────────────────────────────────────────────────────────────

export type NeedKey = 'energy' | 'hunger' | 'social' | 'fun'
export type Needs = Record<NeedKey, number>

/** What a hero is doing with their time. The last four are pinned by other systems. */
export type ActivityKind =
  | 'sleep'
  | 'eat'
  | 'work'
  | 'train'
  | 'socialize'
  | 'hobby'
  | 'read'
  | 'pray'
  | 'mourn'
  | 'heal'
  | 'wander'
  | 'promoting'
  | 'drilling'
  | 'away'
  | 'captive'

/** Where on the campus an activity happens (a building or an outdoor spot). */
export type LifePlace =
  | 'dormitory'
  | 'hall'
  | 'kitchen'
  | 'forge'
  | 'yard'
  | 'tavern'
  | 'library'
  | 'promotion'
  | 'memorial'
  | 'infirmary'
  | 'garden'
  | 'market'
  | 'watchtower'
  | 'courtyard'
  | 'rift'
  | 'offsite'

/** A building job a hero can be assigned to (one per hero). */
export type JobId = 'blacksmith' | 'cook' | 'instructor' | 'scholar' | 'healer' | 'gardener' | 'merchant' | 'guard'

export type MemoryKind =
  | 'firstDay'
  | 'floorCleared'
  | 'floorLost'
  | 'nearDeath'
  | 'friendDied'
  | 'comradeDied'
  | 'befriended'
  | 'rivalry'
  | 'argued'
  | 'gift'
  | 'promoted'
  | 'forged'
  | 'jobTier'
  | 'mourned'
  | 'retreated'

export interface Memory {
  kind: MemoryKind
  /** World-day index it happened. */
  day: number
  /** The other hero involved (a friend, a rival, the fallen). */
  other?: HeroId
  floor?: number
  /** Free detail (an item name, a gift id, a job id). */
  detail?: string
  /** Salience 0..100 (decays with age when ranked). */
  weight: number
}

export interface HeroActivity {
  kind: ActivityKind
  place: LifePlace
  /** Absolute life slot at which the hero reconsiders. */
  untilSlot: number
  /** A companion (a chat partner, a sparring mate). */
  with?: HeroId
  /** Work that could not proceed (the smith has no materials). */
  stalled?: boolean
}

export interface HeroLife {
  needs: Needs
  job: JobId | null
  /** Work slots banked per job (the job's skill). */
  jobXp: Partial<Record<JobId, number>>
  doing: HeroActivity
  memories: Memory[]
  /** 0..100; a friend's death. Drives mourning, fades with time. */
  grief: number
  /** World-day the hero arrived in the waiting room. */
  arrivedDay: number
  /** Deepest floor the hero has fought on. */
  bestFloor: number
}

/** A pair of heroes' history ("a|b", ids sorted). */
export interface Relation {
  affinity: number
  /** Floors fought side by side. */
  shared: number
}

export type ChronicleKind =
  | 'friends'
  | 'closeFriends'
  | 'rivals'
  | 'grudge'
  | 'argument'
  | 'forged'
  | 'masterwork'
  | 'jobTier'
  | 'death'
  | 'mourning'
  | 'research'
  | 'stalled'
  | 'arrival'

export interface ChronicleEntry {
  /** World-time ms. */
  at: number
  kind: ChronicleKind
  heroIds: HeroId[]
  floor?: number
  detail?: string
}

export type DeathCause = 'battle' | 'synthesis' | 'captor'

/** A grave in the Memorial. */
export interface FallenRecord {
  heroId: HeroId
  name: string
  star: Star
  level: number
  heroClass: HeroClass | null
  element: Element
  portraitToken: string
  cause: DeathCause
  floor: number
  /** World-day of death. */
  day: number
  daysServed: number
  bestFloor: number
  /** Ids of the friends left behind (affinity ≥ friend threshold at death). */
  mourners: HeroId[]
}

/** Running totals since the Master last read Isel's letter. */
export interface LifeTally {
  jobGold: number
  meals: number
  forged: number
  trainXp: number
  research: number
  healed: number
}

export type ForgeOrder = EquipmentSlot | 'auto'

export interface LifeState {
  /** Last absolute life slot simulated. */
  slot: number
  relations: Record<string, Relation>
  chronicle: ChronicleEntry[]
  memorial: FallenRecord[]
  /** Prepared meals waiting in the kitchen. */
  pantry: number
  forge: {
    order: ForgeOrder | null
    /** The item being worked (grade + slot paid for), with work points done. */
    wip: { slot: EquipmentSlot; grade: EquipmentGrade; progress: number } | null
  }
  /** Scholars' study of the current floor. */
  research: { floor: number; points: number }
  /** Guards on duty in the latest slot (feeds invasion defense). */
  guardPower: number
  tally: LifeTally
  /** World-time the Master last read the letter. */
  letterReadAt: number
  /** Onboarding: the free tutorial 10-pull, and the first-steps checklist done so far. */
  guide: { tutorialPull: boolean; done: string[] }
  /** Advanced pulls taken today (the crystal's charge), and which world-day. */
  crystal: { day: number; advancedPulls: number }
}

/** Where a captured hero is held and what it costs to get them back. */
export interface CaptiveHold {
  master: string
  rivalId: string
  ransomGold: number
  ransomGems: number
  /** At this world-time the captor synthesizes the hero (permadeath). */
  deadlineWorld: number
}

/** An enemy Master's hero we took in a raid (a ghost, not an OwnedHero). */
export interface Captive {
  id: string
  name: string
  star: Star
  level: number
  element: Element
  growthGrades: GrowthGrades
  fromMaster: string
  /** What its Master will pay to get it back. */
  ransomGold: number
  ransomGems: number
}

/** One line of the invasion log ("while you were away…"). */
export interface InvasionRecord {
  worldDay: number
  direction: 'in' | 'out'
  rival: string
  won: boolean
  goldDelta: number
  note: string
}

/** Everything PvP and social (Layer 4; schema v9). */
export interface PvpState {
  /** The preset defense roster (length 5); empty slots fall back to the party. */
  defense: (HeroId | null)[]
  /** No invasion can land before this world-time (anti-grief). */
  shieldUntil: number
  /** The last world-day an incoming invasion was rolled. */
  lastInvasionDay: number
  /** Sector rating (ELO-ish). */
  rating: number
  log: InvasionRecord[]
  captives: Captive[]
  /** Rival ids raided this world-week (one raid each per week). */
  raided: string[]
  raidWeek: number
  guild: string | null
  guildAidDay: number
  guildRaidWeek: number
  warWeek: number
  war: { wins: number; losses: number }
}

/** A Training Center drill: refine an owned skill, or learn a trainable one. */
export interface TrainingDrill {
  skillId: string
  mode: 'refine' | 'learn'
  completesAtWorld: number
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
  /** Persistent per-account position (the F36–40 loop is the one rollback). Starts at 1. */
  currentFloor: number
  /** Highest floor cleared at least once; firstClear = (floor > highestCleared). */
  highestCleared: number
  /** Per-floor retry counter for the CURRENT floor; folded into the combat seed
   *  so each wipe-retry is independently reproducible. Reset to 0 on advance. */
  attemptIndex: number
  /** An open event floor (bonus / recovery / tournament); the climb waits on it (schema v7). */
  event: TowerEvent | null
  /** The F36–40 looped mission, while inside it. */
  loop: LoopState | null
  /** Hidden objectives found so far (sorted ids). */
  hiddenFound: string[]
  /** F90 has been cleared: the world is gone (Layer 2 §1.3). */
  worldEnded: boolean
  /** F90 was cleared by subverting the win condition: the world was spared (Layer 4 §5.3). */
  worldSaved: boolean
}

/** The looped mission (canon F36–40: 5 attempts; failing F40 drops the room to F31). */
export interface LoopState {
  attemptsLeft: number
  /** Times the attempts ran out; each hardens F36–40. */
  scars: number
}

export type TowerEventKind = 'bonus' | 'recovery' | 'tournament'

/** An event floor between regular floors (Layer 2 §5.1). `floor` = the floor it follows. */
export interface TowerEvent {
  kind: TowerEventKind
  floor: number
  options: string[]
}

/** Hidden objective condition (Layer 2 §5.3). */
export type HiddenCondition =
  | { kind: 'defeat'; targetTag: string }
  | { kind: 'flawless' }
  | { kind: 'swift'; ticks: number }
  | { kind: 'escortHp'; targetTag: string; pct: number }

export interface HiddenObjective {
  id: string
  floor: number
  name: string
  /** Shown to a Master with the half-Master sight (see TUNING). */
  hint: string
  condition: HiddenCondition
  reward: { gems?: number; gold?: number; materials?: Record<MaterialId, number> }
  /** A line of the world's truth (foreshadows F90). */
  lore: string
}

export interface GachaState {
  /** Consecutive pulls that have not yet hit the pool's pity-guarantee star. */
  pity: number
  /** Monotonic total Normal pulls; doubles as the gacha sub-stream index. */
  pullCount: number
  /** Advanced pool: consecutive pulls without a 4★+ (schema v6). */
  advPity4: number
  /** Advanced pool: consecutive pulls without a 5★. */
  advPity5: number
  /** Monotonic total Advanced pulls; the `gacha-adv` sub-stream index. */
  advPullCount: number
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
  /** Probability Interference — passive, account-wide, never spent (Layer 3 §D1; schema v8). */
  pi: number
  /** Daily login streak (FOMO: a missed world-day resets it). */
  login: { lastDay: number; streak: number }
  /** Monthly package: days of the daily claim left, and the last day claimed. */
  monthly: { daysLeft: number; lastClaimDay: number } | null
  /** Simulated real-money wallet — NO real payment ever happens. */
  wallet: { spentUsd: number; purchases: Record<string, number> }
  /** The Master's minigame skills (auto-resolve performance), 0..1. */
  skill: { blacksmith: number; ballista: number }
  /** The Crack of Time and Space is open (ML20+). */
  crackOpen: boolean
  /** Hidden objectives revealed by an intervention (ids). */
  revealedHidden: string[]
  /** Floors whose weakness an intervention revealed. */
  peekedFloors: number[]
  /** Nudge probability: the next Normal summon rolls its star twice. */
  nudge: boolean
  /** World-time PI fell below 1 (the waiting room starts to grey); null while alive. */
  piZeroSince: number | null
  /** Six months at zero: the account is deleted (canon grey towers). */
  deleted: boolean
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
  /** Every equipment item the account owns (equipped or free). Layer 1 §5. */
  inventory: EquipmentItem[]
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
  /** PvP and social (Layer 4; schema v9). */
  pvp: PvpState
  /** Quanton Life: the living lobby (schema v10). */
  life: LifeState
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

/** What a `guard` reduction applies to: everything, ranged attackers (archer/mage), or one element. */
export type GuardSource = 'ranged' | Element

/** Enemy families for `bane` (Dragon Slayer etc.). */
export type EnemyFamily = 'dragon' | 'undead' | 'beast' | 'humanoid' | 'construct' | 'aquatic' | 'demon' | 'fragment'

/** Conditional-effect keywords as data (Layer 0 §2.6). None of them draws RNG. */
export type KeywordTag =
  /** Takes no damage of this type. */
  | { kind: 'immune'; damageType: DamageType }
  /** Takes ×(1 − reduction) damage of this type (a softer immune: slow, but never a hard lock). */
  | { kind: 'resist'; damageType: DamageType; reduction: number }
  /** Takes ×vulnerableMult damage from this element. */
  | { kind: 'vulnerable'; element: Element }
  | { kind: 'phased' } // untargetable until all non-phased enemies in the wave are down
  | { kind: 'enrage'; afterTick: number; multiplier: number }
  /** An overwhelming presence to outlast, not kill: never shields a phased wavemate, is not
   *  needed to clear its wave, and heroes only target it when nothing else is left. */
  | { kind: 'looming' }
  /** Negates the first `charges` hits taken (True Black Dragon's Blood). */
  | { kind: 'aegis'; charges: number }
  /** Deals ×multiplier while own HP is below `belowHpPct`% (Beast King's Heir). */
  | { kind: 'frenzy'; belowHpPct: number; multiplier: number }
  /** The unit's first action deals ×multiplier (Sword Saint's Mark). */
  | { kind: 'opener'; multiplier: number }
  /** Heals `fraction` of damage dealt (Blood Pact). */
  | { kind: 'lifesteal'; fraction: number }
  /** Deals ×multiplier against an enemy family (Dragon Slayer). */
  | { kind: 'bane'; family: EnemyFamily; multiplier: number }
  /** Takes ×(1 − reduction) damage, optionally only from one source. */
  | { kind: 'guard'; reduction: number; vs?: GuardSource }

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
  /** A Wary hero ignores the Master's focus directive (Layer 3 §C1). */
  defiant?: boolean
  /** Stable enemy template id for Defeat(target) missions; absent for heroes. */
  targetTag?: string
  /** A mission NPC on the hero side: targetable, never acts, not part of the party. */
  isNpc?: boolean
  /** Enemy family for `bane` keywords; absent for heroes. */
  family?: EnemyFamily
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
  /** Keep the tagged NPC ally alive; if it falls the mission FAILS. */
  | { kind: 'protect'; targetTag: string }
  /** Cover `distance` steps: every hero action moves the party one step (escape/delivery). */
  | { kind: 'reach'; distance: number }
  /** Take the item the tagged carrier holds (met when the carrier falls). */
  | { kind: 'acquire'; targetTag: string }

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
  /** Tactical Center concentrate-fire bonus: extra damage fraction vs the focused
   *  enemy (e.g. 0.06 = +6%). Absent/0 = no bonus. */
  focusBonus?: number
  /** Decides permadeath policy; combat only flags it. */
  encounterContext: 'tower'
  /** Hero-side NPCs fielded by the mission (escort targets). Never act; not the party. */
  allies?: CombatUnit[]
  /** Label for the log/UI (defaults to 'tower'); combat only flags, never kills. */
  label?: string
  /** The Master's mid-battle orders, each applied at the start of its tick. Combat is
   *  deterministic, so re-resolving with an order replays the fight exactly up to it. */
  orders?: BattleOrder[]
}

/** A mid-battle order (Living Lobby spec §6). */
export type BattleOrder =
  /** Pull the party out: the fight ends, survivors live, nothing is won. */
  | { tick: number; kind: 'retreat' }
  /** Every hero attacks this enemy while it lives. */
  | { tick: number; kind: 'focus'; enemyId: string }
  /** Enemies avoid this hero while anyone else stands. */
  | { tick: number; kind: 'protect'; allyId: string }

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
  /** Present (true) for mission NPC allies. */
  isNpc?: boolean
}

/** `failed` = the mission was lost without a wipe (e.g. the escort target fell). */
export type CombatOutcome = 'win' | 'wipe' | 'timeout' | 'failed' | 'retreat'

export type CombatEvent = { seq: number; tick: number } & (
  | { kind: 'battle-start'; heroIds: string[]; enemyIds: string[] }
  | { kind: 'wave-spawn'; wave: number; enemyIds: string[] }
  | { kind: 'act'; actorId: string; skillId: string; targetId: string }
  | { kind: 'hit'; actorId: string; targetId: string; amount: number; crit: boolean; hpAfter: number }
  | { kind: 'miss'; actorId: string; targetId: string }
  /** An HP-cost ultimate drained its caster (never lethal: casts are gated on HP). */
  | { kind: 'hp-cost'; unitId: string; amount: number; hpAfter: number }
  /** A low-Sanity hero panicked and lost its turn (Layer 3 §3.2). */
  | { kind: 'panic'; unitId: string }
  /** An aegis charge absorbed a hit (no damage). */
  | { kind: 'guard'; actorId: string; targetId: string }
  /** A unit recovered HP (lifesteal). */
  | { kind: 'heal'; unitId: string; amount: number; hpAfter: number }
  | { kind: 'death'; unitId: string }
  | { kind: 'mission'; note: string }
  /** The Master gave an order (mid-battle). */
  | { kind: 'order'; order: BattleOrder }
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
  /** Reach progress covered (steps); 0 when the mission has no reach objective. */
  reachProgress: number
  /** Final HP of each NPC ally by targetTag (for escort hidden objectives). */
  allyHpPct: Record<string, number>
  survivorHeroIds: HeroId[]
  fallenHeroIds: HeroId[]
  /** Authored-skill casts per hero (heroId → skillId → count). Basic attacks and
   *  enemies are not tallied. Feeds the post-combat auto-learn fold. */
  skillCasts: Record<string, Record<string, number>>
  log: CombatLog
}

/** A skill milestone reached in the post-combat fold (for the results screen). */
export type SkillProgress =
  | { kind: 'level-up'; heroId: HeroId; skillId: string; level: number }
  | { kind: 'merge'; heroId: HeroId; skillId: string; from: readonly [string, string] }
  /** A conditional skill unlocked (level/floor threshold). */
  | { kind: 'unlock'; heroId: HeroId; skillId: string }
  /** An achievement skill was earned in this battle. */
  | { kind: 'achievement'; heroId: HeroId; skillId: string }

// ── Floor resolution (tower → account) ───────────────────────────────────────

export interface FloorResult {
  floor: number
  cleared: boolean
  firstClear: boolean
  goldAwarded: number
  xpAwarded: number
  /** Materials the clear dropped this attempt (empty on a wipe). */
  materialsAwarded: Record<MaterialId, number>
  fallenHeroIds: HeroId[]
  /** Skill level-ups and merges earned by the survivors this attempt. */
  skillProgress: SkillProgress[]
  /** Hidden objectives found on this attempt (ids). */
  hiddenFound: string[]
  /** An event floor this attempt opened (bonus / recovery / tournament), if any. */
  event: TowerEvent | null
  /** The F40 loop gate failed and sent the tower back to F31. */
  loopRollback: boolean
  /** This attempt cleared F90: the world ends. */
  worldEnded: boolean
  /** Heroes who refused to deploy (Wary and broken — Layer 3 rebellion). */
  refusedHeroIds: HeroId[]
  /** F90 was cleared by subversion: the world was saved. */
  worldSaved: boolean
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
  /** Authored engraving (4★+ cameos). */
  engraving?: HeroEngraving
}

/** Enemy archetype. tower derives a statline as attrMult[attr] × level, then
 *  runs it through the same deriveStats the heroes use. */
export interface EnemyTemplate {
  id: string
  name: string
  element: Element
  attrMult: PrimaryAttrs
  keywords?: KeywordTag[]
  /** Targeting profile (Layer 0 class rules): e.g. 'archer' strikes the lowest-HP foe. */
  unitClass?: HeroClass | null
  /** Family for `bane` keywords (e.g. Halgiraf is a dragon). */
  family?: EnemyFamily
}

/** A hero-side NPC an anchor fields (e.g. the F15 escort target). */
export interface AnchorAllySpec {
  templateId: string
  line: Line
  /** Protect(target) objective subject. */
  targetTag: string
  levelBonus?: number
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

/** Authored set-piece floor (every 5th). tower builds an Encounter from it. */
export interface AnchorDef {
  floor: number
  missionType: string
  objectives: Objective[]
  timer: number | null
  waves: AnchorWaveSpec[][]
  /** Hero-side NPCs (e.g. the F15 escort target). */
  allies?: AnchorAllySpec[]
  /** Materials granted on the FIRST clear only (e.g. F20's Book of Reverse Heaven). */
  firstClearDrops?: Record<MaterialId, number>
  /** A mission minigame the Master can play before the fight (Layer 3 §C2). */
  minigame?: 'ballista'
}

export type SkillRegistry = Record<string, SkillDef>

// ─────────────────────────────────────────────────────────────────────────────
// Persistence + store command surface
// ─────────────────────────────────────────────────────────────────────────────

export interface StoragePort {
  read(key: string): string | null
  write(key: string, value: string): void
  clear(key: string): void
}

export type SummonPool = 'normal' | 'advanced'

export type InterventionId = 'reveal' | 'peek' | 'nudge' | 'guarantee'

/** A player-chosen Salvage rescue. */
export type RescueChoice = { kind: 'skill'; skillId: string } | { kind: 'grade'; attr: AttrKey }

export type Command =
  | { type: 'NEW_ACCOUNT'; seed: number; now?: number }
  /** Mobius Summon: Normal (gold) or Advanced (gems); a 10-pull is discounted on Advanced. */
  | { type: 'SUMMON'; pool?: SummonPool; count?: 1 | 10 }
  | { type: 'SET_PARTY'; slots: (HeroId | null)[]; lines: Line[] }
  | { type: 'ATTEMPT_FLOOR'; focus?: FocusDirective; ballista?: number; subvert?: boolean; orders?: BattleOrder[] }
  /** Explicit world-time catch-up; advances the clock with no other state change. */
  | { type: 'TICK' }
  /** Kitchen Banquet: spend gold to restore Sanity across the living roster. */
  | { type: 'BANQUET' }
  /** Start a promotion for an at-cap hero: pay materials, begin the world-time timer. */
  | { type: 'PROMOTE_HERO'; heroId: HeroId }
  /** Start a facility upgrade: pay gold, begin the world-time build timer. */
  | { type: 'UPGRADE_FACILITY'; facility: FacilityId }
  /** Gem pay-to-skip a running timer. `'promotion'`/`'training'` → HeroId; `'facility'` → FacilityId. */
  | { type: 'SKIP_TIMER'; kind: 'facility' | 'promotion' | 'training'; id: string }
  /** Training Center: start a drill that refines an owned skill or learns a trainable one. */
  | { type: 'TRAIN_SKILL'; heroId: HeroId; skillId: string }
  /** Run today's Daily Dungeon (seeded combat; free attempts then gem-paid). */
  | { type: 'ATTEMPT_DAILY' }
  /** Synthesis (Layer 1 §4): destroy heroes to transfer traits or render materials. */
  | {
      type: 'SYNTHESIZE'
      mode: 'transfer' | 'salvage'
      survivorId: HeroId | null
      sacrificeIds: HeroId[]
      /** Salvage: what to rescue onto the survivor; omitted = the automatic rule. */
      rescue?: RescueChoice
    }
  /** Transfer Station: move a skill from one living hero to another. */
  | { type: 'TRANSFER_SKILL'; donorId: HeroId; recipientId: HeroId; skillId: string }
  /** Transfer Station: fuse a merge early, or run a manual-only evolution, producing `result`. */
  | { type: 'FUSE_SKILL'; heroId: HeroId; result: string }
  /** Resolve the open event floor with one of its options. */
  | { type: 'RESOLVE_EVENT'; option: string }
  /** Give a hero a gift (Layer 3 §C1). */
  | { type: 'GIVE_GIFT'; heroId: HeroId; giftId: string }
  /** Spend a Devoted+ hero's Intervention Points. */
  | { type: 'INTERVENE'; heroId: HeroId; action: InterventionId }
  /** Blacksmithing: try to raise an item's grade (performance 0..1 from the minigame; omitted = auto). */
  | { type: 'UPGRADE_EQUIPMENT'; itemId: EquipmentId; performance?: number }
  /** Simulated purchase of a gem package (no real money). */
  | { type: 'BUY_PACKAGE'; packageId: string }
  | { type: 'CLAIM_LOGIN' }
  | { type: 'CLAIM_MONTHLY' }
  /** Open the Crack of Time and Space (ML20). */
  | { type: 'OPEN_CRACK' }
  /** Send 1–3 heroes on a Ruins expedition through the rift. */
  | { type: 'DISPATCH_RUINS'; heroIds: HeroId[] }
  /** PvP (Layer 4): the preset defense roster. */
  | { type: 'SET_DEFENSE'; slots: (HeroId | null)[] }
  | { type: 'RAID_RIVAL'; rivalId: string }
  | { type: 'RANSOM_HERO'; heroId: HeroId }
  | { type: 'COUNTER_RAID'; heroId: HeroId }
  | { type: 'RELEASE_CAPTIVE'; captiveId: string }
  | { type: 'SYNTHESIZE_CAPTIVE'; captiveId: string; survivorId: HeroId }
  | { type: 'JOIN_GUILD'; guildId: string }
  | { type: 'LEAVE_GUILD' }
  | { type: 'CLAIM_GUILD_AID' }
  | { type: 'GUILD_RAID' }
  | { type: 'SERVER_WAR' }
  /** Equipment (Layer 1 §5): forge a graded item for a slot at the Smithy. */
  | { type: 'CRAFT_EQUIPMENT'; slot: EquipmentSlot }
  /** Equipment: equip an owned item onto a hero's matching slot. */
  | { type: 'EQUIP_ITEM'; heroId: HeroId; itemId: EquipmentId }
  /** Equipment: clear a hero's slot (the item returns to free inventory). */
  | { type: 'UNEQUIP_ITEM'; heroId: HeroId; slot: EquipmentSlot }
  /** Quanton Life: give a hero a building job (null = relieve them). */
  | { type: 'ASSIGN_JOB'; heroId: HeroId; job: JobId | null }
  /** Quanton Life: what the smiths at the Forge work on (null = stand the forge down). */
  | { type: 'SET_FORGE_ORDER'; order: ForgeOrder | null }
  /** Quanton Life: the Master has read Isel's letter (the tally resets). */
  | { type: 'READ_LETTER' }
  /** Testing-only: grant free gold. Not part of the real economy. */
  | { type: 'ADD_GOLD'; amount: number }
