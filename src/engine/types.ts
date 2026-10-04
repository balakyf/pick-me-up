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

/**
 * Who a skill strikes or tends (lane F adds the support and formation shapes):
 * one foe (the class rule picks), every foe, the caster, the caster's most wounded ally,
 * the ally the foes are lined up on (a shield's mark), the caster's whole side, every foe
 * on the front-most line, or one foe and its neighbour.
 */
export type SkillTarget = 'single' | 'all-enemies' | 'self' | 'ally-lowest' | 'ally-threatened' | 'all-allies' | 'front-row' | 'cleave'

/** A stat a buff or debuff bends for a while: attack (both kinds), defence (both kinds),
 *  speed, crit chance (in points), or `guard` — damage taken (up = takes less; down = a
 *  Mark: takes more). */
export type BuffStat = 'atk' | 'def' | 'spd' | 'crit' | 'guard'

/** Damage over time: a bleeding cut, a poison, a burn. */
export type DotKind = 'bleed' | 'poison' | 'burn'

/** A status a unit can carry in battle (what the replay's icons show). */
export type StatusKey = 'taunt' | 'shield' | 'regen' | 'stun' | DotKind | `${BuffStat}-up` | `${BuffStat}-down`

/** Who a skill's effect lands on: the skill's own targets (default), the caster, the
 *  caster's whole side, or the caster's most wounded ally. */
export type EffectTo = 'targets' | 'self' | 'allies' | 'ally-lowest'

/**
 * One thing a skill does besides (or instead of) its blow (lane F). Magnitudes are integer
 * percents that grow by `perLevel` per skill level above 1. Durations are in the caster's
 * own turns (resolved to ticks at the cast from the caster's speed), so a slow tank's
 * taunt and a quick thief's bleed each last about as many of their own actions.
 * `chance` (percent, foes only) is rolled on the battle's Rng only when 0 < chance < 100,
 * and the target's statusRes shaves it.
 */
export type SkillEffectDef =
  /** Restore HP now: `pct` of the caster's mAtk, or of the recipient's max HP. */
  | { kind: 'heal'; from: 'mAtk' | 'maxHP'; pct: number; perLevel?: number; to?: EffectTo }
  /** Restore HP each turn for `turns` turns (a heal over time). */
  | { kind: 'regen'; from: 'mAtk' | 'maxHP'; pct: number; perLevel?: number; turns: number; to?: EffectTo }
  /** An absorb pool (of the caster's mAtk, the recipient's max HP, or the caster's pDef)
   *  that soaks damage before HP, for `turns` turns. */
  | { kind: 'shield'; from: 'mAtk' | 'maxHP' | 'def'; pct: number; perLevel?: number; turns: number; to?: EffectTo }
  /** Raise a stat by `pct`% (crit: by `pct` points) for `turns` turns. */
  | { kind: 'buff'; stat: BuffStat; pct: number; perLevel?: number; turns: number; to?: EffectTo }
  /** Lower a stat by `pct`% (guard: the target takes `pct`% more) for `turns` turns. */
  | { kind: 'debuff'; stat: BuffStat; pct: number; perLevel?: number; turns: number; chance?: number; to?: EffectTo }
  /** Damage each turn for `turns` turns: `pct` of the caster's attack, or of the recipient's
   *  max HP. `dot: 'element'` picks by the caster's element (fire/light burn, earth/water/dark
   *  poison, others bleed). */
  | { kind: 'dot'; dot: DotKind | 'element'; from: 'atk' | 'maxHP'; pct: number; perLevel?: number; turns: number; chance?: number; to?: EffectTo }
  /** Push the target's action gauge back by `push`% of a turn (it stays dazed until it acts). */
  | { kind: 'stun'; push: number; chance?: number; perLevel?: number; to?: EffectTo }
  /** Foes must strike the recipient (single-target blows) for `turns` turns. */
  | { kind: 'taunt'; turns: number; to?: EffectTo }
  /** Give (`amount` > 0) or drain (`amount` < 0) SP. */
  | { kind: 'sp'; amount: number; perLevel?: number; to?: EffectTo }
  /** Call forth up to `count` units of the encounter's reserve `group` (an enemy's brood,
   *  its guard, the void it speaks to) onto the caster's side of the field (lane G). */
  | { kind: 'summon'; group: string; count: number; to?: EffectTo }

