import { describe, expect, it } from 'vitest'
import type { CombatEvent, CombatLog, CombatUnitInit } from '../../engine/types'
import {
  HERO_DEATH_MS,
  HIGHLIGHT_BUDGET_MS,
  HOLD_1X,
  KILL_HITSTOP_MS,
  SHAKE_MAX_PX,
  SPEEDS,
  TRAUMA,
  addTrauma,
  clampTrauma,
  decayTrauma,
  frameHoldMs,
  highlightPlan,
  highlightTotalMs,
  hitstopMs,
  normalizeSpeed,
  overtimeSpeed,
  replayDurationMs,
  shakeOffset,
  smoothNoise,
  traumaFor,
} from './fx'
import { isAuthoredSkill } from './intents'
import { SEEDS, floorLog } from './__fixtures__/logs'

const hero: CombatUnitInit = { id: 'h_1', name: 'Mira Vale', side: 'hero', line: 'front', unitClass: 'warrior', element: 'fire', level: 3, maxHP: 200, maxSP: 50, cp: 100 }
const npc: CombatUnitInit = { ...hero, id: 'npc_1', name: 'Princess Priasis', isNpc: true }
const foe: CombatUnitInit = { ...hero, id: 'e_1', name: 'Goblin', side: 'enemy', unitClass: null, maxHP: 100 }
const units = new Map([hero, npc, foe].map((u) => [u.id, u]))
const unit = (id: string) => units.get(id)

const hit = (o: Partial<Extract<CombatEvent, { kind: 'hit' }>> = {}): CombatEvent => ({
  seq: 5,
  tick: 3,
  kind: 'hit',
  actorId: 'h_1',
  targetId: 'e_1',
  amount: 10,
  crit: false,
  hpAfter: 90,
  ...o,
})

describe('speeds', () => {
  it('offers 1/2/4/8 and falls back to 2× for anything else', () => {
    expect([...SPEEDS]).toEqual([1, 2, 4, 8])
    expect(normalizeSpeed(8)).toBe(8)
    expect(normalizeSpeed(3)).toBe(2)
    expect(normalizeSpeed('fast')).toBe(2)
    expect(normalizeSpeed(undefined)).toBe(2)
  })
})

describe('hitstopMs', () => {
  it('is monotone in damage and caps at the target’s max HP', () => {
    let prev = -1
    for (let dmg = 0; dmg <= 120; dmg += 5) {
      const ms = hitstopMs({ amount: dmg, maxHP: 100, crit: false, kill: false, speed: 1 })
      expect(ms).toBeGreaterThanOrEqual(prev)
      prev = ms
    }
    expect(hitstopMs({ amount: 0, maxHP: 100, crit: false, kill: false, speed: 1 })).toBe(40)
    expect(hitstopMs({ amount: 100, maxHP: 100, crit: false, kill: false, speed: 1 })).toBe(180)
    expect(hitstopMs({ amount: 500, maxHP: 100, crit: false, kill: false, speed: 1 })).toBe(180)
  })

  it('adds 100 ms on a crit and has a kill floor', () => {
    expect(hitstopMs({ amount: 0, maxHP: 100, crit: true, kill: false, speed: 1 })).toBe(140)
    expect(hitstopMs({ amount: 1, maxHP: 100, crit: false, kill: true, speed: 1 })).toBe(KILL_HITSTOP_MS)
    for (const speed of SPEEDS) {
      const kill = hitstopMs({ amount: 1, maxHP: 100, crit: false, kill: true, speed })
      expect(kill).toBeGreaterThanOrEqual(Math.floor(KILL_HITSTOP_MS / Math.sqrt(speed)))
    }
  })

  it('shrinks with speed (÷√speed) and halves under reduced motion', () => {
    const at = (speed: number) => hitstopMs({ amount: 60, maxHP: 100, crit: true, kill: false, speed })
    expect(at(2)).toBeLessThan(at(1))
    expect(at(4)).toBeLessThan(at(2))
    expect(at(8)).toBeLessThan(at(4))
    expect(at(4)).toBe(Math.round(at(1) / 2))
    const calm = hitstopMs({ amount: 60, maxHP: 100, crit: true, kill: false, speed: 1, reducedMotion: true })
    expect(calm).toBe(Math.round(at(1) / 2))
  })
})

