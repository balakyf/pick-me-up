import { describe, it, expect } from 'vitest'
import { crackRefusal, openCrack, dispatchRuins, dispatchRefusal, expeditionHaul } from './rift'
import { createAccount } from '../account'
import { advanceTime } from '../time'
import { playFloor } from '../tower'
import { piAfterGap, piUnlocked } from '../interference'
import { canUpgrade } from '../facilities'
import { TUNING } from '../tuning'
import type { GameState, HeroId } from '../types'

const R = TUNING.rift

function ready(): { state: GameState; id: HeroId } {
  const acct = createAccount(7)
  const id = Object.keys(acct.heroes)[0] as HeroId
  return {
    id,
    state: {
      ...acct,
      gold: 100_000,
      materials: { promotionStone: 100 },
      meta: { ...acct.meta, masterLevel: R.masterLevel, pi: 250 },
      heroes: { [id]: { ...acct.heroes[id]!, star: 4, heroClass: 'mage' } },
    },
  }
}

describe('the Crack of Time and Space', () => {
  it('needs Master Lv 20, PI, a 4★ mage, gold and stones', () => {
    const { state, id } = ready()
    expect(crackRefusal(state)).toBeNull()
    expect(crackRefusal({ ...state, meta: { ...state.meta, masterLevel: 19 } })).toMatch(/Master Lv 20/)
    expect(crackRefusal({ ...state, meta: { ...state.meta, pi: 10 } })).toMatch(/Interference/)
    expect(crackRefusal({ ...state, heroes: { [id]: { ...state.heroes[id]!, heroClass: 'warrior' } } })).toMatch(/mage/)
    const open = openCrack(state)
    expect(open.meta.crackOpen).toBe(true)
    expect(open.gold).toBe(state.gold - R.gold)
    expect(crackRefusal(open)).toMatch(/already/)
  })

  it('expeditions take heroes away, then bring gems home', () => {
    const { state, id } = ready()
    const open = openCrack(state)
    expect(dispatchRefusal(state, [id])).toMatch(/closed/)
    const away = dispatchRuins(open, [id], 0)
    expect(away.heroes[id]!.expedition).toEqual({ completesAtWorld: R.expeditionMs })
    expect(playFloor(away).result.result.log.unitsInit.filter((u) => u.side === 'hero')).toHaveLength(0)
    const haul = expeditionHaul(away.heroes[id]!, away.seed)
    const home = advanceTime(away, R.expeditionMs + 1)
    expect(home.heroes[id]!.expedition).toBeNull()
    expect(home.gems).toBe(away.gems + haul.gems)
    expect(haul.gems).toBeGreaterThanOrEqual(R.gemsBase)
  })
})

describe('Probability Interference', () => {
  const HOUR = 3_600_000
  it('the Hall of Magic generates it; a long absence fades it', () => {
    expect(piAfterGap(100, 10 * HOUR, 2)).toBe(100 + 10 * 2 * TUNING.interference.hallPerHourPerLevel)
    expect(piAfterGap(100, TUNING.interference.idleDays * 24 * HOUR, 0)).toBe(100)
    expect(piAfterGap(100, (TUNING.interference.idleDays + 2) * 24 * HOUR, 0)).toBeLessThan(100)
  })

  it('gates the Hall of Magic build', () => {
    const acct = createAccount(1)
    const s = { ...acct, gold: 1_000_000, meta: { ...acct.meta, masterLevel: 10 } }
    expect(piUnlocked(s, 'hallOfMagic')).toBe(false)
    expect(canUpgrade(s, 'hallOfMagic')).toBe(false)
    expect(canUpgrade({ ...s, meta: { ...s.meta, pi: 50 } }, 'hallOfMagic')).toBe(true)
  })
})