/** A skill effect at its level: magnitudes leveled, `perLevel` gone. */
export type ResolvedEffect = SkillEffectDef extends infer E ? (E extends unknown ? Omit<E, 'perLevel'> : never) : never

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
  /** Strikes this many times, `skillMult` each (each hit rolls and logs on its own). Absent = 1. */
  hits?: number
  /** What the skill does besides its blow (heals, shields, statuses…). Absent = a plain blow. */
  effects?: ResolvedEffect[]
  /** The caster's own turns before it can cast this again (lane G: a boss's rhythm). Absent = none. */
  cooldown?: number
  /** A big move it winds up first (lane G): see SkillCharge. Absent = cast at once. */
  charge?: SkillCharge
}

/**
 * A charged move (lane G): the caster spends its turn winding up (a 'telegraph' event names
 * the move, when it fires and whom it threatens), its gauge stops, and the move fires at
 * that tick on its own. A stun or the caster's death cancels it; the Master's Guard and
 * Protect soften it; a retreat escapes it.
 */
export interface SkillCharge {
  /** The caster's own turns (at its speed when it winds up) until the move fires. */
  turns: number
  /** What the replay says as it winds up ('{name} draws a deep breath…'), in English. */
  line?: string
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
  /** Strikes this many times at `baseMult` (+ perLevel) each. Absent = 1. */
  hits?: number
  /** What the skill does besides its blow (lane F). A support skill has baseMult 0. */
  effects?: SkillEffectDef[]
  /** An enemy's skill (a priest's prayer, a knight's shield wall): never a hero's. */
  enemy?: boolean
  /** The caster's own turns before it can cast this again (lane G). */
  cooldown?: number
  /** Wound up a turn ahead and telegraphed (lane G): see SkillCharge. */
  charge?: SkillCharge
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
  /** Only heroes of these classes learn it (absent = every class). */
  classes?: readonly HeroClass[]
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
  /** In-progress promotion timer; null when not promoting (Phase 4). The Master's choices at
   *  the ceremony (lane J) ride along: the class a classless hero takes up and the skill it
   *  learns (absent = the chamber chooses, as before). */
  promotion: { completesAtWorld: number; heroClass?: HeroClass; skillId?: string } | null
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
  gift: {
    last: string | null
    streak: number
    /** The latest gifts, oldest first (at most TUNING.favor.repeatWindow): repeats are
     *  counted here, so alternating two gifts no longer resets the decay. Absent on older
     *  saves (read through favor.recentGifts). */
    recent?: string[]
  }
  /** Whale-bait inflation: the star the summon SHOWED (engine always uses `star`). */
  displayStar?: Star
  /** Guarantee an action: the next tower battle's first strike lands ×2. */
  blessed: boolean
  /** Away on a Ruins expedition until this world-time; null when home. */
  expedition: { completesAtWorld: number } | null
  /** Kidnapped by a raiding Master (Layer 4 §2): held until ransomed, rescued or synthesized. */
  captiveOf: CaptiveHold | null
  /** The bond group this hero was summoned into (schema v11), or null. */
  bondGroup: string | null
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
  // The estate (WS6b): duels, statues, bounties, trauma
  | 'duel'
  | 'statue'
  | 'bounty'
  | 'comforted'
  | 'burnout'
  | 'selfTaught'
  // Lane L (morale, grief, incidents)
  | 'guilt'
  | 'consoled'
  | 'anniversary'
  | 'incident'

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
  /** Self-practice in the yard: the skill the hero is working on and the progress banked. */
  practice?: { skillId: string; points: number }
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
  // The estate (WS6b)
  | 'statue'
  | 'withdrawn'
  | 'recovered'
  | 'burnout'
  | 'duel'
  | 'bounty'
  | 'jealous'
  | 'selfTaught'
  // Lane L: a rival's guilt, a friend's comfort, a week since a grave, a camp incident
  | 'guilt'
  | 'consoled'
  | 'anniversary'
  | 'incident'

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
  /** What they carried at the end (the gear went back to the armory, so their blade can
   *  be passed on). Absent on older graves and for heroes who carried nothing. */
  carried?: { slot: EquipmentSlot; itemId: EquipmentId; name: string; grade: EquipmentGrade }[]
}

