/** Floor kinds, the sawtooth budget and the mercy director (spec 2026-10-12 S13, S20). */
import { describe, it, expect } from 'vitest'
import {
  floorKindBase,
  kindForFloor,
  floorBudget,
  staticBudget,
  pathBudget,
  pathLift,
  pathTarget,
  kindRel,
  mercyBand,
  mercyCap,
  anchorFeel,
  directorCp,
  levelLagMult,
  isMercyCapped,
  rosterCp,
  lastStandPct,
  climbExtraPct,
  fightableCount,
} from './kinds'
import { floorPower } from '../tower'
import { createAccount } from '../account'
import { reduce } from '../store'
import { suggestParty } from '../scout'
import { TUNING } from '../tuning'
import { ANCHORS } from '../content'
import type { FloorKind, GameState, HeroId, OwnedHero } from '../types'

const CL = TUNING.climb
const KINDS: FloorKind[] = ['tutorial', 'breather', 'path', 'elite', 'rest', 'cache', 'boss']

/** A summoned roster of `n` (plus the starter), the suggested party set, standing on `floor`. */
function roster(seed: number, n: number, floor = 1): GameState {
  let s: GameState = { ...createAccount(seed, { now: 0 }), gold: TUNING.gacha.normalCostGold * n }
  for (let i = 0; i < n; i++) s = reduce(s, { type: 'SUMMON' })
  s = reduce(s, { type: 'SET_PARTY', ...suggestParty(s) })
  return { ...s, tower: { ...s.tower, currentFloor: floor, highestCleared: floor - 1 } }
}

/** A roster with nobody fit to fight: the director has nothing to read. */
function empty(seed = 3): GameState {
  const s = createAccount(seed, { now: 0 })
  const heroes: Record<HeroId, OwnedHero> = {}
  for (const h of Object.values(s.heroes)) heroes[h.id] = { ...h, alive: false }
  return { ...s, heroes }
}

describe('floorKindBase', () => {
  it('F1-F2 are tutorial floors, every 5th (and F41/F42) is a boss, the rest are Path', () => {
    expect([1, 2].map(floorKindBase)).toEqual(['tutorial', 'tutorial'])
    for (const f of [5, 10, 15, 20, 25, 40, 41, 42, 90, 100]) expect(floorKindBase(f), `F${f}`).toBe('boss')
    for (const f of [3, 4, 6, 7, 8, 9, 11, 14, 16, 39, 43, 89]) expect(floorKindBase(f), `F${f}`).toBe('path')
    for (const f of Object.keys(ANCHORS).map(Number)) expect(floorKindBase(f), `anchor F${f}`).toBe('boss')
  })
})

describe('kindForFloor', () => {
  it('the current floor takes the chosen Door; tutorial floors and anchors never move', () => {
    const s = roster(1, 4, 7)
    expect(kindForFloor({ ...s, tower: { ...s.tower, kind: 'elite' } }, 7)).toBe('elite')
    expect(kindForFloor({ ...s, tower: { ...s.tower, kind: 'breather' } }, 7)).toBe('breather')
    // A stale or impossible kind falls back to Path; other floors are their base kind.
    expect(kindForFloor({ ...s, tower: { ...s.tower, kind: 'rest' } }, 7)).toBe('path')
    expect(kindForFloor({ ...s, tower: { ...s.tower, kind: 'elite' } }, 8)).toBe('path')
    expect(kindForFloor({ ...s, tower: { ...s.tower, currentFloor: 1, kind: 'path' } }, 1)).toBe('tutorial')
    expect(kindForFloor({ ...s, tower: { ...s.tower, currentFloor: 10, kind: 'elite' } }, 10)).toBe('boss')
  })
})

