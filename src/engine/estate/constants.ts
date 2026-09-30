/**
 * The estate's numbers (spec 2026-09-30-estate-and-life): decorations, statues, the
 * bounty board, trauma, favoritism, duels and the paid drill refocus. Kept here rather
 * than in tuning.ts so the estate stays one self-contained slice.
 */
import type { FacilityId, LifePlace } from '../types'

const HOUR = 60 * 60_000

export interface DecorDef {
  id: string
  name: string
  /** Where it stands (and whose place panel sells it). */
  place: LifePlace
  /** The building it needs standing (null = always there). */
  facility: FacilityId | null
  /** Gold for level 1; each later level costs base × DECOR_CURVE[level − 1]. */
  base: number
  blurb: string
}

/** Decoration levels cost base × this (≈ ×2.2 a level; integer table, no Math.pow). */
export const DECOR_CURVE = [1, 2.2, 4.8, 10.5, 23] as const
export const DECOR_MAX_LEVEL = DECOR_CURVE.length

export const DECOR: Record<string, DecorDef> = {
  rugs: {
    id: 'rugs',
    name: 'Rugs & bunk lamps',
    place: 'dormitory',
    facility: 'dormitory',
    base: 6_000,
    blurb: 'Warm rugs and a lamp by every bunk: sleep restores more energy.',
  },
  hearth: {
    id: 'hearth',
    name: 'Hearth & music corner',
    place: 'tavern',
    facility: 'tavern',
    base: 8_000,
    blurb: 'A roaring hearth and a corner for the musicians: company is more fun.',
  },
  flowerbeds: {
    id: 'flowerbeds',
    name: 'Flower beds & benches',
    place: 'garden',
    facility: 'garden',
    base: 7_000,
    blurb: 'Heroes who linger in the Garden find a little calm (Sanity).',
  },
  tapestries: {
    id: 'tapestries',
    name: 'Great Hall tapestries',
    place: 'hall',
    facility: null,
    base: 10_000,
    blurb: 'Tapestries of every act cleared: a content hero’s morale mends faster.',
  },
  fountain: {
    id: 'fountain',
    name: 'Fountain upgrades',
    place: 'courtyard',
    facility: null,
    base: 5_000,
    blurb: 'A finer fountain: a stroll in the courtyard is more pleasant and more sociable.',
  },
  lanterns: {
    id: 'lanterns',
    name: 'Road lanterns',
    place: 'courtyard',
    facility: null,
    base: 4_000,
    blurb: 'Lanterns along the roads: the watch sees further at night, and night owls feel safer.',
  },
  banners: {
    id: 'banners',
    name: 'Training Yard pennants',
    place: 'yard',
    facility: null,
    base: 9_000,
    blurb: 'Pennants, a proper rack and a scoreboard: training in the Yard earns more XP.',
  },
}

/** Per-level effects of each decoration in the life sim (per 30-minute slot). */
export const DECOR_EFFECT = {
  /** Rugs: extra energy per sleep slot in the dormitory. */
  rugsEnergy: 0.6,
  /** Hearth: extra social and fun per socialize slot in the tavern. */
  hearthSocial: 1.2,
  hearthFun: 1,
  /** Flower beds: Sanity per slot spent in the garden. */
  gardenSanity: 0.12,
  /** Tapestries: extra Sanity per content slot (base 0.25). */
  tapestriesContent: 0.05,
  /** Fountain: fun and social per wander slot. */
  fountainFun: 1,
  fountainSocial: 0.5,
  /** Lanterns: guard power on the wall, and Sanity for heroes awake at night. */
  lanternGuard: 0.25,
  lanternNight: 0.06,
  /** Pennants: training XP multiplier per level. */
  bannersXp: 0.06,
} as const

export const STATUE = {
  /** Gold = base + perStar2 × star² + perLevel × level. */
  base: 15_000,
  perStar2: 6_000,
  perLevel: 500,
  /** Statue plinths in the Memorial. */
  max: 12,
  /** Sanity per slot for a hero at the Memorial, per statue (capped). */
  memorialSanity: 0.25,
  memorialSanityCap: 1,
  /** Extra grief fading per slot when the lost friend has a statue. */
  griefDecay: 0.5,
} as const

export interface BountyDef {
  id: string
  name: string
  blurb: string
  gold: number
  /** World-time the heroes are away. */
  ms: number
  heroes: number
  /** Highest floor cleared needed to post it. */
  minFloor: number
  /** Promotion Stones [min, max] before the floor scaling. */
  stones: readonly [number, number]
  /** Rank Materials [min, max]. */
  rank: readonly [number, number]
  /** Attribute Stones of each hero's element. */
  attr: number
  /** Chance of a rare item (forge grade; a high roll is one grade better). */
  itemChance: number
  /** Share of a level's XP each hero earns. */
  xpShare: number
}