/** Running totals since the Master last read Isel's letter. */
export interface LifeTally {
  jobGold: number
  meals: number
  forged: number
  trainXp: number
  research: number
  healed: number
  /** Skill levels and new skills heroes gained by practising on their own. */
  selfTaught?: number
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
  /** The crystal's charge: Advanced pulls not yet recharged, as of world-day `day` (the last pull). */
  crystal: { day: number; advancedPulls: number }
  /** Camp incidents waiting on the Master's word (lane L). Absent on older saves — read
   *  through life/incidents.incidentsOf(). */
  incidents?: CampIncident[]
}

/** Small things that happen in the camp (lane L): some wait on the Master's word. */
export type IncidentKind = 'brawl' | 'sworn' | 'nightTraining' | 'kitchenFire' | 'homesick' | 'trait'

/** An incident waiting on the Master: intervene, or let it be (it settles itself at `untilSlot`). */
export interface CampIncident {
  /** `i<slot>` — at most one incident is born per life slot. */
  id: string
  kind: IncidentKind
  heroIds: HeroId[]
  /** World-time it began. */
  at: number
  /** The life slot at which it settles itself ('let it be'). */
  untilSlot: number
  /** Free detail (a place). */
  detail?: string
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
  /** Event floors waiting behind the open one (B19: a heavy-loss first clear of F41 opens
   *  the recovery first, then the tournament — neither is lost). Absent = none. */
  eventQueue?: TowerEvent[]
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
  /** World-day of the last Kitchen Banquet (absent = never held). */
  banquetDay?: number
}