describe('static budget (the sawtooth)', () => {
  const s = empty()
  const wm = TUNING.tower.worldMult[s.worldGrade]!

  it('tutorial floors are exactly today’s floorPower (F1-F2 unchanged)', () => {
    for (const f of [1, 2]) {
      expect(staticBudget(s, f, 'tutorial')).toBe(floorPower(f, wm))
      expect(floorBudget(roster(5, 6), f, 'tutorial')).toBe(floorPower(f, wm))
    }
  })

  it('Path is the step-capped Path curve; the other kinds scale it by kindMult relative to Path', () => {
    for (let f = 3; f <= 60; f++) {
      if (floorKindBase(f) === 'boss') continue
      const path = staticBudget(s, f, 'path')
      expect(path).toBeCloseTo(pathBudget(f, wm), 6)
      expect(staticBudget(s, f, 'elite')).toBeCloseTo((path * CL.kindMult.elite!) / CL.kindMult.path!, 6)
      expect(staticBudget(s, f, 'breather')).toBeCloseTo((path * CL.kindMult.breather!) / CL.kindMult.path!, 6)
      expect(staticBudget(s, f, 'rest')).toBe(0)
      expect(staticBudget(s, f, 'cache')).toBe(0)
    }
    expect(kindRel('path')).toBe(1)
    expect(kindRel('elite')).toBeCloseTo(CL.kindMult.elite! / CL.kindMult.path!, 9)
  })

  it('the Skull asks the most, the Breather the least', () => {
    for (const f of [3, 9, 23, 57]) {
      expect(staticBudget(s, f, 'elite')).toBeGreaterThan(staticBudget(s, f, 'path'))
      expect(staticBudget(s, f, 'breather')).toBeLessThan(staticBudget(s, f, 'path'))
    }
  })

  it('the Path lift is climb.earlyLift at the foot and fades to ×1 at the inflection floor', () => {
    const I = TUNING.tower.inflectionFloor
    expect(pathLift(0)).toBeCloseTo(TUNING.climb.earlyLift, 9)
    // kindMult keeps its WP0 meaning (Path 1 is the reference; Elite and Breather scale it,
    // Boss 1 with each anchor's own feel); the 2026-10-16 tension pass set Elite to 1.6.
    expect(CL.kindMult.path).toBe(1)
    for (let f = 1; f <= I; f++) expect(pathLift(f), `F${f}`).toBeLessThanOrEqual(pathLift(f - 1))
    for (const f of [I, I + 1, 90, 100]) expect(pathLift(f)).toBe(1)
    // …so the late tower keeps the balance pass's curve exactly.
    for (const f of [71, 77, 88, 99]) expect(pathBudget(f, wm)).toBeCloseTo(floorPower(f, wm), 6)
  })

  it('a Boss is the uncapped Path target × its kind × anchorBudgetMult × its anchor feel', () => {
    for (const f of [5, 10, 25, 90]) {
      expect(staticBudget(s, f, 'boss')).toBeCloseTo(pathTarget(f, wm) * kindRel('boss') * TUNING.tower.anchorBudgetMult * anchorFeel(f), 6)
      expect(pathTarget(f, wm)).toBeCloseTo(floorPower(f, wm) * pathLift(f), 6)
    }
    expect(staticBudget(s, 90, 'boss')).toBeCloseTo(floorPower(90, wm) * kindRel('boss') * TUNING.tower.anchorBudgetMult, 6)
  })

  it('anchorFeel reads climb.anchorFeel and is 1 for an anchor it does not list (the late tower is untouched)', () => {
    for (const [f, v] of Object.entries(CL.anchorFeel)) expect(anchorFeel(Number(f))).toBe(v)
    for (const f of [30, 41, 42, 50, 90, 100]) expect(anchorFeel(f), `F${f}`).toBe(1)
  })

  it('consecutive Path floors step up by at most maxStepPct (anchors skipped), never down, never past the target', () => {
    let prev: number | null = null
    for (let f = CL.directorFromFloor; f <= 100; f++) {
      if (floorKindBase(f) === 'boss') continue
      const cur = pathBudget(f, wm)
      expect(cur).toBeLessThanOrEqual(pathTarget(f, wm) + 1e-9)
      if (prev !== null) {
        expect(cur / prev, `F${f}`).toBeLessThanOrEqual(1 + CL.maxStepPct + 1e-9)
        expect(cur, `F${f}`).toBeGreaterThan(prev)
      }
      prev = cur
    }
  })

  it('the memo never changes an answer (any call order gives the same curve)', () => {
    const forward = Array.from({ length: 60 }, (_, i) => pathBudget(i + 3, 1.8))
    const backward = Array.from({ length: 60 }, (_, i) => pathBudget(62 - i, 2.6)).reverse()
    const scaled = forward.map((v) => (v / 1.8) * 2.6)
    backward.forEach((v, i) => expect(v).toBeCloseTo(scaled[i]!, 6))
  })

  it('floorPower itself stays strictly increasing', () => {
    for (let f = 2; f <= 100; f++) expect(floorPower(f, wm)).toBeGreaterThan(floorPower(f - 1, wm))
  })
})

