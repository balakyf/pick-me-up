/**
 * Lane L's numbers: morale (a derived 0..100 spirit with five pips), grief that plays out
 * (a rival's guilt, a friend's comfort, the weekly remembrance) and camp incidents.
 * Module tuning (lane rule 6): nothing here retunes a shared value.
 */
export const MORALE = {
  /** Where every hero starts before the factors. */
  base: 50,
  /** Sanity's pull: (Sanity − pivot) × perPoint. */
  sanityPivot: 60,
  sanityPerPoint: 0.4,
  /** A need below this line weighs on them; all at/above `caredAbove` lifts them. */
  needLow: 25,
  needs: { energy: -6, hunger: -5, social: -4, fun: -3 },
  caredAbove: 60,
  cared: 5,
  /** Floors in a row: from `fatigueFrom` on, each costs this much (capped). */
  fatigueFrom: 3,
  fatiguePer: -2,
  fatigueCap: -12,
  /** Grief drags them down: −grief × this (capped). */
  griefPer: 0.3,
  griefCap: -30,
  withdrawn: -15,
  jealous: -6,
  /** Each living friend lifts them (a close friend more), up to the cap. */
  friend: 3,
  closeFriend: 5,
  friendsCap: 10,
  /** Each living rival weighs (a grudge more), down to the cap. */
  rival: -3,
  grudge: -4,
  feudCap: -8,
  /** Recent memories (within `days` world-days): value. */
  recent: {
    floorCleared: { days: 1, value: 6 },
    floorLost: { days: 1, value: -5 },
    retreated: { days: 1, value: -3 },
    nearDeath: { days: 2, value: -8 },
    comradeDied: { days: 2, value: -6 },
    guilt: { days: 3, value: -6 },
    gift: { days: 2, value: 4 },
    consoled: { days: 1, value: 4 },
    promoted: { days: 2, value: 5 },
  } as Record<string, { days: number; value: number }>,
  /** A camp incident lingers a day: ±this. */
  incident: 5,
  /** A banquet today / yesterday. */
  banquetToday: 8,
  banquetYesterday: 4,
  /** How they feel about their job. */
  jobLikes: 3,
  jobDislikes: -4,
  /** Innate traits that steady the spirit (lane J's families). */
  trait: { courage: 4, steadfast: 6, leader: 3 } as Record<string, number>,
  /** Band floors (score ≥ value): inspired 5 pips … broken 0. */
  bands: { inspired: 85, high: 65, steady: 45, low: 25, shaken: 10 },
  /** Combat: an inspired hero fights a little better, a shaken one a little worse (every
   *  magnitude stat ×). Neutral bands change nothing (battles replay bit-identically). */
  inspiredStat: 1.03,
  shakenStat: 0.96,
} as const

export const GRIEF = {
  /** A rival who falls leaves guilt behind: grief, and a memory of words unsaid. */
  guilt: 20,
  /** A friend's company eases grief a little (per shared slot), and steadies them. */
  console: 3,
  consoleSanity: 0.5,
  /** Only real grief is worth a line in the chronicle. */
  consoleNewsAt: 35,
  /** Every `every` world-days after a death, the friends left behind remember. */
  anniversaryEvery: 7,
  anniversaryGrief: 15,
  /** Mourners only remember this many weeks (then the grave is just a grave). */
  anniversaryWeeks: 8,
} as const

export const INCIDENT = {
  /** Chance per life slot that something happens in the camp (≈2–3 a world-day). */
  perSlot: 0.06,
  /** At most this many incidents wait on the Master at once. */
  maxPending: 3,
  /** Slots an incident waits before it settles itself. */
  wait: { brawl: 24, nightTraining: 8, homesick: 36 } as Record<string, number>,
  brawl: {
    /** Both lose this Sanity in the fight itself. */
    hurt: 3,
    /** Separated by the Master: made to talk it out. */
    interveneAffinity: 8,
    interveneSanity: 2,
    /** Left to settle it: sometimes it clears the air, mostly it does not. */
    clearChance: 0.4,
    clearAffinity: 12,
    worseAffinity: -10,
    loserSanity: 5,
  },
  sworn: { affinityAt: 70, affinity: 10 },
  night: { diligenceAt: 0.65, energyAt: 40, xpShare: 0.15, energyCost: 20, bedEnergy: 10 },
  /** A fire needs a stocked pantry, and even then only this share of the chances catch. */
  fire: { pantryAt: 3, pantryKept: 0.5, catchChance: 0.25 },
  homesick: { arrivedDays: 6, socialBelow: 40, interveneSanity: 6, interveneSocial: 25, letSanity: -4 },
  trait: {
    /** A rousing word: every party member's Sanity. */
    speech: 2,
    /** A found purse: gold = base + perFloor × highest floor cleared. */
    purseBase: 50,
    purseFloor: 10,
    /** Tending the most troubled hero. */
    tend: 5,
    /** The pantry, eaten. */
    eat: 2,
    /** A drill: XP share for everyone in the yard. */
    drillXp: 0.05,
    /** A night watch shared: Sanity for both. */
    watch: 2,
  },
} as const