export interface DailiesState {
  attemptsUsed: number
  /** World-day index of the last reset (floor(worldMs / worldDayMs)). */
  lastResetWorldDay: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema v11: the Enemy Codex, tower challenges, the estate
// ─────────────────────────────────────────────────────────────────────────────

/** What the Master has learned about one enemy template. */
export interface CodexEntry {
  /** Times this enemy template was met in battle. */
  seen: number
  /** Times it was felled. */
  defeated: number
  /** Its resistances, immunities and weak element are known. */
  studied: boolean
  /** Distinct floors it was met on (sorted, capped — see engine/codex). */
  floors: number[]
}

export interface CodexState {
  /** Keyed by enemy template id. */
  entries: Record<string, CodexEntry>
}

/** Heroes summoned already bound to one another (canon 인연: a band, twins…). */
export interface BondGroup {
  id: string
  /** The English display name ("the Gale Band"); `adj` + `noun` let the UI translate it. */
  name: string
  members: HeroId[]
  /** Name parts: "the {adj} {noun}" (size 3+), or "the Twin {noun}" for a pair (adj 'Twin'). */
  adj?: string
  noun?: string
}

/** The optional side rooms that can open after an anchor's first clear (tower challenges). */
export type BonusRoomKind = 'vault' | 'shrine' | 'lostHero' | 'merchant' | 'training' | 'mimic'

/** An open side room: it waits (optional) until taken, left, or the next anchor replaces it. */
export interface BonusRoom {
  kind: BonusRoomKind
  /** The anchor floor it follows. */
  floor: number
  /** Merchant wares already bought. */
  bought: string[]
}

/** One raid boss's record (the reward chest pays once per world-week). */
export interface RaidRecord {
  clears: number
  attempts: number
  lastClearWeek: number
}

export interface ChallengeState {
  bondGroups: Record<string, BondGroup>
  /** The weekly trial: which week it is, attempts spent, the Master's best result, and how
   *  many of the week's score thresholds have paid out. */
  weekly: { week: number; attempts: number; best: number; claimed: number }
  /** The side room waiting on the Tower screen, if any. */
  room: BonusRoom | null
  /** The Cursed Shrine's buff: +pct stats for the party on `floor` (its next tower attempt). */
  blessing: { floor: number; pct: number } | null
  /** Raid records keyed by anchor floor. */
  raids: Record<string, RaidRecord>
}

export interface EstateState {
  /** Fallen heroes honoured with a statue in the Memorial. */
  statues: HeroId[]
  /** Decoration id → level. */
  decor: Record<string, number>
  /** Bounties under way (bench heroes out on a gold-funded job). */
  bounties: Bounty[]
  /** The latest finished bounties, newest first (what they brought back). */
  bountyLog: BountyReport[]
  /** Next bounty id. */
  bountySeq: number
  /** Per-hero trauma: fatigue, burnout, withdrawal (living heroes only). */
  trauma: Record<HeroId, HeroTrauma>
  /** The Master's attention (talks, gifts, deployments) over a rolling window. */
  attention: AttentionMark[]
  /** Who feels neglected, and whom they envy (recomputed each world-day). */
  jealous: Record<HeroId, HeroId>
  /** Tryout duels: how many today (world-day `day`) and ever, and the latest. */
  duels: { day: number; today: number; total: number; last: DuelRecord | null }
  /** World-time the estate last caught up (fatigue recovery, daily checks). */
  clock: number
}

/** A gold-funded job bench heroes take for a while (a gold → materials conversion). */
export interface Bounty {
  id: number
  kind: string
  heroIds: HeroId[]
  postedAt: number
  endsAt: number
}

/** What a finished bounty brought back. */
export interface BountyReport {
  id: number
  kind: string
  heroIds: HeroId[]
  endedAt: number
  materials: Record<MaterialId, number>
  xp: number
  item: string | null
}

export interface HeroTrauma {
  /** Floors fought without rest, as of `foughtAt` (recovers one per world-hour after). */
  fatigue: number
  /** World-time of the last floor fought. */
  foughtAt: number
  /** Burnt out: refuses deployment until this world-time (null = fine). */
  burnoutUntil: number | null
  /** Has burnt out before — a veteran who teaches well (canon Roderick). */
  veteran: boolean
  /** Withdrawn from the others until comforted (null = not). */
  withdrawn: { since: number; cause: HeroId | null; comfort: number; lastTalkDay: number } | null
  /** When Sanity first sank below the despair line (null = above it). */
  lowSince: number | null
}

export interface AttentionMark {
  /** World-day index. */
  day: number
  heroId: HeroId
  weight: number
}

export interface DuelRecord {
  a: HeroId
  b: HeroId
  /** The winner, or null for a draw. */
  winner: HeroId | null
  day: number
  /** How the pair took it: grudging respect, or bitterness. */
  mood: 'respect' | 'bitter' | 'friendly'
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
  /** The Enemy Codex (schema v11). */
  codex: CodexState
  /** Bond groups, event floors, raids and the weekly trial (schema v11). */
  challenge: ChallengeState
  /** Gold sinks once the buildings stand: statues, decorations, bounties (schema v11). */
  estate: EstateState
  /** Lane O: the endgame — the F90 fate, Reliving, the New Cycle and its legends. Optional:
   *  a save without it reads the defaults through `endgameOf` (no schema bump). */
  endgame?: EndgameState
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

/** What a `guard` reduction applies to: everything, ranged attackers (archer/mage), close
 *  combat (everyone else: a dragon in the air), or one element. */
export type GuardSource = 'ranged' | 'melee' | Element

/** Enemy families for `bane` (Dragon Slayer etc.). */
export type EnemyFamily = 'dragon' | 'undead' | 'beast' | 'humanoid' | 'construct' | 'aquatic' | 'demon' | 'fragment'

/** Conditional-effect keywords as data (Layer 0 §2.6). None of them draws RNG. */
export type KeywordTag =
  /** Takes no damage of this type. */
  | { kind: 'immune'; damageType: DamageType }
  /** Takes ×(1 − reduction) damage of this type (a softer immune: slow, but never a hard lock).
   *  With `fromTick`, only from that tick on (a raid ballista broke the scales until then). */
  | { kind: 'resist'; damageType: DamageType; reduction: number; fromTick?: number }
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
  /** A boss phase (lane G): the first time a blow brings it to `atHpPct`% of its max HP, it
   *  changes — new keywords (an `aegis` adds charges), new skills, a speed change, a summoned
   *  reserve group — and the replay plays a short cinematic with its `title` and `line`
   *  (English; the UI translates). A blow never carries it past an unreached threshold. */
  | PhaseKeyword

/** A boss phase (see KeywordTag). */
export interface PhaseKeyword {
  kind: 'phase'
  atHpPct: number
  /** The phase's name on the title card ('Takes flight'). */
  title?: string
  /** What the boss says as it turns. */
  line?: string
  addKeywords?: KeywordTag[]
  /** Skill ids (SKILLS) it fights with from now on, beside its own. */
  skills?: string[]
  /** Speed from now on, as a % of its own (e.g. 25 = a quarter faster). */
  spdPct?: number
  /** A reserve group (Encounter.reserves) it calls onto the field. */
  summonWave?: string
  /** It shakes off what the party left on it (debuffs, DoTs, a daze). */
  cleanse?: boolean
}

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
  /** The enemy template this unit was built from (the Codex key); absent for heroes. */
  templateId?: string
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
  /** Bonds between party members at battle start (friends cover and follow up, rivals compete). */
  bonds?: CombatBond[]
  /** The floor's conditions (Fog, Blood Moon…), from F40 — see engine/depth. */
  modifiers?: FloorModifierId[]
  /** Units held off the field until a boss phase or a summoning skill calls them (lane G):
   *  the Egg's brood, Valention's officers, the echoes Tell calls back. By group. */
  reserves?: Record<string, CombatUnit[]>
}

/** How two party members stand with each other in battle (from Quanton Life affinity). */
export type BondKind = 'friend' | 'closeFriend' | 'rival' | 'grudge'

/** A bond between two hero-side units (unit ids), carried into combat. */
export interface CombatBond {
  a: string
  b: string
  kind: BondKind
  affinity: number
}

/** A floor condition that bends a battle for both sides (combat depth, F40+). */
export type FloorModifierId = 'fog' | 'bloodMoon' | 'holyGround' | 'miasma' | 'gale' | 'frost'

/** A mid-battle order (Living Lobby spec §6; orders 2.0, lane G). */
export type BattleOrder =
  /** Pull the party out: the fight ends, survivors live, nothing is won. */
  | { tick: number; kind: 'retreat' }
  /** Every hero attacks this enemy while it lives (a sweep lands on it at fuller force). */
  | { tick: number; kind: 'focus'; enemyId: string }
  /** Enemies avoid this hero while anyone else stands; a charged blow lands on them softened. */
  | { tick: number; kind: 'protect'; allyId: string }
  /** The hero's gauge fills at once and it casts its best skill now. */
  | { tick: number; kind: 'unleash'; allyId: string }
  /** The party braces: it takes less damage and holds its attacks until the big blow it
   *  braces for has landed (or a turn has passed). `onTelegraph`: a standing order that
   *  raises the guard the moment a foe winds up a big move. */
  | { tick: number; kind: 'guard'; onTelegraph?: boolean }
  /** The party keeps its SP for a sweep over a crowd or a blow on the boss. */
  | { tick: number; kind: 'hold' }
  /** Two heroes trade places (their lines and their order in the line). */
  | { tick: number; kind: 'swap'; a: string; b: string }

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
  /** The enemy template (the Codex key); absent for heroes. */
  templateId?: string
  /** HP at the start of the fight when below max (a raid boss already wounded). */
  startHP?: number
  /** Speed (the action gauge fills by this each tick) — for a turn-order strip. Always
   *  written by runBattle; optional only so logs saved before it still load. */
  spd?: number
  /** Present on mission objective units only: the tag a Defeat / Capture / Protect
   *  objective names (the Black Priest, the jewel's carrier, Priasis). */
  targetTag?: string
}

