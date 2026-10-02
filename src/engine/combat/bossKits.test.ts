/**
 * Lane G · enemy kits, telegraphs and boss phases: a charged move winds up (a 'telegraph'),
 * its caster's gauge stands still, and it fires on its tick; a stun or a kill cancels it; the
 * Master's Guard and Protect soften it and a retreat escapes it. A phase triggers once at its
 * threshold (a blow never carries a boss past it): new keywords, skills, speed, aegis, a
 * summoned reserve. Summoning skills, cooldowns, determinism.
 */
import { describe, expect, it } from 'vitest'
import { runBattle } from './combat'
import { ORDERS } from './bossTuning'
import type { BattleOrder, CombatEvent, CombatUnit, DerivedStats, Encounter, HeroId, KeywordTag, Objective, ResolvedEffect, SkillEffect, SkillTarget } from '../types'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function stats(o: Partial<DerivedStats> = {}): DerivedStats {
  return { maxHP: 1000, pAtk: 100, mAtk: 100, pDef: 0, mDef: 0, spd: 50, critPct: 0, evaPct: 0, accPct: 100, statusRes: 0, ...o }
}
interface U {
  hp?: number
  cls?: CombatUnit['unitClass']
  line?: CombatUnit['line']
  skills?: SkillEffect[]
  keywords?: KeywordTag[]
  tag?: string
}
function unit(id: string, side: 'hero' | 'enemy', s: Partial<DerivedStats> = {}, o: U = {}): CombatUnit {
  const st = stats(s)
  return {
    id,
    name: id,
    side,
    unitClass: o.cls ?? null,
    element: 'physical',
    line: o.line ?? 'front',
    level: 10,
    stats: st,
    maxSP: 100,
    currentHP: o.hp ?? st.maxHP,
    currentSP: 100,
    actionGauge: 0,
    alive: true,
    skills: o.skills ?? [],
    keywords: o.keywords ?? [],
    cp: 100,
    ...(side === 'hero' ? { sourceHeroId: id as unknown as HeroId } : {}),
    ...(o.tag !== undefined ? { targetTag: o.tag } : {}),
  }
}
const hero = (id: string, s?: Partial<DerivedStats>, o?: U) => unit(id, 'hero', s, o)
const foe = (id: string, s?: Partial<DerivedStats>, o?: U) => unit(id, 'enemy', s, o)
function enc(waves: CombatUnit[][], extra: Partial<Encounter> = {}, objectives: Objective[] = [{ kind: 'annihilate' }], timer: number | null = null): Encounter {
  return { floor: 1, mission: { type: 'test', objectives, timer }, waves: waves.map((units) => ({ units })), encounterContext: 'tower', ...extra }
}
const survive = (ticks: number): Objective[] => [{ kind: 'survive', ticks }]
const basic: SkillEffect = { id: 'basic', name: 'Attack', skillMult: 1, damageType: 'physical', element: null, target: 'single', spCost: 0 }
const weak: SkillEffect = { ...basic, id: 'poke', skillMult: 0.01 }
function skill(id: string, target: SkillTarget, mult: number, extra: Partial<SkillEffect> = {}, effects?: ResolvedEffect[]): SkillEffect {
  return { id, name: id, skillMult: mult, damageType: 'physical', element: null, target, spCost: 10, ...(effects ? { effects } : {}), ...extra }
}
/** A wound-up sweep (fires one of the caster's turns after it winds up). */
const breath = skill('breath', 'all-enemies', 3, { cooldown: 4, charge: { turns: 1 } })
const dive = skill('dive', 'single', 3, { cooldown: 4, charge: { turns: 1 } })

type K = CombatEvent['kind']
const of = <T extends K>(evs: CombatEvent[], kind: T) => evs.filter((e): e is Extract<CombatEvent, { kind: T }> => e.kind === kind)
const fires = (evs: CombatEvent[]) => of(evs, 'act').filter((e) => e.charged)
const run = (heroes: CombatUnit[], e: Encounter, seed = 7) => runBattle(heroes, e, seed).log.events

// ── Telegraphs ────────────────────────────────────────────────────────────────

