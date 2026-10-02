import { describe, it, expect, beforeAll } from 'vitest'
import { createAccount } from '../account'
import { summonMany } from '../gacha'
import { reduce, attemptFloorWithResult } from '../store'
import { runBattle } from '../combat'
import { hash } from '../rng/rng'
import { prepareFloorBattle, ordersAllowed } from '../tower'
import { tacticalFocusBonus } from '../tactical'
import { TUNING } from '../tuning'
import type { FloorResult, GameState, HeroId, OwnedHero } from '../types'
import { playAccount, simulate } from '../../sim/sim'
import {
  FORECAST,
  benchSwaps,
  clearForecastCache,
  enterConcerns,
  forecastAlternatives,
  forecastFloor,
  forecastInput,
  forecastSeed,
  improves,
  readFloor,
  suggestParty,
  threatFor,
} from '.'

/** A fresh account with ten heroes, the first five in the party. */
function party(seed = 3, floor = 1): GameState {
  let s = { ...createAccount(seed, { now: 0 }), gold: 1_000_000 }
  s = summonMany(s, 'normal', 10).state
  const ids = (Object.keys(s.heroes) as HeroId[]).slice(0, 5)
  s = { ...s, party: { slots: ids, lines: ['front', 'front', 'mid', 'back', 'back'] } }
  return floor === 1 ? s : { ...s, tower: { ...s.tower, currentFloor: floor, highestCleared: floor - 1 } }
}

function patch(s: GameState, id: HeroId, p: Partial<OwnedHero>): GameState {
  return { ...s, heroes: { ...s.heroes, [id]: { ...s.heroes[id]!, ...p } } }
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o)
    for (const v of Object.values(o as object)) deepFreeze(v)
  }
  return o
}

/** The casual bots' F15 attempts (the escort floor) over a few seeds, with what each did. */
const f15s: { before: GameState; result: FloorResult }[] = []
let f15: { before: GameState; result: FloorResult } | null = null
beforeAll(() => {
  for (let seed = 1; seed <= 6; seed++) {
    simulate('casual', seed, 4, (before, result) => {
      if (result.floor === 15) f15s.push({ before, result })
    })
  }
  f15 = f15s[0] ?? null
})

describe('prepareFloorBattle — the one battle input', () => {
  it('is exactly the battle playFloor fights (the same BattleResult, bit for bit)', () => {
    for (const s of [party(3), party(5, 4), party(8, 10)]) {
      const p = prepareFloorBattle(s)
      const real = attemptFloorWithResult(s).result.result
      expect(runBattle(p.battleUnits, p.encounter, p.combatSeed)).toEqual(real)
      expect(p.combatSeed).toBe(hash(s.seed, 'combat', s.tower.currentFloor, s.tower.attemptIndex))
    }
  })

  it('carries orders, the ballista and refusals exactly as the attempt does', () => {
    const s0 = party(4, 35)
    const ids = s0.party.slots as HeroId[]
    const s = patch(s0, ids[4]!, { training: { skillId: 'x', endsAt: 1e15 } as unknown as OwnedHero['training'] })
    const enemy = prepareFloorBattle(s).encounter.waves[0]!.units[0]!.id
    const orders = [{ tick: 3, kind: 'focus' as const, enemyId: enemy }]
    const p = prepareFloorBattle(s, { ballista: 0.9, orders })
    const real = attemptFloorWithResult(s, undefined, 0.9, undefined, orders).result
    expect(runBattle(p.battleUnits, p.encounter, p.combatSeed)).toEqual(real.result)
    expect(p.refusals).toEqual(real.refusals)
    expect(p.refusals.map((r) => r.reason)).toEqual(['training'])
  })

  it('the forecast reads the same prepared battle as the attempt', () => {
    const s = party(6, 12)
    const input = forecastInput(s)!
    expect(input.prepared).toEqual(prepareFloorBattle(s))
  })

  it('B18: a mid-battle Focus carries the Tactical Center bonus (reduce ≡ attemptFloorWithResult)', () => {
    const s = party(7, 3)
    expect(prepareFloorBattle(s).encounter.focusBonus).toBeUndefined()
    const enemy = prepareFloorBattle(s).encounter.waves[0]!.units[0]!.id
    const orders = [{ tick: 2, kind: 'focus' as const, enemyId: enemy }]
    const p = prepareFloorBattle(s, { orders })
    expect(p.encounter.focusBonus).toBeCloseTo(tacticalFocusBonus(s.facilities.tacticalCenter.level), 9)
    expect(reduce(s, { type: 'ATTEMPT_FLOOR', orders })).toEqual(attemptFloorWithResult(s, undefined, undefined, undefined, orders).state)
    // A protect order alone carries no focus bonus.
    const ally = p.battleUnits[0]!.id
    expect(prepareFloorBattle(s, { orders: [{ tick: 2, kind: 'protect', allyId: ally }] }).encounter.focusBonus).toBeUndefined()
  })
})

