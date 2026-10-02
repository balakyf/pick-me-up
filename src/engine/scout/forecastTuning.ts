/**
 * The war-room forecast's numbers (scout/forecast.ts). A module tuning file, like
 * depth/depthTuning.ts: the forecast is a read, never a combat input, so none of these
 * moves a battle.
 */
export const FORECAST = {
  /** Battles the crystal runs per forecast (seeds rngFor-style: 'forecast', floor, attempt, i). */
  runs: 16,
  /** Threat bands from the forecast (the band names the old CP-ratio scout used). */
  bands: {
    /** Safe: wins at least this often… */
    safeWinPct: 90,
    /** …and costs fewer heroes than this an attempt (16 runs: at most one fall in all of them). */
    safeDeaths: 0.1,
    /** Fair: wins at least this often and costs fewer than this. */
    fairWinPct: 70,
    fairDeaths: 0.75,
    /** Risky: wins more often than this and costs fewer than this; anything worse is Deadly. */
    riskyWinPct: 40,
    riskyDeaths: 2,
  },
  /** Sanity (of 100) under which the Enter sheet asks first (the panic threshold). */
  lowSanity: 30,
  /** A forecast at or under this win % makes Enter ask first. */
  confirmWinPct: 40,
  /** "What would change the odds": at most this many alternatives… */
  maxAlternatives: 3,
  /** …each shown only when it wins at least this many points more often, or saves at least
   *  `minDeathsSaved` heroes an attempt. */
  minWinGain: 5,
  minDeathsSaved: 0.25,
  /** Bench heroes below this Sanity are not offered as replacements (suggestParty's default). */
  benchMinSanity: 40,
  /** Counter-picking (suggestParty): a damage type is "shrugged off" when at least this share
   *  of the floor is immune to it (a resist counts half, the boss counts `bossWeight` times). */
  counterShare: 0.25,
  bossWeight: 3,
  /** Score multipliers for heroes who exploit the boss: its weakness, and element advantage. */
  bossWeakMult: 1.3,
  bossAdvantageMult: 1.15,
  /** Element advantage over most of the floor (the old scout's tiebreak). */
  floorAdvantageMult: 1.25,
  /** Forecasts kept in memory (keyed on the exact battle input). */
  cacheSize: 48,
} as const
