import { describe, it, expect } from 'vitest'
import { reduce, attemptFloorWithResult } from '../store'
import { buildCombatUnit } from '../unit'
import { SKILLS } from '../content'
import { scoutFloor, scoutUnits } from '../scout'
import { combatPowerForHero } from '../stats'
import { toWorldTime } from '../time'
import { saveState, loadState } from '../account'
import { boonGoldMult, climbExtraPct, lastStandPct, sortieBoons } from '../climb'
import { TUNING } from '../tuning'
import { heirOptions } from '../legacy'
import type { GameState, HeroId, Line, OwnedHero, Command } from '../types'

/**
 * The fun-and-return overhaul (spec 2026-10-12), end to end through the REAL reducer:
 * every package's engine work as one player meets it — the guaranteed first pull, Doors,
 * a death that feeds forward (Echo, Bane, New Arrival, grave), Rout, the honest scout,
 * Pent-up Interference, the stamp card, no deletion, the v10 → v11 migration, and a fuzzed
 * climb that must never throw, break an invariant or lose determinism.
 */

const LINES: Line[] = ['front', 'front', 'mid', 'back', 'back']
const R = (s: GameState | null, c: Command, now = 0) => reduce(s, c, now)

function bestParty(s: GameState): GameState {
  const living = (Object.values(s.heroes) as OwnedHero[])
    .filter((h) => h.alive)
    .sort((a, b) => combatPowerForHero(b, b.xp.level) - combatPowerForHero(a, a.xp.level))
    .slice(0, 5)
  const slots: (HeroId | null)[] = [null, null, null, null, null]
  living.forEach((h, i) => (slots[i] = h.id))
  return R(s, { type: 'SET_PARTY', slots, lines: LINES })
}

function fresh(seed: number): GameState {
  let s = R(null, { type: 'NEW_ACCOUNT', seed })
  s = R(s, { type: 'SUMMON', count: 10 })
  return bestParty(s)
}

function closeEvents(s: GameState): GameState {
  for (let g = 0; s.tower.event !== null && g < 4; g++) {
    const ev = s.tower.event
    s = R(s, { type: 'RESOLVE_EVENT', option: ev.options.includes('rest') ? 'rest' : ev.options[0]! })
  }
  return s
}

describe('fun and return, end to end: first ten minutes', () => {
  it('tutorial pull guarantee over 100 seeds', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const s0 = R(null, { type: 'NEW_ACCOUNT', seed })
      const gold = s0.gold
      const s = R(s0, { type: 'SUMMON', count: 10 })
      expect(s.gold).toBe(gold)
      const pulled = (Object.values(s.heroes) as OwnedHero[]).filter((h) => h.id !== Object.keys(s0.heroes)[0])
      expect(pulled.length).toBe(10)
      expect(pulled.some((h) => h.star >= 3 && h.skills.length >= 1 && h.heroClass !== null)).toBe(true)
      expect(pulled.filter((h) => h.star >= 2).length).toBeGreaterThanOrEqual(3)
    }
  })

  it('F1-F2 clear; doors from F3 after first clears; ATTEMPT with no choice fights doors[0]', () => {
    for (let seed = 1; seed <= 20; seed++) {
      let s = fresh(seed)
      for (const f of [1, 2]) {
        const r = attemptFloorWithResult(s)
        expect(r.result.floor).toBe(f)
        expect(r.result.cleared, `seed ${seed} F${f}`).toBe(true)
        s = r.state
      }
      expect(s.tower.doors, `seed ${seed} doors for F3`).not.toBeNull()
      expect(s.tower.doors!.length).toBeGreaterThanOrEqual(2)
      // F3 with no choice fights doors[0]
      const d0 = s.tower.doors![0]!.kind
      expect(['path', 'breather']).toContain(d0)
      const r3 = attemptFloorWithResult(s)
      expect(r3.result.kind).toBe(d0)
      if (r3.result.cleared) {
        // F4 doors
        expect(r3.state.tower.currentFloor).toBe(4)
        expect(r3.state.tower.doors).not.toBeNull()
      }
    }
  })
})

function strong(s: GameState, level = 40): GameState {
  const heroes = { ...s.heroes }
  for (const h of Object.values(heroes) as OwnedHero[]) if (h.alive) heroes[h.id] = { ...h, xp: { ...h.xp, level }, sanity: 100 }
  return { ...s, heroes }
}