describe('the mercy director', () => {
  it('reads the top five fightable heroes as their battle units', () => {
    const s = roster(2, 9, 6)
    expect(rosterCp(s)).toBeGreaterThan(0)
    // Breaking every hero (Sanity 0) leaves nobody to read.
    const broken: Record<HeroId, OwnedHero> = {}
    for (const h of Object.values(s.heroes)) broken[h.id] = { ...h, sanity: 0 }
    expect(rosterCp({ ...s, heroes: broken })).toBe(0)
    expect(fightableCount({ ...s, heroes: broken })).toBe(0)
  })

  it('caps the budget at rosterCp × mercyBand — it never raises it', () => {
    const weak = roster(4, 2, 12)
    for (const k of ['path', 'elite', 'breather', 'boss'] as FloorKind[]) {
      const b = floorBudget(weak, 12, k)
      expect(b).toBeLessThanOrEqual(staticBudget(weak, 12, k))
      expect(b).toBeLessThanOrEqual(rosterCp(weak) * mercyBand(k) + 1e-9)
    }
    expect(isMercyCapped(weak, 12, 'path')).toBe(true)
    // A god roster is never capped: the static curve stands.
    const gods = roster(4, 2, 12)
    const heroes: Record<HeroId, OwnedHero> = {}
    for (const h of Object.values(gods.heroes)) heroes[h.id] = { ...h, xp: { ...h.xp, level: 150 }, baseAttrs: { str: 999, agi: 999, vit: 999, int: 999, wil: 999 } }
    const strong = { ...gods, heroes }
    expect(floorBudget(strong, 12, 'path')).toBe(staticBudget(strong, 12, 'path'))
    expect(isMercyCapped(strong, 12, 'path')).toBe(false)
  })

  it('stays out of the tutorial floors and away from an empty roster', () => {
    const weak = roster(4, 2, 2)
    expect(mercyCap(weak, 2, 'tutorial')).toBeNull()
    expect(mercyCap(empty(), 12, 'path')).toBeNull()
    expect(floorBudget(empty(), 12, 'path')).toBe(staticBudget(empty(), 12, 'path'))
  })

  it('mercyBand reads the climb’s bands from TUNING.climb', () => {
    for (const k of KINDS) expect(mercyBand(k)).toBe(TUNING.climb.mercyBand[k])
    // The bands are relative to the roster (2026-10-16 tension pass): Path and the Breather
    // sit under it, the Skull above it (the opt-in peak). The cap still never raises a
    // floor above its static curve (floorBudget = min(static, cap)).
    for (const k of ['path', 'breather'] as FloorKind[]) expect(mercyBand(k)).toBeLessThan(1)
    expect(mercyBand('elite')).toBeGreaterThan(1)
    expect(mercyBand('elite')).toBeGreaterThan(mercyBand('path') * 1.4)
  })

  it('reads under-levelled heroes at less than their CP (levelLag), only in the early climb', () => {
    const L = CL.levelLag
    // At or near the floor's mob level: full CP.
    expect(levelLagMult(12, 12)).toBe(1)
    expect(levelLagMult(12 - L.grace, 12)).toBe(1)
    // Each level beyond the grace counts perLevel less, down to min.
    expect(levelLagMult(12 - L.grace - 2, 12)).toBeCloseTo(1 - 2 * L.perLevel, 9)
    expect(levelLagMult(1, L.untilFloor)).toBe(L.min)
    // Past untilFloor the plain-CP director stands.
    expect(levelLagMult(1, L.untilFloor + 1)).toBe(1)
    // directorCp is the same five heroes rosterCp reads, never above it.
    const r = roster(4, 8, 3)
    expect(directorCp(r, 3)).toBeCloseTo(rosterCp(r), 6)
    expect(directorCp(r, 24)).toBeLessThan(rosterCp(r))
    expect(directorCp(r, L.untilFloor + 1)).toBeCloseTo(rosterCp(r), 6)
    expect(mercyCap(r, 24, 'path')).toBeCloseTo(directorCp(r, 24) * mercyBand('path'), 6)
  })
})

