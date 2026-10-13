import { describe, it, expect, afterEach } from 'vitest'
import { createAccount } from '../../engine/account'
import type { GameState, HeroId, Nemesis } from '../../engine/types'
import { setLocale } from '../i18n/i18n'
import { baneName, baneWhere, counterHint, echoGift, giftFor, heirBond, lessonLine, pctNum, statGift } from './legacyText'

const nem = (over: Partial<Nemesis> = {}): Nemesis => ({
  id: 'nem_h_1',
  templateId: 'knight',
  name: 'Knight',
  element: 'earth',
  level: 14,
  heroId: 'h_000001' as HeroId,
  heroName: 'Mira Vale',
  diedFloor: 12,
  revengeFloor: 16,
  status: 'waiting',
  ...over,
})

afterEach(() => setLocale('en'))

describe('legacy words', () => {
  it('describes an Echo: the stat, and the skill fragment when there is one', () => {
    expect(statGift('pAtk', 0.1)).toBe('+10% P.ATK')
    expect(echoGift({ stat: 'mAtk', pct: 0.1 })).toBe('+10% M.ATK')
    expect(echoGift({ stat: 'mAtk', pct: 0.1, skillId: 'power_strike' })).toBe('+10% M.ATK · Power Strike +1 if known')
  })

  it('tells each heir what they would receive (the fragment only when they know the skill)', () => {
    const h = Object.values(createAccount(3).heroes)[0]!
    const p = { stat: 'spd' as const, pct: 0.1, skillId: 'power_strike' }
    expect(giftFor({ ...h, skills: [] }, p)).toBe('+10% SPD')
    expect(giftFor({ ...h, skills: [{ id: 'power_strike', level: 1, xp: 0 }] }, p)).toBe('+10% SPD · Power Strike +1')
  })

  it('names the bond between heir and fallen', () => {
    const s = createAccount(4)
    const a = 'h_a' as HeroId
    const b = 'h_b' as HeroId
    const rel = (affinity: number): GameState => ({ ...s, life: { ...s.life, relations: { 'h_a|h_b': { affinity, shared: 0 } } } })
    expect(heirBond(rel(70), a, b)).toBe('Closest friend')
    expect(heirBond(rel(35), a, b)).toBe('Their friend')
    expect(heirBond(rel(5), a, b)).toBe('Fought beside them')
    expect(heirBond(rel(-40), a, b)).toBe('Their old rival')
  })

  it('names a Bane, and says where it waits', () => {
    const s = createAccount(5)
    expect(baneName(nem())).toBe('Mira’s Bane')
    expect(baneWhere({ ...s, tower: { ...s.tower, currentFloor: 13 } }, nem())).toBe('waits on floor 16')
    expect(baneWhere({ ...s, tower: { ...s.tower, currentFloor: 20 } }, nem())).toBe('still at large in the tower')
    expect(baneWhere(s, nem({ status: 'avenged' }))).toBe('Avenged at last')
  })

  it('teaches the family and the counter element', () => {
    expect(lessonLine({ name: 'Knight', element: 'earth', family: 'humanoid' })).toBe(
      'Humanoids: the scout now points out their weakness. Knight ⛰️: answer it with 🍃.',
    )
    expect(counterHint('Goblin', 'physical')).toBeNull()
    expect(lessonLine({ name: 'Goblin', element: 'physical', family: 'humanoid' })).toBe('Humanoids: the scout now points out their weakness.')
  })

  it('speaks French', () => {
    setLocale('fr')
    expect(baneName(nem())).toBe('Le Fléau de Mira')
    expect(statGift('pAtk', 0.1)).toBe('+10 % ATQ.P')
    // Decimal commas in French ("+2,5 %"), points in English.
    expect(pctNum(0.025)).toBe('2,5')
    expect(pctNum(0.05)).toBe('5')
    setLocale('en')
    expect(pctNum(0.025)).toBe('2.5')
    expect(pctNum(0.005)).toBe('0.5')
  })
})