describe('fun and return, end to end: doors', () => {
  it('choosing Skull / Rest / Cache works', () => {
    let sawElite = false
    let sawRest = false
    let sawCache = false
    for (let seed = 1; seed <= 40 && !(sawElite && sawRest && sawCache); seed++) {
      let s = strong(fresh(seed))
      for (let k = 0; k < 25; k++) {
        s = closeEvents(s)
        const doors = s.tower.doors
        const f = s.tower.currentFloor
        if (doors && doors.length > 1) {
          const idx = doors.findIndex((d) => (d.kind === 'rest' && !sawRest) || (d.kind === 'cache' && !sawCache) || (d.kind === 'elite' && !sawElite))
          if (idx >= 0) {
            const kind = doors[idx]!.kind
            const before = s
            s = R(s, { type: 'CHOOSE_DOOR', index: idx })
            if (kind === 'rest' || kind === 'cache') {
              expect(s.tower.currentFloor).toBe(f + 1)
              expect(s.tower.highestCleared).toBeGreaterThanOrEqual(f)
              expect(s.meta.masterXp).toBe(before.meta.masterXp)
              if (kind === 'cache') {
                expect(s.gold).toBeGreaterThan(before.gold)
                expect(s.materials.promotionStone ?? 0).toBeGreaterThan(before.materials.promotionStone ?? 0)
                sawCache = true
              } else {
                expect(s.life.pantry).toBeGreaterThan(before.life.pantry)
                sawRest = true
              }
              continue
            }
            expect(s.tower.kind).toBe('elite')
            expect(s.tower.doors).toBeNull()
            const r = attemptFloorWithResult(s)
            expect(r.result.kind).toBe('elite')
            if (r.result.cleared) {
              // Skull gold is exactly ×2 the floor's pay (War Chest and any Bane on top).
              const pay = Math.round(Math.round(TUNING.economy.goldPerFloor * f) * (r.result.firstClear ? TUNING.economy.firstClearMult : 1) * 2 * boonGoldMult(sortieBoons(s)))
              expect(r.result.goldAwarded).toBe(pay + (r.result.nemesisDefeated?.length ?? 0) * TUNING.legacy.nemesis.rewardGoldPerFloor * f)
              expect(r.result.materialsAwarded.promotionStone ?? 0).toBeGreaterThanOrEqual(1)
              expect(r.state.tower.event?.kind).toBe('boon')
              sawElite = true
            }
            s = r.state
            continue
          }
        }
        const r = attemptFloorWithResult(s)
        s = r.state
        if (r.result.fallenHeroIds.length) s = bestParty(s)
      }
    }
    expect([sawElite, sawRest, sawCache]).toEqual([true, true, true])
  })
})

function at(s: GameState, floor: number): GameState {
  return { ...s, tower: { ...s.tower, currentFloor: floor, highestCleared: floor - 1, kind: 'path', doors: null, event: null } }
}

/** Find a tower fight (via the real reducer path) in which a hero dies to a roaming killer. */
function findDeath(): { before: GameState; after: GameState; res: ReturnType<typeof attemptFloorWithResult>['result'] } {
  for (let seed = 1; seed <= 60; seed++) {
    let s = fresh(seed)
    for (const floor of [8, 11, 13, 16, 18]) {
      const before = bestParty(at(s, floor))
      const r = attemptFloorWithResult(before)
      if (r.result.fallenHeroIds.length > 0 && r.state.life.legacy.nemeses.length > 0) return { before, after: r.state, res: r.result }
    }
  }
  throw new Error('no death found')
}