/** One mission objective as the replay sees it: the objective itself, plus the units
 *  that carry its tag (a Defeat target, a Capture carrier, a Protect escort). */
export type LogObjective = Objective & { unitIds?: string[] }

/** The battle's mission, carried on its log so the replay can show the objective. */
export interface CombatLogMission {
  /** The canon mission label ('Survival', 'Escort', 'Capture'…). */
  type: string
  objectives: LogObjective[]
  /** The tick budget, when the mission has one. */
  timerTicks?: number
  /** Enemy waves in the fight. */
  waves: number
}

/** What a structured 'mission' beat is about (see combat.ts `missionBeat`). */
export type MissionCode =
  /** Wave `wave` of `waves` is cleared. */
  | 'wave-cleared'
  /** A Survival countdown milestone: `pct`% of the time is behind the party, `left` ticks remain. */
  | 'hold'
  /** A mission timer (not a survival) milestone: the deadline approaches. */
  | 'deadline'
  /** Escape progress: `steps` of `distance` covered (`pct`%). */
  | 'escape'
  /** A Capture objective: the carrier `unitId` fell and the prize is taken. */
  | 'taken'
  /** A Defeat objective: `unitId` fell. */
  | 'defeated'
  /** The escort `unitId` dropped below `pct`% HP. */
  | 'escort-low'
  /** A phased unit `unitId` lost its shield (its wave fell). */
  | 'shield-down'
  /** A looming unit `unitId` woke. */
  | 'wakes'
  /** Survival: no foe is left and no wave is coming — the floor is held at once. */
  | 'horde-spent'
  /** Nothing the party holds can hurt the foes left (`unitId` stands in front): it falls back. */
  | 'futile'