describe('trauma', () => {
  it('is clamped to [0, 1]', () => {
    expect(addTrauma(0.9, 0.5)).toBe(1)
    expect(addTrauma(0, -1)).toBe(0)
    expect(clampTrauma(Number.NaN)).toBe(0)
    expect(clampTrauma(7)).toBe(1)
  })

  it('decays linearly at 1.5/s down to exactly 0', () => {
    expect(decayTrauma(1, 200)).toBeCloseTo(0.7, 10)
    let t = 1
    for (let i = 0; i < 100; i++) t = decayTrauma(t, 16)
    expect(t).toBe(0)
    expect(decayTrauma(0.5, -100)).toBe(0.5)
  })

  it('shakes 8px·trauma²·noise, deterministically, scaled by the slider', () => {
    for (let ms = 0; ms < 2000; ms += 37) {
      const o = shakeOffset(0.5, ms)
      expect(Math.abs(o.x)).toBeLessThanOrEqual(SHAKE_MAX_PX * 0.25 + 1e-9)
      expect(Math.abs(o.y)).toBeLessThanOrEqual(SHAKE_MAX_PX * 0.25 + 1e-9)
      expect(shakeOffset(0.5, ms)).toEqual(o)
    }
    expect(shakeOffset(0, 123)).toEqual({ x: 0, y: 0 })
    expect(shakeOffset(1, 123, 0)).toEqual({ x: 0, y: 0 })
    const full = shakeOffset(1, 500)
    const half = shakeOffset(1, 500, 0.5)
    expect(half.x).toBeCloseTo(full.x / 2, 10)
  })

  it('noise is smooth and bounded', () => {
    for (let x = 0; x < 10; x += 0.05) {
      const v = smoothNoise('s', x)
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThanOrEqual(1)
      expect(Math.abs(smoothNoise('s', x + 0.01) - v)).toBeLessThan(0.2)
    }
  })

  it('only crits, kills, deaths and half-life blows shake the stage', () => {
    expect(traumaFor(hit({ amount: 20 }), unit)).toBe(0)
    expect(traumaFor(hit({ amount: 49 }), unit)).toBe(0)
    expect(traumaFor(hit({ amount: 50 }), unit)).toBe(TRAUMA.bigHit)
    expect(traumaFor(hit({ crit: true }), unit)).toBe(TRAUMA.crit)
    expect(traumaFor({ seq: 1, tick: 1, kind: 'death', unitId: 'e_1' }, unit)).toBe(TRAUMA.kill)
    expect(traumaFor({ seq: 1, tick: 1, kind: 'death', unitId: 'h_1' }, unit)).toBe(TRAUMA.heroDeath)
    expect(traumaFor({ seq: 1, tick: 1, kind: 'miss', actorId: 'h_1', targetId: 'e_1' }, unit)).toBe(0)
    expect(traumaFor(undefined, unit)).toBe(0)
  })
})

describe('frameHoldMs (pacing)', () => {
  it('holds the frame by what it SHOWS: an ordinary hit lands in 120-180 ms (+hitstop)', () => {
    for (const amount of [0, 30, 100]) {
      const e = hit({ amount, hpAfter: 100 - amount + 1 })
      const ms = frameHoldMs(e, undefined, { speed: 1, unit })
      const stop = hitstopMs({ amount, maxHP: 100, crit: false, kill: false, speed: 1 })
      expect(ms - stop).toBeGreaterThanOrEqual(HOLD_1X.hitMin)
      expect(ms - stop).toBeLessThanOrEqual(HOLD_1X.hitMax)
    }
  })

  it('crits, kills and skills keep full time', () => {
    const plain = frameHoldMs(hit(), undefined, { speed: 1, unit })
    expect(frameHoldMs(hit({ crit: true }), undefined, { speed: 1, unit })).toBeGreaterThan(plain + 200)
    expect(frameHoldMs(hit({ hpAfter: 0 }), undefined, { speed: 1, unit })).toBeGreaterThan(plain + 200)
    expect(frameHoldMs(hit(), undefined, { speed: 1, unit, skillAction: true })).toBeGreaterThan(plain + 200)
    const act: CombatEvent = { seq: 4, tick: 3, kind: 'act', actorId: 'h_1', skillId: 'basic', targetId: 'e_1' }
    expect(frameHoldMs(act, undefined, { speed: 1, unit, skillAction: true })).toBeGreaterThan(frameHoldMs(act, undefined, { speed: 1, unit }))
  })

  it('keeps the hero death hold (1300 ms even at 4× and 8×) and lets enemies die quickly', () => {
    const heroDeath: CombatEvent = { seq: 9, tick: 4, kind: 'death', unitId: 'h_1' }
    const npcDeath: CombatEvent = { seq: 9, tick: 4, kind: 'death', unitId: 'npc_1' }
    const foeDeath: CombatEvent = { seq: 9, tick: 4, kind: 'death', unitId: 'e_1' }
    expect(frameHoldMs(heroDeath, undefined, { speed: 1, unit })).toBe(HERO_DEATH_MS)
    expect(frameHoldMs(heroDeath, undefined, { speed: 4, unit })).toBe(1300)
    expect(frameHoldMs(heroDeath, undefined, { speed: 8, unit })).toBe(1300)
    expect(frameHoldMs(npcDeath, undefined, { speed: 8, unit })).toBeLessThan(100)
    expect(frameHoldMs(foeDeath, undefined, { speed: 2, unit })).toBe(Math.round(HOLD_1X.death / 2))
  })

  it('the blow that fells a hero gets 300 ms of slow motion', () => {
    const fatal = hit({ actorId: 'e_1', targetId: 'h_1', amount: 50, hpAfter: 0 })
    const glancing = hit({ actorId: 'h_1', targetId: 'e_1', amount: 25, hpAfter: 0 })
    expect(frameHoldMs(fatal, undefined, { speed: 8, unit }) - frameHoldMs(glancing, undefined, { speed: 8, unit })).toBeGreaterThanOrEqual(300)
  })

  it('is divided by speed', () => {
    const e: CombatEvent = { seq: 2, tick: 1, kind: 'wave-spawn', wave: 1, enemyIds: [] }
    expect(frameHoldMs(e, undefined, { speed: 1, unit })).toBe(800)
    expect(frameHoldMs(e, undefined, { speed: 8, unit })).toBe(100)
  })
})