describe('telegraphs', () => {
  /** A dragon that only breathes; heroes too slow to act before it fires. */
  const dragon = (o: U = {}) => foe('dragon', { spd: 100, pAtk: 200 }, { skills: [weak, breath], ...o })
  const sloths = () => [hero('a', { spd: 1, maxHP: 5000 }), hero('b', { spd: 1, maxHP: 5000 })]

  it('winds up (its turn), stands still, and fires on its tick — not a turn of its own', () => {
    const evs = run(sloths(), enc([[dragon()]], {}, survive(40), 40))
    const tg = of(evs, 'telegraph')[0]!
    expect(tg).toMatchObject({ unitId: 'dragon', skillId: 'breath', targets: ['a', 'b'] })
    // One of its turns at spd 100: 1000 / 100 = 10 ticks.
    expect(tg.firesAtTick).toBe(tg.tick + 10)
    const fire = fires(evs)[0]!
    expect(fire.tick).toBe(tg.firesAtTick)
    expect(fire).toMatchObject({ actorId: 'dragon', skillId: 'breath', charged: true })
    // Between the wind-up and the fire it takes no turn (its gauge stood still).
    expect(of(evs, 'act').filter((e) => e.actorId === 'dragon' && e.tick > tg.tick && e.tick < tg.firesAtTick)).toEqual([])
    // The breath strikes both, after the act.
    const hits = evs.filter((e) => e.kind === 'hit' && e.tick === fire.tick && e.actorId === 'dragon')
    expect(hits.length).toBe(2)
    // Cooldown 4: the next wind-up is at least four of its own actions later.
    const tgs = of(evs, 'telegraph')
    if (tgs.length > 1) expect(tgs[1]!.tick - tg.tick).toBeGreaterThanOrEqual(10 * 4)
  })

  it('a stun mid-wind-up cancels it: the move dies in its throat', () => {
    const daze = skill('daze', 'single', 0.01, { spCost: 0 }, [{ kind: 'stun', push: 50 }])
    const stunner = hero('stunner', { spd: 60, maxHP: 5000 }, { skills: [basic, daze] })
    const evs = run([stunner, ...sloths()], enc([[dragon()]], {}, survive(30), 30))
    const end = of(evs, 'telegraph-end')[0]!
    expect(end).toMatchObject({ unitId: 'dragon', skillId: 'breath', reason: 'stunned' })
    expect(fires(evs).filter((e) => e.tick <= end.tick + 20)).toEqual([])
  })

  it('the brain stuns a foe mid-wind-up (it is worth the whole move)', () => {
    // A daze that does nothing but daze: only a charging foe makes it worth more than a blow.
    const daze = skill('daze', 'single', 0.01, { spCost: 0 }, [{ kind: 'stun', push: 10 }])
    const stunner = hero('stunner', { spd: 60, maxHP: 5000 }, { skills: [basic, daze] })
    const evs = run([stunner, ...sloths()], enc([[dragon()]], {}, survive(30), 30))
    const tg = of(evs, 'telegraph')[0]!
    const next = of(evs, 'act').find((e) => e.actorId === 'stunner' && e.tick >= tg.tick)!
    expect(next.skillId).toBe('daze')
    // Against the same breath unwound (cast at once), the daze is worth nothing: a plain blow.
    const plainDragon = foe('dragon', { spd: 100, pAtk: 200 }, { skills: [weak, { ...breath, charge: undefined }] })
    const calm = run([hero('stunner', { spd: 60, maxHP: 5000 }, { skills: [basic, daze] }), ...sloths()], enc([[plainDragon]], {}, survive(30), 30))
    expect(of(calm, 'act').find((e) => e.actorId === 'stunner')!.skillId).toBe('basic')
  })

  it('a kill mid-wind-up cancels it', () => {
    const slayer = hero('slayer', { spd: 60, pAtk: 5000 }, { skills: [basic] })
    const evs = run([slayer, ...sloths()], enc([[dragon({ hp: 1000 }), foe('guard', { spd: 1, maxHP: 1e7, pAtk: 0 })]], {}, survive(30), 30))
    const tg = of(evs, 'telegraph')
    if (tg.length === 0) return // (it fell before it could wind up)
    expect(of(evs, 'telegraph-end')[0]).toMatchObject({ unitId: 'dragon', reason: 'fell' })
    expect(fires(evs)).toEqual([])
  })

  it('Guard answers it: the party takes it braced (30% less)', () => {
    const plain = run(sloths(), enc([[dragon()]], {}, survive(40), 40))
    const tg = of(plain, 'telegraph')[0]!
    const guarded = run(sloths(), enc([[dragon()]], { orders: [{ tick: tg.tick + 1, kind: 'guard' }] }, survive(40), 40))
    const fire = fires(guarded)[0]!
    expect(fire.answered).toBe('guard')
    const hitAt = (evs: CombatEvent[], t: number, who: string) => of(evs, 'hit').find((e) => e.tick === t && e.targetId === who)!.amount
    // The same draws (the sloths never act in between), so exactly the guard's cut.
    const before = hitAt(plain, fire.tick, 'a')
    expect(hitAt(guarded, fire.tick, 'a')).toBeLessThan(before)
    expect(Math.abs(hitAt(guarded, fire.tick, 'a') - (before * (100 - ORDERS.guardPct)) / 100)).toBeLessThanOrEqual(1)
    // Everyone on the party's side took the brace (a status they can see).
    expect(of(guarded, 'status').filter((e) => e.status === 'guard-up').map((e) => e.unitId).sort()).toEqual(['a', 'b'])
  })

  it('a standing Guard braces the moment a foe winds up', () => {
    const evs = run(sloths(), enc([[dragon()]], { orders: [{ tick: 1, kind: 'guard', onTelegraph: true }] }, survive(40), 40))
    const tg = of(evs, 'telegraph')[0]!
    const braces = of(evs, 'status').filter((e) => e.status === 'guard-up')
    expect(braces.length).toBe(2)
    expect(braces[0]!.tick).toBe(tg.tick)
    expect(fires(evs)[0]!.answered).toBe('guard')
  })

  it('Protect answers a charged blow on the protected: it lands softened', () => {
    const lone = [hero('a', { spd: 1, maxHP: 5000 })]
    const diver = () => foe('diver', { spd: 100, pAtk: 200 }, { skills: [weak, dive] })
    const plain = run(lone, enc([[diver()]], {}, survive(40), 40))
    const tg = of(plain, 'telegraph')[0]!
    const covered = run(lone, enc([[diver()]], { orders: [{ tick: tg.tick + 1, kind: 'protect', allyId: 'a' }] }, survive(40), 40))
    const fire = fires(covered)[0]!
    expect(fire.answered).toBe('protect')
    const amt = (evs: CombatEvent[]) => of(evs, 'hit').find((e) => e.tick === fire.tick && e.actorId === 'diver')!.amount
    expect(Math.abs(amt(covered) - (amt(plain) * (100 - ORDERS.protectChargeCutPct)) / 100)).toBeLessThanOrEqual(1)
  })

  it('a retreat escapes it', () => {
    const plain = run(sloths(), enc([[dragon()]], {}, survive(40), 40))
    const tg = of(plain, 'telegraph')[0]!
    const r = runBattle(sloths(), enc([[dragon()]], { orders: [{ tick: tg.tick + 1, kind: 'retreat' }] }, survive(40), 40), 7)
    expect(r.outcome).toBe('retreat')
    expect(fires(r.log.events)).toEqual([])
  })

  it('a single charged blow aims where it was telegraphed', () => {
    const lone = [hero('a', { spd: 1, maxHP: 5000 }), hero('b', { spd: 1, maxHP: 5000 })]
    const evs = run(lone, enc([[foe('diver', { spd: 100, pAtk: 200 }, { skills: [weak, dive] })]], {}, survive(40), 40))
    const tg = of(evs, 'telegraph')[0]!
    expect(tg.targets).toHaveLength(1)
    expect(fires(evs)[0]!.targetId).toBe(tg.targets[0])
  })
})