describe('fun and return, end to end: death feeds forward', () => {
  it('a death yields pending echo, nemesis, recruit token, grave with killer', () => {
    const { before, after, res } = findDeath()
    const dead = res.fallenHeroIds[0]!
    // echo
    expect(after.life.legacy.pending.some((p) => p.fallenId === dead)).toBe(true)
    // nemesis — non-anchor killer; revenge floor later
    const nem = after.life.legacy.nemeses.find((n) => n.heroId === dead) ?? after.life.legacy.nemeses[0]!
    expect(nem.status).toBe('waiting')
    expect(nem.revengeFloor).toBeGreaterThan(before.tower.currentFloor)
    // grave with killer
    const grave = after.life.memorial.find((g) => g.heroId === nem.heroId)!
    expect(grave).toBeDefined()
    expect(grave.killer?.templateId).toBe(nem.templateId)
    // recruit token when below 5 living
    const living = (Object.values(after.heroes) as OwnedHero[]).filter((h) => h.alive && !h.captiveOf).length
    if (living < 5) expect(after.life.legacy.recruitTokens).toBeGreaterThanOrEqual(1)
  })

  it('a recruit token appears when the roster drops below 5', () => {
    // fresh account has 11 heroes; trim to 5 living then kill one.
    for (let seed = 1; seed <= 80; seed++) {
      let s = fresh(seed)
      const ids = Object.keys(s.heroes) as HeroId[]
      // keep the party's 5, mark the rest dead (they never fought → no echo)
      const party = new Set(s.party.slots.filter(Boolean) as HeroId[])
      const heroes = { ...s.heroes }
      for (const id of ids) if (!party.has(id)) heroes[id] = { ...heroes[id]!, alive: false }
      s = { ...s, heroes }
      const r = attemptFloorWithResult(at(s, 12))
      if (r.result.fallenHeroIds.length > 0) {
        expect(r.state.life.legacy.recruitTokens).toBe(1)
        const claimed = R(r.state, { type: 'CLAIM_RECRUIT' })
        expect(claimed.life.legacy.recruitTokens).toBe(0)
        expect(claimed.gold).toBe(r.state.gold)
        const newcomer = (Object.values(claimed.heroes) as OwnedHero[]).find((h) => !r.state.heroes[h.id])!
        expect(newcomer.star).toBeGreaterThanOrEqual(2)
        return
      }
    }
    throw new Error('no death')
  })

  it('bequeathing an echo raises the heir built unit stat by exactly +10% once', () => {
    const { after } = findDeath()
    const p = after.life.legacy.pending[0]!
    const heirId = p.candidates[0]!
    const heirBefore = after.heroes[heirId]!
    const s2 = R(after, { type: 'BEQUEATH_ECHO', fallenId: p.fallenId, heirId })
    const heirAfter = s2.heroes[heirId]!
    expect(heirAfter.life?.echoes?.length).toBe((heirBefore.life?.echoes?.length ?? 0) + 1)
    expect(s2.life.legacy.pending.some((x) => x.fallenId === p.fallenId)).toBe(false)
    // compare the raw build with no extra pct
    const big = (h: OwnedHero): OwnedHero => ({ ...h, xp: { ...h.xp, level: 200 } })
    const u0 = buildCombatUnit(big(heirBefore), 'front', SKILLS, s2.inventory)
    const u1 = buildCombatUnit(big(heirAfter), 'front', SKILLS, s2.inventory)
    // derive the base multiplier to account for other pct (favor etc)
    const stat = p.stat
    const ratio = u1.stats[stat] / u0.stats[stat]
    // now through the tower path: the combat units the battle used
    const party = s2.party.slots.includes(heirId) ? s2 : R(s2, { type: 'SET_PARTY', slots: [heirId, null, null, null, null], lines: LINES })
    const sc = scoutUnits(party, [party.heroes[heirId]!])
    const extra = climbExtraPct(party)
    const raw = buildCombatUnit(heirBefore, sc[0]!.line, SKILLS, party.inventory, extra)
    // Tower battle uses the same build: check the log's init maxHP if stat is maxHP
    const tr = attemptFloorWithResult(at(party, 3))
    const init = tr.result.result.log.unitsInit.find((u) => u.id === heirId)!
    expect(init.maxHP).toBe(sc[0]!.stats.maxHP)
    // +10% applied exactly once: with no other pct in play the ratio is 1.1 within rounding.
    expect(ratio).toBeGreaterThan(1.08)
    expect(ratio).toBeLessThan(1.11)
  })
})