/** A mission beat's details (which fields are set depends on the code). */
export interface MissionParams {
  wave?: number
  waves?: number
  pct?: number
  left?: number
  steps?: number
  distance?: number
  unitId?: string
  tag?: string
}

/** `failed` = the mission was lost without a wipe (e.g. the escort target fell). */
export type CombatOutcome = 'win' | 'wipe' | 'timeout' | 'failed' | 'retreat'

/** How a hit met its target's defences (WEAK! / RESIST / IMMUNE on screen). */
export type HitEffect = 'weak' | 'resist' | 'immune'

export type CombatEvent = { seq: number; tick: number } & (
  | { kind: 'battle-start'; heroIds: string[]; enemyIds: string[] }
  | { kind: 'wave-spawn'; wave: number; enemyIds: string[] }
  /** `spAfter`: the actor's SP once the cast is paid (for an SP bar; absent on old logs).
   *  `charged`: a wound-up move firing on its tick (not a turn of its own; lane G), and
   *  `answered`, how the party met it (its Guard was up / a target was Protected). */
  | {
      kind: 'act'
      actorId: string
      skillId: string
      targetId: string
      spAfter?: number
      charged?: true
      answered?: 'guard' | 'protect'
    }
  /** A foe winds up a big move (lane G): it fires at `firesAtTick` unless a stun or its
   *  death cancels it. `targets`: whom it threatens (as it stands now). */
  | { kind: 'telegraph'; unitId: string; skillId: string; firesAtTick: number; targets: string[] }
  /** A wound-up move came to nothing: the caster was stunned, or fell. */
  | { kind: 'telegraph-end'; unitId: string; skillId: string; reason: 'stunned' | 'fell' }
  /** A boss changed phase (lane G): phase `phase` of `phases` (from 1), its title and line
   *  (English), and its new speed when that changed. */
  | { kind: 'phase'; unitId: string; phase: number; phases: number; title?: string; line?: string; spd?: number }
  /** Units called onto the field by `unitId` (a phase or a summoning skill), into `wave`. */
  | { kind: 'summon'; unitId: string; enemyIds: string[]; wave: number }
  /** `eff` says how the blow met its target's defences (absent = plainly): a weakness
   *  (element advantage or a vulnerability), a resistance (element disadvantage or a
   *  resist keyword), or an immunity (the hit did nothing). */
  | { kind: 'hit'; actorId: string; targetId: string; amount: number; crit: boolean; hpAfter: number; eff?: HitEffect }
  | { kind: 'miss'; actorId: string; targetId: string }
  /** An HP-cost ultimate drained its caster (never lethal: casts are gated on HP). */
  | { kind: 'hp-cost'; unitId: string; amount: number; hpAfter: number }
  /** A low-Sanity hero panicked and lost its turn (Layer 3 §3.2). */
  | { kind: 'panic'; unitId: string }
  /** An aegis charge absorbed a hit (no damage). */
  | { kind: 'guard'; actorId: string; targetId: string }
  /** A unit recovered HP: lifesteal (no `sourceId`), or a heal / regeneration from
   *  `sourceId`'s skill (`status: 'regen'` on a heal-over-time pulse). */
  | { kind: 'heal'; unitId: string; amount: number; hpAfter: number; sourceId?: string; status?: 'regen' }
  /** A status took hold of `unitId` (lane F): from `sourceId`, for `ticks` ticks (0 = until
   *  it next acts, a stun). `value`: the % of a buff/debuff (crit: points), the pool of a
   *  shield, the HP per pulse of a DoT or regeneration. `nth`: the n-th unit (from 1) the same
   *  cast reached after the first (a war cry over the party) — absent on the first. */
  | { kind: 'status'; unitId: string; status: StatusKey; sourceId: string; ticks: number; value?: number; nth?: number }
  /** A status wore off (`expired`), broke (a shield emptied), or ended as its bearer acted (a stun). */
  | { kind: 'status-end'; unitId: string; status: StatusKey; reason: 'expired' | 'broken' | 'acted' }
  /** A DoT pulse hurt `unitId` (no crit, no variance, no defence). */
  | { kind: 'dot'; unitId: string; status: DotKind; amount: number; hpAfter: number; sourceId: string }
  /** A shield soaked `absorbed` of a blow (or a DoT) meant for `unitId`; `left` remains. */
  | { kind: 'shield'; unitId: string; actorId: string; absorbed: number; left: number }
  /** A skill gave (`amount` > 0) or drained (< 0) `unitId`'s SP. */
  | { kind: 'sp'; unitId: string; amount: number; spAfter: number; sourceId: string }
  | { kind: 'death'; unitId: string }
  /** A mission beat. `note` is a plain-English line (old replays carry only that);
   *  `code`/`params` say what happened so the replay can caption it in any language. */
  | { kind: 'mission'; note: string; code?: MissionCode; params?: MissionParams }
  /** The Master gave an order (mid-battle). */
  | { kind: 'order'; order: BattleOrder }
  /** A close friend threw themself in front of a killing blow meant for `allyId`. */
  | { kind: 'cover'; unitId: string; allyId: string; actorId: string }
  /** A friend pressed `allyId`'s attack with a strike of their own on the same target. */
  | { kind: 'followup'; unitId: string; allyId: string; targetId: string }
  /** A rival ignored the focus order to chase a kill of their own. */
  | { kind: 'rivalry'; unitId: string; rivalId: string; targetId: string }
  /** The floor's conditions, announced as the battle begins. */
  | { kind: 'floor-mods'; modifiers: FloorModifierId[] }
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
  /** The mission fought (objectives, timer, waves). Absent on logs saved before it. */
  mission?: CombatLogMission
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
  /** Heroes who refused the order (rebellion, burnout or a bounty — the old meaning; kept
   *  for compatibility). `refusals` has every slotted hero who stayed behind, with why. */
  refusedHeroIds: HeroId[]
  /** Every slotted hero who did not fight this attempt, and the true reason (deploy rails). */
  refusals: { heroId: HeroId; reason: DeployReason }[]
  /** F90 was cleared by subversion: the world was saved. */
  worldSaved: boolean
  result: BattleResult
}

