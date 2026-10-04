/**
 * The endgame's numbers (lane O): the Wall siege, the floors behind it, the F90 fate's
 * consequences, Reliving and the New Cycle. A module tuning file (like challenge/tuning):
 * the numbers live next to their rules; the shared TUNING is untouched.
 */
import type { ReliveDifficulty } from '../types'

export const ENDGAME = {
  /** The Siege of the Wailing Wall (F80). */
  siege: {
    /** The siege's budget on top of the Wall's own (TUNING.tower.wallPowerMult): four stages
     *  and fifteen foes instead of three waves and ten, so the gate's CP is spread thinner. The
     *  siege then stands on exactly this budget (tower trims the 8% elite steps). Tuned with
     *  the sim (lane O notes): at 1.15 a strong engaged run broke it on day 21; at 1.45 the
     *  Wall holds every casual and engaged run for 30 days and every whale breaks it (d22–29). */
    budgetMult: 1.45,
    /** The siege ram's level over the floor's (it must outlast the defenders' sweeps). */
    ramLevelBonus: 40,
    /** The four stages (the waves) of the siege, for the HUD and the story. */
    stages: 4,
  },

  /** The floors behind the Wall (F81–89): their missions' parameters. */
  postWall: {
    /** F81: steps to the far side of the breach. */
    breachDistance: 45,
    /** F83: ticks to hold the hollow garrison. */
    garrisonTicks: 900,
    /** F86: the banner's level over the floor's. */
    bannerLevelBonus: 20,
  },

  /** What the F90 decision changes, for the rest of this world. */
  fate: {
    /** The world ended: the void is sated, and the floors past ninety hold back. Every foe on
     *  F91–100 fights at this share of its strength… */
    endedPowerMult: 0.85,
    /** …and there is no one left below to pay for a clear: their gold × this. */
    endedGoldMult: 0.5,
    /** The world was spared: its people send a tribute once, the day the Herald falls. */
    savedTribute: { gems: 300, gold: 40_000 },
  },

  /** Reliving: replay a cleared anchor as a memory (nobody dies there). */
  relive: {
    /** Memories a world-week. */
    attemptsPerWeek: 3,
    /** Sanity each hero who relives pays (it is still a memory of the worst day of their life). */
    sanityCost: 8,
    /** Per difficulty: the foes' strength, the share of the floor's clear gold paid, and
     *  whether a missed truth can be recovered there (a faded memory keeps none). */
    difficulties: {
      faded: { power: 0.8, gold: 0.1, truths: false },
      true: { power: 1, gold: 0.2, truths: true },
      vivid: { power: 1.3, gold: 0.4, truths: true },
    } as Record<ReliveDifficulty, { power: number; gold: number; truths: boolean }>,
    /** A truth recovered by reliving pays this share of its first reward (it was missed once). */
    truthShare: 0.5,
    /** Master XP per relived clear (the climb is a lesson). */
    masterXp: 40,
  },

  /** The New Cycle: a fresh, harder world after this one's fate. */
  cycle: {
    /** Each cycle multiplies the tower's world multiplier by 1 + this × cycle (levels, budget,
     *  gold: a harder world that pays a little more). */
    powerStep: 0.12,
    /** The fallen carried into the next world as legends (statues first, then the deepest). */
    legendsCarried: 12,
    /** Legends kept across every cycle (the oldest fade first). */
    legendsMax: 60,
  },
} as const
