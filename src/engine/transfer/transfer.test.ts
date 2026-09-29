import { describe, it, expect } from 'vitest'
import {
  maxTransferGrade,
  transferRefusal,
  transferSkill,
  transferCost,
  transferredLevel,
  fuseRefusal,
  fuseSkill,
  fuseOptions,
  fuseCost,
} from './transfer'
import { createAccount } from '../account'
import { TUNING } from '../tuning'
import type { GameState, HeroId, OwnedHero } from '../types'

const TR = TUNING.skills.transfer
const sk = (id: string, level = 1) => ({ id, level, xp: 0 })

function hero(id: string, skills: { id: string; level: number; xp: number }[], extra: Partial<OwnedHero> = {}): OwnedHero {
  const base = createAccount(1).heroes['h_000001' as HeroId]!
  return { ...base, id: id as HeroId, name: `Hero ${id}`, skills, ...extra }
}

function world(heroes: OwnedHero[], stationLevel = 1, gold = 100_000): GameState {
  const base = createAccount(1)
  const map: Record<string, OwnedHero> = {}
  for (const h of heroes) map[h.id] = h
  return {
    ...base,
    gold,
    heroes: map,
    facilities: { ...base.facilities, transferStation: { level: stationLevel, build: null } },
  }
}

describe('Transfer Station — transfer', () => {
  it('ceiling grade rises with station level', () => {
    expect(maxTransferGrade(0)).toBeNull()
    expect(maxTransferGrade(1)).toBe('D')
    expect(maxTransferGrade(3)).toBe('C')
    expect(maxTransferGrade(7)).toBe('A')
  })

  it('moves a skill: the donor forgets it, the recipient learns it one level lower', () => {
    const s = world([hero('a', [sk('berserk', 4)]), hero('b', [])])
    const after = transferSkill(s, 'a' as HeroId, 'b' as HeroId, 'berserk')
    expect(after.heroes['a' as HeroId]!.skills).toEqual([])
    expect(after.heroes['b' as HeroId]!.skills).toEqual([sk('berserk', 3)])
    expect(after.gold).toBe(s.gold - transferCost('berserk'))
    expect(transferredLevel(4, TR.keepLevelAt)).toBe(4)
  })

  it('resolves merges on the recipient (gathering Berserk onto a Composure holder → Exceed)', () => {
    const s = world([hero('a', [sk('berserk', 4)]), hero('b', [sk('composure', 3)])])
    const after = transferSkill(s, 'a' as HeroId, 'b' as HeroId, 'berserk')
    expect(after.heroes['b' as HeroId]!.skills.map((x) => x.id)).toEqual(['exceed'])
  })

  it('refuses bound, conditional, over-grade, duplicate and unaffordable transfers', () => {
    const s = world([
      hero('a', [sk('dragon_slayer'), sk('projectile_defense'), sk('sword_soul'), sk('berserk')]),
      hero('b', [sk('berserk')]),
    ])
    expect(transferRefusal(s, 'a' as HeroId, 'b' as HeroId, 'dragon_slayer')).toMatch(/bound/)
    expect(transferRefusal(s, 'a' as HeroId, 'b' as HeroId, 'projectile_defense')).toMatch(/bound/)
    expect(transferRefusal(s, 'a' as HeroId, 'b' as HeroId, 'sword_soul')).toMatch(/ceiling/)
    expect(transferRefusal(s, 'a' as HeroId, 'b' as HeroId, 'berserk')).toMatch(/already/)
    expect(transferRefusal(world([hero('a', [sk('composure')]), hero('b', [])], 1, 0), 'a' as HeroId, 'b' as HeroId, 'composure')).toMatch(/gold/)
    expect(transferRefusal(world([hero('a', [sk('composure')]), hero('b', [])], 0), 'a' as HeroId, 'b' as HeroId, 'composure')).toMatch(/not built/)
    expect(() => transferSkill(s, 'a' as HeroId, 'b' as HeroId, 'dragon_slayer')).toThrow()
  })
})

describe('Transfer Station — fuse', () => {
  it('fuses a merge one level earlier than auto-merge', () => {
    const s = world([hero('a', [sk('berserk', 2), sk('calmness', 2)])])
    expect(fuseRefusal(s, 'a' as HeroId, 'ixid')).toBeNull()
    const after = fuseSkill(s, 'a' as HeroId, 'ixid')
    expect(after.heroes['a' as HeroId]!.skills).toEqual([sk('ixid')])
    expect(after.gold).toBe(s.gold - fuseCost('ixid'))
    expect(fuseRefusal(world([hero('a', [sk('berserk', 1), sk('calmness', 2)])]), 'a' as HeroId, 'ixid')).toMatch(/Lv2/)
  })

  it('evolves a maxed Pain Tolerance into Battle Speed (and not before)', () => {
    expect(fuseRefusal(world([hero('a', [sk('pain_tolerance', 3)])]), 'a' as HeroId, 'battle_speed')).toMatch(/Lv4/)
    const after = fuseSkill(world([hero('a', [sk('pain_tolerance', 4)])]), 'a' as HeroId, 'battle_speed')
    expect(after.heroes['a' as HeroId]!.skills).toEqual([sk('battle_speed')])
  })

  it('lists the fusions a hero is working toward', () => {
    const opts = fuseOptions(world([hero('a', [sk('berserk', 2)])]), 'a' as HeroId)
    expect(opts.map((o) => o.result).sort()).toEqual(['exceed', 'ixid'])
    expect(opts.every((o) => !o.ok)).toBe(true)
  })
})