describe('fun and return, end to end: the Bane', () => {
  it('appears later with its revenant name; avenging marks it once and pays once', () => {
    const { after } = findDeath()
    const nem = after.life.legacy.nemeses[0]!
    let s = strong(after, 60)
    s = bestParty(s)
    // a floor before the revenge floor: no bane
    const early = attemptFloorWithResult(at(s, nem.revengeFloor - 1))
    expect(early.result.result.log.unitsInit.some((u) => u.name.endsWith("'s Bane"))).toBe(false)
    const pre = at(s, nem.revengeFloor)
    const sc = scoutFloor(pre)!
    expect(sc.nemesis).toBe(`${nem.heroName.split(' ')[0]}'s Bane`)
    const r = attemptFloorWithResult(pre)
    const bane = r.result.result.log.unitsInit.find((u) => u.id === `nem_${nem.id}`)
    expect(bane?.name).toBe(`${nem.heroName.split(' ')[0]}'s Bane`)
    expect(bane?.templateId).toBe(nem.templateId)
    expect(r.result.cleared).toBe(true)
    expect(r.result.nemesisDefeated).toEqual([nem.id])
    const n2 = r.state.life.legacy.nemeses.find((n) => n.id === nem.id)!
    expect(n2.status).toBe('avenged')
    expect(r.state.life.chronicle.filter((e) => e.kind === 'revenge' && e.detail === nem.id)).toHaveLength(1)
    // pays once: goldAwarded - floor gold = revenge gold
    expect(r.state.gold - pre.gold).toBe(r.result.goldAwarded + (r.result.restedBonus ?? 0))
    const f = pre.tower.currentFloor
    expect(r.result.goldAwarded).toBe(TUNING.economy.goldPerFloor * f * TUNING.economy.firstClearMult + TUNING.legacy.nemesis.rewardGoldPerFloor * f)
    // the reducer path pays the same (lifeReact adds nothing)
    const viaReduce = R(pre, { type: 'ATTEMPT_FLOOR' })
    expect(viaReduce.gold).toBe(r.state.gold)
    // next floor: no bane any more, nothing pays again
    const next = closeEvents(r.state)
    const r2 = attemptFloorWithResult(next)
    expect(r2.result.result.log.unitsInit.some((u) => u.id === `nem_${nem.id}`)).toBe(false)
    expect(r2.result.nemesisDefeated ?? []).not.toContain(nem.id)
  })
})

describe('fun and return, end to end: rout', () => {
  it('a 5-hero losing tower fight routs before a wipe, nearly always after exactly 2 deaths on a Path floor', () => {
    let losses = 0
    const bad: string[] = []
    const outcomes: Record<string, number> = {}
    for (let seed = 1; seed <= 40; seed++) {
      const s = fresh(seed)
      for (const floor of [6, 9, 12, 14, 17, 19, 22, 26, 29, 33]) {
        const pre = bestParty(at(s, floor))
        const deployed = pre.party.slots.filter(Boolean).length
        if (deployed < 5) continue
        const r = attemptFloorWithResult(pre)
        if (r.result.cleared) continue
        losses++
        const k = `${r.result.kind}:${r.result.result.outcome}:${r.result.fallenHeroIds.length}`
        outcomes[k] = (outcomes[k] ?? 0) + 1
        if (r.result.kind === 'path' && (r.result.result.outcome !== 'retreat' || r.result.fallenHeroIds.length > 2)) bad.push(`seed ${seed} F${floor} ${k}`)
        if (r.result.result.outcome === 'retreat') {
          expect(r.result.routed).toBe(true)
          expect(r.result.fallenHeroIds.length).toBeGreaterThanOrEqual(2)
          expect(r.result.result.survivorHeroIds.length).toBeGreaterThan(0)
        }
      }
    }
    expect(losses).toBeGreaterThan(5)
    // The spec's rule ("being lost" = less HP than the wave) lets a party that is ahead
    // on HP fight on past N deaths; measured, not guaranteed.
    expect(bad.length / losses).toBeLessThan(0.15)
  })

  it('scout ratio uses the combat builder (echoes, Last Stand)', () => {
    const { after } = findDeath()
    let s = after
    // Give the heir an echo, and thin the roster to 3 for Last Stand
    const p = s.life.legacy.pending[0]!
    s = R(s, { type: 'BEQUEATH_ECHO', fallenId: p.fallenId, heirId: p.candidates[0]! })
    const keep = new Set([p.candidates[0]!, ...(Object.values(s.heroes) as OwnedHero[]).filter((h) => h.alive && h.id !== p.candidates[0]).slice(0, 2).map((h) => h.id)])
    const heroes = { ...s.heroes }
    for (const h of Object.values(heroes) as OwnedHero[]) if (!keep.has(h.id)) heroes[h.id] = { ...h, alive: false }
    s = bestParty(at({ ...s, heroes }, 7))
    expect(lastStandPct(s)).toBeGreaterThan(0)
    const rep = scoutFloor(s)!
    const r = attemptFloorWithResult(s)
    const heroInit = r.result.result.log.unitsInit.filter((u) => u.side === 'hero')
    const cp = heroInit.reduce((n, u) => n + u.cp, 0)
    expect(rep.partyCp).toBe(cp)
    expect(rep.lastStandPct).toBe(lastStandPct(s))
    const foe = r.result.result.log.unitsInit.filter((u) => u.side === 'enemy')
  })
})

