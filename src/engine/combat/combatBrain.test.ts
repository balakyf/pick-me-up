/**
 * The combat brain (lane D): skill choice by expected damage, immunity-aware targeting,
 * the HP-cost floor, AoE falloff, hit effectiveness (WEAK / RESIST / IMMUNE) and the
 * follow-up's opener accounting. Hand-built units: combat stays unit-agnostic.
 */
import { describe, it, expect } from 'vitest'
import { aoeSpreadPermille, canCast, runBattle } from './combat'
import { TUNING } from '../tuning'
import type {
  BattleResult,
  CombatBond,
  CombatEvent,
  CombatUnit,
  DerivedStats,
  Element,
  Encounter,
  HeroClass,
  HeroId,
  KeywordTag,
  Objective,
  SkillEffect,
} from '../types'

const C = TUNING.combat

function stats(o: Partial<DerivedStats> = {}): DerivedStats {
  return { maxHP: 100, pAtk: 50, mAtk: 50, pDef: 0, mDef: 0, spd: 50, critPct: 0, evaPct: 0, accPct: 100, statusRes: 0, ...o }
}

interface U {
  id: string
  cls?: HeroClass | null
  element?: Element
  stats?: Partial<DerivedStats>
  hp?: number
  sp?: number
  skills?: SkillEffect[]
  keywords?: KeywordTag[]
  targetTag?: string
  defiant?: boolean
}

function unit(side: 'hero' | 'enemy', o: U): CombatUnit {
  const s = stats(o.stats)
  return {
    id: o.id,
    name: o.id,
    side,
    unitClass: o.cls ?? null,
    element: o.element ?? 'physical',
    line: 'front',
    level: 1,
    stats: s,
    maxSP: 100,
    currentHP: o.hp ?? s.maxHP,
    currentSP: o.sp ?? 100,
    actionGauge: 0,
    alive: true,
    skills: o.skills ?? [],
    keywords: o.keywords ?? [],
    cp: 100,
    ...(side === 'hero' ? { sourceHeroId: o.id as HeroId } : {}),
    ...(o.targetTag !== undefined ? { targetTag: o.targetTag } : {}),
    ...(o.defiant ? { defiant: true } : {}),
  }
}
const hero = (o: U) => unit('hero', o)
const enemy = (o: U) => unit('enemy', o)

function enc(waves: CombatUnit[][], objectives: Objective[] = [{ kind: 'survive', ticks: 60 }], timer: number | null = 60, extra: Partial<Encounter> = {}): Encounter {
  return { floor: 50, mission: { type: 'test', objectives, timer }, waves: waves.map((units) => ({ units })), encounterContext: 'tower', ...extra }
}

const skill = (id: string, skillMult: number, o: Partial<SkillEffect> = {}): SkillEffect => ({
  id,
  name: id,
  skillMult,
  damageType: 'physical',
  element: null,
  target: 'single',
  spCost: 10,
  ...o,
})
const basic = skill('basic', 1, { spCost: 0 })
const magicBasic = skill('basic', 1, { spCost: 0, damageType: 'magic' })
const strike = skill('strike', 1.6, { spCost: 30 })
const bolt = skill('bolt', 2.5, { damageType: 'magic', spCost: 20 })
const sweep = skill('sweep', 1.2, { target: 'all-enemies', spCost: 40 })

/** A foe that soaks blows and never answers. */
const tank = (id: string, o: Partial<U> = {}) => enemy({ id, stats: { maxHP: 1e9, spd: 1, pAtk: 0, mAtk: 0 }, ...o })
const hits = (r: BattleResult, actor?: string) =>
  r.log.events.filter((e): e is Extract<CombatEvent, { kind: 'hit' }> => e.kind === 'hit' && (actor === undefined || e.actorId === actor))
const acts = (r: BattleResult, actor: string) =>
  r.log.events.filter((e): e is Extract<CombatEvent, { kind: 'act' }> => e.kind === 'act' && e.actorId === actor)

