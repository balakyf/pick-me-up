import { afterEach, describe, expect, it } from 'vitest'
import { reduce } from '../../engine/store'
import type { GameState, HeroId, OwnedHero } from '../../engine/types'
import { clearToasts, currentToasts, dismissToast, MAX_TOASTS, subscribeToasts, toast } from './toastBus'
import { describeCommand, describeTime } from './toastText'
import { setLocale } from '../i18n/i18n'

afterEach(() => {
  clearToasts()
  setLocale('en')
})

const DAY = 24 * 3_600_000

function fresh(): GameState {
  return reduce(null, { type: 'NEW_ACCOUNT', seed: 4242, now: 0 })
}

describe('toast bus', () => {
  it('queues, refreshes duplicates, caps the stack and dismisses', () => {
    const seen: number[] = []
    const off = subscribeToasts((items) => seen.push(items.length))
    const a = toast('one')
    toast('two')
    toast('one') // refreshed, not doubled
    expect(currentToasts().map((i) => i.text)).toEqual(['two', 'one'])
    for (let i = 0; i < 10; i++) toast(`n${i}`)
    expect(currentToasts()).toHaveLength(MAX_TOASTS)
    dismissToast(currentToasts()[0]!.id)
    expect(currentToasts()).toHaveLength(MAX_TOASTS - 1)
    dismissToast(a) // already gone: no event
    off()
    expect(seen.length).toBeGreaterThan(3)
  })
})

describe('toast text', () => {
  it('the Daily claim says what it paid', () => {
    const s = fresh()
    const now = 3 * DAY
    const after = reduce(s, { type: 'CLAIM_LOGIN' }, now)
    const said = describeCommand(s, after, { type: 'CLAIM_LOGIN' })
    expect(said?.text).toMatch(/^Daily reward: \+\d+ ♦/)
  })

  it('a banquet counts who ate and how much it restored', () => {
    const s0 = fresh()
    const id = Object.keys(s0.heroes)[0] as HeroId
    const tired: GameState = { ...s0, gold: 10_000, heroes: { ...s0.heroes, [id]: { ...s0.heroes[id]!, sanity: 20 } } }
    const after = reduce(tired, { type: 'BANQUET' })
    const said = describeCommand(tired, after, { type: 'BANQUET' })
    expect(said?.text).toMatch(/A banquet! 1 hero eats well: up to \+\d+ Sanity\./)
  })

  it('time passing: a finished building and a finished promotion are announced', () => {
    const s = fresh()
    const id = Object.keys(s.heroes)[0] as HeroId
    const h = s.heroes[id]! as OwnedHero
    const before: GameState = {
      ...s,
      facilities: { ...s.facilities, tavern: { level: 0, build: { toLevel: 1, completesAtWorld: 1 } } },
      heroes: { ...s.heroes, [id]: { ...h, promotion: { completesAtWorld: 1 } } },
    }
    const after: GameState = {
      ...s,
      facilities: { ...s.facilities, tavern: { level: 1, build: null } },
      heroes: { ...s.heroes, [id]: { ...h, star: (h.star + 1) as OwnedHero['star'], promotion: null } },
    }
    const said = describeTime(before, after).map((x) => x.text)
    expect(said).toContain('The Tavern is built!')
    expect(said.some((x) => x.includes('rises to'))).toBe(true)
    // A different account (a new game, an import) says nothing.
    expect(describeTime(before, { ...after, accountId: 'other' })).toEqual([])
  })

  it('commands with nothing to show stay silent', () => {
    const s = fresh()
    expect(describeCommand(s, s, { type: 'TICK' })).toBeNull()
  })
})
