/**
 * Mission beats (lane D): the log carries its mission (objectives, timer, waves), and
 * runBattle emits structured 'mission' events — waves cleared, countdown milestones,
 * escape steps, objectives taken or defeated, the escort's wounds, a shield breaking, a
 * looming thing waking, and a Survival whose horde is spent. No beat draws RNG.
 */
import { describe, it, expect } from 'vitest'
import { runBattle } from './combat'
import type { BattleResult, CombatEvent, CombatUnit, DerivedStats, Encounter, HeroId, KeywordTag, MissionCode, Objective } from '../types'

function stats(o: Partial<DerivedStats> = {}): DerivedStats {
  return { maxHP: 100, pAtk: 50, mAtk: 50, pDef: 0, mDef: 0, spd: 50, critPct: 0, evaPct: 0, accPct: 100, statusRes: 0, ...o }
}

function unit(side: 'hero' | 'enemy', id: string, s: Partial<DerivedStats> = {}, extra: Partial<CombatUnit> = {}): CombatUnit {
  const st = stats(s)
  return {
    id,
    name: id,
    side,
    unitClass: null,
    element: 'physical',
    line: 'front',
    level: 1,
    stats: st,
    maxSP: 0,
    currentHP: st.maxHP,
    currentSP: 0,
    actionGauge: 0,
    alive: true,
    skills: [],
    keywords: [],
    cp: 100,
    ...(side === 'hero' ? { sourceHeroId: id as HeroId } : {}),
    ...extra,
  }
}
const hero = (id: string, s: Partial<DerivedStats> = {}, extra: Partial<CombatUnit> = {}) => unit('hero', id, s, extra)
const enemy = (id: string, s: Partial<DerivedStats> = {}, extra: Partial<CombatUnit> = {}) => unit('enemy', id, s, extra)
/** A foe that soaks blows and never answers. */
const tank = (id: string, extra: Partial<CombatUnit> = {}) => enemy(id, { maxHP: 1e9, spd: 1, pAtk: 0 }, extra)
const frail = (id: string, extra: Partial<CombatUnit> = {}) => enemy(id, { maxHP: 1, spd: 1, pAtk: 0 }, extra)

function enc(waves: CombatUnit[][], objectives: Objective[], timer: number | null = null, extra: Partial<Encounter> = {}): Encounter {
  return { floor: 30, mission: { type: 'Test', objectives, timer }, waves: waves.map((units) => ({ units })), encounterContext: 'tower', ...extra }
}

type Beat = Extract<CombatEvent, { kind: 'mission' }>
const beats = (r: BattleResult, code?: MissionCode): Beat[] =>
  r.log.events.filter((e): e is Beat => e.kind === 'mission' && (code === undefined || e.code === code))

describe('the log carries its mission', () => {
  it('type, objectives (with the units that carry their tags), timer and waves', () => {
    const priest = frail('priest', { targetTag: 'black_priest' })
    const npc = { ...hero('vip', { maxHP: 500 }), isNpc: true, targetTag: 'priasis', sourceHeroId: undefined }
    const r = runBattle(
      [hero('h', { spd: 200, pAtk: 500 })],
      enc([[frail('a')], [priest]], [{ kind: 'defeat', targetTag: 'black_priest' }, { kind: 'protect', targetTag: 'priasis' }, { kind: 'survive', ticks: 300 }], 300, { allies: [npc] }),
      1,
    )
    expect(r.log.mission).toEqual({
      type: 'Test',
      objectives: [
        { kind: 'defeat', targetTag: 'black_priest', unitIds: ['priest'] },
        { kind: 'protect', targetTag: 'priasis', unitIds: ['vip'] },
        { kind: 'survive', ticks: 300 },
      ],
      timerTicks: 300,
      waves: 2,
    })
  })

  it('unitsInit carries every unit’s speed, and a target tag only on objective units', () => {
    const r = runBattle([hero('h', { spd: 77, pAtk: 500 })], enc([[frail('a', { targetTag: 'goblin' }), frail('b', { targetTag: 'jewel' })]], [{ kind: 'acquire', targetTag: 'jewel' }]), 1)
    const by = Object.fromEntries(r.log.unitsInit.map((u) => [u.id, u]))
    expect(by.h!.spd).toBe(77)
    expect(by.a!.spd).toBe(1)
    expect(by.a!.targetTag).toBeUndefined()
    expect(by.b!.targetTag).toBe('jewel')
  })
})

