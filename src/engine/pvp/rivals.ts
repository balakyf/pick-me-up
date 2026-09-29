/**
 * The simulated server (Layer 4 §3). This build is offline, so every other Master is a
 * seeded GHOST: a handle, a guild, a tower floor, a CP ratio against you and a rating,
 * all drawn from (account seed, sector). Crossing a 10-floor line moves you to a new
 * sector of 100 — a new neighbourhood of rivals (canon "sectors of 100, reassigned every
 * 10 floors"). Real matchmaking can replace this module without changing the rules.
 *
 * PURE and DETERMINISTIC.
 */

import type { GameState } from '../types'
import { TUNING } from '../tuning'
import { rngFor, nextInt, nextFloat, pick, type Rng } from '../rng'

const P = TUNING.pvp

export interface GuildDef {
  id: string
  name: string
  /** Canon whale guilds (단결회 / Kaiser): PKers who spend fortunes; they admit only whales. */
  whale: boolean
  blurb: string
}

export const GUILDS: readonly GuildDef[] = [
  { id: 'unity', name: 'Unity Society (단결회)', whale: true, blurb: 'Whales who buy their way up and hunt the weak.' },
  { id: 'kaiser', name: 'Kaiser', whale: true, blurb: 'A PK guild of big spenders. They raid for sport.' },
  { id: 'morning_star', name: 'Morning Star', whale: false, blurb: 'Steady climbers who look after their heroes.' },
  { id: 'iron_lantern', name: 'Iron Lantern', whale: false, blurb: 'Night-shift Masters; they trade stones freely.' },
  { id: 'last_light', name: 'Last Light', whale: false, blurb: 'They remember every hero they lost.' },
  { id: 'grey_tower', name: 'Grey Tower Club', whale: false, blurb: 'Veterans of worlds that ended.' },
]

export interface RivalMaster {
  id: string
  name: string
  guildId: string
  whale: boolean
  /** Their tower floor (within your sector's band). */
  floor: number
  /** Their defense CP as a fraction of yours. */
  cpRatio: number
  rating: number
}

const HANDLES = ['Kaiser', 'Wolf', 'Ash', 'Nox', 'Iris', 'Rook', 'Vale', 'Hex', 'Sable', 'Juno', 'Orin', 'Pike', 'Zed', 'Lark', 'Moth', 'Brin']

/** Your sector: 1 + floor(highestCleared / 10). */
export function sectorOf(state: GameState): number {
  return 1 + Math.floor(state.tower.highestCleared / P.sectorFloors)
}

function rival(r: Rng, sector: number, i: number): { value: RivalMaster; rng: Rng } {
  let rr = r
  const h = pick(rr, HANDLES)
  rr = h.rng
  const n = nextInt(rr, 10, 99)
  rr = n.rng
  const g = pick(rr, GUILDS)
  rr = g.rng
  const f = nextInt(rr, (sector - 1) * P.sectorFloors, sector * P.sectorFloors - 1)
  rr = f.rng
  const c = nextFloat(rr)
  rr = c.rng
  const rt = nextInt(rr, 850, 1250)
  rr = rt.rng
  const [lo, hi] = P.rivalCpRange as [number, number]
  return {
    rng: rr,
    value: {
      id: `r${sector}_${i}`,
      name: `${h.value}_${n.value}`,
      guildId: g.value.id,
      whale: g.value.whale,
      floor: Math.max(1, f.value),
      cpRatio: Math.round((lo + c.value * (hi - lo)) * 100) / 100,
      rating: rt.value,
    },
  }
}

/** The 99 other Masters of your sector (seeded by sector — re-bucketed every 10 floors). */
export function sectorRivals(state: GameState): RivalMaster[] {
  const sector = sectorOf(state)
  let r = rngFor(state.seed, 'sector', sector)
  const out: RivalMaster[] = []
  for (let i = 0; i < P.sectorSize - 1; i++) {
    const d = rival(r, sector, i)
    r = d.rng
    out.push(d.value)
  }
  return out
}

/** A rival by id (from your current sector), or undefined. */
export function findRival(state: GameState, id: string): RivalMaster | undefined {
  return sectorRivals(state).find((r) => r.id === id)
}

/** This world-week's raid targets: a rotating handful of your sector. */
export function raidTargets(state: GameState, week: number): RivalMaster[] {
  const all = sectorRivals(state)
  let r = rngFor(state.seed, 'targets', sectorOf(state), week)
  const out: RivalMaster[] = []
  const used = new Set<number>()
  while (out.length < P.targetsPerWeek && used.size < all.length) {
    const d = nextInt(r, 0, all.length - 1)
    r = d.rng
    if (used.has(d.value)) continue
    used.add(d.value)
    out.push(all[d.value]!)
  }
  return out
}

/** Your rank among the 100 Masters of your sector (by rating). */
export function sectorRank(state: GameState): number {
  return 1 + sectorRivals(state).filter((r) => r.rating > state.pvp.rating).length
}

/**
 * Your server-wide rank (the prestige overlay): anyone past the Wailing Wall is in the
 * canon top 5; below it, rank falls away with each floor short of F80.
 */
export function serverRank(state: GameState): number {
  const f = state.tower.highestCleared
  const tiebreak = Math.max(0, 1500 - state.pvp.rating)
  if (f >= 80) return 1 + Math.min(4, Math.floor(tiebreak / 150))
  const short = 80 - f
  return 6 + short * short * 40 + tiebreak
}

export function guildById(id: string | null): GuildDef | undefined {
  return GUILDS.find((g) => g.id === id)
}