describe('overtime', () => {
  it('leaves the first 20 s alone, then ramps a slow replay to 4× over 2 s', () => {
    expect(overtimeSpeed(1, 19_999)).toBe(1)
    expect(overtimeSpeed(2, 21_000)).toBe(3)
    expect(overtimeSpeed(1, 22_000)).toBe(4)
    expect(overtimeSpeed(2, 99_000)).toBe(4)
    expect(overtimeSpeed(8, 99_000)).toBe(8)
    expect(overtimeSpeed(4, 99_000)).toBe(4)
  })
})

describe('real fights (engine fixture logs)', () => {
  const logs: CombatLog[] = []
  for (const seed of SEEDS) for (let f = 1; f <= 14; f++) logs.push(floorLog(seed, f))

  it('median replay of floors 1-14 is ≤ 15 s at the 2× default', () => {
    const times = logs.map((l) => replayDurationMs(l, 2, isAuthoredSkill)).sort((a, b) => a - b)
    const median = times[Math.floor(times.length / 2)]!
    expect(median).toBeLessThanOrEqual(15_000)
  })

  it('the highlight reel is ≤ 2.5 s at 1× for every fixture log, ends on the end frame, and is never offered when a hero dies', () => {
    let reels = 0
    for (const l of logs.concat(SEEDS.map((s) => floorLog(s, 15)))) {
      const plan = highlightPlan(l)
      const heroDied = l.events.some((e) => e.kind === 'death' && l.unitsInit.find((u) => u.id === e.unitId)?.side === 'hero')
      if (heroDied) {
        expect(plan).toBeNull()
        continue
      }
      reels++
      expect(plan).not.toBeNull()
      expect(highlightTotalMs(plan!)).toBeLessThanOrEqual(HIGHLIGHT_BUDGET_MS)
      expect(plan!.at(-1)!.cursor).toBe(l.events.length)
      const cursors = plan!.map((p) => p.cursor)
      expect([...cursors].sort((a, b) => a - b)).toEqual(cursors)
      // The party's heaviest blow is in it.
      const best = l.events.reduce((b, e, i) => (e.kind === 'hit' && l.unitsInit.find((u) => u.id === e.actorId)?.side === 'hero' && (b < 0 || e.amount > (l.events[b] as { amount: number }).amount) ? i : b), -1)
      if (best >= 0) expect(cursors).toContain(best + 1)
    }
    expect(reels).toBeGreaterThan(10)
  })

  it('a synthetic giant log still fits the reel budget', () => {
    const many: CombatEvent[] = [{ seq: 0, tick: 0, kind: 'battle-start', heroIds: ['h_1'], enemyIds: ['e_1'] }]
    for (let i = 1; i < 400; i++) many.push({ seq: i, tick: i, kind: 'hit', actorId: 'h_1', targetId: 'e_1', amount: i, crit: false, hpAfter: 100 })
    many.push({ seq: 400, tick: 400, kind: 'death', unitId: 'e_1' }, { seq: 401, tick: 400, kind: 'end', outcome: 'win' })
    const log: CombatLog = { seed: 1, floor: 1, encounterContext: 'tower', unitsInit: [hero, foe], events: many, outcome: 'win', rngDraws: 0 }
    const plan = highlightPlan(log)!
    expect(highlightTotalMs(plan)).toBeLessThanOrEqual(HIGHLIGHT_BUDGET_MS)
    expect(plan.map((p) => p.cursor)).toEqual(expect.arrayContaining([398, 399, 400, 401, 402]))
  })
})
