/**
 * Lane G tuning: enemy kits, telegraphs, boss phases and the Master's orders 2.0. Its own
 * block (the shared TUNING table stays untouched); integer percents and per-milles, so the
 * engine's estimates stay integer math.
 */
export const BOSS = {
  /** A charged move is worth this much of its blow to the brain (per-mille): it costs a turn
   *  and can be answered, but it is the boss's best card. */
  chargeValuePm: 1000,
  /** A blow that stuns a foe mid-wind-up (cancelling its move) is worth this share of the
   *  move's expected harm on top of the stun's own value (per-mille). */
  cancelValuePm: 900,
  /** A summoned unit is worth its plain blow for this many of its turns to the brain. */
  summonTurns: 2,
  /** The brain never summons while this many of its side already stand. */
  summonFieldCap: 6,
} as const

export const ORDERS = {
  /** GUARD: the party takes this % less damage while it braces… */
  guardPct: 30,
  /** …for at least this many of an average party member's turns (or until the big blow it
   *  braces for has landed, whichever is later). */
  guardMinTurns: 1,
  /** PROTECT: a charged blow that lands on a protected hero lands this % softer. */
  protectChargeCutPct: 50,
  /** FOCUS: a sweep lands on the marked foe at no less than this % of its force (the
   *  falloff spreads the rest of the sweep as usual). */
  focusSweepFloorPct: 60,
  /** HOLD: a sweep is worth the SP when it strikes at least this many foes. */
  holdSweepTargets: 3,
  /** Orders the Master's voice regains each time a wave is cleared (0 = none). */
  refillPerWave: 1,
} as const
