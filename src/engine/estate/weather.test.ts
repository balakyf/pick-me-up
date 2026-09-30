import { describe, it, expect } from 'vitest'
import { TUNING } from '../tuning'
import { SEASON_DAYS, WEATHER_BLOCKS, dayOfSeason, forecast, isOutdoor, outdoorPenalty, seasonAt, seasonOfDay, weatherAt, weatherOn, worldDay, type Weather } from './weather'

const DAY = TUNING.life.slotMs * TUNING.life.slotsPerDay

describe('seasons', () => {
  it('each lasts seven world-days and they cycle spring → winter', () => {
    expect(seasonOfDay(0)).toBe('spring')
    expect(seasonOfDay(SEASON_DAYS - 1)).toBe('spring')
    expect(seasonOfDay(SEASON_DAYS)).toBe('summer')
    expect(seasonOfDay(3 * SEASON_DAYS)).toBe('winter')
    expect(seasonOfDay(4 * SEASON_DAYS)).toBe('spring')
    expect(seasonOfDay(-1)).toBe('winter')
    expect(dayOfSeason(SEASON_DAYS + 2)).toBe(3)
    expect(seasonAt(SEASON_DAYS * DAY + 5)).toBe('summer')
    expect(worldDay(3 * DAY + 1)).toBe(3)
  })
})

describe('weather', () => {
  it('is a pure function of (seed, time): the same forecast every time', () => {
    for (let d = 100; d < 130; d++) expect(forecast(7, d)).toEqual(forecast(7, d))
    expect(forecast(7, 100)).toHaveLength(WEATHER_BLOCKS)
    expect(weatherAt(7, 100 * DAY + 13 * 3_600_000)).toBe(weatherOn(7, 100, 2))
  })

  it('differs between seeds and across days', () => {
    const a = Array.from({ length: 40 }, (_, d) => forecast(1, d).join()).join('|')
    const b = Array.from({ length: 40 }, (_, d) => forecast(2, d).join()).join('|')
    expect(a).not.toBe(b)
    expect(new Set(Array.from({ length: 40 }, (_, d) => forecast(1, d).join())).size).toBeGreaterThan(5)
  })

  it('snows only in winter and never rains then; a year sees every kind of sky', () => {
    const seen = new Set<Weather>()
    for (let d = 0; d < 28 * 4; d++) {
      const season = seasonOfDay(d)
      for (const w of forecast(11, d)) {
        seen.add(w)
        if (season !== 'winter') expect(w).not.toBe('snow')
        else expect(w).not.toBe('rain')
      }
    }
    expect([...seen].sort()).toEqual(['clear', 'cloudy', 'fog', 'rain', 'snow', 'storm'])
  })

  it('rain and storms keep heroes indoors', () => {
    expect(outdoorPenalty('storm')).toBeGreaterThan(outdoorPenalty('rain'))
    expect(outdoorPenalty('rain')).toBeGreaterThan(outdoorPenalty('clear'))
    expect(isOutdoor('yard')).toBe(true)
    expect(isOutdoor('tavern')).toBe(false)
  })
})
