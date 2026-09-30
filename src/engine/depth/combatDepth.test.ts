import { describe, it, expect } from 'vitest'
import { runBattle } from '../combat'
import type {
  BattleResult,
  CombatBond,
  CombatEvent,
  CombatUnit,
  DerivedStats,
  Element,
  Encounter,
  FloorModifierId,
  HeroClass,
  HeroId,
  KeywordTag,
  Line,
} from '../types'
import { DEPTH } from './depthTuning'
import { coverChance, followUpSkill } from './combatDepth'
import { modEnrageTick, modSpeed } from './floorMods'

// ─────────────────────────────────────────────────────────────────────────────
// Hand-built fixtures (combat stays unit-agnostic)
// ─────────────────────────────────────────────────────────────────────────────

function stats(o: Partial<DerivedStats> = {}): DerivedStats {
  return { maxHP: 100, pAtk: 50, mAtk: 50, pDef: 10, mDef: 10, spd: 50, critPct: 0, evaPct: 0, accPct: 100, statusRes: 0, ...o }
}

interface U {
  id: string
  cls?: HeroClass | null
  element?: Element
  line?: Line
  stats?: Partial<DerivedStats>
  hp?: number
  keywords?: KeywordTag[]
}

function unit(side: 'hero' | 'enemy', o: U): CombatUnit {
  const s = stats(o.stats)
  return {
    id: o.id,
    name: o.id,
    side,
    unitClass: o.cls ?? null,
    element: o.element ?? 'physical',
    line: o.line ?? 'front',
    level: 1,
    stats: s,
    maxSP: 0,
    currentHP: o.hp ?? s.maxHP,
    currentSP: 0,
    actionGauge: 0,
    alive: true,
    skills: [],
    keywords: o.keywords ?? [],
    cp: 100,
    ...(side === 'hero' ? { sourceHeroId: o.id as HeroId } : {}),
  }
}
const hero = (o: U) => unit('hero', o)
const enemy = (o: U) => unit('enemy', o)

function enc(enemies: CombatUnit[], extra: Partial<Encounter> = {}, ticks = 400): Encounter {
  return {
    floor: 50,
    mission: { type: 'test', objectives: [{ kind: 'survive', ticks }], timer: ticks },
    waves: [{ units: enemies }],
    encounterContext: 'tower',
    ...extra,
  }
}

const hits = (r: BattleResult, actor: string) =>
  r.log.events.filter((e): e is Extract<CombatEvent, { kind: 'hit' }> => e.kind === 'hit' && e.actorId === actor)
const firstHit = (r: BattleResult, actor: string) => hits(r, actor)[0]!.amount

/** A dummy that soaks hits and never threatens (acts almost never). */
const dummy = (o: Partial<U> = {}) => enemy({ id: 'dummy', stats: { maxHP: 1_000_000, spd: 1, pAtk: 1 }, ...o })

const bond = (a: string, b: string, kind: CombatBond['kind'], affinity = kind === 'closeFriend' ? 80 : kind === 'friend' ? 40 : kind === 'rival' ? -40 : -80): CombatBond => ({
  a,
  b,
  kind,
  affinity,
})

// ─────────────────────────────────────────────────────────────────────────────
// Formation
// ─────────────────────────────────────────────────────────────────────────────

