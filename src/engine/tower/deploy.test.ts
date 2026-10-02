import { describe, it, expect } from 'vitest'
import { createAccount } from '../account'
import { summonMany } from '../gacha'
import { reduce, attemptFloorWithResult } from '../store'
import { TUNING } from '../tuning'
import type { GameState, HeroId, OwnedHero } from '../types'
import { canDeploy, deployParty, deployReport, fitCount, fitToDeploy, heroUnfitReason, rebelsNow } from './deploy'
import { playFloor } from './tower'
import { attemptDaily } from '../daily'
import { pvpReady } from '../pvp'
import { canEnterTrial, fitToFight } from '../challenge'
import { canFight, scoutFloor, suggestParty } from '../scout'
import { estateOf } from '../estate'

/** A fresh account with ten more heroes, the first five in the party, and F10 cleared. */
function party(seed = 3): { s: GameState; ids: HeroId[] } {
  let s = { ...createAccount(seed, { now: 0 }), gold: 1_000_000 }
  s = summonMany(s, 'normal', 10).state
  const ids = (Object.keys(s.heroes) as HeroId[]).slice(0, 6)
  s = { ...s, party: { slots: ids.slice(0, 5), lines: ['front', 'front', 'mid', 'back', 'back'] } }
  return { s, ids }
}

function patch(s: GameState, id: HeroId, p: Partial<OwnedHero>): GameState {
  return { ...s, heroes: { ...s.heroes, [id]: { ...s.heroes[id]!, ...p } } }
}

function burnOut(s: GameState, id: HeroId): GameState {
  const e = estateOf(s)
  const t = { fatigue: 0, foughtAt: 0, burnoutUntil: 1e15, veteran: false, withdrawn: null, lowSince: null }
  return { ...s, estate: { ...e, trauma: { ...e.trauma, [id]: t } } }
}

function onBounty(s: GameState, id: HeroId): GameState {
  const e = estateOf(s)
  return { ...s, estate: { ...e, bounties: [...e.bounties, { id: 0, kind: 'herbs', heroIds: [id], postedAt: 0, endsAt: 1e15 }] } }
}

/** Find a Wary, broken variant of `id` whose rebellion draw fires on this attempt. */
function rebelOn(s: GameState, id: HeroId): GameState | null {
  for (let a = 0; a < 40; a++) {
    const t = { ...s, tower: { ...s.tower, attemptIndex: a } }
    const r = patch(t, id, { favor: 0, sanity: 2 })
    if (rebelsNow(r, r.heroes[id]!)) return r
  }
  return null
}

