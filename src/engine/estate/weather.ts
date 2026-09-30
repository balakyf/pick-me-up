/**
 * Seasons and weather over the campus (spec 2026-09-30-estate-and-life §4).
 *
 * A season lasts 7 world-days (spring → summer → autumn → winter: a 28-day year). Each
 * world-day is split into four 6-hour blocks; each block's weather is drawn from the
 * season's odds, and often simply carries on from the block before (weather has
 * persistence). Snow only falls in winter, rain never does.
 *
 * PURE and deterministic: every roll is a hash of (seed, day, block), so the whole year's
 * forecast is fixed by the account seed and any UI can read it without touching state.
 */
import { hash } from '../rng'
import { TUNING } from '../tuning'
import type { LifePlace } from '../types'

export type Season = 'spring' | 'summer' | 'autumn' | 'winter'
export type Weather = 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog' | 'snow'

export const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter']
export const SEASON_DAYS = 7
/** Weather blocks per world-day (6 world-hours each). */
export const WEATHER_BLOCKS = 4

const DAY_MS = TUNING.life.slotMs * TUNING.life.slotsPerDay
const BLOCK_MS = DAY_MS / WEATHER_BLOCKS

/** Odds per season (weights; zero = never). */
export const WEATHER_ODDS: Record<Season, Record<Weather, number>> = {
  spring: { clear: 40, cloudy: 25, rain: 25, storm: 4, fog: 6, snow: 0 },
  summer: { clear: 55, cloudy: 18, rain: 10, storm: 14, fog: 3, snow: 0 },
  autumn: { clear: 30, cloudy: 30, rain: 22, storm: 4, fog: 14, snow: 0 },
  winter: { clear: 32, cloudy: 26, rain: 0, storm: 4, fog: 10, snow: 28 },
}
/** Chance a block keeps the previous block's weather. */
const PERSIST = 0.45

const WEATHERS: readonly Weather[] = ['clear', 'cloudy', 'rain', 'storm', 'fog', 'snow']

function unit(h: number): number {
  return (h >>> 0) / 4294967296
}

/** World-day index of a world-time. */
export function worldDay(worldMs: number): number {
  return Math.floor(worldMs / DAY_MS)
}

export function seasonOfDay(day: number): Season {
  const i = Math.floor(day / SEASON_DAYS)
  return SEASONS[((i % 4) + 4) % 4]!
}

/** Day of the season, 1..7. */
export function dayOfSeason(day: number): number {
  return (((day % SEASON_DAYS) + SEASON_DAYS) % SEASON_DAYS) + 1
}

export function seasonAt(worldMs: number): Season {
  return seasonOfDay(worldDay(worldMs))
}

function draw(seed: number, day: number, block: number, season: Season): Weather {
  const odds = WEATHER_ODDS[season]
  let total = 0
  for (const w of WEATHERS) total += odds[w]
  let r = unit(hash(seed, 'weather', day, block)) * total
  for (const w of WEATHERS) {
    r -= odds[w]
    if (r < 0) return w
  }
  return 'clear'
}

/** The weather of block `block` (0..3) of world-day `day`. */
export function weatherOn(seed: number, day: number, block: number): Weather {
  const season = seasonOfDay(day)
  let w = draw(seed, day, 0, season)
  for (let b = 1; b <= block; b++) {
    if (unit(hash(seed, 'weather-keep', day, b)) < PERSIST) continue
    w = draw(seed, day, b, season)
  }
  return w
}

export function weatherAt(seed: number, worldMs: number): Weather {
  const day = worldDay(worldMs)
  const block = Math.floor((worldMs - day * DAY_MS) / BLOCK_MS)
  return weatherOn(seed, day, Math.max(0, Math.min(WEATHER_BLOCKS - 1, block)))
}

/** The day's forecast, block by block. */
export function forecast(seed: number, day: number): Weather[] {
  return Array.from({ length: WEATHER_BLOCKS }, (_, b) => weatherOn(seed, day, b))
}

/** Places under the open sky (rain sends the heroes indoors from these). */
const OUTDOOR: ReadonlySet<LifePlace> = new Set<LifePlace>(['yard', 'garden', 'courtyard', 'memorial', 'market'])

export function isOutdoor(place: LifePlace): boolean {
  return OUTDOOR.has(place)
}

/** How much the weather puts a hero off an outdoor activity (a utility penalty). */
export function outdoorPenalty(w: Weather): number {
  switch (w) {
    case 'storm':
      return 1
    case 'rain':
      return 0.6
    case 'snow':
      return 0.3
    case 'fog':
      return 0.1
    default:
      return 0
  }
}

export function isWet(w: Weather): boolean {
  return w === 'rain' || w === 'storm'
}
