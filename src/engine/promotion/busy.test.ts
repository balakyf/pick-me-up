/**
 * B41 — promotion and synthesis respect who is busy, and the chamber shows the truth.
 */
import { describe, it, expect } from 'vitest'
import { createAccount } from '../account'
import { summonMany } from '../gacha'
import { synthesize, canSynthesize } from '../synthesis'
import { estateOf } from '../estate'
import { shownStar } from '../shop'
import type { GameState, HeroId, OwnedHero, Star } from '../types'
import { TUNING } from '../tuning'
import { canPromote, completePromotion } from './promotion'

function roster(): { s: GameState; ids: HeroId[] } {
  let s: GameState = { ...createAccount(12, { now: 0 }), gold: 1_000_000 }
  s = summonMany(s, 'normal', 10).state
  s = { ...s, meta: { ...s.meta, masterLevel: TUNING.lobby.synthesis.unlockMasterLevel } }
  return { s, ids: Object.keys(s.heroes) as HeroId[] }
}

function patch(s: GameState, id: HeroId, p: Partial<OwnedHero>): GameState {
  return { ...s, heroes: { ...s.heroes, [id]: { ...s.heroes[id]!, ...p } } }
}

function onBounty(s: GameState, id: HeroId): GameState {
  const e = estateOf(s)
  return { ...s, estate: { ...e, bounties: [{ id: 0, kind: 'herbs', heroIds: [id], postedAt: 0, endsAt: 1e15 }] } }
}

const DRILL = { skillId: 'composure', mode: 'learn' as const, completesAtWorld: 1e15 }

describe('promotion (B41)', () => {
  it('a hero in a drill cannot start a promotion', () => {
    const { s, ids } = roster()
    const capped = { ...s.heroes[ids[0]!]!, xp: { ...s.heroes[ids[0]!]!.xp, atCap: true } }
    expect(canPromote(capped)).toBe(true)
    expect(canPromote({ ...capped, training: DRILL })).toBe(false)
  })

  it('a completed promotion clears the whale-bait display star (twice promoted, never shown lower than real)', () => {
    const { s, ids } = roster()
    const bait: OwnedHero = { ...s.heroes[ids[0]!]!, star: 3 as Star, displayStar: 5 as Star, xp: { ...s.heroes[ids[0]!]!.xp, atCap: true } }
    // (At the level cap the lie is seen through anyway; below it, the bait shows 5★.)
    expect(shownStar({ ...bait, xp: { ...bait.xp, atCap: false } }, 1)).toBe(5)
    const once = completePromotion(bait, s.seed)
    expect(once.displayStar).toBeUndefined()
    expect('displayStar' in once).toBe(false)
    const twice = completePromotion({ ...once, xp: { ...once.xp, atCap: true } }, s.seed)
    expect(twice.star).toBe(5)
    expect(shownStar({ ...twice, xp: { ...twice.xp, atCap: false } }, 1)).toBe(twice.star)
  })
})

describe('synthesis refuses the busy (B41)', () => {
  it('a sacrifice out on a bounty or in a drill', () => {
    const { s, ids } = roster()
    const input = { mode: 'salvage' as const, survivorId: null, sacrificeIds: [ids[1]!] }
    expect(canSynthesize(s, input)).toBe(true)
    expect(() => synthesize(onBounty(s, ids[1]!), input)).toThrow(/out on a bounty/)
    expect(() => synthesize(patch(s, ids[1]!, { training: DRILL }), input)).toThrow(/drill/)
  })

  it('a survivor who is away, held, promoting, drilling or on a bounty', () => {
    const { s, ids } = roster()
    const survivor = ids[0]!
    const input = { mode: 'transfer' as const, survivorId: survivor, sacrificeIds: [ids[1]!] }
    expect(canSynthesize(s, input)).toBe(true)
    expect(() => synthesize(patch(s, survivor, { expedition: { completesAtWorld: 1e15 } }), input)).toThrow(/away in the Ruins/)
    expect(() => synthesize(patch(s, survivor, { captiveOf: { master: 'X', rivalId: 'r', ransomGold: 1, ransomGems: 1, deadlineWorld: 1e15 } }), input)).toThrow(/held captive/)
    expect(() => synthesize(patch(s, survivor, { promotion: { completesAtWorld: 1e15 } }), input)).toThrow(/mid-promotion/)
    expect(() => synthesize(patch(s, survivor, { training: DRILL }), input)).toThrow(/drill/)
    expect(() => synthesize(onBounty(s, survivor), input)).toThrow(/out on a bounty/)
  })
})