const HOUR = 3_600_000
describe('fun and return, end to end: return', () => {
  const T0 = 1_760_000_000_000 // a real epoch
  function played(seed: number): GameState {
    let s = R(null, { type: 'NEW_ACCOUNT', seed, now: T0 }, toWorldTime(T0))
    s = R(s, { type: 'SUMMON', count: 10 }, toWorldTime(T0))
    s = bestParty(s)
    return s
  }
  it('10 real hours accrue a charge; one clear consumes one and doubles floor gold once', () => {
    let s = played(3)
    s = { ...s, meta: { ...s.meta, pi: 120 } }
    const now = toWorldTime(T0 + 10 * HOUR)
    s = R(s, { type: 'TICK' }, now)
    expect(s.meta.rested.charges).toBe(1)
    expect(s.meta.pi).toBe(120)
    const r = attemptFloorWithResult(s)
    expect(r.result.cleared).toBe(true)
    const floorGold = r.result.goldAwarded
    expect(r.result.restedBonus).toBe(floorGold)
    expect(r.state.gold - s.gold).toBe(2 * floorGold)
    expect(r.state.meta.rested.charges).toBe(0)
    // the reducer path matches exactly
    const viaReduce = R(s, { type: 'ATTEMPT_FLOOR' }, now)
    expect(viaReduce.gold).toBe(r.state.gold)
    expect(viaReduce.meta.rested.charges).toBe(0)
    // a second clear: no charge, no bonus
    const r2 = attemptFloorWithResult(r.state)
    expect(r2.result.restedBonus ?? 0).toBe(0)
    expect(r2.state.gold - r.state.gold).toBe(r2.result.goldAwarded)
  })

  it('PI never decays, no deletion unless hardcore', () => {
    let s = played(4)
    s = { ...s, meta: { ...s.meta, pi: 50 } }
    const far = toWorldTime(T0 + 300 * 24 * HOUR)
    const t = R(s, { type: 'TICK' }, far)
    expect(t.meta.pi).toBe(50)
    expect(t.meta.deleted).toBe(false)
    expect(t.meta.rested.charges).toBe(6)
    // a world at zero PI is not deleted either
    const z = R({ ...s, meta: { ...s.meta, pi: 0 } }, { type: 'TICK' }, far)
    expect(z.meta.deleted).toBe(false)
    // can still play
    expect(() => R(t, { type: 'ATTEMPT_FLOOR' }, far)).not.toThrow()
    // hardcore decays and deletes
    let hc = R(null, { type: 'NEW_ACCOUNT', seed: 4, now: T0, hardcore: true }, toWorldTime(T0))
    expect(hc.meta.hardcore).toBe(true)
    hc = { ...hc, meta: { ...hc.meta, pi: 50 } }
    hc = R(hc, { type: 'TICK' }, far)
    expect(hc.meta.pi).toBeLessThan(50)
    expect(hc.meta.deleted).toBe(true)
  })

  it('the stamp card never resets', () => {
    let s = played(5)
    const c0 = s.meta.stamps.count
    let now = toWorldTime(T0 + 1 * HOUR)
    s = R(s, { type: 'CLAIM_LOGIN' }, now)
    expect(s.meta.stamps.count).toBe(c0 + 1)
    // skip 9 real days
    now = toWorldTime(T0 + 10 * 24 * HOUR)
    s = R(s, { type: 'CLAIM_LOGIN' }, now)
    expect(s.meta.stamps.count).toBe(c0 + 2)
    // same real day again, next world day: login claim allowed, no extra stamp
    now = toWorldTime(T0 + 10 * 24 * HOUR + 9 * HOUR)
    let threw = false
    try {
      s = R(s, { type: 'CLAIM_LOGIN' }, now)
    } catch {
      threw = true
    }
    expect(s.meta.stamps.count).toBe(c0 + 2)
    for (let d = 11; d < 30; d++) s = R(s, { type: 'CLAIM_LOGIN' }, toWorldTime(T0 + d * 24 * HOUR + 2 * HOUR))
    expect(s.meta.stamps.count).toBe(c0 + 2 + 19)
  })
})