describe('fitToDeploy — every reason', () => {
  it('a rested hero at home is fit', () => {
    const { s, ids } = party()
    expect(fitToDeploy(s, s.heroes[ids[0]!])).toEqual({ ok: true })
    expect(canDeploy(s, s.heroes[ids[0]!])).toBe(true)
  })

  it('names the true reason for each way a hero stays behind', () => {
    const { s, ids } = party()
    const id = ids[0]!
    const reason = (st: GameState) => {
      const c = fitToDeploy(st, st.heroes[id])
      return c.ok ? 'ok' : c.reason
    }
    expect(reason(patch(s, id, { alive: false }))).toBe('dead')
    expect(fitToDeploy(s, undefined)).toEqual({ ok: false, reason: 'dead' })
    expect(reason(patch(s, id, { captiveOf: { master: 'X', rivalId: 'r', ransomGold: 1, ransomGems: 1, deadlineWorld: 9 } }))).toBe('captive')
    expect(reason(patch(s, id, { expedition: { completesAtWorld: 9 } }))).toBe('expedition')
    expect(reason(patch(s, id, { promotion: { completesAtWorld: 9 } }))).toBe('promotion')
    expect(reason(patch(s, id, { training: { skillId: 'composure', mode: 'learn', completesAtWorld: 9 } }))).toBe('training')
    expect(reason(onBounty(s, id))).toBe('bounty')
    expect(reason(burnOut(s, id))).toBe('burnout')
    expect(reason(patch(s, id, { sanity: 0 }))).toBe('exhausted')
    const rebel = rebelOn(s, id)
    expect(rebel).not.toBeNull()
    expect(reason(rebel!)).toBe('rebellion')
    // Non-tower callers skip the tower's rebellion draw.
    expect(fitToDeploy(rebel!, rebel!.heroes[id], { rebellion: false }).ok).toBe(true)
  })

  it('the estate reason wins over a broken-down hero (that is the one the Master can act on)', () => {
    const { s, ids } = party()
    const id = ids[0]!
    expect(fitToDeploy(burnOut(patch(s, id, { sanity: 0 }), id), { ...s.heroes[id]!, sanity: 0 })).toEqual({ ok: false, reason: 'burnout' })
    expect(heroUnfitReason({ ...s.heroes[id]!, sanity: 0 })).toBe('exhausted')
  })

  it('the rebellion draw is fixed before Enter: the report and the attempt agree', () => {
    const { s, ids } = party()
    const rebel = rebelOn(s, ids[0]!)!
    expect(deployReport(rebel)[0]).toMatchObject({ heroId: ids[0], fit: false, reason: 'rebellion' })
    const { result } = playFloor(rebel)
    expect(result.refusals).toContainEqual({ heroId: ids[0], reason: 'rebellion' })
    expect(result.refusedHeroIds).toEqual([ids[0]])
  })
})

describe('deployReport', () => {
  it('one row per slot, in order, with Sanity and the reason', () => {
    const { s, ids } = party()
    let t = patch(s, ids[1]!, { promotion: { completesAtWorld: 9 } })
    t = patch(t, ids[2]!, { sanity: 25 })
    t = { ...t, party: { ...t.party, slots: [ids[0]!, ids[1]!, ids[2]!, null, ids[3]!] } }
    const r = deployReport(t)
    expect(r).toHaveLength(TUNING.account.partySize)
    expect(r.map((x) => x.slot)).toEqual([0, 1, 2, 3, 4])
    expect(r[0]).toMatchObject({ heroId: ids[0], fit: true, sanityMax: TUNING.lobby.sanityMax })
    expect(r[0]!.reason).toBeUndefined()
    expect(r[1]).toMatchObject({ heroId: ids[1], fit: false, reason: 'promotion' })
    expect(r[2]).toMatchObject({ heroId: ids[2], fit: true, sanity: 25 })
    expect(r[3]).toMatchObject({ heroId: null, fit: false, reason: 'empty' })
    expect(r[4]!.line).toBe('back')
    expect(fitCount(t)).toBe(3)
  })

  it('is pure (same state, same report; the state is untouched)', () => {
    const { s } = party()
    const snap = JSON.stringify(s)
    expect(deployReport(s)).toEqual(deployReport(s))
    expect(JSON.stringify(s)).toBe(snap)
  })
})