describe('skill choice by expected damage', () => {
  it('a lone boss draws the single-target skill; a crowd of frail foes draws the sweep', () => {
    const fighter = () => hero({ id: 'h', skills: [basic, strike, sweep], stats: { spd: 1000, pAtk: 100 } })
    expect(acts(runBattle([fighter()], enc([[tank('boss')]]), 1), 'h')[0]!.skillId).toBe('strike')
    const frail = (id: string) => enemy({ id, stats: { maxHP: 5, spd: 1, pAtk: 0 } })
    expect(acts(runBattle([fighter()], enc([[frail('a'), frail('b'), frail('c')]]), 1), 'h')[0]!.skillId).toBe('sweep')
  })

  it('a sweep only beats a strong single blow when its spread force adds up', () => {
    // Two fresh tanks: 2 × 1.2 × 100/(100 + k) vs 1.6 — the falloff decides.
    const two = runBattle([hero({ id: 'h', skills: [basic, strike, sweep], stats: { spd: 1000, pAtk: 100 } })], enc([[tank('a'), tank('b')]]), 2)
    const sweepTotal = (2 * 1.2 * aoeSpreadPermille(2)) / 1000
    expect(acts(two, 'h')[0]!.skillId).toBe(sweepTotal > 1.6 ? 'sweep' : 'strike')
  })

  it('on a tie (both kill) the hero practises its skill — but never pays HP for nothing', () => {
    const ult = skill('ult', 3, { spCost: 0, hpCost: 10 })
    const r = runBattle([hero({ id: 'h', skills: [basic, ult, strike], stats: { spd: 1000, pAtk: 100 } })], enc([[enemy({ id: 'e', stats: { maxHP: 1, spd: 1 } })]], [{ kind: 'annihilate' }], null), 3)
    expect(acts(r, 'h')[0]!.skillId).toBe('strike')
    expect(r.log.events.some((e) => e.kind === 'hp-cost')).toBe(false)
  })

  it('weighs the element: a skill of the foe’s weakness beats a bigger neutral one', () => {
    const fire = skill('fire', 1.2, { element: 'fire' })
    const plain = skill('plain', 1.5)
    const r = runBattle([hero({ id: 'h', skills: [basic, plain, fire], stats: { spd: 1000, pAtk: 100 } })], enc([[tank('e', { element: 'wind' })]]), 4)
    // fire vs wind: 1.2 × 1.5 = 1.8 > 1.5.
    expect(acts(r, 'h')[0]!.skillId).toBe('fire')
  })

  it('draws no RNG of its own: a hero with skills spends exactly two draws a hit', () => {
    const r = runBattle([hero({ id: 'h', skills: [basic, strike, sweep, bolt], stats: { spd: 300, pAtk: 100, critPct: 20 } })], enc([[tank('a'), tank('b')]]), 5)
    expect(r.log.rngDraws).toBe(hits(r).length * 2)
  })
})

