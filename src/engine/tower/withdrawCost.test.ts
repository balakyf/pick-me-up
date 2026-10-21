import { describe, expect, it } from 'vitest'
import { createAccount, DEFAULT_SAVE_KEY, MemoryStorage, saveState } from '../account'
import { createStore, reduce } from '../store'
import { suggestParty } from '../scout'
import { TUNING } from '../tuning'
import type { BattleOrder, GameState, HeroId } from '../types'
import { playFloor } from './tower'

/**
 * Pull back's lasting cost (the Decisive Moment's 'withdraw' order). It spends no order,
 * so it needs a cost of its own or it would always beat Protect: the hero comes home
 * shaken and loses TUNING.combat.withdrawSanityCost Sanity after the fight, on top of the
 * floor's drain. Exactly once, only to the hero pulled back, deterministic.
 */
const COST = TUNING.combat.withdrawSanityCost

function account(sanity?: number): { s: GameState; party: HeroId[] } {
  let s = createAccount(3)
  s = reduce(s, { type: 'SUMMON', count: 10 })
  const p = suggestParty(s)
  s = reduce(s, { type: 'SET_PARTY', slots: p.slots, lines: p.lines })
  const party = p.slots.filter((x): x is HeroId => x !== null)
  if (sanity !== undefined) s = { ...s, heroes: { ...s.heroes, [party[0]!]: { ...s.heroes[party[0]!]!, sanity } } }
  return { s, party }
}
const pull = (id: HeroId, tick = 2): BattleOrder => ({ tick, kind: 'withdraw', allyId: id as string })
const sanityOf = (s: GameState) => Object.fromEntries(Object.entries(s.heroes).map(([id, h]) => [id, h.sanity]))

/** Deep-freeze a state: any write to it while a floor is played throws. */
function freeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o)
    for (const v of Object.values(o as object)) freeze(v)
  }
  return o
}

describe("Pull back's cost: the hero comes home shaken", () => {
  it('the premise: floor 1 with or without the order is the same won fight, nobody falls', () => {
    const { s, party } = account()
    const plain = playFloor(s)
    const pulled = playFloor(s, undefined, undefined, undefined, [pull(party[0]!)])
    expect(plain.result.cleared).toBe(true)
    expect(pulled.result.cleared).toBe(true)
    expect(plain.result.fallenHeroIds).toEqual([])
    expect(pulled.result.fallenHeroIds).toEqual([])
    expect(pulled.result.result.log.events.some((e) => e.kind === 'order' && e.order.kind === 'withdraw')).toBe(true)
  })

  it('costs the pulled-back hero exactly withdrawSanityCost, and nobody else anything', () => {
    const { s, party } = account()
    const plain = sanityOf(playFloor(s).state)
    const r = playFloor(s, undefined, undefined, undefined, [pull(party[0]!)])
    const after = sanityOf(r.state)
    expect(COST).toBeGreaterThanOrEqual(15)
    expect(COST).toBeLessThanOrEqual(20)
    for (const id of Object.keys(after)) expect(after[id], id).toBe(id === party[0] ? plain[id]! - COST : plain[id])
    expect(r.result.shaken).toEqual([{ heroId: party[0], sanity: COST }])
    expect(playFloor(s).result.shaken).toBeUndefined()
  })

  it('is paid once, however many times the hero was pulled back', () => {
    const { s, party } = account()
    const once = playFloor(s, undefined, undefined, undefined, [pull(party[0]!)])
    const twice = playFloor(s, undefined, undefined, undefined, [pull(party[0]!), pull(party[0]!, 30)])
    expect(twice.result.result.log.events.filter((e) => e.kind === 'order' && e.order.kind === 'withdraw').length).toBeGreaterThanOrEqual(2)
    expect(twice.state.heroes[party[0]!]!.sanity).toBe(once.state.heroes[party[0]!]!.sanity)
    expect(twice.result.shaken).toEqual([{ heroId: party[0], sanity: COST }])
  })

  it('costs nothing when the order never landed (given after the fight was decided)', () => {
    const { s, party } = account()
    const plain = playFloor(s)
    const end = plain.result.result.log.events.at(-1)!.tick
    const late = playFloor(s, undefined, undefined, undefined, [pull(party[0]!, end + 1)])
    expect(sanityOf(late.state)).toEqual(sanityOf(plain.state))
    expect(late.result.shaken).toBeUndefined()
  })

  it('shakes but never breaks: alone it stops at 1 Sanity', () => {
    const { s, party } = account(COST)
    const plain = playFloor(s).state.heroes[party[0]!]!.sanity
    expect(plain).toBeGreaterThan(1)
    expect(plain).toBeLessThan(COST + 1)
    const r = playFloor(s, undefined, undefined, undefined, [pull(party[0]!)])
    expect(r.state.heroes[party[0]!]!.sanity).toBe(1)
    expect(r.result.shaken).toEqual([{ heroId: party[0], sanity: plain - 1 }])
  })

  it('is deterministic and pure (a frozen state, the same result twice)', () => {
    const { s, party } = account()
    freeze(s)
    const a = playFloor(s, undefined, undefined, undefined, [pull(party[0]!)])
    const b = playFloor(s, undefined, undefined, undefined, [pull(party[0]!)])
    expect(b).toEqual(a)
  })

  it('through the store: a floor revised with Pull back pays the cost once, not on top of the first attempt', () => {
    const { s, party } = account()
    const storage = new MemoryStorage()
    storage.write(DEFAULT_SAVE_KEY, saveState(s))
    const store = createStore({ storage })
    store.load()
    const pre = store.getState()!
    const plain = store.dispatch({ type: 'ATTEMPT_FLOOR' })
    const revised = store.revise({ type: 'ATTEMPT_FLOOR', orders: [pull(party[0]!)] })
    const direct = reduce(pre, { type: 'ATTEMPT_FLOOR', orders: [pull(party[0]!)] })
    expect(revised).toEqual(direct)
    expect(revised.heroes[party[0]!]!.sanity).toBe(plain.heroes[party[0]!]!.sanity - COST)
    for (const id of party.slice(1)) expect(revised.heroes[id]!.sanity).toBe(plain.heroes[id]!.sanity)
  })
})
