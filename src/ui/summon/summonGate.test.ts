import { describe, expect, it } from 'vitest'
import { reduce } from '../../engine/store'
import { TUNING } from '../../engine/tuning'
import type { GameState } from '../../engine/types'
import { summonGate } from './summonGate'

const DAY = TUNING.life.slotMs * TUNING.life.slotsPerDay
const fresh = (): GameState => reduce(null, { type: 'NEW_ACCOUNT', seed: 7, now: 0 })

/** The crystal at `charge` of 10 today. */
function withCharge(s: GameState, charge: number, gems: number): GameState {
  const day = Math.floor(s.meta.lastSeenAtWorld / DAY)
  return { ...s, gems, life: { ...s.life, crystal: { day, advancedPulls: TUNING.gacha.advanced.dailyCharge - charge } } }
}

describe('summon gate', () => {
  it('a rich Master with a spent crystal is told about the crystal, not the gems', () => {
    const g = summonGate(withCharge(fresh(), 0, 29_635), 'advanced')
    expect(g.canOne).toBe(false)
    expect(g.why).toMatch(/crystal is spent: charge 0\/10/)
    expect(g.why).not.toMatch(/gems/)
  })

  it('a full crystal and no gems blames the gems', () => {
    const g = summonGate(withCharge(fresh(), 10, 20), 'advanced')
    expect(g.canOne).toBe(false)
    expect(g.why).toMatch(/Not enough gems/)
  })

  it('one pull can go but not ten: says why the ten-pull waits', () => {
    const low = summonGate(withCharge(fresh(), 4, 10_000), 'advanced')
    expect(low.canOne).toBe(true)
    expect(low.canTen).toBe(false)
    expect(low.why).toMatch(/full crystal/)
    const poor = summonGate(withCharge(fresh(), 10, 600), 'advanced')
    expect(poor.canTen).toBe(false)
    expect(poor.why).toMatch(/ten-pull costs 1,350 gems/)
    expect(summonGate(withCharge(fresh(), 10, 2_000), 'advanced').why).toBeNull()
  })

  it('the Normal pool: the free tutorial ten-pull, then gold', () => {
    const s = fresh()
    const g = summonGate(s, 'normal')
    expect(g.tutorial).toBe(true)
    expect(g.canTen).toBe(true)
    const broke = summonGate({ ...s, gold: 0, life: { ...s.life, guide: { ...s.life.guide, tutorialPull: true } } }, 'normal')
    expect(broke.canTen).toBe(false)
  })

  it('reads the charge as of now: a new world-day refills the crystal', () => {
    const spent = withCharge(fresh(), 0, 10_000)
    expect(summonGate(spent, 'advanced').charge).toBe(0)
    const later = summonGate(spent, 'advanced', spent.meta.lastSeenAtWorld + 3 * DAY)
    expect(later.charge).toBe(3 * TUNING.gacha.advanced.rechargePerDay)
    expect(later.canOne).toBe(true)
  })
})