describe('B3 — Protect can shield an escort', () => {
  it('a protect order on the F15 escort: reduce ≡ attemptFloorWithResult, and enemies turn away from her', () => {
    expect(f15).not.toBeNull()
    const pre = f15!.before
    const escort = prepareFloorBattle(pre).encounter.allies![0]!
    expect(escort.isNpc).toBe(true)
    const orders = [{ tick: 2, kind: 'protect' as const, allyId: escort.id }]
    const viaReduce = reduce(pre, { type: 'ATTEMPT_FLOOR', orders })
    const viaHelper = attemptFloorWithResult(pre, undefined, undefined, undefined, orders)
    expect(viaReduce).toEqual(viaHelper.state)
    const log = viaHelper.result.result.log
    expect(log.events.some((e) => e.kind === 'order' && e.order.kind === 'protect' && e.order.allyId === escort.id)).toBe(true)
    // After the order, no enemy aims a blow at her while a hero still stands.
    const heroes = new Set(log.unitsInit.filter((u) => u.side === 'hero' && !u.isNpc).map((u) => u.id))
    const enemies = new Set(log.unitsInit.filter((u) => u.side === 'enemy').map((u) => u.id))
    const dead = new Set<string>()
    for (const e of log.events) {
      if (e.kind === 'death') dead.add(e.unitId)
      if (e.kind === 'act' && e.tick >= 2 && enemies.has(e.actorId) && [...heroes].some((h) => !dead.has(h))) {
        expect(e.targetId).not.toBe(escort.id)
      }
    }
  })
})

