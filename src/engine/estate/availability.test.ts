import { describe, it, expect } from 'vitest'
import { createAccount } from '../account'
import { reduce } from '../store'
import { TUNING } from '../tuning'
import type { GameState } from '../types'
import { suggestParty } from '../scout'
import { trainingRefusal } from '../training'
import { estateBusy, postBounty, benchHeroes } from './index'

/** An account with nine extra Normal pulls, the Training Center built, lots of gold. */
function roster(seed: number): GameState {
  let st: GameState = { ...createAccount(seed), gold: TUNING.gacha.normalCostGold * 9 }
  for (let i = 0; i < 9; i++) st = reduce(st, { type: 'SUMMON' })
  return { ...st, gold: 10_000_000, facilities: { ...st.facilities, trainingCenter: { level: 3, build: null } } }
}

describe('a hero out on a bounty is away for everything else', () => {
  it('leaves the suggested party and cannot drill', () => {
    const s = roster(77)
    const h = benchHeroes(s)[0]!
    const away = postBounty(s, 'forage', [h.id], 0)
    expect(estateBusy(away, h.id)).toBe('is out on a bounty')
    expect(suggestParty(away).slots).not.toContain(h.id)
    const skill = h.skills[0]?.id ?? 'basic'
    expect(trainingRefusal(away, h.id, skill)).toBe('That hero is out on a bounty.')
  })
})
