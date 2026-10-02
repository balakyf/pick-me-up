import { describe, it, expect } from 'vitest'
import { createAccount } from '../account'
import { reduce } from '../store'
import { TUNING } from '../tuning'
import type { GameState, OwnedHero } from '../types'
import { lifeReact, mournComfort, stepLife } from '.'

const L = TUNING.life
const DAY = L.slotMs * L.slotsPerDay

function roster(seed: number, n = 9): GameState {
  let st: GameState = { ...createAccount(seed), gold: TUNING.gacha.normalCostGold * n }
  for (let i = 0; i < n; i++) st = reduce(st, { type: 'SUMMON' })
  return st
}

/** A roster where one hero has just lost a close friend (grieving, at the given Memorial level). */
function bereaved(memorialLevel: number): { s: GameState; mourner: OwnedHero } {
  const s0 = roster(31)
  const [a, b] = Object.values(s0.heroes).filter((h) => h.alive) as OwnedHero[]
  const friends: GameState = {
    ...s0,
    facilities: { ...s0.facilities, memorial: { level: memorialLevel, build: null } },
    life: { ...s0.life, relations: { [[a!.id, b!.id].sort().join('|')]: { affinity: 80, shared: 5 } } },
  }
  const dead = { ...friends, heroes: { ...friends.heroes, [a!.id]: { ...a!, alive: false } } }
  const s = lifeReact(friends, dead, { type: 'SYNTHESIZE', mode: 'salvage', survivorId: null, sacrificeIds: [a!.id] }, 0)
  return { s, mourner: s.heroes[b!.id]! }
}

describe('the Memorial (B47: upgrades matter)', () => {
  it('each level above the first eases more grief and steadies more per visit', () => {
    expect(mournComfort(1)).toEqual({ grief: L.grief.mourn, sanity: 1 })
    expect(mournComfort(0)).toEqual(mournComfort(1))
    expect(mournComfort(4).grief).toBe(L.grief.mourn + 3 * L.memorial.griefPerLevel)
    expect(mournComfort(4).sanity).toBe(1 + 3 * L.memorial.sanityPerLevel)
    expect(mournComfort(5).grief).toBeGreaterThan(mournComfort(2).grief)
  })

  it('mourners at a well-kept Memorial grieve less over the same days', () => {
    const plain = bereaved(1)
    const kept = bereaved(5)
    expect(kept.mourner.life!.grief).toBe(plain.mourner.life!.grief)
    // Through the first day (the grief fades either way; the kept Memorial gets there sooner).
    let sooner = 0
    for (const share of [0.4, 0.5, 0.6, 0.75, 0.9, 1]) {
      const g1 = stepLife(plain.s, share * DAY).heroes[plain.mourner.id]!.life!.grief
      const g5 = stepLife(kept.s, share * DAY).heroes[kept.mourner.id]!.life!.grief
      expect(g5).toBeLessThanOrEqual(g1)
      if (g5 < g1) sooner++
    }
    expect(sooner).toBeGreaterThan(0)
  })
})