/** Why a slotted hero stays behind (see engine/tower/deploy.ts). */
export type DeployReason =
  | 'dead'
  | 'captive'
  | 'expedition'
  | 'promotion'
  | 'training'
  | 'bounty'
  | 'burnout'
  | 'exhausted'
  | 'rebellion'
  /** Morale broken (lane L): grief, despair and fear have taken the fight out of them. */
  | 'disheartened'

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
  /** Presentation only: the level the UI shows instead of the real one (the F10 Lv999 Creature). */
  displayLevel?: number
  /** A caster: its basic attack is a Spell — magic damage from its mAtk against the
   *  target's mDef — instead of a physical Strike. */
  caster?: boolean
  /** Enemy skills (ENEMY_SKILLS ids) it fights with beside its basic attack (lane F: a
   *  priest heals, a shaman poisons, a knight taunts). */
  kit?: readonly string[]
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
  /** Groups held off the field until a boss phase or a summoning skill calls them (lane G). */
  reserves?: Record<string, AnchorWaveSpec[]>
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
  /** Start a promotion for an at-cap hero: pay materials, begin the world-time timer. The
   *  ceremony's choices are optional (lane J): one of `promotionPreview`'s class offers (a
   *  classless hero reaching 3★) and one of its skill offers. */
  | { type: 'PROMOTE_HERO'; heroId: HeroId; heroClass?: HeroClass; skillId?: string }
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
  /** Onboarding: mark a first-steps item the engine cannot see (e.g. talking to a hero). */
  | { type: 'GUIDE_STEP'; step: string }
  /** Testing-only: grant free gold. Not part of the real economy. */
  | { type: 'ADD_GOLD'; amount: number }
  /** Tower challenges: act in the open side room ('leave' closes it). */
  | { type: 'BONUS_ROOM'; choice: string }
  /** Tower challenges: up to three parties raid a cleared anchor's boss (one shared HP pool);
   *  the crew man the ballista instead of fighting. */
  | { type: 'TOWER_RAID'; floor: number; parties: HeroId[][]; crew: HeroId[]; ballista?: number }
  /** Tower challenges: one attempt at this week's Crack of Time trial (a simulation). */
  | { type: 'WEEKLY_TRIAL'; heroIds: HeroId[] }
  /** The estate: raise a decoration one level. */
  | { type: 'BUY_DECOR'; decor: string }
  /** The estate: raise a statue for a fallen hero in the Memorial. */
  | { type: 'RAISE_STATUE'; heroId: HeroId }
  /** The estate: post a bounty on the board and send bench heroes on it. */
  | { type: 'POST_BOUNTY'; bounty: string; heroIds: HeroId[] }
  /** Training Center: pay to redirect a running drill to another skill (keeps its timer). */
  | { type: 'REFOCUS_DRILL'; heroId: HeroId; skillId: string }
  /** Training Yard: host a tryout duel between two heroes. */
  | { type: 'HOST_DUEL'; a: HeroId; b: HeroId }
  /** The Master talked to a hero (attention; comfort for the withdrawn). */
  | { type: 'TALK_TO_HERO'; heroId: HeroId }
  /** Lane L: answer a camp incident — step in, or let it be. */
  | { type: 'RESOLVE_INCIDENT'; id: string; choice: 'intervene' | 'let' }
  /** Lane N: put the best free gear on a hero, every slot at once (equipment/loadout). */
  | { type: 'EQUIP_BEST'; heroId: HeroId }
  /** Lane O: begin a New Cycle on a harder world, once this world's fate is sealed at F90. */
  | { type: 'NEW_CYCLE' }
  /** Lane O: relive a cleared anchor (a memory: nobody dies) at a chosen difficulty, to
   *  recover the truths missed there. */
  | { type: 'RELIVE_FLOOR'; floor: number; difficulty: ReliveDifficulty; heroIds: HeroId[] }

