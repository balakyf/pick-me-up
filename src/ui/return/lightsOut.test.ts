import { describe, it, expect, afterEach } from 'vitest'
import { brewingTimers, edgeRelation, goalBars, iselSignoff, ISEL_SIGNOFFS, nextFloorTeaser, restedOutlook } from './lightsOut'
import { finishedTimers, honestTitle, snapshotTimers } from './tabTitle'
import { createAccount } from '../../engine/account'
import { reduce } from '../../engine/store'
import { relationKey } from '../../engine/life'
import { TUNING } from '../../engine/tuning'
import type { GameState, HeroId, OwnedHero } from '../../engine/types'
import { setLocale } from '../i18n/i18n'

afterEach(() => setLocale('en'))

const T = 10_000_000

function roster(n = 4): GameState {
  let s: GameState = { ...createAccount(19), gold: TUNING.gacha.normalCostGold * n }
  for (let i = 0; i < n; i++) s = reduce(s, { type: 'SUMMON' })
  return s
}
function ids(s: GameState): HeroId[] {
  return (Object.values(s.heroes) as OwnedHero[]).filter((h) => h.alive).map((h) => h.id).sort()
}

/** Three timers the Master started, finishing at T+300, T+100 and T+200, plus a build. */
function brewing(): GameState {
  const s = roster()
  const [a, b, c] = ids(s)
  return {
    ...s,
    heroes: {
      ...s.heroes,
      [a!]: { ...s.heroes[a!]!, promotion: { completesAtWorld: T + 300 } },
      [b!]: { ...s.heroes[b!]!, training: { skillId: 'power_strike', mode: 'refine', completesAtWorld: T + 100 } },
      [c!]: { ...s.heroes[c!]!, expedition: { completesAtWorld: T + 200 } },
    },
    facilities: { ...s.facilities, kitchen: { level: 1, build: { toLevel: 2, completesAtWorld: T + 400 } } },
  }
}

describe('Lights Out: what is brewing', () => {
  it('lists running timers soonest first, capped', () => {
    const s = brewing()
    const all = brewingTimers(s, T)
    expect(all.map((b) => b.kind)).toEqual(['training', 'expedition', 'promotion', 'build'])
    expect(brewingTimers(s, T, 3)).toHaveLength(3)
    expect(all.find((b) => b.kind === 'build')!.place).toBe('kitchen')
    // Finished timers are not "brewing".
    expect(brewingTimers(s, T + 250).map((b) => b.kind)).toEqual(['promotion', 'build'])
  })
})

describe('Lights Out: one relationship on the edge', () => {
  it('picks the pair closest to friendship, skipping the dead and the already-close', () => {
    const s = roster()
    const [a, b, c, d] = ids(s)
    const R = TUNING.life.relation
    const rel = (x: HeroId, y: HeroId, affinity: number) => [relationKey(x, y), { affinity, shared: 0 }] as const
    const st: GameState = {
      ...s,
      life: { ...s.life, relations: Object.fromEntries([rel(a!, b!, R.friend - 7), rel(a!, c!, R.friend - 2), rel(b!, d!, R.closeFriend + 5), rel(c!, d!, -40)]) },
    }
    expect(edgeRelation(st)).toEqual({ a: [a!, c!].sort()[0], b: [a!, c!].sort()[1], toward: 'friends', evenings: 1 })
    const dead: GameState = { ...st, heroes: { ...st.heroes, [c!]: { ...st.heroes[c!]!, alive: false } } }
    expect(edgeRelation(dead)).toMatchObject({ toward: 'friends', evenings: Math.ceil(7 / R.socializeGain) })
    expect(edgeRelation(s)).toBeNull()
  })
})

describe('Lights Out: the next floor and the goals', () => {
  it('teases the real next floor', () => {
    const s = roster()
    const t = nextFloorTeaser(s)!
    expect(t.floor).toBe(s.tower.currentFloor)
    expect(t.headline).not.toBeNull()
    expect(nextFloorTeaser({ ...s, tower: { ...s.tower, worldEnded: true } })).toBeNull()
  })

  it('teases the nearest Bane still waiting further up (S22)', () => {
    const s = roster()
    expect(nextFloorTeaser(s)!.laterBane).toBeNull()
    const nem = (id: string, revengeFloor: number, status: 'waiting' | 'avenged' = 'waiting') => ({
      id,
      templateId: 'goblin',
      name: 'Goblin',
      element: 'fire' as const,
      level: 3,
      heroId: `h_${id}` as HeroId,
      heroName: `Hero${id} Smith`,
      diedFloor: 1,
      revengeFloor,
      status,
    })
    const banes: GameState = {
      ...s,
      life: { ...s.life, legacy: { ...s.life.legacy, nemeses: [nem('a', 14), nem('b', 9), nem('c', 6, 'avenged')] } },
    }
    expect(nextFloorTeaser(banes)!.laterBane).toEqual({ heroName: 'Herob Smith', floor: 9 })
  })

  it('shows goal-gradient bars that are honest numbers', () => {
    const s = { ...roster(), gold: 1200, tower: { ...roster().tower, highestCleared: 7, currentFloor: 8 } }
    const bars = goalBars(s)
    expect(bars.map((b) => b.key)).toEqual(['summon', 'boss', 'master', 'stamps'])
    expect(bars[0]).toMatchObject({ value: 1200, max: TUNING.gacha.normalCostGold })
    expect(bars[1]).toMatchObject({ vars: { floor: 10, n: 3 }, value: 2, max: 5 })
    expect(bars[3]).toMatchObject({ value: TUNING.return.stamps.endowed, max: TUNING.return.stamps.perCard })
    expect(goalBars({ ...s, gold: 1e6 }).some((b) => b.key === 'summon')).toBe(false)
  })

  it('tells how Interference builds while resting', () => {
    const s = roster()
    expect(restedOutlook(s)).toEqual({ charges: 0, max: TUNING.return.rested.maxCharges, nextInRealMs: TUNING.return.rested.perRealHours * 3_600_000 })
    expect(restedOutlook({ ...s, meta: { ...s.meta, rested: { charges: TUNING.return.rested.maxCharges, carryWorld: 0 } } }).nextInRealMs).toBeNull()
  })

  it('Isel’s sign-off is warm and stable within a moment', () => {
    const s = roster()
    expect(iselSignoff(s)).toBe(iselSignoff(s))
    expect(ISEL_SIGNOFFS).toContain(iselSignoff(s))
    for (const line of ISEL_SIGNOFFS) expect(line).not.toMatch(/don.t (go|leave)|will suffer|miss you|abandon/i)
  })
})

describe('the honest tab title', () => {
  it('keeps the base title until a chosen timer has really finished', () => {
    const s = brewing()
    const snap = snapshotTimers(s, T)
    expect(snap).toHaveLength(4)
    expect(honestTitle('Pick Me Up! — Infinite Gacha', snap, T + 50)).toBe('Pick Me Up! — Infinite Gacha')
    expect(honestTitle('base', snap, T + 100)).toBe('Pick Me Up! · ✓ Training done')
    expect(honestTitle('base', snap, T + 450)).toBe('Pick Me Up! · ✓ Training done +3')
    expect(finishedTimers(snap, T + 250).map((b) => b.kind)).toEqual(['training', 'expedition'])
    expect(snapshotTimers(null, T)).toEqual([])
  })

  it('is translated', () => {
    setLocale('fr')
    expect(honestTitle('base', snapshotTimers(brewing(), T), T + 100)).toBe('Pick Me Up! · ✓ Entraînement terminé')
  })
})