describe('the forecast', () => {
  it('is deterministic and never mutates the state', () => {
    const s = deepFreeze(party(9, 6))
    clearForecastCache()
    const a = forecastFloor(s)!
    clearForecastCache()
    const b = forecastFloor(s)!
    expect(a).toEqual(b)
    expect(a.runs).toBe(FORECAST.runs)
    expect(a.outcomes.win + a.outcomes.wipe + a.outcomes.failed + a.outcomes.timeout + a.outcomes.retreat).toBe(FORECAST.runs)
  })

  it('never touches the attempt’s own seed, and leaves the real attempt unchanged', () => {
    const s = party(10, 7)
    const combat = hash(s.seed, 'combat', s.tower.currentFloor, s.tower.attemptIndex)
    for (let i = 0; i < FORECAST.runs; i++) expect(forecastSeed(s, i)).not.toBe(combat)
    const before = attemptFloorWithResult(s)
    clearForecastCache()
    forecastFloor(s)
    expect(attemptFloorWithResult(s)).toEqual(before)
  })

  it('reports the party slot by slot: who stays home and why, the shaky, each one’s odds', () => {
    const s0 = party(11, 2)
    const ids = s0.party.slots as HeroId[]
    let s = patch(s0, ids[0]!, { promotion: { toStar: 2, endsAt: 1e15 } as unknown as OwnedHero['promotion'] })
    s = patch(s, ids[1]!, { sanity: 12 })
    const f = forecastFloor(s)!
    expect(f.fielded).toBe(4)
    expect(f.heroes.map((h) => h.heroId)).toEqual(ids)
    expect(f.heroes[0]).toMatchObject({ fights: false, reason: 'promotion', deathPct: 0 })
    expect(f.heroes[1]).toMatchObject({ fights: true, lowSanity: true })
    expect(f.heroes[1]!.panicPct).toBeGreaterThan(0)
    expect(f.heroes[2]!.panicPct).toBe(0)
    const c = enterConcerns(f)!
    expect(c.short).toBe(true)
    expect(c.refusing).toEqual([{ heroId: ids[0], reason: 'promotion' }])
    expect(c.shaky.map((x) => x.heroId)).toEqual([ids[1]])
  })

  it('a healthy party on a safe floor enters without a sheet', () => {
    const s = party(12, 1)
    const f = forecastFloor(s)!
    expect(f.threat).toBe('safe')
    expect(enterConcerns(f)).toBeNull()
  })

  it('nobody fit: no battle is run, and the band is Deadly', () => {
    const s0 = party(13, 3)
    const s = { ...s0, party: { ...s0.party, slots: [null, null, null, null, null] } }
    const f = forecastFloor(s)!
    expect(f.runs).toBe(0)
    expect(f.fielded).toBe(0)
    expect(f.threat).toBe('deadly')
    expect(f.emptySlots).toBe(5)
  })

  it('F15 for a fresh account is not Safe when the real fight kills heroes (and names the escort’s odds)', () => {
    let deadly = 0
    for (const { before, result } of f15s) {
      clearForecastCache()
      const f = forecastFloor(before)!
      expect(f.floor).toBe(15)
      expect(f.escorts).toHaveLength(1)
      expect(f.mission.objectives.some((o) => o.kind === 'protect')).toBe(true)
      if (result.fallenHeroIds.length > 0) {
        deadly++
        expect(f.threat).not.toBe('safe')
        expect(f.expectedDeaths).toBeGreaterThan(0)
      }
    }
    // The sample really does kill: young casual accounts lose heroes at the escort.
    expect(deadly).toBeGreaterThan(0)
  })

  it('F80 for a 25-day bot save reads Deadly with high expected deaths — and names the boss and the danger', () => {
    const s0 = playAccount('engaged', 1000, 25, Date.UTC(2026, 0, 5))
    // (The bot stands at the Wall by day 25; should a later balance move it, put it there.)
    const s = s0.tower.currentFloor === 80 ? s0 : { ...s0, tower: { ...s0.tower, currentFloor: 80, attemptIndex: 0, event: null, loop: null } }
    const f = forecastFloor(s)!
    expect(f.threat).toBe('deadly')
    expect(f.winPct).toBeLessThanOrEqual(10)
    expect(f.expectedDeaths).toBeGreaterThanOrEqual(Math.max(1.5, f.fielded * 0.6))
    expect(f.boss?.name).toBe('Pryos Al Ragna')
    expect(f.boss?.hpLeftPct ?? 0).toBeGreaterThan(50)
    expect(f.deadliest).not.toBeNull()
    expect(f.enemyCp).toBeGreaterThan(f.partyCp)
    // Even the suggested party is told the truth.
    const sug = suggestParty(s)
    const g = forecastFloor(s, { slots: sug.slots, lines: sug.lines })!
    expect(g.threat).toBe('deadly')
  })
})