describe('immunity', () => {
  const knight = (id = 'knight') => enemy({ id, stats: { maxHP: 50, spd: 1, pAtk: 0 }, keywords: [{ kind: 'immune', damageType: 'magic' }] })

  it('a hero never chooses a skill its foe is immune to while another can hurt it', () => {
    const r = runBattle([hero({ id: 'h', skills: [basic, bolt], stats: { spd: 1000, pAtk: 50, mAtk: 500 } })], enc([[tank('e', { keywords: [{ kind: 'immune', damageType: 'magic' }] })]]), 1)
    expect(acts(r, 'h').every((a) => a.skillId === 'basic')).toBe(true)
    expect(hits(r, 'h').every((h) => h.amount > 0)).toBe(true)
  })

  it('a mage passes over a magic-immune Fragment Knight while another foe stands', () => {
    // A mage strikes the weakest foe — here the immune knight — unless the blow cannot hurt it.
    const mage = hero({ id: 'm', cls: 'mage', skills: [magicBasic], stats: { spd: 500, mAtk: 100 } })
    const r = runBattle([mage], enc([[knight(), tank('soldier')]]), 2)
    expect(hits(r, 'm').length).toBeGreaterThan(2)
    expect(hits(r, 'm').every((h) => h.targetId === 'soldier' && h.eff !== 'immune')).toBe(true)
  })

  it('…and passes over a focus order on it, while a sword obeys', () => {
    const mage = hero({ id: 'm', cls: 'mage', skills: [magicBasic], stats: { spd: 500, mAtk: 100 } })
    const sword = hero({ id: 's', cls: 'warrior', skills: [basic], stats: { spd: 500, pAtk: 1 } })
    const r = runBattle([mage, sword], enc([[tank('soldier'), tank('knight', { keywords: [{ kind: 'immune', damageType: 'magic' }] })]], undefined, undefined, { focus: { focusEnemyId: 'knight' } }), 3)
    expect(hits(r, 'm').every((h) => h.targetId === 'soldier')).toBe(true)
    expect(hits(r, 's').every((h) => h.targetId === 'knight')).toBe(true)
  })

  it('with nothing it can hurt, the blow lands as IMMUNE (amount 0)', () => {
    const mage = hero({ id: 'm', cls: 'mage', skills: [magicBasic], stats: { spd: 500, mAtk: 100 } })
    const r = runBattle([mage], enc([[knight()]]), 4)
    expect(hits(r, 'm').length).toBeGreaterThan(0)
    expect(hits(r, 'm').every((h) => h.amount === 0 && h.eff === 'immune')).toBe(true)
  })

  it('a friend never follows up on a foe their strike cannot hurt (no roll, no wasted swing)', () => {
    const friends: CombatBond[] = [{ a: 'a', b: 'b', kind: 'closeFriend', affinity: 90 }]
    const a = hero({ id: 'a', skills: [basic], stats: { spd: 100, pAtk: 100 } })
    const mageFriend = hero({ id: 'b', cls: 'mage', skills: [magicBasic], stats: { spd: 1 } })
    const r = runBattle([a, mageFriend], enc([[tank('knight', { keywords: [{ kind: 'immune', damageType: 'magic' }] })]], undefined, 200, { bonds: friends }), 3)
    expect(r.log.events.some((e) => e.kind === 'followup')).toBe(false)
  })
})

describe('the HP-cost floor', () => {
  const ult = skill('ult', 3, { spCost: 0, hpCost: 30 })
  it('casts only when HP after the cost stays at or above hpCostFloorPct of max', () => {
    expect(canCast(100, 100, 100, ult)).toBe(true) // 70 left
    expect(canCast(100, 60, 100, ult)).toBe(true) // 30 left: exactly the floor
    expect(canCast(100, 59, 100, ult)).toBe(C.hpCostFloorPct <= 29) // 29 left
    expect(canCast(100, 31, 100, ult)).toBe(false) // 1 left: the old rule allowed it
    expect(canCast(5, 100, 100, { ...ult, spCost: 10 })).toBe(false)
    expect(canCast(0, 1, 100, basic)).toBe(true)
  })
})

describe('AoE falloff', () => {
  it('spreads a sweep: each of n foes takes ×100 / (100 + k(n − 1))', () => {
    expect(aoeSpreadPermille(1)).toBe(1000)
    expect(aoeSpreadPermille(2)).toBe(Math.floor(100_000 / (100 + C.aoeFalloffK)))
    expect(aoeSpreadPermille(8)).toBe(Math.floor(100_000 / (100 + 7 * C.aoeFalloffK)))
    // atk 1000 × 1.0 × no defence × damageScale × variance [0.95, 1.05] × falloff(3).
    const flat = skill('flat', 1, { target: 'all-enemies', spCost: 0 })
    const r = runBattle([hero({ id: 'h', skills: [flat], stats: { spd: 1000, pAtk: 1000 } })], enc([[tank('a'), tank('b'), tank('c')]], undefined, 4), 6)
    const f = 100 / (100 + 2 * C.aoeFalloffK)
    for (const h of hits(r, 'h')) {
      expect(h.amount).toBeGreaterThanOrEqual(Math.floor(1000 * C.damageScale * C.varianceMin * f))
      expect(h.amount).toBeLessThanOrEqual(Math.ceil(1000 * C.damageScale * C.varianceMax * f))
    }
  })
})