describe('Last Stand (S20)', () => {
  function withLiving(n: number, floor = 8): GameState {
    const s = roster(7, 6, floor)
    const heroes: Record<HeroId, OwnedHero> = {}
    Object.values(s.heroes).forEach((h, i) => (heroes[h.id] = { ...h, alive: i < n }))
    return { ...s, heroes }
  }

  it('grows as the roster shrinks: +10% / +15% / +20% for 3 / 2 / 1 fightable heroes', () => {
    expect(lastStandPct(withLiving(5))).toBe(0)
    expect(lastStandPct(withLiving(4))).toBe(0)
    expect(lastStandPct(withLiving(3))).toBe(CL.lastStand.pctByCount[3])
    expect(lastStandPct(withLiving(2))).toBe(CL.lastStand.pctByCount[2])
    expect(lastStandPct(withLiving(1))).toBe(CL.lastStand.pctByCount[1])
    expect(lastStandPct(withLiving(0))).toBe(0)
  })

  it('counts the fallen, the captured and the broken, not heroes away by choice', () => {
    const s = withLiving(5)
    const ids = Object.values(s.heroes).filter((h) => h.alive).map((h) => h.id)
    const set = (patch: (h: OwnedHero, i: number) => OwnedHero): GameState => {
      const heroes: Record<HeroId, OwnedHero> = { ...s.heroes }
      ids.forEach((id, i) => (heroes[id] = patch(heroes[id]!, i)))
      return { ...s, heroes }
    }
    // Three of five sent off on an expedition: still five standing, no Last Stand.
    const away = set((h, i) => (i < 3 ? { ...h, expedition: { kind: 'probe' } as unknown as OwnedHero['expedition'] } : h))
    expect(fightableCount(away)).toBe(2)
    expect(lastStandPct(away)).toBe(0)
    // Two broken (Sanity 0) and one captured: two stand.
    const shaken = set((h, i) => (i < 2 ? { ...h, sanity: 0 } : i === 2 ? { ...h, captiveOf: { rivalId: 'r' } as unknown as OwnedHero['captiveOf'] } : h))
    expect(lastStandPct(shaken)).toBe(CL.lastStand.pctByCount[2])
  })

  it('leaves the tutorial floors alone', () => {
    expect(lastStandPct(withLiving(1, 2))).toBe(0)
    expect(lastStandPct(withLiving(1, 3))).toBeGreaterThan(0)
  })

  it('becomes an all-stat extraPct (empty when there is nothing to add)', () => {
    const pct = CL.lastStand.pctByCount[2]!
    expect(climbExtraPct(withLiving(2))).toEqual({ maxHP: pct, pAtk: pct, mAtk: pct, pDef: pct, mDef: pct, spd: pct })
    expect(climbExtraPct(withLiving(5))).toEqual({})
  })
})
