/**
 * Lane Q's own numbers for PvP on stage (rule 6: a new block in the module's tuning file;
 * the shared `TUNING.pvp` / `TUNING.guild` values stay the balance lane's).
 */
export const PVP_STAGE = {
  /** Incoming invasions keep their battle for a replay on the newest this-many log lines. */
  replaysKept: 3,
  /** A raid or counter-raid team: at most this many heroes. */
  teamMax: 5,
  /** Guildmates who join the weekly guild raid beside the Master (the simulated rivals). */
  guildmates: 5,
  /** A guildmate's share of the mates' damage is drawn between these weights (relative). */
  mateWeight: [2, 9] as readonly number[],
} as const