describe('hit effectiveness (WEAK / RESIST / IMMUNE)', () => {
  const effOn = (o: Partial<U>, el: Element = 'fire', kw: KeywordTag[] = []) => {
    const r = runBattle([hero({ id: 'h', element: el, skills: [basic], stats: { spd: 500, pAtk: 100 } })], enc([[tank('e', { ...o, keywords: kw })]]), 7)
    return hits(r, 'h')[0]!.eff
  }
  it('tags a hit by the element wheel and the target’s keywords', () => {
    expect(effOn({ element: 'wind' })).toBe('weak') // fire beats wind
    expect(effOn({ element: 'water' })).toBe('resist') // water beats fire
    expect(effOn({ element: 'earth' })).toBeUndefined()
    expect(effOn({}, 'physical', [{ kind: 'vulnerable', element: 'physical' }])).toBe('weak')
    expect(effOn({}, 'physical', [{ kind: 'resist', damageType: 'physical', reduction: 0.5 }])).toBe('resist')
    expect(effOn({}, 'physical', [{ kind: 'immune', damageType: 'physical' }, { kind: 'immune', damageType: 'magic' }])).toBe('immune')
    // A guard is armour, not an affinity: no tag.
    expect(effOn({}, 'physical', [{ kind: 'guard', reduction: 0.3 }])).toBeUndefined()
    // A weakness outweighs a light resistance (×1.5 × 0.8 = ×1.2).
    expect(effOn({ element: 'wind' }, 'fire', [{ kind: 'resist', damageType: 'physical', reduction: 0.2 }])).toBe('weak')
  })
})

describe('follow-ups and the opener', () => {
  /** a strikes; b (slow) is a's close friend and may press the attack before acting itself. */
  function duo(seed: number, opener: boolean): BattleResult {
    const a = hero({ id: 'a', skills: [basic], stats: { spd: 100, pAtk: 100 } })
    const b = hero({ id: 'b', skills: [basic], stats: { spd: 30, pAtk: 100 }, keywords: opener ? [{ kind: 'opener', multiplier: 2 }] : [] })
    return runBattle([a, b], enc([[tank('dummy')]], undefined, 200, { bonds: [{ a: 'a', b: 'b', kind: 'closeFriend', affinity: 95 }] }), seed)
  }
  it('a follow-up neither uses nor spends the friend’s opener', () => {
    // Find a seed where b follows up before its own first action.
    let seed = 1
    for (; seed < 400; seed++) {
      const ev = duo(seed, true).log.events
      const fu = ev.findIndex((e) => e.kind === 'followup')
      const own = ev.findIndex((e) => e.kind === 'act' && e.actorId === 'b')
      if (fu >= 0 && own >= 0 && fu < own) break
    }
    expect(seed).toBeLessThan(400)
    const withOpener = duo(seed, true).log.events
    const without = duo(seed, false).log.events
    const fuHit = (ev: CombatEvent[]) => ev[ev.findIndex((e) => e.kind === 'followup') + 1] as Extract<CombatEvent, { kind: 'hit' }>
    // The pressed strike is the same with or without the opener (same draws, same blow)…
    expect(fuHit(withOpener).amount).toBe(fuHit(without).amount)
    // …and b's first real action still carries it.
    const firstOwn = (ev: CombatEvent[]) => {
      const i = ev.findIndex((e) => e.kind === 'act' && e.actorId === 'b')
      return (ev.slice(i).find((e) => e.kind === 'hit' && e.actorId === 'b') as Extract<CombatEvent, { kind: 'hit' }>).amount
    }
    expect(Math.abs(firstOwn(withOpener) - 2 * firstOwn(without))).toBeLessThanOrEqual(1)
  })
})
