import { describe, expect, it } from 'vitest'
import { runBattle } from './combat'
import { TUNING } from '../tuning'
import { createAccount } from '../account'
import { attemptFloorWithResult, reduce } from '../store'
import { suggestParty } from '../scout'
import { ordersAllowed } from '../tower'
import type { BattleOrder, CombatEvent, CombatUnit, DerivedStats, Encounter, HeroId } from '../types'

/**
 * The 'withdraw' order (Pull back, the Decisive Moment's way out that spends no order —
 * its cost is Sanity after the fight, see tower/withdrawCost.test.ts; review finding
 * #13): for TUNING.combat.withdrawTicks ticks the hero sits out its turns, foes cannot
 * reach it while anyone else on its side stands, and what still reaches it is reduced.
 * Deterministic: the fight before the order's tick is untouched.
 */
function stats(o: Partial<DerivedStats> = {}): DerivedStats {
  return { maxHP: 5000, pAtk: 50, mAtk: 50, pDef: 10, mDef: 10, spd: 250, critPct: 0, evaPct: 0, accPct: 100, statusRes: 0, ...o }
}
function unit(id: string, side: 'hero' | 'enemy', o: Partial<DerivedStats> = {}): CombatUnit {
  const s = stats(o)
  return {
    id,
    name: id,
    side,
    unitClass: side === 'hero' ? 'warrior' : null,
    element: 'physical',
    line: 'front',
    level: 1,
    stats: s,
    maxSP: 0,
    currentHP: s.maxHP,
    currentSP: 0,
    actionGauge: 0,
    alive: true,
    skills: [],
    keywords: [],
    cp: 100,
    ...(side === 'hero' ? { sourceHeroId: id as unknown as HeroId } : {}),
  }
}
function enc(orders: BattleOrder[] = []): Encounter {
  return {
    floor: 1,
    mission: { type: 'test', objectives: [{ kind: 'annihilate' }], timer: 60 },
    waves: [{ units: [unit('e1', 'enemy', { spd: 260 })] }],
    encounterContext: 'tower',
    ...(orders.length ? { orders } : {}),
  }
}
const heroes = () => [unit('a', 'hero'), unit('b', 'hero')]
const strip = (e: CombatEvent) => ({ ...e, seq: 0 })

describe("the 'withdraw' order (Pull back)", () => {
  const T = 9
  const W = TUNING.combat.withdrawTicks
  const base = runBattle(heroes(), enc(), 1)
  const pulled = runBattle(heroes(), enc([{ tick: T, kind: 'withdraw', allyId: 'a' }]), 1)
  const inWindow = (e: CombatEvent) => e.tick >= T && e.tick < T + W

  it('the premise: without it, the foe keeps striking the front-most hero (a)', () => {
    const hits = base.log.events.filter((e) => e.kind === 'hit' && e.actorId === 'e1')
    expect(hits.length).toBeGreaterThan(3)
    expect(hits.every((e) => e.kind === 'hit' && e.targetId === 'a')).toBe(true)
  })

  it('replays the fight exactly up to the order tick', () => {
    const before = (l: CombatEvent[]) => l.filter((e) => e.tick < T).map(strip)
    expect(before(pulled.log.events)).toEqual(before(base.log.events))
  })

  it('the hero sits out its turns and is out of reach while it is back, then returns', () => {
    const ev = pulled.log.events
    expect(ev.some((e) => e.kind === 'order' && e.order.kind === 'withdraw' && e.tick === T)).toBe(true)
    expect(ev.filter((e) => inWindow(e) && e.kind === 'act' && e.actorId === 'a')).toEqual([])
    const foeHits = ev.filter((e) => inWindow(e) && e.kind === 'hit' && e.actorId === 'e1')
    expect(foeHits.length).toBeGreaterThan(0)
    expect(foeHits.every((e) => e.kind === 'hit' && e.targetId === 'b')).toBe(true)
    // Back in the line afterwards: it acts again, and the foe may strike it again.
    expect(ev.some((e) => e.tick >= T + W && e.kind === 'act' && e.actorId === 'a')).toBe(true)
    expect(ev.some((e) => e.tick >= T + W && e.kind === 'hit' && e.actorId === 'e1' && e.targetId === 'a')).toBe(true)
  })

  it('with nobody else left on its side, the foe can still reach it, for reduced damage', () => {
    const solo = (orders: BattleOrder[]) => runBattle([unit('a', 'hero')], enc(orders), 1).log.events
    const hitAt = (ev: CombatEvent[]) => ev.find((e) => inWindow(e) && e.kind === 'hit' && e.actorId === 'e1') as Extract<CombatEvent, { kind: 'hit' }>
    const plain = hitAt(solo([]))
    const back = hitAt(solo([{ tick: T, kind: 'withdraw', allyId: 'a' }]))
    expect(back.targetId).toBe('a')
    expect(back.amount).toBeLessThan(plain.amount)
    expect(back.amount / plain.amount).toBeLessThan((1 - TUNING.combat.withdrawReduction) * 1.15) // variance aside
  })

  it('is deterministic', () => {
    const again = runBattle(heroes(), enc([{ tick: T, kind: 'withdraw', allyId: 'a' }]), 1)
    expect(again.log).toEqual(pulled.log)
  })

  it('costs no order: the tower takes it on top of every order the Tactical Center allows', () => {
    let s = createAccount(3)
    s = reduce(s, { type: 'SUMMON', count: 10 })
    const p = suggestParty(s)
    s = reduce(s, { type: 'SET_PARTY', slots: p.slots, lines: p.lines })
    const id = p.slots.find((x) => x !== null)!
    const full: BattleOrder[] = Array.from({ length: ordersAllowed(s) }, (_, i) => ({ tick: 2 + i, kind: 'protect', allyId: id }))
    expect(() => attemptFloorWithResult(s, undefined, undefined, undefined, [...full, { tick: 2, kind: 'withdraw', allyId: id }])).not.toThrow()
    expect(() => attemptFloorWithResult(s, undefined, undefined, undefined, [...full, { tick: 2, kind: 'protect', allyId: id }])).toThrow()
  })
})