describe('mission beats', () => {
  it('wave X of Y cleared, before the next wave charges in (none in a one-wave fight)', () => {
    const r = runBattle([hero('h', { spd: 200, pAtk: 500 })], enc([[frail('a')], [frail('b')], [frail('c')]], [{ kind: 'annihilate' }]), 2)
    expect(beats(r, 'wave-cleared').map((b) => b.params)).toEqual([
      { wave: 1, waves: 3 },
      { wave: 2, waves: 3 },
      { wave: 3, waves: 3 },
    ])
    const ev = r.log.events
    const first = ev.findIndex((e) => e.kind === 'mission' && e.code === 'wave-cleared')
    expect(ev[first + 1]).toMatchObject({ kind: 'wave-spawn', wave: 1 })
    const single = runBattle([hero('h', { spd: 200, pAtk: 500 })], enc([[frail('a')]], [{ kind: 'annihilate' }]), 2)
    expect(beats(single)).toEqual([])
  })

  it('a Survival whose horde is spent is held at once — no idling to the bell', () => {
    const r = runBattle([hero('h', { spd: 200, pAtk: 500 })], enc([[frail('a')], [frail('b')]], [{ kind: 'survive', ticks: 800 }], 800), 3)
    expect(r.outcome).toBe('win')
    expect(r.ticksElapsed).toBeLessThan(50)
    const spent = beats(r, 'horde-spent')
    expect(spent).toHaveLength(1)
    expect(spent[0]!.params!.left).toBe(800 - spent[0]!.tick)
    expect(r.log.events.at(-2)).toBe(spent[0])
  })

  it('…but never while a looming thing still stands', () => {
    const looming = tank('lv999', { keywords: [{ kind: 'looming' }, { kind: 'enrage', afterTick: 10_000, multiplier: 5 }] })
    const r = runBattle([hero('h', { spd: 200, pAtk: 500 })], enc([[frail('a'), looming]], [{ kind: 'survive', ticks: 120 }], 120), 3)
    expect(r.outcome).toBe('win')
    expect(r.ticksElapsed).toBe(120)
    expect(beats(r, 'horde-spent')).toEqual([])
  })

  it('a survival countdown announces each quarter', () => {
    const r = runBattle([hero('h', { spd: 10, pAtk: 1 })], enc([[tank('e')]], [{ kind: 'survive', ticks: 200 }], 200), 4)
    expect(beats(r, 'hold').map((b) => [b.tick, b.params!.pct, b.params!.left])).toEqual([
      [50, 25, 150],
      [100, 50, 100],
      [150, 75, 50],
    ])
    expect(beats(r, 'deadline')).toEqual([])
  })

  it('a deadline (a timer without a survival) counts down too', () => {
    const r = runBattle([hero('h', { spd: 10, pAtk: 1 })], enc([[tank('boss', { targetTag: 'boss' })]], [{ kind: 'defeat', targetTag: 'boss' }], 100), 4)
    expect(r.outcome).toBe('timeout')
    expect(beats(r, 'deadline').map((b) => b.params!.pct)).toEqual([25, 50, 75])
  })

  it('escape progress: a beat at each quarter of the distance', () => {
    const r = runBattle([hero('h', { spd: 100, pAtk: 1 })], enc([[tank('e')]], [{ kind: 'reach', distance: 20 }]), 5)
    expect(r.outcome).toBe('win')
    expect(beats(r, 'escape').map((b) => [b.params!.steps, b.params!.pct])).toEqual([
      [5, 25],
      [10, 50],
      [15, 75],
    ])
  })

  it('an objective taken (Capture) or defeated (Defeat) is announced right after it falls', () => {
    const take = runBattle([hero('h', { spd: 200, pAtk: 500 })], enc([[frail('carrier', { targetTag: 'jewel' }), tank('guard')]], [{ kind: 'acquire', targetTag: 'jewel' }]), 6)
    const ev = take.log.events
    const i = ev.findIndex((e) => e.kind === 'mission' && e.code === 'taken')
    expect(ev[i - 1]).toMatchObject({ kind: 'death', unitId: 'carrier' })
    expect((ev[i] as Beat).params).toEqual({ unitId: 'carrier', tag: 'jewel' })
    const slay = runBattle([hero('h', { spd: 200, pAtk: 500 })], enc([[frail('priest', { targetTag: 'black_priest' })]], [{ kind: 'defeat', targetTag: 'black_priest' }]), 6)
    expect(beats(slay, 'defeated').map((b) => b.params)).toEqual([{ unitId: 'priest', tag: 'black_priest' }])
    // A plain foe falling is no objective.
    expect(beats(take, 'defeated')).toEqual([])
  })

  it('the escort’s wounds: below 50% and below 25%, once each', () => {
    const npc = { ...hero('vip', { maxHP: 1000, spd: 1 }), isNpc: true, targetTag: 'priasis', sourceHeroId: undefined }
    // A steady assassin chips the escort (it targets the weakest: the NPC has the least HP).
    const assassin = enemy('assassin', { maxHP: 1e9, spd: 60, pAtk: 200 }, { unitClass: 'archer' })
    const r = runBattle([hero('h', { maxHP: 1e6, spd: 10, pAtk: 1 })], enc([[assassin]], [{ kind: 'protect', targetTag: 'priasis' }, { kind: 'survive', ticks: 400 }], 400, { allies: [npc] }), 7)
    const low = beats(r, 'escort-low')
    expect(low.map((b) => b.params!.pct)).toEqual([50, 25])
    for (const b of low) {
      const hit = r.log.events.slice(0, r.log.events.indexOf(b)).reverse().find((e) => e.kind === 'hit' && e.targetId === 'vip') as Extract<CombatEvent, { kind: 'hit' }>
      expect(hit.hpAfter * 100).toBeLessThan(1000 * b.params!.pct!)
    }
  })

  it('a phased shield breaking is announced when its wave falls', () => {
    const phased: KeywordTag[] = [{ kind: 'phased' }]
    const r = runBattle([hero('h', { spd: 200, pAtk: 500 })], enc([[frail('acolyte'), enemy('priest', { maxHP: 5000, spd: 1, pAtk: 0 }, { keywords: phased })]], [{ kind: 'annihilate' }]), 8)
    const down = beats(r, 'shield-down')
    expect(down.map((b) => b.params)).toEqual([{ unitId: 'priest' }])
    const ev = r.log.events
    expect(ev.findIndex((e) => e.kind === 'death' && e.unitId === 'acolyte')).toBeLessThan(ev.indexOf(down[0]!))
  })

  it('a looming unit waking is announced at its tick', () => {
    const looming = tank('lv999', { keywords: [{ kind: 'looming' }, { kind: 'enrage', afterTick: 40, multiplier: 5 }] })
    const r = runBattle([hero('h', { maxHP: 1e9, spd: 10, pAtk: 1 })], enc([[looming]], [{ kind: 'survive', ticks: 80 }], 80), 9)
    expect(beats(r, 'wakes').map((b) => [b.tick, b.params])).toEqual([[40, { unitId: 'lv999' }]])
  })

  it('a looming unit left in the last wave does not inflate wavesCleared', () => {
    const looming = tank('lv999', { keywords: [{ kind: 'looming' }, { kind: 'enrage', afterTick: 10_000, multiplier: 5 }] })
    const r = runBattle([hero('h', { spd: 200, pAtk: 500 })], enc([[frail('a')], [frail('b'), looming]], [{ kind: 'survive', ticks: 150 }], 150), 10)
    expect(r.outcome).toBe('win')
    expect(r.wavesCleared).toBe(2)
    expect(beats(r, 'wave-cleared')).toHaveLength(2)
  })

  it('beats draw no RNG and every beat has an English note', () => {
    const r = runBattle([hero('h', { spd: 100, pAtk: 1, critPct: 30 })], enc([[tank('e')], [tank('f')]], [{ kind: 'survive', ticks: 200 }], 200), 11)
    const hitsN = r.log.events.filter((e) => e.kind === 'hit').length
    expect(r.log.rngDraws).toBe(hitsN * 2)
    for (const b of beats(r)) expect(b.note.length).toBeGreaterThan(0)
  })

  describe('futility: nothing the party holds can hurt the foes left', () => {
    const warden = (id = 'warden') => enemy(id, { maxHP: 500, spd: 5, mAtk: 1, pAtk: 1 }, { keywords: [{ kind: 'immune', damageType: 'physical' }] })
    const bolt = { id: 'bolt', name: 'Bolt', skillMult: 1, damageType: 'magic' as const, element: null, target: 'single' as const, spCost: 10 }

    it('blades against a physical-immune Warden fall back at once — no swinging IMMUNE to the death', () => {
      const r = runBattle([hero('a', { spd: 100 }), hero('b', { spd: 90 })], enc([[warden()]], [{ kind: 'annihilate' }]), 12)
      expect(r.outcome).toBe('retreat')
      expect(r.fallenHeroIds).toEqual([])
      const f = beats(r, 'futile')
      expect(f).toHaveLength(1)
      expect(f[0]!.params).toEqual({ unitId: 'warden' })
      expect(r.log.events.at(-2)).toBe(f[0])
      expect(r.log.events.filter((e) => e.kind === 'act' && e.actorId !== 'warden').length).toBe(1)
    })

    it('only once the foes it could hurt are down', () => {
      const r = runBattle([hero('a', { spd: 100, pAtk: 500 })], enc([[frail('goblin'), warden()]], [{ kind: 'annihilate' }]), 13)
      expect(r.outcome).toBe('retreat')
      expect(r.log.events.some((e) => e.kind === 'death' && e.unitId === 'goblin')).toBe(true)
      expect(beats(r, 'futile')).toHaveLength(1)
    })

    it('a spell in hand keeps the fight on — until the SP to cast it is spent', () => {
      const withSp = runBattle([hero('m', { spd: 100, mAtk: 2000 }, { skills: [bolt], maxSP: 100, currentSP: 100 })], enc([[warden()]], [{ kind: 'annihilate' }]), 14)
      expect(withSp.outcome).toBe('win')
      expect(beats(withSp, 'futile')).toEqual([])
      const dry = runBattle([hero('m', { spd: 100, mAtk: 2000 }, { skills: [bolt], maxSP: 100, currentSP: 5 })], enc([[warden()]], [{ kind: 'annihilate' }]), 14)
      expect(dry.outcome).toBe('retreat')
    })

    it('a phased foe the blades could hurt is out of reach while an immune wavemate shields it', () => {
      const priest = enemy('priest', { maxHP: 50, spd: 1, pAtk: 0 }, { keywords: [{ kind: 'phased' }] })
      const r = runBattle([hero('a', { spd: 100 })], enc([[warden(), priest]], [{ kind: 'annihilate' }]), 16)
      expect(r.outcome).toBe('retreat')
      expect(beats(r, 'futile')[0]!.params).toEqual({ unitId: 'warden' })
      // …but a hurtable shield is only in the way: the fight goes on.
      const goblin = enemy('goblin', { maxHP: 1e6, spd: 1, pAtk: 0 })
      const held = runBattle([hero('a', { spd: 100 })], enc([[goblin, priest]], [{ kind: 'annihilate' }], 200), 16)
      expect(beats(held, 'futile')).toEqual([])
    })

    it('a mission NPC never strikes, so its spells do not keep a futile fight going', () => {
      const vip = hero('vip', { maxHP: 1e6, mAtk: 500 }, { isNpc: true, targetTag: 'vip', skills: [bolt], maxSP: 100, currentSP: 100 })
      const r = runBattle([hero('a', { spd: 100 })], enc([[warden()]], [{ kind: 'protect', targetTag: 'vip' }, { kind: 'annihilate' }], null, { allies: [vip] }), 17)
      expect(r.outcome).toBe('retreat')
      expect(beats(r, 'futile')).toHaveLength(1)
    })

    it('never on a mission waiting or walking can win (a Survival holds to the bell)', () => {
      const r = runBattle([hero('a', { maxHP: 1e6, spd: 100 })], enc([[warden()]], [{ kind: 'survive', ticks: 120 }], 120), 15)
      expect(r.outcome).toBe('win')
      expect(r.ticksElapsed).toBe(120)
      expect(beats(r, 'futile')).toEqual([])
    })
  })
})