describe('fun and return, end to end: save migration', () => {
  it('a v10 save loads, migrates and plays a floor', () => {
    let s = played10()
    const v11 = JSON.parse(saveState(s)) as { schemaVersion: number; state: Record<string, any> }
    const st = v11.state
    st.schemaVersion = 10
    v11.schemaVersion = 10
    delete st.meta.rested
    delete st.meta.hardcore
    delete st.meta.stamps
    delete st.tower.kind
    delete st.tower.doors
    delete st.tower.sortie
    delete st.life.legacy
    delete st.life.unlocks
    for (const h of Object.values(st.heroes) as any[]) if (h.life) delete h.life.echoes
    for (const g of st.life.memorial as any[]) delete g.killer
    const loaded = loadState(JSON.stringify(v11))
    expect(loaded.schemaVersion).toBe(11)
    expect(loaded.meta.rested).toEqual({ charges: 0, carryWorld: 0 })
    expect(loaded.tower.kind).toBe('path')
    expect(loaded.life.legacy.pending).toEqual([])
    expect(loaded.life.unlocks.length).toBeGreaterThan(0)
    const r = attemptFloorWithResult(loaded)
    expect(r.result.floor).toBe(s.tower.currentFloor)
    const after = R(loaded, { type: 'ATTEMPT_FLOOR' })
    expect(after.tower).toBeDefined()
    // round-trip again
    expect(loadState(saveState(after)).schemaVersion).toBe(11)
    function played10(): GameState {
      let x = fresh(9)
      for (let i = 0; i < 4; i++) x = closeEvents(attemptFloorWithResult(x).state)
      return x
    }
    void s
    s = loaded
  })
})