// ─────────────────────────────────────────────────────────────────────────────
// Lane O · the endgame (optional on GameState; read through endgame/endgameOf)
// ─────────────────────────────────────────────────────────────────────────────

/** How the F90 decision went: the world ended (a plain clear) or was saved (Subvert). */
export type WorldFate = 'ended' | 'saved'

/** How hard a relived memory is: dimmer than it was, as it was, or more vivid. */
export type ReliveDifficulty = 'faded' | 'true' | 'vivid'

/** One world the Master finished, kept when a New Cycle begins. */
export interface CycleRecord {
  /** 0 = the first world. */
  cycle: number
  fate: WorldFate
  /** World-day the fate was sealed. */
  day: number
  highestCleared: number
  fallen: number
  survivors: number
  truths: number
  masterLevel: number
}

/** A grave carried into a later world: one of the fallen of an earlier cycle. */
export interface Legend extends FallenRecord {
  /** The cycle they fell in. */
  cycle: number
  /** A statue stood for them in the Memorial. */
  statue: boolean
}

export interface EndgameState {
  /** The cycle this world is (0 = the first world). */
  cycle: number
  /** The worlds finished before this one, oldest first. */
  history: CycleRecord[]
  /** The fallen of earlier worlds, carried as legends. */
  legends: Legend[]
  /** This world's fate, as the F90 clear sealed it (absent before). */
  fate?: { kind: WorldFate; day: number; truths: number }
  /** Reliving this world-week: attempts spent. */
  relive?: { week: number; used: number }
  /** Truths recovered by reliving (ids; also in tower.hiddenFound). */
  recovered?: string[]
}
