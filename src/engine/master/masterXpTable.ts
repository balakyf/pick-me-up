/**
 * Baked Master-Level XP table (B21). Generated offline from
 *   need(L) = round(500 + 70·L + 0·L²), L = 1..99
 * and frozen as integer literals, so the engine never computes a fractional power at
 * runtime (the old round(60·L^1.8) was the very determinism hazard the guard missed).
 * Regenerate with the lane-B generator (see docs/superpowers/specs/2026-10-02-lane-b.md).
 *
 * MASTER_XP_TO_NEXT[L-1] = Master XP to advance from level L to L+1.
 * Cumulative: ML10 7650, ML15 14350, ML20 22800, ML25 33000, ML50 110250.
 */
export const MASTER_XP_TO_NEXT: readonly number[] = [
  570, 640, 710, 780, 850, 920, 990, 1060, 1130, 1200,
  1270, 1340, 1410, 1480, 1550, 1620, 1690, 1760, 1830, 1900,
  1970, 2040, 2110, 2180, 2250, 2320, 2390, 2460, 2530, 2600,
  2670, 2740, 2810, 2880, 2950, 3020, 3090, 3160, 3230, 3300,
  3370, 3440, 3510, 3580, 3650, 3720, 3790, 3860, 3930, 4000,
  4070, 4140, 4210, 4280, 4350, 4420, 4490, 4560, 4630, 4700,
  4770, 4840, 4910, 4980, 5050, 5120, 5190, 5260, 5330, 5400,
  5470, 5540, 5610, 5680, 5750, 5820, 5890, 5960, 6030, 6100,
  6170, 6240, 6310, 6380, 6450, 6520, 6590, 6660, 6730, 6800,
  6870, 6940, 7010, 7080, 7150, 7220, 7290, 7360, 7430,
]
