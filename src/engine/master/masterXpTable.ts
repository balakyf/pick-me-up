/**
 * Baked Master-Level XP table (B21), frozen as integer literals so the engine never
 * computes a fractional power at runtime (the old round(60·L^1.8) was the very
 * determinism hazard the guard missed). Three pieces:
 *
 *   L = 1..4   the old curve's opening (60, 209, 434, 728) — the first unlocks (the
 *              Smithy, the Tavern and the Garden at ML2, the Promotion Chamber and
 *              Synthesis at ML3) still come after "a floor or two", as First Steps says;
 *   L = 5..9   1150 + 25·(L−5) — a short ramp up to the linear part;
 *   L ≥ 10     560 + 70·L — so the late gates (ML10 truth hints, ML15 A forge, ML20 the
 *              Crack and the S forge, ML25 the bait reveal) arrive inside the climb.
 *
 * MASTER_XP_TO_NEXT[L-1] = Master XP to advance from level L to L+1.
 * Cumulative: ML2 60, ML3 269, ML5 1431, ML10 7431, ML15 14431, ML20 23181, ML25 33681,
 * ML50 112431. Measured against the bots in docs/superpowers/specs/2026-10-02-lane-b.md.
 */
export const MASTER_XP_TO_NEXT: readonly number[] = [
  60, 209, 434, 728, 1150, 1175, 1200, 1225, 1250, 1260,
  1330, 1400, 1470, 1540, 1610, 1680, 1750, 1820, 1890, 1960,
  2030, 2100, 2170, 2240, 2310, 2380, 2450, 2520, 2590, 2660,
  2730, 2800, 2870, 2940, 3010, 3080, 3150, 3220, 3290, 3360,
  3430, 3500, 3570, 3640, 3710, 3780, 3850, 3920, 3990, 4060,
  4130, 4200, 4270, 4340, 4410, 4480, 4550, 4620, 4690, 4760,
  4830, 4900, 4970, 5040, 5110, 5180, 5250, 5320, 5390, 5460,
  5530, 5600, 5670, 5740, 5810, 5880, 5950, 6020, 6090, 6160,
  6230, 6300, 6370, 6440, 6510, 6580, 6650, 6720, 6790, 6860,
  6930, 7000, 7070, 7140, 7210, 7280, 7350, 7420, 7490,
]