// ── Phases ────────────────────────────────────────────────────────────────────

describe('boss phases', () => {
  const phase = (o: Partial<Extract<KeywordTag, { kind: 'phase' }>> = {}): KeywordTag => ({ kind: 'phase', atHpPct: 50, title: 'Takes flight', line: 'Up!', ...o })

  it('triggers once, at its threshold: a blow never carries the boss past it', () => {
    const hammer = hero('hammer', { spd: 100, pAtk: 100_000 }, { skills: [basic] })
    const boss = foe('boss', { spd: 1, maxHP: 10_000, pAtk: 0 }, { keywords: [phase({ spdPct: 50, addKeywords: [{ kind: 'aegis', charges: 1 }] })] })
    const evs = run([hammer], enc([[boss]]))
    const first = of(evs, 'hit')[0]!
    // The killing blow stopped at half.
    expect(first.hpAfter).toBe(5000)
    const ph = of(evs, 'phase')
    expect(ph).toHaveLength(1)
    expect(ph[0]).toMatchObject({ unitId: 'boss', phase: 1, phases: 1, title: 'Takes flight', line: 'Up!', spd: 1 })
    // Its new aegis turns the next blow; the one after kills it.
    expect(of(evs, 'guard')[0]).toMatchObject({ targetId: 'boss' })
    expect(of(evs, 'death').map((e) => e.unitId)).toEqual(['boss'])
  })

  it('several phases come in order, each once; new skills and speed take hold', () => {
    const hammer = hero('hammer', { spd: 100, pAtk: 100_000 }, { skills: [basic] })
    const boss = foe('boss', { spd: 10, maxHP: 9000, pAtk: 0 }, {
      keywords: [phase({ atHpPct: 66, title: 'Two', skills: ['e_shield_wall'], spdPct: 100 }), phase({ atHpPct: 33, title: 'Three' })],
    })
    const evs = run([hammer], enc([[boss]]))
    const ph = of(evs, 'phase')
    expect(ph.map((e) => [e.phase, e.title])).toEqual([
      [1, 'Two'],
      [2, 'Three'],
    ])
    expect(ph[0]!.spd).toBe(20)
    // Each stop is exactly at its threshold.
    const hp = of(evs, 'hit').map((e) => e.hpAfter)
    expect(hp.slice(0, 2)).toEqual([Math.floor(9000 * 0.66), Math.floor(9000 * 0.33)])
  })

  it('a phase calls its reserve onto the field (and they fight)', () => {
    const tank = hero('tank', { spd: 30, maxHP: 1e6, pAtk: 400 }, { skills: [basic] })
    const boss = foe('boss', { spd: 5, maxHP: 1000, pAtk: 1 }, { keywords: [phase({ summonWave: 'guard' })], tag: 'boss' })
    const minion = foe('minion', { spd: 100, pAtk: 10, maxHP: 300 })
    const r = runBattle([tank], enc([[boss]], { reserves: { guard: [minion] } }, [{ kind: 'defeat', targetTag: 'boss' }]), 3)
    const evs = r.log.events
    expect(r.log.unitsInit.map((u) => u.id)).toContain('minion')
    const sm = of(evs, 'summon')[0]!
    expect(sm).toMatchObject({ unitId: 'boss', enemyIds: ['minion'], wave: 0 })
    expect(evs.indexOf(sm)).toBeGreaterThan(evs.indexOf(of(evs, 'phase')[0]!))
    expect(of(evs, 'act').some((e) => e.actorId === 'minion')).toBe(true)
  })

  it('a cleanse sheds what the party left on the boss', () => {
    const marker = hero('marker', { spd: 100, pAtk: 300 }, { skills: [basic, skill('mark', 'single', 1, { spCost: 0 }, [{ kind: 'debuff', stat: 'def', pct: 30, turns: 9 }])] })
    const boss = foe('boss', { spd: 1, maxHP: 2000, pAtk: 0 }, { keywords: [phase({ cleanse: true })] })
    const evs = run([marker], enc([[boss]]))
    const at = of(evs, 'phase')[0]!.seq
    expect(of(evs, 'status-end').some((e) => e.unitId === 'boss' && e.status === 'def-down' && e.seq > at)).toBe(true)
  })
})