describe('what would change the odds', () => {
  it('swaps the unfit and the shaky for the best of the bench', () => {
    const s0 = party(14, 2)
    const ids = s0.party.slots as HeroId[]
    let s = patch(s0, ids[2]!, { sanity: 0 })
    s = { ...s, party: { ...s.party, slots: [ids[0]!, ids[1]!, ids[2]!, ids[3]!, null] } }
    const base = forecastFloor(s)!
    const sw = benchSwaps(s, base)!
    expect(sw.swaps.map((x) => x.out)).toEqual([ids[2], null])
    for (const x of sw.swaps) expect(ids.slice(0, 4)).not.toContain(x.in)
    expect(sw.slots.filter(Boolean)).toHaveLength(5)
  })

  it('every alternative is re-forecast and really improves the odds (best first, at most three)', () => {
    const s0 = party(15, 8)
    const ids = s0.party.slots as HeroId[]
    const s = { ...s0, party: { ...s0.party, slots: [ids[0]!, null, null, null, null] } }
    const base = forecastFloor(s)!
    const alts = forecastAlternatives(s, base)
    expect(alts.length).toBeGreaterThan(0)
    expect(alts.length).toBeLessThanOrEqual(FORECAST.maxAlternatives)
    for (const a of alts) {
      expect(improves(base, a.forecast)).toBe(true)
      expect(a.forecast).toEqual(forecastFloor(s, { slots: a.slots, lines: a.lines, opening: a.opening }))
    }
  })

  it('an opening Focus is one of the battle’s orders and is never offered on a sleeping giant', () => {
    const s = party(16, 10)
    const base = forecastFloor(s)!
    for (const a of forecastAlternatives(s, base)) {
      if (a.kind !== 'focus') continue
      expect(a.opening).toHaveLength(1)
      expect(a.opening[0]).toMatchObject({ tick: 1, kind: 'focus' })
      expect(a.opening.length).toBeLessThanOrEqual(ordersAllowed(s))
      expect(base.deadliest?.looming).toBe(false)
    }
  })

  it('threat bands: the names stay, the meaning is the forecast', () => {
    expect(threatFor(100, 0)).toBe('safe')
    expect(threatFor(30, 0)).toBe('deadly')
    expect(threatFor(100, 3)).toBe('deadly')
  })
})

describe('suggestParty counter-picks', () => {
  it('reads the floor: immunity shares (the boss weighted) and the boss’s weakness', () => {
    const wall = party(17, 80)
    const r = readFloor(wall)!
    expect(r.boss).not.toBeNull()
    expect(r.boss!.weakTo).toContain('light')
    expect(r.shrugs.magic).toBeGreaterThanOrEqual(FORECAST.counterShare)
  })

  it('brings blades when a quarter of the floor shrugs off magic (the Wall)', () => {
    let s = { ...createAccount(18, { now: 0 }), gold: 10_000_000 }
    s = summonMany(s, 'normal', 30).state
    s = { ...s, tower: { ...s.tower, currentFloor: 80, highestCleared: 79 } }
    const picked = suggestParty(s, 0).slots.filter(Boolean).map((id) => s.heroes[id!]!)
    const blades = picked.filter((h) => h.heroClass !== 'mage').length
    const fitBlades = (Object.values(s.heroes) as OwnedHero[]).filter((h) => h.alive && h.heroClass !== 'mage').length
    expect(blades).toBeGreaterThanOrEqual(Math.min(3, fitBlades))
  })

  it('favours heroes of the boss’s weakness at equal strength', () => {
    let s = { ...createAccount(19, { now: 0 }), gold: 10_000_000 }
    s = summonMany(s, 'normal', 12).state
    s = { ...s, tower: { ...s.tower, currentFloor: 80, highestCleared: 79 } }
    const heroes = (Object.values(s.heroes) as OwnedHero[]).sort((a, b) => b.xp.level - a.xp.level)
    // Four strong heroes, then two identical twins for the last slot: one of light (Pryos's
    // weakness), one of earth (no edge on him or on the Wall).
    const base = heroes[4]!
    const light = { ...base, id: 'h_light' as HeroId, element: 'light' as const }
    const earth = { ...base, id: 'h_earth' as HeroId, element: 'earth' as const }
    const top = Object.fromEntries(heroes.slice(0, 4).map((h) => [h.id, { ...h, xp: { ...h.xp, level: 60 } }]))
    const t: GameState = { ...s, heroes: { ...top, [light.id]: light, [earth.id]: earth } as GameState['heroes'] }
    const slots = suggestParty(t, 0).slots
    expect(slots).toContain('h_light')
    expect(slots).not.toContain('h_earth')
  })
})

describe('tuning sanity', () => {
  it('K is a dozen-odd runs and the confirm line sits at the Risky/Deadly border', () => {
    expect(FORECAST.runs).toBeGreaterThanOrEqual(12)
    expect(FORECAST.runs).toBeLessThanOrEqual(16)
    expect(FORECAST.confirmWinPct).toBe(FORECAST.bands.riskyWinPct)
    expect(FORECAST.lowSanity).toBe(TUNING.lobby.combat.panicThreshold)
  })
})