export const BOUNTIES: Record<string, BountyDef> = {
  forage: {
    id: 'forage',
    name: 'Forage the rift’s edge',
    blurb: 'One hero, a basket and half a day. Herbs, scrap and the odd stone.',
    gold: 4_000,
    ms: 6 * HOUR,
    heroes: 1,
    minFloor: 0,
    stones: [1, 1],
    rank: [0, 0],
    attr: 0,
    itemChance: 0,
    xpShare: 0.3,
  },
  patrol: {
    id: 'patrol',
    name: 'Patrol the outer ring',
    blurb: 'Two heroes walk the ring for a day and bring back what the tower sheds.',
    gold: 15_000,
    ms: 12 * HOUR,
    heroes: 2,
    minFloor: 10,
    stones: [1, 3],
    rank: [0, 0],
    attr: 0,
    itemChance: 0.05,
    xpShare: 0.5,
  },
  salvage: {
    id: 'salvage',
    name: 'Salvage the fallen floors',
    blurb: 'Three heroes pick through cleared floors for a day and a night.',
    gold: 45_000,
    ms: 24 * HOUR,
    heroes: 3,
    minFloor: 25,
    stones: [3, 5],
    rank: [0, 1],
    attr: 1,
    itemChance: 0.15,
    xpShare: 0.8,
  },
  hunt: {
    id: 'hunt',
    name: 'Hunt a named beast',
    blurb: 'Three heroes track something big through the lower floors. Rare trophies.',
    gold: 120_000,
    ms: 36 * HOUR,
    heroes: 3,
    minFloor: 45,
    stones: [5, 8],
    rank: [1, 2],
    attr: 2,
    itemChance: 0.35,
    xpShare: 1.2,
  },
}

export const BOUNTY = {
  /** Bounties under way at once. */
  maxActive: 3,
  /** Finished bounties kept on the board. */
  logMax: 8,
  /** Stone yields grow by this per floor cleared (1 + floor × perFloor). */
  perFloor: 0.005,
} as const

export const TRAUMA = {
  /** Fatigue (floors in a row) where burnout becomes possible, and the chance per floor past it. */
  burnAt: 8,
  burnChance: 0.06,
  /** Courage shields: chance × (1 − courage × this). */
  burnCourage: 0.5,
  /** How long a burnt-out hero refuses to deploy. */
  burnoutMs: 24 * HOUR,
  /** A veteran of burnout teaches better (canon Roderick): Instructor power ×. */
  veteranInstructor: 1.5,
  /** Fatigue recovered per world-hour in the lobby. */
  fatiguePerHour: 1,
  /** Withdrawn heroes fight a little worse (every stat ×). */
  withdrawnStat: 0.92,
  /** Despair: Sanity under this line for this long turns a hero inward. */
  despairSanity: 20,
  despairMs: 72 * HOUR,
  /** A close friend's death: chance = base + warmth × w − courage × c. */
  griefBase: 0.35,
  griefWarmth: 0.4,
  griefCourage: 0.3,
  /** Comfort needed to come back, and what each kindness gives. */
  recoverAt: 4,
  talkComfort: 1,
  giftComfort: 2,
  /** Time heals: comfort per world-day. */
  dailyComfort: 1,
} as const

export const FAVORITISM = {
  /** Rolling window in world-days (3 world-days = one real day). */
  windowDays: 3,
  talk: 1,
  gift: 2,
  deploy: 0.5,
  /** Attention at which a hero reads as the Master's favourite. */
  favouredAt: 6,
  /** Envy trait (temper × 0.6 + sociability × 0.4) at which neglect turns to jealousy. */
  envyAt: 0.55,
  /** Daily cost of jealousy: favor (never below `favorFloor`) and affinity to the favourite. */
  favorLoss: 1,
  favorFloor: 20,
  affinityLoss: 2,
  /** Marks kept at most. */
  logMax: 400,
  /** A hero is only jealous after settling in (world-days since arrival). */
  settleDays: 3,
} as const

export const DUEL = {
  /** Tryouts the Master can host per world-day. */
  perDay: 3,
  /** The winner's purse: base + perLevel × (both levels). */
  purseBase: 1_000,
  purseLevel: 40,
  /** XP for both (share of a level), plus a bonus share for the winner. */
  xpShare: 0.1,
  winShare: 0.1,
  /** Bruises: Sanity each fighter spends. */
  sanityCost: 3,
  /** Affinity after the bout: grudging respect / bitterness / a friendly spar. */
  respect: 15,
  bitter: -10,
  friendly: 5,
} as const

export const REFOCUS = {
  /** Redirect a drill: flat + share × the new drill's price. */
  flat: 1_000,
  share: 0.5,
} as const