// ── Summons and cooldowns ─────────────────────────────────────────────────────

describe('summoning skills and cooldowns', () => {
  it('a summoner calls its reserve two at a time, never past it', () => {
    const hatch = skill('hatch', 'self', 0, { spCost: 0, cooldown: 2 }, [{ kind: 'summon', group: 'brood', count: 2 }])
    const egg = foe('egg', { spd: 100, maxHP: 1e7, pAtk: 0 }, { skills: [weak, hatch] })
    const brood = [1, 2, 3].map((i) => foe(`b${i}`, { spd: 1, pAtk: 50, maxHP: 1e6 }))
    const evs = run([hero('h', { spd: 1, maxHP: 1e7, pAtk: 1 })], enc([[egg]], { reserves: { brood } }, survive(200), 200))
    const sm = of(evs, 'summon')
    expect(sm.map((e) => e.enemyIds)).toEqual([['b1', 'b2'], ['b3']])
    // Cooldown 2: never two hatches in a row.
    const eggActs = of(evs, 'act').filter((e) => e.actorId === 'egg').map((e) => e.skillId)
    for (let i = 1; i < eggActs.length; i++) expect(eggActs[i - 1] === 'hatch' && eggActs[i] === 'hatch').toBe(false)
  })

  it('is deterministic: the same fight, the same log', () => {
    const mk = () => [hero('a', { spd: 40, maxHP: 3000 }), hero('b', { spd: 55, maxHP: 3000, critPct: 30 })]
    const boss = () => foe('boss', { spd: 70, pAtk: 150 }, { skills: [basic, breath], keywords: [{ kind: 'phase', atHpPct: 50, summonWave: 'r' }] })
    const e = () => enc([[boss()]], { reserves: { r: [foe('m', { spd: 50 })] } })
    expect(runBattle(mk(), e(), 99)).toEqual(runBattle(mk(), e(), 99))
  })
})

