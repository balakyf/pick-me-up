import { describe, it, expect } from 'vitest'
import { createAccount } from '../account'
import { floorXp, playFloor } from '../tower'
import type { BonusRoomKind, FloorResult, GameState, HeroId } from '../types'
import { CHALLENGE } from './tuning'
import { challengeOf } from './challenge'
import { afterFloor, merchantWares, resolveBonusRoom, roomChoices, rollBonusRoom, ROOM_KINDS } from './rooms'
import { rosterIds, veteranState, withParty } from './fixtures.test-util'

const R = CHALLENGE.rooms

function withRoom(s: GameState, kind: BonusRoomKind, floor = 20): GameState {
  return { ...s, challenge: { ...challengeOf(s), room: { kind, floor, bought: [] } } }
}

function base(): GameState {
  const s = veteranState(4, 25, 20)
  return withParty(s, rosterIds(s))
}

describe('side rooms after anchors', () => {
  it('only anchors reveal them, about as often as tuned, every kind appears, deterministically', () => {
    let opened = 0
    const kinds = new Set<BonusRoomKind>()
    for (let seed = 1; seed <= 200; seed++) {
      const s = createAccount(seed)
      expect(rollBonusRoom(s, 7)).toBeNull()
      const k = rollBonusRoom(s, 25)
      expect(rollBonusRoom(s, 25)).toBe(k)
      if (k) {
        opened++
        kinds.add(k)
      }
    }
    expect(opened / 200).toBeGreaterThan(R.chance - 0.1)
    expect(opened / 200).toBeLessThan(R.chance + 0.1)
    expect([...kinds].sort()).toEqual([...ROOM_KINDS].sort())
  })

  it("opens on an anchor's first clear only, and spends the Shrine blessing on its floor", () => {
    let seed = 1
    while (rollBonusRoom(createAccount(seed), 20) === null) seed++
    const s = createAccount(seed)
    const result = { floor: 20, firstClear: true } as FloorResult
    const opened = afterFloor({ state: s, result }).state
    expect(challengeOf(opened).room).toEqual({ kind: rollBonusRoom(s, 20), floor: 20, bought: [] })
    expect(challengeOf(afterFloor({ state: s, result: { ...result, firstClear: false } }).state).room).toBeNull()
    const blessed = { ...s, challenge: { ...challengeOf(s), blessing: { floor: 21, pct: 0.1 } } }
    expect(challengeOf(afterFloor({ state: blessed, result: { floor: 21, firstClear: false } as FloorResult }).state).blessing).toBeNull()
    expect(challengeOf(afterFloor({ state: blessed, result: { floor: 20, firstClear: false } as FloorResult }).state).blessing).not.toBeNull()
  })

  it('the Treasure Vault pays gold and stones; leaving closes any room', () => {
    const s = withRoom(base(), 'vault', 25)
    const { state, outcome } = resolveBonusRoom(s, 'take')
    expect(state.gold).toBe(s.gold + R.vaultGoldPerFloor * 25)
    expect(state.materials.promotionStone).toBe((s.materials.promotionStone ?? 0) + outcome.materials.promotionStone!)
    expect(challengeOf(state).room).toBeNull()
    const left = resolveBonusRoom(s, 'leave').state
    expect(left.gold).toBe(s.gold)
    expect(challengeOf(left).room).toBeNull()
  })

  it('the Cursed Shrine costs the party Sanity and blesses their next floor', () => {
    const s = withRoom(base(), 'shrine')
    const { state } = resolveBonusRoom(s, 'accept')
    const id = s.party.slots[0]!
    expect(state.heroes[id]!.sanity).toBe(s.heroes[id]!.sanity - R.shrineSanity)
    expect(challengeOf(state).blessing).toEqual({ floor: s.tower.currentFloor, pct: R.shrineBuff })
    const bench = rosterIds(s).find((h) => !s.party.slots.includes(h))!
    expect(state.heroes[bench]!.sanity).toBe(s.heroes[bench]!.sanity)
  })

  it('the Lost Hero joins for free; Training Grounds teach the party', () => {
    const s = withRoom(base(), 'lostHero')
    const { state, outcome } = resolveBonusRoom(s, 'accept')
    expect(Object.keys(state.heroes).length).toBe(Object.keys(s.heroes).length + 1)
    expect(state.gold).toBe(s.gold)
    expect(outcome.recruit!.star).toBeLessThanOrEqual(3)

    const t = withRoom(base(), 'training', 20)
    const trained = resolveBonusRoom(t, 'train')
    expect(trained.outcome.xp).toBe(Math.round(floorXp(20) * R.trainingXpMult))
    const id = t.party.slots[0]!
    expect(trained.state.heroes[id]!.xp).not.toEqual(t.heroes[id]!.xp)
  })

  it('the Wandering Merchant sells each ware once for gold, refuses the broke, and stays until left', () => {
    const s = withRoom(base(), 'merchant', 30)
    const wares = merchantWares(s, 30)
    expect(wares.map((w) => w.id)).toEqual(['stones', 'attr', 'rank', 'gear'])
    expect(merchantWares(s, 30)).toEqual(wares)
    const bought = resolveBonusRoom(s, 'gear')
    expect(bought.state.gold).toBe(s.gold - wares[3]!.price)
    expect(bought.state.inventory).toHaveLength(s.inventory.length + 1)
    expect(bought.outcome.item!.grade).toBe('C')
    expect(roomChoices(challengeOf(bought.state).room!)).toEqual(['stones', 'attr', 'rank', 'leave'])
    expect(() => resolveBonusRoom(bought.state, 'gear')).toThrow(/not offered/)
    expect(() => resolveBonusRoom({ ...s, gold: 0 }, 'stones')).toThrow(/merchant wants/)
    let cur = bought.state
    for (const w of ['stones', 'attr', 'rank']) cur = resolveBonusRoom(cur, w).state
    expect(challengeOf(cur).room).toBeNull()
  })

  it('the Mimic is a real (seeded) fight: loot on a win, and the fallen stay fallen', () => {
    const s = withRoom(base(), 'mimic', 20)
    const a = resolveBonusRoom(s, 'fight')
    const b = resolveBonusRoom(s, 'fight')
    expect(a.outcome.log!.events).toEqual(b.outcome.log!.events)
    expect(a.outcome.won).toBe(true)
    expect(a.state.gold).toBe(s.gold + R.mimicGoldPerFloor * 20)
    expect(a.outcome.item).toBeDefined()
    for (const id of a.outcome.fallen) expect(a.state.heroes[id]!.alive).toBe(false)

    const weak = withRoom(withParty(veteranState(4, 1, 20), rosterIds(veteranState(4, 1, 20)).slice(-1)), 'mimic', 20)
    const lost = resolveBonusRoom({ ...weak, challenge: { ...challengeOf(weak), room: { kind: 'mimic', floor: 20, bought: [] } } }, 'fight')
    expect(lost.state.gold).toBeLessThanOrEqual(weak.gold + R.mimicGoldPerFloor * 20)
  })

  it('refuses when nothing is open, or the party is empty for a room that needs it', () => {
    const s = base()
    expect(() => resolveBonusRoom(s, 'leave')).toThrow(/no side room/)
    const empty = withRoom({ ...s, party: { ...s.party, slots: [null, null, null, null, null] } }, 'training')
    expect(() => resolveBonusRoom(empty, 'train')).toThrow(/fit to go in/)
    expect(() => resolveBonusRoom(empty, 'shrine')).toThrow(/not offered/)
  })

  it('the tower attempt reads the blessing (a blessed party hits harder on that floor)', () => {
    const s = base()
    const plain = playFloor(s).result.result.log
    const blessed = playFloor({ ...s, challenge: { ...challengeOf(s), blessing: { floor: s.tower.currentFloor, pct: 0.5 } } }).result.result.log
    const firstHeroHit = (log: typeof plain) => log.events.find((e) => e.kind === 'hit' && (s.heroes[e.actorId as HeroId] !== undefined))
    const a = firstHeroHit(plain)
    const b = firstHeroHit(blessed)
    expect(a && b && a.kind === 'hit' && b.kind === 'hit' && b.amount > a.amount).toBe(true)
  })
})