describe('formation', () => {
  const F = DEPTH.formation
  function strike(cls: HeroClass | null, line: Line): number {
    return firstHit(runBattle([hero({ id: 'h', cls, line, stats: { spd: 200, pAtk: 200 } })], enc([dummy()]), 7), 'h')
  }

  it('ranged heroes hit harder from the back and softer from the front', () => {
    const back = strike('archer', 'back')
    const mid = strike('archer', 'mid')
    const front = strike('archer', 'front')
    expect(back / mid).toBeCloseTo(F.dealt.ranged.back, 2)
    expect(front / mid).toBeCloseTo(F.dealt.ranged.front, 2)
  })

  it('melee heroes are the opposite: full power in front, weaker behind', () => {
    const front = strike('warrior', 'front')
    const back = strike('warrior', 'back')
    expect(back / front).toBeCloseTo(F.dealt.melee.back, 2)
    // classless heroes don't care where they stand
    expect(strike(null, 'back')).toBe(strike(null, 'front'))
  })

  it('enemies ignore formation (monsters hold no lines)', () => {
    const at = (line: Line) =>
      firstHit(runBattle([hero({ id: 'h', stats: { maxHP: 1_000_000, spd: 1 } })], enc([enemy({ id: 'e', cls: 'archer', line, stats: { spd: 200 } })]), 3), 'e')
    expect(at('front')).toBe(at('back'))
  })

  /** The enemy's first blow on `victim` (it strikes the front-most spawn: the first hero). */
  function blowOn(victimLine: Line, mateLine: Line): number {
    const victim = hero({ id: 'a_victim', line: victimLine, stats: { maxHP: 100_000, spd: 1 } })
    const mate = hero({ id: 'b_mate', line: mateLine, stats: { maxHP: 100_000, spd: 1 } })
    return firstHit(runBattle([victim, mate], enc([enemy({ id: 'e', stats: { spd: 200, pAtk: 300 } })]), 11), 'e')
  }

  it('the back line takes less while a front-line ally stands', () => {
    expect(blowOn('back', 'front') / blowOn('back', 'back')).toBeCloseTo(F.backCover, 2)
  })

  it('a mid-line ally supports the front line', () => {
    expect(blowOn('front', 'mid') / blowOn('front', 'front')).toBeCloseTo(F.midSupportTaken, 2)
  })

  it('a mid-line hero heals better (lifesteal)', () => {
    const heal = (line: Line) => {
      const h = hero({ id: 'h', line, hp: 10, stats: { maxHP: 100_000, spd: 200, pAtk: 400 }, keywords: [{ kind: 'lifesteal', fraction: 0.5 }] })
      const r = runBattle([h], enc([dummy()]), 5)
      return (r.log.events.find((e) => e.kind === 'heal') as Extract<CombatEvent, { kind: 'heal' }>).amount
    }
    expect(heal('mid') / heal('front')).toBeCloseTo(F.midSupportHeal, 2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Relationship synergy
// ─────────────────────────────────────────────────────────────────────────────

describe('bonds — cover', () => {
  /** A fragile friend in front of a fast enemy whose one blow kills them. */
  function coverBattle(seed: number, bonds: CombatBond[], coverLine: Line = 'mid', coverHp = 100_000): BattleResult {
    const frail = hero({ id: 'a_frail', line: 'front', hp: 5, stats: { maxHP: 100, spd: 1 } })
    const guard = hero({ id: 'b_guard', line: coverLine, stats: { maxHP: 100_000, spd: 1 }, hp: coverHp })
    return runBattle([frail, guard], enc([enemy({ id: 'e', stats: { spd: 200, pAtk: 80 } })], { bonds }, 30), seed)
  }

  it('a close friend on a neighbouring line sometimes takes the killing blow instead', () => {
    let covered: BattleResult | null = null
    for (let seed = 1; seed < 60 && !covered; seed++) {
      const r = coverBattle(seed, [bond('a_frail', 'b_guard', 'closeFriend')])
      if (r.log.events.some((e) => e.kind === 'cover')) covered = r
    }
    expect(covered).not.toBeNull()
    const ev = covered!.log.events
    const i = ev.findIndex((e) => e.kind === 'cover')
    expect(ev[i]).toMatchObject({ kind: 'cover', unitId: 'b_guard', allyId: 'a_frail', actorId: 'e' })
    // the very next hit lands on the friend who covered
    expect(ev[i + 1]).toMatchObject({ kind: 'hit', targetId: 'b_guard' })
    // once per pair a battle
    expect(ev.filter((e) => e.kind === 'cover')).toHaveLength(1)
  })

  it('no cover for mere friends, far-apart lines, or a friend who could not survive the blow', () => {
    for (let seed = 1; seed < 40; seed++) {
      expect(coverBattle(seed, [bond('a_frail', 'b_guard', 'friend')]).log.events.some((e) => e.kind === 'cover')).toBe(false)
      expect(coverBattle(seed, [bond('a_frail', 'b_guard', 'closeFriend')], 'back').log.events.some((e) => e.kind === 'cover')).toBe(false)
      expect(coverBattle(seed, [bond('a_frail', 'b_guard', 'closeFriend')], 'mid', 20).log.events.some((e) => e.kind === 'cover')).toBe(false)
      expect(coverBattle(seed, []).log.events.some((e) => e.kind === 'cover')).toBe(false)
    }
  })

  it('the chance scales with affinity and is capped', () => {
    expect(coverChance(60)).toBeCloseTo(DEPTH.bonds.coverBase)
    expect(coverChance(80)).toBeGreaterThan(coverChance(60))
    expect(coverChance(100)).toBeLessThanOrEqual(DEPTH.bonds.coverMax)
  })
})

describe('bonds — follow-up', () => {
  function duo(seed: number, bonds: CombatBond[]): BattleResult {
    const a = hero({ id: 'a', stats: { spd: 100, pAtk: 100 } })
    const b = hero({ id: 'b', stats: { spd: 1, pAtk: 100 } })
    return runBattle([a, b], enc([dummy()], { bonds }, 200), seed)
  }

  it('a friend sometimes presses the attack on the same target, at reduced power', () => {
    const r = duo(3, [bond('a', 'b', 'closeFriend')])
    const ev = r.log.events
    const fu = ev.filter((e) => e.kind === 'followup')
    expect(fu.length).toBeGreaterThan(0)
    const i = ev.findIndex((e) => e.kind === 'followup')
    expect(ev[i]).toMatchObject({ unitId: 'b', allyId: 'a', targetId: 'dummy' })
    const strike = ev[i + 1] as Extract<CombatEvent, { kind: 'hit' }>
    expect(strike).toMatchObject({ kind: 'hit', actorId: 'b', targetId: 'dummy' })
    // half a basic attack: well under a's own blows
    expect(strike.amount).toBeLessThan(firstHit(r, 'a') * 0.7)
  })

  it('a sweeping skill is pressed on the front-most foe still standing', () => {
    const sweep = { id: 'sweep', name: 'Sweep', skillMult: 1, damageType: 'physical' as const, element: null, target: 'all-enemies' as const, spCost: 0 }
    const a = { ...hero({ id: 'a', stats: { spd: 100, pAtk: 100 } }), skills: [sweep] }
    const b = hero({ id: 'b', stats: { spd: 1, pAtk: 100 } })
    const foes = [dummy(), enemy({ id: 'dummy2', stats: { maxHP: 1_000_000, spd: 1, pAtk: 1 } })]
    const r = runBattle([a, b], enc(foes, { bonds: [bond('a', 'b', 'closeFriend')] }, 200), 3)
    const fu = r.log.events.filter((e): e is Extract<CombatEvent, { kind: 'followup' }> => e.kind === 'followup')
    expect(fu.length).toBeGreaterThan(0)
    expect(fu.every((e) => e.targetId === 'dummy')).toBe(true)
  })

  it('never without a friendly bond, and rivals never follow up', () => {
    expect(duo(3, []).log.events.some((e) => e.kind === 'followup')).toBe(false)
    expect(duo(3, [bond('a', 'b', 'rival')]).log.events.some((e) => e.kind === 'followup')).toBe(false)
  })

  it('the follow-up strike is the friend’s free attack at the tuned power', () => {
    const u = hero({ id: 'x' })
    const s = followUpSkill(u, { id: 'basic-attack', name: 'Basic', skillMult: 1, damageType: 'physical', element: null, target: 'single', spCost: 0 })
    expect(s.skillMult).toBeCloseTo(DEPTH.bonds.followUpMult)
  })
})

describe('bonds — rivals and grudges', () => {
  it('rivals deal a little more while both stand', () => {
    const run = (bonds: CombatBond[]) =>
      firstHit(runBattle([hero({ id: 'a', stats: { spd: 200, pAtk: 200 } }), hero({ id: 'b', stats: { spd: 1 } })], enc([dummy()], { bonds }), 9), 'a')
    expect(run([bond('a', 'b', 'rival')]) / run([])).toBeCloseTo(1 + DEPTH.bonds.rivalDamage, 2)
  })

  it('a rival sometimes ignores the focus order to chase their own kill', () => {
    const run = (seed: number, bonds: CombatBond[]) =>
      runBattle(
        [hero({ id: 'a', stats: { spd: 100, pAtk: 1 } }), hero({ id: 'b', stats: { spd: 90, pAtk: 1 } })],
        enc([dummy(), enemy({ id: 'marked', stats: { maxHP: 1_000_000, spd: 1, pAtk: 1 } })], { bonds, focus: { focusEnemyId: 'marked' } }, 200),
        seed,
      )
    const r = run(4, [bond('a', 'b', 'rival')])
    const ev = r.log.events
    const i = ev.findIndex((e) => e.kind === 'rivalry')
    expect(i).toBeGreaterThan(-1)
    const rv = ev[i] as Extract<CombatEvent, { kind: 'rivalry' }>
    expect(rv.targetId).not.toBe('marked')
    expect(ev[i + 1]).toMatchObject({ kind: 'act', actorId: rv.unitId, targetId: rv.targetId })
    // most blows still follow the order
    const acts = ev.filter((e): e is Extract<CombatEvent, { kind: 'act' }> => e.kind === 'act' && e.actorId !== 'dummy' && e.actorId !== 'marked')
    expect(acts.filter((a) => a.targetId === 'marked').length).toBeGreaterThan(acts.length / 2)
    // friends obey
    expect(run(4, [bond('a', 'b', 'friend')]).log.events.some((e) => e.kind === 'rivalry')).toBe(false)
  })

  it('a grudge costs accuracy (misses), a rivalry does not', () => {
    const run = (kind: CombatBond['kind']) =>
      runBattle([hero({ id: 'a', stats: { spd: 200 } }), hero({ id: 'b', stats: { spd: 1 } })], enc([dummy()], { bonds: [bond('a', 'b', kind)] }, 400), 21)
    expect(run('grudge').log.events.some((e) => e.kind === 'miss')).toBe(true)
    expect(run('rival').log.events.some((e) => e.kind === 'miss')).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Floor modifiers
// ─────────────────────────────────────────────────────────────────────────────

describe('floor modifiers in combat', () => {
  const M = DEPTH.mods
  function strike(el: Element, mods: FloorModifierId[], side: 'hero' | 'enemy' = 'hero'): number {
    if (side === 'hero') {
      return firstHit(runBattle([hero({ id: 'h', element: el, stats: { spd: 200, pAtk: 2000 } })], enc([dummy()], { modifiers: mods }), 13), 'h')
    }
    return firstHit(runBattle([hero({ id: 'h', stats: { maxHP: 1_000_000, spd: 1 } })], enc([enemy({ id: 'e', element: el, stats: { spd: 200, pAtk: 2000 } })], { modifiers: mods }), 13), 'e')
  }

  it('announces the floor’s conditions right after the battle starts', () => {
    const r = runBattle([hero({ id: 'h' })], enc([dummy()], { modifiers: ['gale', 'frost'] }, 20), 2)
    expect(r.log.events[0]!.kind).toBe('battle-start')
    expect(r.log.events[1]).toMatchObject({ kind: 'floor-mods', modifiers: ['gale', 'frost'] })
  })

  it('Holy Ground: light +, dark −', () => {
    expect(strike('light', ['holyGround']) / strike('light', [])).toBeCloseTo(1 + M.holyGround, 2)
    expect(strike('dark', ['holyGround']) / strike('dark', [])).toBeCloseTo(1 - M.holyGround, 2)
    expect(strike('fire', ['holyGround'])).toBe(strike('fire', []))
  })

  it('Frost: fire −, water +', () => {
    expect(strike('fire', ['frost']) / strike('fire', [])).toBeCloseTo(1 - M.frost, 2)
    expect(strike('water', ['frost']) / strike('water', [])).toBeCloseTo(1 + M.frost, 2)
  })

  it('Blood Moon: enemies hit harder (heroes don’t), and enrage sooner', () => {
    expect(strike('physical', ['bloodMoon'], 'enemy') / strike('physical', [], 'enemy')).toBeCloseTo(1 + M.bloodMoonDamage, 2)
    expect(strike('physical', ['bloodMoon'])).toBe(strike('physical', []))
    expect(modEnrageTick(['bloodMoon'], 100)).toBe(Math.floor(100 * M.bloodMoonEnrage))
    expect(modEnrageTick([], 100)).toBe(100)
  })

  it('Fog: blows miss on both sides', () => {
    const r = runBattle(
      [hero({ id: 'h', stats: { maxHP: 1_000_000, spd: 100 } })],
      enc([enemy({ id: 'e', stats: { maxHP: 1_000_000, spd: 100, pAtk: 1 } })], { modifiers: ['fog'] }, 400),
      2,
    )
    const misses = r.log.events.filter((e): e is Extract<CombatEvent, { kind: 'miss' }> => e.kind === 'miss')
    expect(misses.some((m) => m.actorId === 'h')).toBe(true)
    expect(misses.some((m) => m.actorId === 'e')).toBe(true)
  })

  it('Gale: everyone acts sooner', () => {
    const firstAct = (mods: FloorModifierId[]) => runBattle([hero({ id: 'h' })], enc([dummy()], { modifiers: mods }), 1).log.events.find((e) => e.kind === 'act')!.tick
    expect(firstAct(['gale'])).toBeLessThan(firstAct([]))
    expect(modSpeed(['gale'], 100)).toBe(Math.round(100 * M.galeSpeed))
  })

  it('Miasma: healing is halved', () => {
    const heal = (mods: FloorModifierId[]) => {
      const h = hero({ id: 'h', hp: 10, stats: { maxHP: 100_000, spd: 200, pAtk: 400 }, keywords: [{ kind: 'lifesteal', fraction: 0.5 }] })
      const r = runBattle([h], enc([dummy()], { modifiers: mods }), 5)
      return (r.log.events.find((e) => e.kind === 'heal') as Extract<CombatEvent, { kind: 'heal' }>).amount
    }
    expect(heal(['miasma']) / heal([])).toBeCloseTo(M.miasmaHeal, 2)
  })
})

describe('plain battles are untouched', () => {
  it('no bonds and no modifiers → no extra draws (2 per hit) and no depth events', () => {
    const r = runBattle(
      [hero({ id: 'a', line: 'back', cls: 'mage' }), hero({ id: 'b', cls: 'warrior' })],
      enc([enemy({ id: 'e', stats: { maxHP: 2000 } })], {}, 300),
      99,
    )
    const hitsN = r.log.events.filter((e) => e.kind === 'hit').length
    expect(r.log.rngDraws).toBe(hitsN * 2)
    expect(r.log.events.some((e) => ['cover', 'followup', 'rivalry', 'floor-mods', 'miss'].includes(e.kind))).toBe(false)
  })
})
