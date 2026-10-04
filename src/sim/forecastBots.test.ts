import { describe, it, expect } from 'vitest'
import { PROFILES, simulate } from './sim'
import { forecastFloor } from '../engine/scout/forecast'
import { ANCHORS } from '../engine/content'
import { TUNING } from '../engine/tuning'
import { missionDirective } from './missionSense'

/** The war room taught to the bots (lane C): the engaged and the whale read the crystal. */
describe('forecast-reading bots', () => {
  it('the engaged and the whale read the forecast; the casual player does not', () => {
    expect(PROFILES.engaged.forecast).toBe(true)
    expect(PROFILES.whale.forecast).toBe(true)
    expect(PROFILES.casual.forecast).toBe(false)
  })

  it('a forecast bot only enters a grim floor after a week of waiting on it', () => {
    let grim = 0
    const r = simulate('engaged', 7, 6, (before, result) => {
      const floor = result.floor
      const f = forecastFloor(before, {
        ballista: ANCHORS[floor]?.minigame === 'ballista' ? 0.6 : undefined,
        subvert: floor === 90 && before.tower.hiddenFound.length >= TUNING.lifecycle.subvertTruths ? true : undefined,
        // Lane P: the bot reads the forecast for its plan, the mission's free mark and protect included.
        focus: missionDirective(before),
      })!
      if (f.winPct < 70 || f.expectedDeaths >= 1.5) grim++
    })
    expect(r.log.length).toBeGreaterThan(0)
    // It did meet a floor the crystal called grim (El Cid's F60 by day 6), and waited.
    expect(r.levers.FORECAST_WAIT ?? 0).toBeGreaterThan(0)
    // Every grim entry was a dare after the bot's patience ran out.
    expect(grim).toBeLessThanOrEqual(r.levers.FORECAST_DARED ?? 0)
  })
})