// ── Orders 2.0 (engine) ───────────────────────────────────────────────────────

describe('orders 2.0', () => {
  const big = skill('big', 'single', 2, { spCost: 30 })
  const sweep = skill('sweep', 'all-enemies', 1.2, { spCost: 30 })

  it('Unleash: the hero acts on the order’s tick with its best paid skill', () => {
    // A slow hero whose free blow would score more than its dear one (the foe is nearly dead).
    const h = hero('h', { spd: 5, pAtk: 100 }, { skills: [basic, big] })
    const evs = run([h], enc([[foe('dummy', { spd: 1, maxHP: 1e7, pAtk: 0 })]], { orders: [{ tick: 3, kind: 'unleash', allyId: 'h' }] }, survive(30), 30))
    const act = of(evs, 'act').find((e) => e.actorId === 'h')!
    expect(act.tick).toBe(3)
    expect(act.skillId).toBe('big')
  })

  it('Guard: heroes brace (no blows) while it holds, and still tend a wound', () => {
    const aid = skill('aid', 'ally-lowest', 0, { spCost: 5 }, [{ kind: 'heal', from: 'maxHP', pct: 30 }])
    const fighter = hero('fighter', { spd: 100, pAtk: 50 }, { skills: [basic] })
    const medic = hero('medic', { spd: 100 }, { skills: [basic, aid], hp: 300 })
    const evs = run([fighter, medic], enc([[foe('dummy', { spd: 1, maxHP: 1e7, pAtk: 0 })]], { orders: [{ tick: 2, kind: 'guard' }] }, survive(40), 40))
    const guardEnd = of(evs, 'status-end').find((e) => e.status === 'guard-up')!.tick
    const during = of(evs, 'act').filter((e) => e.tick >= 2 && e.tick < guardEnd)
    expect(during.filter((e) => e.actorId === 'fighter').every((e) => e.skillId === 'brace')).toBe(true)
    expect(during.some((e) => e.actorId === 'medic' && e.skillId === 'aid')).toBe(true)
    expect(of(evs, 'hit').filter((e) => e.tick >= 2 && e.tick < guardEnd)).toEqual([])
    // After it, the blows come back.
    expect(of(evs, 'act').some((e) => e.actorId === 'fighter' && e.tick > guardEnd && e.skillId === 'basic')).toBe(true)
  })

  it('Hold: SP is kept for a crowd of three or the boss', () => {
    const mage = () => hero('mage', { spd: 100, pAtk: 10 }, { skills: [basic, sweep, big] })
    const pair = () => [foe('x', { spd: 1, maxHP: 1e6, pAtk: 0 }), foe('y', { spd: 1, maxHP: 1e6, pAtk: 0 })]
    const held = run([mage()], enc([pair()], { orders: [{ tick: 1, kind: 'hold' }] }, survive(30), 30))
    expect(of(held, 'act').filter((e) => e.actorId === 'mage').every((e) => e.skillId === 'basic')).toBe(true)
    const free = run([mage()], enc([pair()], {}, survive(30), 30))
    expect(of(free, 'act').some((e) => e.actorId === 'mage' && e.skillId !== 'basic')).toBe(true)
    // A boss (the mission's target) is worth it.
    const bossFight = run([mage()], enc([[foe('boss', { spd: 1, maxHP: 1e6, pAtk: 0 }, { tag: 'boss' })]], { orders: [{ tick: 1, kind: 'hold' }] }, [{ kind: 'defeat', targetTag: 'boss' }, { kind: 'survive', ticks: 30 }], 30))
    expect(of(bossFight, 'act').some((e) => e.actorId === 'mage' && e.skillId === 'big')).toBe(true)
  })

  it('Swap: two heroes trade places (the front-most is struck first)', () => {
    const brute = foe('brute', { spd: 50, pAtk: 100 }, { cls: 'warrior' })
    const front = hero('front', { spd: 1, maxHP: 1e6 }, { line: 'front' })
    const back = hero('back', { spd: 1, maxHP: 1e6 }, { line: 'back' })
    const plain = run([front, back], enc([[brute]], {}, survive(60), 60))
    expect(new Set(of(plain, 'hit').map((e) => e.targetId))).toEqual(new Set(['front']))
    const swapped = run([front, back], enc([[brute]], { orders: [{ tick: 5, kind: 'swap', a: 'front', b: 'back' }] }, survive(60), 60))
    const after = of(swapped, 'hit').filter((e) => e.tick >= 5)
    expect(after.length).toBeGreaterThan(0)
    expect(new Set(after.map((e) => e.targetId))).toEqual(new Set(['back']))
  })

  it('Focus: a sweep lands on the mark at fuller force', () => {
    const sweeper = () => hero('sw', { spd: 100, pAtk: 100 }, { skills: [skill('sweep', 'all-enemies', 1, { spCost: 0 })] })
    const crowd = () => [1, 2, 3, 4, 5].map((i) => foe(`f${i}`, { spd: 1, maxHP: 1e6, pAtk: 0 }))
    const marked = run([sweeper()], enc([crowd()], { focus: { focusEnemyId: 'f3' } }, survive(30), 30))
    const first = of(marked, 'hit').filter((e) => e.tick === of(marked, 'hit')[0]!.tick)
    const on = (id: string) => first.find((e) => e.targetId === id)!.amount
    // Five foes: ×100/340 ≈ 0.29 each, but the mark takes it at 60%.
    expect(on('f3') / on('f1')).toBeGreaterThan(1.9)
  })

  it('every order replays the fight exactly up to its tick', () => {
    const mk = () => [hero('a', { spd: 45, maxHP: 4000 }, { skills: [basic, big] }), hero('b', { spd: 60, maxHP: 4000 }, { skills: [basic, sweep] })]
    const foes = () => [foe('d', { spd: 70, pAtk: 150 }, { skills: [weak, breath] }), foe('e', { spd: 40, pAtk: 80 })]
    const base = run(mk(), enc([foes()]), 5)
    const at = 20
    const orders: BattleOrder[][] = [
      [{ tick: at, kind: 'unleash', allyId: 'a' }],
      [{ tick: at, kind: 'guard' }],
      [{ tick: at, kind: 'hold' }],
      [{ tick: at, kind: 'swap', a: 'a', b: 'b' }],
      [{ tick: at, kind: 'focus', enemyId: 'e' }],
    ]
    for (const o of orders) {
      const after = run(mk(), enc([foes()], { orders: o }), 5)
      const upTo = (evs: CombatEvent[]) => evs.filter((e) => e.tick < at && e.kind !== 'end')
      expect(upTo(after), o[0]!.kind).toEqual(upTo(base))
      expect(after.some((e) => e.kind === 'order' && e.order.kind === o[0]!.kind)).toBe(true)
    }
  })
})