describe('playFloor rides the rails', () => {
  it('skips a hero whose promotion is in progress (B2) and says why', () => {
    const { s, ids } = party()
    const t = patch(s, ids[0]!, { promotion: { completesAtWorld: 1e15 } })
    const { result } = playFloor(t)
    expect(result.result.log.unitsInit.some((u) => u.id === ids[0])).toBe(false)
    expect(result.refusals).toContainEqual({ heroId: ids[0], reason: 'promotion' })
    // Refused (the old meaning) is only rebellion, burnout and bounty.
    expect(result.refusedHeroIds).not.toContain(ids[0])
  })

  it('refuses outright when nobody is fit: no attempt spent, no loop attempt burned', () => {
    const { s, ids } = party()
    let t = s
    for (const id of ids.slice(0, 5)) t = patch(t, id, { sanity: 0 })
    expect(() => playFloor(t)).toThrow('playFloor: no one is fit to fight')
    expect(() => reduce(t, { type: 'ATTEMPT_FLOOR' })).toThrow(/no one is fit to fight/)
    // At the F40 gate inside the loop.
    const gate = { ...t, tower: { ...t.tower, currentFloor: 40, highestCleared: 39, loop: { attemptsLeft: 2, scars: 0 } } }
    expect(() => attemptFloorWithResult(gate)).toThrow(/no one is fit to fight/)
    const empty = { ...s, party: { ...s.party, slots: [null, null, null, null, null] } }
    expect(() => playFloor(empty)).toThrow(/no one is fit to fight/)
  })

  it('deployParty keeps slot order and lists every stay-behind', () => {
    const { s, ids } = party()
    const t = onBounty(patch(s, ids[3]!, { alive: false }), ids[1]!)
    const d = deployParty(t, (h, line) => `${h.id}@${line}`)
    expect(d.units).toEqual([`${ids[0]}@front`, `${ids[2]}@mid`, `${ids[4]}@back`])
    expect(d.ids).toEqual([ids[0], ids[2], ids[4]])
    expect(d.refusals).toEqual([
      { heroId: ids[1], reason: 'bounty' },
      { heroId: ids[3], reason: 'dead' },
    ])
  })
})

describe('every other place that decides who fights', () => {
  it('the Daily Dungeon leaves the promoting and the bounty-bound at home', () => {
    const { s, ids } = party()
    const open = { ...s, tower: { ...s.tower, highestCleared: TUNING.lobby.daily.unlockHighestCleared } }
    let t = patch(open, ids[0]!, { promotion: { completesAtWorld: 1e15 } })
    t = onBounty(t, ids[1]!)
    const { result } = attemptDaily(t, 0)
    const fielded = result.result.log.unitsInit.filter((u) => u.side === 'hero').map((u) => u.id)
    expect(fielded).not.toContain(ids[0])
    expect(fielded).not.toContain(ids[1])
    expect(fielded.length).toBe(3)
  })

  it('PvP, raids, rooms, the trial and the scout share the rule', () => {
    const { s, ids } = party()
    const t = burnOut(onBounty(s, ids[0]!), ids[1]!)
    expect(pvpReady(t, t.heroes[ids[0]!])).toBe(false)
    expect(pvpReady(t, t.heroes[ids[1]!])).toBe(false)
    expect(pvpReady(t, t.heroes[ids[2]!])).toBe(true)
    expect(fitToFight(t.heroes[ids[0]!], t)).toBe(false)
    expect(fitToFight(t.heroes[ids[1]!], t)).toBe(false)
    expect(canFight(t.heroes[ids[1]!]!, t)).toBe(false)
    // The trial's simulation ignores burnout but not a bounty (they are away).
    expect(canEnterTrial(t.heroes[ids[0]!], t)).toBe(false)
    expect(canEnterTrial(t.heroes[ids[1]!], t)).toBe(true)
    // A hero in the yard is busy (with or without the account to hand).
    const drilling = patch(t, ids[2]!, { training: { skillId: 'x', mode: 'learn', completesAtWorld: 9 } })
    expect(canEnterTrial(drilling.heroes[ids[2]!], drilling)).toBe(false)
    expect(canEnterTrial(drilling.heroes[ids[2]!])).toBe(false)
    expect(canEnterTrial(t.heroes[ids[2]!], t)).toBe(true)
  })

  it('the scout counts only who will really fight; suggestions skip the unfit', () => {
    const { s, ids } = party()
    const full = scoutFloor(s)!.partyCp
    const t = patch(s, ids[0]!, { promotion: { completesAtWorld: 1e15 } })
    expect(scoutFloor(t)!.partyCp).toBeLessThan(full)
    const sugg = suggestParty(onBounty(t, ids[1]!)).slots
    expect(sugg).not.toContain(ids[0])
    expect(sugg).not.toContain(ids[1])
  })
})
