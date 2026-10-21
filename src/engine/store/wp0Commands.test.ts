/**
 * WP0 contract (spec 2026-10-12 §4.1): the five new Commands are wired into reduceCore.
 * The stubs that are not built yet throw "not built yet"; RETURN_TO_CAMPUS is identity;
 * SEE_UNLOCK is fully implemented (a sorted, de-duplicated set in life.unlocks).
 */
import { describe, it, expect } from 'vitest'
import { reduce } from './store'
import { createAccount } from '../account'
import type { GameState, HeroId } from '../types'

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o)
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v)
  }
  return o
}

const fresh = (): GameState => createAccount(5, { now: 0 })

describe('new commands reach their stubs', () => {
  it('CHOOSE_DOOR reaches chooseDoor (built by WP3: refused with no Doors open)', () => {
    expect(() => reduce(fresh(), { type: 'CHOOSE_DOOR', index: 0 })).toThrow(/chooseDoor: No doors are open/)
  })

  it('BEQUEATH_ECHO reaches bequeathEcho (built by WP5: an unknown echo is refused)', () => {
    const s = fresh()
    const id = Object.keys(s.heroes)[0] as HeroId
    expect(() => reduce(s, { type: 'BEQUEATH_ECHO', fallenId: 'h_999999' as HeroId, heirId: id })).toThrow(/bequeathEcho: /)
  })

  it('CLAIM_RECRUIT reaches claimRecruit (built by WP5: refused without a token)', () => {
    expect(() => reduce(fresh(), { type: 'CLAIM_RECRUIT' })).toThrow(/claimRecruit: /)
  })

  it('RETURN_TO_CAMPUS is identity', () => {
    const s = deepFreeze(fresh())
    expect(reduce(s, { type: 'RETURN_TO_CAMPUS' })).toEqual(s)
  })

  it('the throwing stubs are refused on a deleted account first, like every command', () => {
    const s = fresh()
    const deleted = { ...s, meta: { ...s.meta, deleted: true } }
    expect(() => reduce(deleted, { type: 'CHOOSE_DOOR', index: 0 })).toThrow(/deleted/)
  })
})

describe('SEE_UNLOCK', () => {
  it('adds the place to life.unlocks, sorted and de-duplicated, without mutating its input', () => {
    const s0 = deepFreeze(fresh())
    const s1 = reduce(s0, { type: 'SEE_UNLOCK', place: 'tavern' })
    const s2 = reduce(s1, { type: 'SEE_UNLOCK', place: 'kitchen' })
    const s3 = reduce(s2, { type: 'SEE_UNLOCK', place: 'tavern' })
    const s4 = reduce(s3, { type: 'SEE_UNLOCK', place: 'memorial' })
    expect(s0.life.unlocks).toEqual([])
    expect(s1.life.unlocks).toEqual(['tavern'])
    expect(s2.life.unlocks).toEqual(['kitchen', 'tavern'])
    expect(s3.life.unlocks).toEqual(['kitchen', 'tavern'])
    expect(s3).toEqual(s2)
    expect(s4.life.unlocks).toEqual(['kitchen', 'memorial', 'tavern'])
    // Nothing else moves.
    expect({ ...s4, life: { ...s4.life, unlocks: [] } }).toEqual(s0)
  })
})