describe('fun and return, end to end: fuzz the climb through the reducer', () => {
  function run(seed: number): { s: GameState; log: string[] } {
    const log: string[] = []
    let now = toWorldTime(1_760_000_000_000)
    let s = R(null, { type: 'NEW_ACCOUNT', seed, now: 1_760_000_000_000 }, now)
    s = R(s, { type: 'SUMMON', count: 10 }, now)
    s = bestParty(s)
    let x = seed * 7919
    const rnd = (n: number) => {
      x = (x * 1103515245 + 12345) & 0x7fffffff
      return x % n
    }
    let prevHighest = 0
    for (let step = 0; step < 160; step++) {
      now += toWorldTime(rnd(4) * 3_600_000)
      try {
        if (s.tower.event) {
          const ev = s.tower.event
          s = R(s, { type: 'RESOLVE_EVENT', option: ev.options[rnd(ev.options.length)]! }, now)
          log.push(`ev ${ev.kind}`)
        } else if (s.life.legacy.pending.length > 0 && rnd(2) === 0) {
          const p = s.life.legacy.pending[0]!
          const heir = heirOptions(s, p)[0]
          if (heir) s = R(s, { type: 'BEQUEATH_ECHO', fallenId: p.fallenId, heirId: heir }, now)
        } else if (s.life.legacy.recruitTokens > 0 && rnd(2) === 0) {
          s = bestParty(R(s, { type: 'CLAIM_RECRUIT' }, now))
        } else if (s.tower.doors && s.tower.doors.length > 1 && rnd(3) === 0) {
          s = R(s, { type: 'CHOOSE_DOOR', index: 1 + rnd(s.tower.doors.length - 1) }, now)
        } else if (s.tower.sortie && rnd(8) === 0) {
          s = R(s, { type: 'RETURN_TO_CAMPUS' }, now)
        } else if (rnd(10) === 0) {
          s = R(s, { type: 'CLAIM_LOGIN' }, now)
        } else {
          const before = s
          s = R(s, { type: 'ATTEMPT_FLOOR' }, now)
          const died = (Object.values(before.heroes) as OwnedHero[]).filter((h) => h.alive && !s.heroes[h.id]!.alive).length
          if (died > 0) s = bestParty(s)
          if (s.party.slots.every((id) => !id || !s.heroes[id]!.alive)) {
            if (s.gold < 3000) s = R(s, { type: 'ADD_GOLD', amount: 3000 }, now)
            s = bestParty(R(s, { type: 'SUMMON' }, now))
          }
          // Sanity: rest when low
          const party = s.party.slots.filter(Boolean).map((id) => s.heroes[id!]!)
          if (party.some((h) => h.sanity < 30)) now += toWorldTime(24 * 3_600_000)
        }
      } catch (e) {
        const msg = (e as Error).message
        if (!/already claimed|Sanity|deploy|requires/.test(msg)) log.push(`THROW ${msg}`)
      }
      // invariants
      expect(s.tower.highestCleared).toBeGreaterThanOrEqual(prevHighest)
      prevHighest = s.tower.highestCleared
      expect(s.gold).toBeGreaterThanOrEqual(0)
      expect(s.life.legacy.nemeses.filter((n) => n.status === 'waiting').length).toBeLessThanOrEqual(3)
      for (const p of s.life.legacy.pending) expect(s.heroes[p.fallenId]!.alive).toBe(false)
      for (const h of Object.values(s.heroes) as OwnedHero[]) expect((h.life?.echoes ?? []).length).toBeLessThanOrEqual(3)
      if (s.tower.doors) expect(s.tower.doors[0]!.kind === 'path' || s.tower.doors[0]!.kind === 'breather').toBe(true)
      expect(s.meta.rested.charges).toBeLessThanOrEqual(6)
      expect(s.life.legacy.recruitTokens).toBeLessThanOrEqual(2)
    }
    return { s, log }
  }
  it('20 seeds: no unexpected throws, invariants hold, deterministic, save round-trips', () => {
    const throws: string[] = []
    for (let seed = 1; seed <= 20; seed++) {
      const a = run(seed)
      const b = run(seed)
      expect(JSON.stringify(a.s)).toBe(JSON.stringify(b.s))
      expect(JSON.stringify(loadState(saveState(a.s)))).toBe(JSON.stringify(a.s))
      throws.push(...a.log.filter((l) => l.startsWith('THROW')).map((l) => `seed ${seed}: ${l}`))
    }
    expect(throws).toEqual([])
  })
})

describe('fun and return, end to end: a costly Skull clear still earns its Boon', () => {
  it('the recovery event opens first and the Boon choice follows it', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s0 = fresh(seed)
      for (let floor = 6; floor <= 20; floor++) {
        const at: GameState = { ...s0, tower: { ...s0.tower, currentFloor: floor, highestCleared: floor - 1, kind: 'elite', doors: null, event: null, sortie: { startFloor: 3, floors: 1, purse: 0, boons: [] } } }
        const r = attemptFloorWithResult(at)
        if (!(r.result.cleared && r.result.kind === 'elite' && r.result.fallenHeroIds.length >= 3)) continue
        expect(r.state.tower.event?.kind).toBe('recovery')
        expect(r.state.tower.event?.boonAfter).toBe(true)
        const rested = R(r.state, { type: 'RESOLVE_EVENT', option: 'rest' })
        expect(rested.tower.event?.kind).toBe('boon')
        expect(rested.tower.event?.options.length).toBe(3)
        const picked = R(rested, { type: 'RESOLVE_EVENT', option: rested.tower.event!.options[0]! })
        expect(picked.tower.event).toBeNull()
        expect(picked.tower.sortie?.boons).toEqual([rested.tower.event!.options[0]!])
        // a costly Path clear chains nothing
        const path = attemptFloorWithResult({ ...at, tower: { ...at.tower, kind: 'path' } })
        if (path.state.tower.event?.kind === 'recovery') expect(path.state.tower.event.boonAfter).toBeUndefined()
        return
      }
    }
    throw new Error('no costly Skull clear found')
  })
})
