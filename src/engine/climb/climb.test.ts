/**
 * The climb wired into the tower (spec 2026-10-12 §4.4): encounter kinds and rout,
 * Last Stand, the Nemesis revenant, Pent-up Interference, F1-F2, purity and determinism.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { floorKindBase, floorBudget, lastStandPct, climbExtraPct } from './kinds'
import { chooseDoor, rollDoors } from './doors'
import { buildEncounter, buildFillerEncounter, playFloor, nemesisUnitId, floorPower } from '../tower'
import { scoutFloor, THREAT_REASONS } from '../scout'
import { buildCombatUnit, buildEnemyUnit } from '../unit'
import { ENEMY_TEMPLATES, SKILLS } from '../content'
import { createAccount } from '../account'
import { reduce, attemptFloorWithResult } from '../store'
import { suggestParty } from '../scout'
import { rngFor } from '../rng'
import { TUNING } from '../tuning'
import type { Door, FloorKind, GameState, HeroId, Nemesis, OwnedHero } from '../types'

const CL = TUNING.climb

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o)
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v)
  }
  return o
}

function roster(seed: number, n: number): GameState {
  let s: GameState = { ...createAccount(seed, { now: 0 }), gold: TUNING.gacha.normalCostGold * n }
  for (let i = 0; i < n; i++) s = reduce(s, { type: 'SUMMON' })
  return reduce(s, { type: 'SET_PARTY', ...suggestParty(s) })
}

const godly = (h: OwnedHero): OwnedHero => ({ ...h, star: 7, xp: { ...h.xp, level: 150 }, baseAttrs: { str: 999, agi: 999, vit: 999, int: 999, wil: 999 } })

function gods(seed = 9): GameState {
  const s = roster(seed, 4)
  const heroes: Record<HeroId, OwnedHero> = {}
  for (const h of Object.values(s.heroes)) heroes[h.id] = godly(h)
  return { ...s, heroes, gold: 0 }
}

function at(s: GameState, floor: number, kind: FloorKind = floorKindBase(floor)): GameState {
  return { ...s, tower: { ...s.tower, currentFloor: floor, highestCleared: floor - 1, doors: null, kind } }
}

const heroUnits = (r: ReturnType<typeof playFloor>) => r.result.result.log.unitsInit.filter((u) => u.side === 'hero' && !u.isNpc)

describe('the encounter carries its kind and rout threshold', () => {
  it('rout after 2 on Path and Elite, 1 on a Breather, 3 on a Boss', () => {
    const s = roster(3, 5)
    const enc = (f: number, k: FloorKind) => buildEncounter(at(s, f, k), f)
    expect(enc(7, 'path')).toMatchObject({ kind: 'path', routAfterDeaths: CL.rout.path })
    expect(enc(7, 'elite')).toMatchObject({ kind: 'elite', routAfterDeaths: CL.rout.elite })
    expect(enc(7, 'breather')).toMatchObject({ kind: 'breather', routAfterDeaths: CL.rout.breather })
    expect(enc(10, 'path')).toMatchObject({ kind: 'boss', routAfterDeaths: CL.rout.boss })
    expect([CL.rout.path, CL.rout.elite, CL.rout.breather, CL.rout.boss]).toEqual([2, 2, 1, 3])
  })

  it('only the tower sets routAfterDeaths (dailies, PvP and hand-built fights never rout)', () => {
    const root = join(__dirname, '..')
    const hits: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && /routAfterDeaths\s*=|routAfterDeaths:/.test(readFileSync(p, 'utf8'))) hits.push(p.slice(root.length + 1))
      }
    }
    walk(root)
    // tower.ts is the one writer (types.ts only declares it, as `routAfterDeaths?:`).
    expect(hits).toEqual(['tower/tower.ts'])
  })

  it('a losing 5-hero tower party routs instead of dying to the last', () => {
    // A god on the bench keeps the mercy director out, so the frail five meet the full floor.
    let s = at(roster(12, 5), 24)
    const bench = Object.values(s.heroes).find((h) => !s.party.slots.includes(h.id))
    expect(bench).toBeDefined()
    s = { ...s, heroes: { ...s.heroes, [bench!.id]: godly(bench!) } }
    const { result } = playFloor(s)
    expect(result.cleared).toBe(false)
    expect(result.result.outcome).toBe('retreat')
    expect(result.routed).toBe(true)
    expect(result.fallenHeroIds.length).toBeGreaterThanOrEqual(CL.rout.path)
    expect(result.fallenHeroIds.length).toBeLessThan(5)
  })
})

describe('losing tower fights rout instead of wiping (S19 acceptance: ≤10% wipes)', () => {
  it('over 20 seeds × every fought kind, a full party loses at most N heroes nearly always', () => {
    let losses = 0
    let wipes = 0
    for (const kind of ['path', 'elite', 'breather', 'boss'] as FloorKind[]) {
      for (let seed = 1; seed <= 20; seed++) {
        const f = kind === 'boss' ? 15 : 13
        let s = roster(seed * 31, 6)
        if (s.party.slots.filter(Boolean).length < 5) continue
        // A god on the bench keeps the mercy director out: the party meets the full floor.
        const bench = Object.values(s.heroes).find((h) => !s.party.slots.includes(h.id))!
        s = at({ ...s, heroes: { ...s.heroes, [bench.id]: godly(bench) } }, f, kind)
        const r = playFloor(s).result
        if (r.cleared) continue
        losses++
        if (r.fallenHeroIds.length >= 5) wipes++
        else {
          expect(r.routed, `seed ${seed} ${kind}`).toBe(true)
          expect(r.result.outcome).toBe('retreat')
        }
      }
    }
    expect(losses).toBeGreaterThan(40)
    expect(wipes / losses).toBeLessThanOrEqual(0.1)
  })
})

describe('F1-F2 are the tutorial floors, unchanged', () => {
  it('their encounters are exactly the pre-climb filler at floorPower', () => {
    for (const seed of [1, 7, 123, 4242]) {
      const s = createAccount(seed, { now: 0 })
      for (const f of [1, 2]) {
        const enc = buildEncounter(at(s, f), f)
        const old = buildFillerEncounter(f, 1, rngFor(s.seed, 'floor', f))
        expect(enc.waves).toEqual(old.waves)
        expect(enc.mission).toEqual(old.mission)
        expect(enc.kind).toBe('tutorial')
        expect(floorBudget(s, f, 'tutorial')).toBe(floorPower(f, 1))
      }
    }
  })

  it('the lone Islat Han clears F1 on every seed tried', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const s = createAccount(seed * 97, { now: 0 })
      expect(Object.keys(s.heroes)).toHaveLength(1)
      expect(Object.values(s.heroes)[0]!.name).toBe('Islat Han')
      const { result } = playFloor(s)
      expect(result.cleared, `seed ${seed * 97}`).toBe(true)
    }
  })

  it('no Doors on F1-F2; the first Doors are offered for F3', () => {
    const s = createAccount(5, { now: 0 })
    expect(rollDoors(s, 1)).toBeNull()
    expect(rollDoors(s, 2)).toBeNull()
    expect(rollDoors(s, 3)).toHaveLength(CL.doors.offered)
  })
})

describe('Last Stand (S20) in battle', () => {
  it('a roster down to two fights with +15% to every stat, and the result says so', () => {
    const base = at(roster(7, 6), 8)
    const keep = base.party.slots.filter((x): x is HeroId => x !== null).slice(0, 2)
    const heroes: Record<HeroId, OwnedHero> = {}
    for (const h of Object.values(base.heroes)) heroes[h.id] = { ...h, alive: keep.includes(h.id) }
    const s = { ...base, heroes }
    const pct = CL.lastStand.pctByCount[2]!
    expect(lastStandPct(s)).toBe(pct)
    const out = playFloor(s)
    expect(out.result.lastStandPct).toBe(pct)
    for (const u of heroUnits(out)) {
      const plain = buildCombatUnit(s.heroes[u.id as HeroId]!, 'front', SKILLS, s.inventory)
      expect(u.maxHP).toBeGreaterThan(plain.stats.maxHP)
    }
    // The bonus is the extraPct handed to buildCombatUnit.
    expect(climbExtraPct(s).pAtk).toBe(pct)
  })
})

describe('the Nemesis (S22)', () => {
  const bane = (o: Partial<Nemesis> = {}): Nemesis => ({
    id: 'nm1',
    templateId: 'goblin',
    name: 'Mira’s Bane',
    element: 'fire',
    level: 4,
    heroId: 'h_mira' as HeroId,
    heroName: 'Mira',
    diedFloor: 4,
    revengeFloor: 8,
    status: 'waiting',
    ...o,
  })
  const withBane = (s: GameState, n: Nemesis[]): GameState => ({ ...s, life: { ...s.life, legacy: { ...s.life.legacy, nemeses: n } } })

  it('waits on its revenge floor as a named ×powerMult revenant, and the scout announces it', () => {
    const s = withBane(at(gods(), 8), [bane()])
    const enc = buildEncounter(s, 8)
    const units = enc.waves.flatMap((w) => w.units)
    const rev = units.find((u) => u.id === nemesisUnitId(bane()))!
    expect(rev).toBeDefined()
    expect(rev.name).toBe('Mira’s Bane')
    expect(rev.element).toBe('fire')
    const plain = buildEnemyUnit(ENEMY_TEMPLATES.goblin!, rev.level, 'x', {})
    expect(rev.stats.maxHP).toBeGreaterThan(plain.stats.maxHP)
    const report = scoutFloor(s)!
    expect(report.nemesis).toBe('Mira’s Bane')
    expect(report.threats[0]).toMatchObject({ name: 'Mira’s Bane', why: THREAT_REASONS.nemesis })
    // Floors before it, anchors and unknown templates stay clear.
    expect(buildEncounter(withBane(at(gods(), 7), [bane()]), 7).waves.flatMap((w) => w.units).some((u) => u.id.startsWith('nem_'))).toBe(false)
    const onAnchor = withBane(at(gods(), 10), [bane({ revengeFloor: 10 })])
    expect(buildEncounter(onAnchor, 10).waves.flatMap((w) => w.units).some((u) => u.id.startsWith('nem_'))).toBe(false)
    const unknown = withBane(at(gods(), 8), [bane({ templateId: 'no_such_thing' })])
    expect(buildEncounter(unknown, 8).waves.flatMap((w) => w.units).some((u) => u.id.startsWith('nem_'))).toBe(false)
  })

  it('one the climb got past (a Cache door taken on its floor) follows the party to the next fight', () => {
    const s = withBane(at(gods(), 7), [bane()])
    const doors = rollDoors(s, 8)
    expect(doors).not.toBeNull()
    const skip = withBane(at(gods(), 8), [bane()])
    const skipped = chooseDoor({ ...skip, tower: { ...skip.tower, doors: [doors![0]!, { kind: 'cache', reward: 'stones' }] } }, 1)
    expect(skipped.tower.currentFloor).toBe(9)
    expect(scoutFloor(skipped)!.nemesis).toBe('Mira’s Bane')
    const { state, result } = playFloor(skipped)
    expect(result.cleared).toBe(true)
    expect(result.nemesisDefeated).toEqual(['nm1'])
    expect(state.life.legacy.nemeses[0]!.status).toBe('avenged')
    // An anchor on the way never hosts it.
    expect(buildEncounter(withBane(at(gods(), 10), [bane()]), 10).waves.flatMap((w) => w.units).some((u) => u.id.startsWith('nem_'))).toBe(false)
  })

  it('is avenged once: revenge gold and a stone, status under life, nemesisDefeated', () => {
    const plainRun = playFloor(at(gods(), 8))
    const s = deepFreeze(withBane(at(gods(), 8), [bane(), bane({ id: 'nm2', revengeFloor: 12 })]))
    const { state, result } = playFloor(s)
    expect(result.cleared).toBe(true)
    expect(result.nemesisDefeated).toEqual(['nm1'])
    expect(state.life.legacy.nemeses.map((n) => n.status)).toEqual(['avenged', 'waiting'])
    const revenge = Math.round(TUNING.legacy.nemesis.rewardGoldPerFloor * 8)
    expect(result.goldAwarded).toBe(plainRun.result.goldAwarded + revenge)
    expect(result.materialsAwarded.promotionStone ?? 0).toBeGreaterThanOrEqual(TUNING.legacy.nemesis.rewardStones)
    // Replaying the floor finds no Bane: it is avenged.
    const again = playFloor({ ...state, tower: { ...state.tower, currentFloor: 8, event: null } })
    expect(again.result.nemesisDefeated).toEqual([])
    expect(buildEncounter({ ...state, tower: { ...state.tower, currentFloor: 8 } }, 8).waves.flatMap((w) => w.units).some((u) => u.id.startsWith('nem_'))).toBe(false)
  })
})

describe('Pent-up Interference (S24)', () => {
  it('one charge doubles one clear’s floor gold, exactly once', () => {
    const base = at(gods(), 6)
    const s = { ...base, meta: { ...base.meta, rested: { charges: 1, carryWorld: 0 } } }
    const first = playFloor(s)
    const bonus = Math.round(first.result.goldAwarded * (TUNING.return.rested.goldMult - 1))
    expect(first.result.restedBonus).toBe(bonus)
    expect(first.state.meta.rested.charges).toBe(0)
    // The bonus lands on top of the floor's pay (hidden objectives may add more).
    expect(first.state.gold - s.gold).toBeGreaterThanOrEqual(first.result.goldAwarded + bonus)
    const uncharged = playFloor(base)
    expect(first.state.gold - uncharged.state.gold).toBe(bonus)
    const second = playFloor(first.state.tower.event ? { ...first.state, tower: { ...first.state.tower, event: null } } : first.state)
    expect(second.result.restedBonus).toBe(0)
  })

  it('a lost floor spends no charge', () => {
    const base = at(roster(2, 1), 30)
    const s = { ...base, meta: { ...base.meta, rested: { charges: 2, carryWorld: 0 } } }
    const out = playFloor(s, undefined, undefined, undefined, [{ tick: 1, kind: 'retreat' }])
    expect(out.result.cleared).toBe(false)
    expect(out.state.meta.rested.charges).toBe(2)
    expect(out.result.restedBonus).toBe(0)
  })
})

describe('purity and determinism', () => {
  it('playFloor and CHOOSE_DOOR never mutate their input', () => {
    const doors: Door[] = [
      { kind: 'path', reward: 'gold' },
      { kind: 'elite', reward: 'boon' },
    ]
    const s = deepFreeze({ ...at(gods(), 7), tower: { ...at(gods(), 7).tower, doors } })
    expect(() => playFloor(s)).not.toThrow()
    expect(() => playFloor(chooseDoor(s, 1))).not.toThrow()
  })

  it('a climb with Doors, Boons and Sorties replays identically', () => {
    const run = () => {
      let s = roster(77, 9)
      const log: unknown[] = []
      for (let i = 0; i < 18; i++) {
        if (s.tower.doors && s.tower.doors.some((d) => d.kind === 'elite') && i % 3 === 0) {
          s = reduce(s, { type: 'CHOOSE_DOOR', index: s.tower.doors.findIndex((d) => d.kind === 'elite') })
        }
        const out = attemptFloorWithResult(s)
        log.push(out.result)
        s = out.state
        while (s.tower.event) s = reduce(s, { type: 'RESOLVE_EVENT', option: s.tower.event.options.includes('rest') ? 'rest' : s.tower.event.options[0]! })
      }
      return { s, log }
    }
    const a = run()
    const b = run()
    expect(a.log).toEqual(b.log)
    expect(a.s).toEqual(b.s)
  })
})
