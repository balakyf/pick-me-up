import { runBattle } from './combat'
import { TUNING } from '../tuning'
import type {
  CombatUnit,
  DerivedStats,
  SkillEffect,
  Encounter,
  Objective,
  Mission,
  EnemyWave,
  KeywordTag,
  HeroClass,
  Element,
  Line,
  CombatSide,
  HeroId,
} from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// Hand-built CombatUnit fixtures (the unit module is not in scope here).
// ─────────────────────────────────────────────────────────────────────────────

function stats(overrides: Partial<DerivedStats> = {}): DerivedStats {
  return {
    maxHP: 100,
    pAtk: 50,
    mAtk: 50,
    pDef: 10,
    mDef: 10,
    spd: 50,
    critPct: 0,
    evaPct: 0,
    accPct: 100,
    statusRes: 0,
    ...overrides,
  }
}

interface UnitOpts {
  id: string
  name?: string
  side: CombatSide
  unitClass?: HeroClass | null
  element?: Element
  line?: Line
  level?: number
  stats?: Partial<DerivedStats>
  maxSP?: number
  hp?: number
  sp?: number
  skills?: SkillEffect[]
  keywords?: KeywordTag[]
  cp?: number
  sourceHeroId?: HeroId
  targetTag?: string
}

function makeUnit(o: UnitOpts): CombatUnit {
  const s = stats(o.stats)
  return {
    id: o.id,
    name: o.name ?? o.id,
    side: o.side,
    unitClass: o.unitClass ?? null,
    element: o.element ?? 'physical',
    line: o.line ?? 'front',
    level: o.level ?? 1,
    stats: s,
    maxSP: o.maxSP ?? 100,
    currentHP: o.hp ?? s.maxHP,
    currentSP: o.sp ?? (o.maxSP ?? 100),
    actionGauge: 0,
    alive: true,
    skills: o.skills ?? [],
    keywords: o.keywords ?? [],
    cp: o.cp ?? 100,
    ...(o.sourceHeroId !== undefined ? { sourceHeroId: o.sourceHeroId } : {}),
    ...(o.targetTag !== undefined ? { targetTag: o.targetTag } : {}),
  }
}

function hero(o: Omit<UnitOpts, 'side'>): CombatUnit {
  return makeUnit({ ...o, side: 'hero', sourceHeroId: o.sourceHeroId ?? (o.id as unknown as HeroId) })
}

function enemy(o: Omit<UnitOpts, 'side'>): CombatUnit {
  return makeUnit({ ...o, side: 'enemy' })
}

function mission(objectives: Objective[], timer: number | null = null): Mission {
  return { type: 'test', objectives, timer }
}

function encounter(waves: CombatUnit[][], m: Mission, extra: Partial<Encounter> = {}): Encounter {
  const ewaves: EnemyWave[] = waves.map((units) => ({ units }))
  return {
    floor: 1,
    mission: m,
    waves: ewaves,
    encounterContext: 'tower',
    ...extra,
  }
}

const annihilate: Objective[] = [{ kind: 'annihilate' }]

// ─────────────────────────────────────────────────────────────────────────────
// Determinism
// ─────────────────────────────────────────────────────────────────────────────

describe('determinism', () => {
  it('same seed → identical events array AND identical rngDraws', () => {
    const build = () =>
      runBattle(
        [hero({ id: 'h1', stats: { pAtk: 80, critPct: 25, spd: 60 } })],
        encounter([[enemy({ id: 'e1', stats: { maxHP: 300, pDef: 20, spd: 40, pAtk: 30 } })]], mission(annihilate)),
        123456,
      )
    const a = build()
    const b = build()
    expect(a.log.events).toEqual(b.log.events)
    expect(a.log.rngDraws).toBe(b.log.rngDraws)
    expect(a.outcome).toBe(b.outcome)
  })

  it('different seeds can diverge (variance/crit)', () => {
    const f = (seed: number) =>
      runBattle(
        [hero({ id: 'h1', stats: { pAtk: 40, critPct: 50, spd: 55 } })],
        encounter([[enemy({ id: 'e1', stats: { maxHP: 500, pDef: 30, spd: 45, pAtk: 20 } })]], mission(annihilate)),
        seed,
      )
    const a = f(1)
    const b = f(2)
    // Crit outcomes differ across seeds, so the event streams should not be identical.
    expect(a.log.events).not.toEqual(b.log.events)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// One-shot
// ─────────────────────────────────────────────────────────────────────────────

describe('one-shot', () => {
  it('a strong hero one-shots a weak goblin', () => {
    const res = runBattle(
      [hero({ id: 'h1', stats: { pAtk: 1000, spd: 100, critPct: 0 } })],
      encounter([[enemy({ id: 'goblin', stats: { maxHP: 50, pDef: 5, spd: 1 } })]], mission(annihilate)),
      42,
    )
    expect(res.outcome).toBe('win')
    expect(res.wavesCleared).toBe(1)
    const hits = res.log.events.filter((e) => e.kind === 'hit')
    expect(hits.length).toBe(1)
    const deaths = res.log.events.filter((e) => e.kind === 'death')
    expect(deaths.length).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Elements
// ─────────────────────────────────────────────────────────────────────────────

describe('element multiplier', () => {
  // Strip variance/crit by reading the first hit; with critPct 0 only variance
  // wobbles ±5%, so relative ordering of advantage/neutral/disadvantage holds.
  function firstHitAmount(attackerEl: Element, defenderEl: Element): number {
    const res = runBattle(
      [hero({ id: 'h1', element: attackerEl, stats: { pAtk: 100, pDef: 0, spd: 100, critPct: 0 } })],
      encounter(
        [[enemy({ id: 'e1', element: defenderEl, stats: { maxHP: 100000, pDef: 50, spd: 1 } })]],
        mission(annihilate),
        {},
      ),
      7,
    )
    const hit = res.log.events.find((e) => e.kind === 'hit')!
    return (hit as { amount: number }).amount
  }

  it('advantage is 1.5x, disadvantage 0.75x, neutral 1.0x (same seed → same variance)', () => {
    // fire advantaged vs wind; water advantaged vs fire (so fire is disadvantaged vs water);
    // fire vs earth is neutral.
    const adv = firstHitAmount('fire', 'wind')
    const neutral = firstHitAmount('fire', 'earth')
    const dis = firstHitAmount('fire', 'water')
    // Same seed → same variance roll, so ratios are exact-ish.
    expect(adv).toBeGreaterThan(neutral)
    expect(neutral).toBeGreaterThan(dis)
    expect(adv / neutral).toBeCloseTo(TUNING.combat.elementAdvantage, 1)
    expect(dis / neutral).toBeCloseTo(TUNING.combat.elementDisadvantage, 1)
  })

  it('light ⇄ dark mutual advantage', () => {
    const lightVsDark = firstHitAmount('light', 'dark')
    const lightVsLight = firstHitAmount('light', 'light')
    expect(lightVsDark / lightVsLight).toBeCloseTo(TUNING.combat.elementAdvantage, 1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Mitigation
// ─────────────────────────────────────────────────────────────────────────────

describe('mitigation K/(K+DEF)', () => {
  function firstHitVsDef(def: number): number {
    const res = runBattle(
      [hero({ id: 'h1', element: 'physical', level: 1, stats: { pAtk: 200, spd: 100, critPct: 0 } })],
      encounter([[enemy({ id: 'e1', stats: { maxHP: 100000, pDef: def, spd: 1 } })]], mission(annihilate)),
      99,
    )
    const hit = res.log.events.find((e) => e.kind === 'hit')!
    return (hit as { amount: number }).amount
  }

  it('higher DEF reduces damage', () => {
    const low = firstHitVsDef(0)
    const mid = firstHitVsDef(50)
    const high = firstHitVsDef(500)
    expect(low).toBeGreaterThan(mid)
    expect(mid).toBeGreaterThan(high)
  })

  it('matches the K/(K+DEF) shape (DEF=K halves vs DEF=0)', () => {
    // level 1 → K = defenseKFlat + defenseKPerLevel*1 = 58.
    const K = TUNING.combat.defenseKFlat + TUNING.combat.defenseKPerLevel * 1
    const atDef0 = firstHitVsDef(0) // mitig = 1.0
    const atDefK = firstHitVsDef(K) // mitig = 0.5
    // Same seed → same variance, so the ratio reflects only mitigation.
    expect(atDefK / atDef0).toBeCloseTo(0.5, 1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SPD / action frequency
// ─────────────────────────────────────────────────────────────────────────────

describe('SPD', () => {
  it('a 2x-SPD unit acts ~2x as often', () => {
    // Two heroes vs an unkillable dummy enemy, capped by a survive timer so the
    // battle runs a fixed number of ticks. Count each hero's 'act' events.
    const res = runBattle(
      [
        hero({ id: 'fast', stats: { spd: 200, pAtk: 1, critPct: 0 } }),
        hero({ id: 'slow', stats: { spd: 100, pAtk: 1, critPct: 0 } }),
      ],
      encounter(
        [[enemy({ id: 'wall', stats: { maxHP: 1e9, pDef: 0, spd: 1, pAtk: 0 } })]],
        mission([{ kind: 'survive', ticks: 100 }], 100),
      ),
      5,
    )
    const fastActs = res.log.events.filter((e) => e.kind === 'act' && e.actorId === 'fast').length
    const slowActs = res.log.events.filter((e) => e.kind === 'act' && e.actorId === 'slow').length
    expect(slowActs).toBeGreaterThan(0)
    const ratio = fastActs / slowActs
    expect(ratio).toBeGreaterThan(1.7)
    expect(ratio).toBeLessThan(2.3)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Permadeath bookkeeping
// ─────────────────────────────────────────────────────────────────────────────

describe('permadeath', () => {
  it('fallenHeroIds lists dead heroes via sourceHeroId; survivors list the rest', () => {
    const res = runBattle(
      [
        hero({ id: 'glass', sourceHeroId: 'H_glass' as HeroId, stats: { maxHP: 1, pDef: 0, spd: 60, pAtk: 1 } }),
        hero({ id: 'tank', sourceHeroId: 'H_tank' as HeroId, stats: { maxHP: 1e9, pDef: 999, spd: 50, pAtk: 1000 } }),
      ],
      encounter(
        [[enemy({ id: 'killer', stats: { maxHP: 1e9, pAtk: 9999, spd: 80, pDef: 0 } })]],
        mission([{ kind: 'survive', ticks: 30 }], 30),
      ),
      11,
    )
    expect(res.fallenHeroIds).toContain('H_glass')
    expect(res.fallenHeroIds).not.toContain('H_tank')
    expect(res.survivorHeroIds).toContain('H_tank')
  })

  it('all heroes dead → wipe', () => {
    const res = runBattle(
      [hero({ id: 'paper', stats: { maxHP: 1, pDef: 0, spd: 40, pAtk: 0 } })],
      encounter([[enemy({ id: 'killer', stats: { maxHP: 1e9, pAtk: 9999, spd: 100, pDef: 0 } })]], mission(annihilate)),
      3,
    )
    expect(res.outcome).toBe('wipe')
    expect(res.fallenHeroIds.length).toBe(1)
    expect(res.survivorHeroIds.length).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Missions
// ─────────────────────────────────────────────────────────────────────────────

describe('mission: defend (3 waves)', () => {
  it('wins only after wave 3 is cleared', () => {
    const weak = (id: string) => enemy({ id, stats: { maxHP: 30, pDef: 0, spd: 30, pAtk: 0 } })
    const res = runBattle(
      [hero({ id: 'h1', stats: { pAtk: 1000, spd: 100, critPct: 0 } })],
      encounter([[weak('w1')], [weak('w2')], [weak('w3')]], mission([{ kind: 'defend', waves: 3 }])),
      8,
    )
    expect(res.outcome).toBe('win')
    expect(res.wavesCleared).toBe(3)
    // The win event must come AFTER wave 3 spawned.
    const wave3Spawn = res.log.events.find((e) => e.kind === 'wave-spawn' && e.wave === 2)
    const end = res.log.events.find((e) => e.kind === 'end')!
    expect(wave3Spawn).toBeDefined()
    expect(end.seq).toBeGreaterThan(wave3Spawn!.seq)
  })

  it('does not win before all 3 waves are cleared (2-wave defend on a 3-wave roster wins earlier)', () => {
    const weak = (id: string) => enemy({ id, stats: { maxHP: 30, pDef: 0, spd: 30, pAtk: 0 } })
    const res2 = runBattle(
      [hero({ id: 'h1', stats: { pAtk: 1000, spd: 100, critPct: 0 } })],
      encounter([[weak('w1')], [weak('w2')], [weak('w3')]], mission([{ kind: 'defend', waves: 2 }])),
      8,
    )
    expect(res2.outcome).toBe('win')
    // It should win at exactly 2 cleared (never spawns wave 3 because we still
    // advance waves, but win is detected right when wavesCleared hits 2).
    expect(res2.wavesCleared).toBe(2)
  })
})

describe('mission: survive(N)', () => {
  it('wins at tick N if the party is alive', () => {
    const res = runBattle(
      [hero({ id: 'h1', stats: { maxHP: 1e9, pDef: 999, spd: 50, pAtk: 1 } })],
      encounter(
        [[enemy({ id: 'e1', stats: { maxHP: 1e9, pAtk: 1, spd: 50, pDef: 0 } })]],
        mission([{ kind: 'survive', ticks: 50 }], 50),
      ),
      4,
    )
    expect(res.outcome).toBe('win')
    expect(res.ticksElapsed).toBeGreaterThanOrEqual(50)
  })

  it('wipes if outmatched before tick N', () => {
    const res = runBattle(
      [hero({ id: 'h1', stats: { maxHP: 5, pDef: 0, spd: 40, pAtk: 0 } })],
      encounter(
        [[enemy({ id: 'e1', stats: { maxHP: 1e9, pAtk: 9999, spd: 100, pDef: 0 } })]],
        mission([{ kind: 'survive', ticks: 1000 }], 1000),
      ),
      6,
    )
    expect(res.outcome).toBe('wipe')
  })
})

describe('mission: defeat(target)', () => {
  it('wins when the tagged enemy dies even if adds still live', () => {
    const res = runBattle(
      [hero({ id: 'h1', unitClass: 'warrior', stats: { pAtk: 1000, spd: 100, critPct: 0 } })],
      encounter(
        [
          [
            // The boss is front-most (spawn order) so the warrior hits it first.
            enemy({ id: 'boss', targetTag: 'BOSS', stats: { maxHP: 80, pDef: 0, spd: 1 } }),
            enemy({ id: 'add1', stats: { maxHP: 1e9, pDef: 0, spd: 1 } }),
            enemy({ id: 'add2', stats: { maxHP: 1e9, pDef: 0, spd: 1 } }),
          ],
        ],
        mission([{ kind: 'defeat', targetTag: 'BOSS' }]),
      ),
      13,
    )
    expect(res.outcome).toBe('win')
    expect(res.defeatedTargetTags).toContain('BOSS')
    // Adds are still alive (battle ended on the defeat objective, not annihilate).
    const addDeaths = res.log.events.filter(
      (e) => e.kind === 'death' && (e.unitId === 'add1' || e.unitId === 'add2'),
    )
    expect(addDeaths.length).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Phased targeting
// ─────────────────────────────────────────────────────────────────────────────

describe('phased', () => {
  it('a phased core is untargetable until its non-phased wavemates die', () => {
    const res = runBattle(
      [hero({ id: 'h1', unitClass: 'warrior', stats: { pAtk: 500, spd: 100, critPct: 0 } })],
      encounter(
        [
          [
            // core is spawned FIRST (front-most) but is phased, so it should be
            // skipped until the guard dies.
            enemy({ id: 'core', keywords: [{ kind: 'phased' }], stats: { maxHP: 200, pDef: 0, spd: 1 } }),
            enemy({ id: 'guard', stats: { maxHP: 200, pDef: 0, spd: 1 } }),
          ],
        ],
        mission(annihilate),
      ),
      21,
    )
    expect(res.outcome).toBe('win')
    // The first hit must land on the guard, never the core, while the guard lives.
    const hits = res.log.events.filter((e) => e.kind === 'hit') as { targetId: string }[]
    const guardDeathIdx = res.log.events.findIndex((e) => e.kind === 'death' && e.unitId === 'guard')
    expect(guardDeathIdx).toBeGreaterThanOrEqual(0)
    // Find the seq of the guard death.
    const guardDeathSeq = res.log.events[guardDeathIdx]!.seq
    const coreHitsBeforeGuardDies = res.log.events.filter(
      (e) => e.kind === 'hit' && (e as { targetId: string }).targetId === 'core' && e.seq < guardDeathSeq,
    )
    expect(coreHitsBeforeGuardDies.length).toBe(0)
    // And the core is eventually hit (after the guard falls).
    expect(hits.some((h) => h.targetId === 'core')).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Targeting priorities
// ─────────────────────────────────────────────────────────────────────────────

describe('targeting', () => {
  it('archer hits the lowest-HP enemy first', () => {
    const res = runBattle(
      [hero({ id: 'arch', unitClass: 'archer', stats: { pAtk: 1, spd: 1000, critPct: 0 } })],
      encounter(
        [
          [
            enemy({ id: 'fat', stats: { maxHP: 1000, pDef: 0, spd: 1 }, hp: 1000 }),
            enemy({ id: 'weak', stats: { maxHP: 1000, pDef: 0, spd: 1 }, hp: 10 }),
          ],
        ],
        mission([{ kind: 'survive', ticks: 5 }], 5),
      ),
      31,
    )
    const firstAct = res.log.events.find((e) => e.kind === 'act')! as { targetId: string }
    expect(firstAct.targetId).toBe('weak')
  })

  it('thief hits the highest-CP enemy first', () => {
    const res = runBattle(
      [hero({ id: 'rogue', unitClass: 'thief', stats: { pAtk: 1, spd: 1000, critPct: 0 } })],
      encounter(
        [
          [
            enemy({ id: 'low', cp: 100, stats: { maxHP: 1000, pDef: 0, spd: 1 } }),
            enemy({ id: 'high', cp: 9999, stats: { maxHP: 1000, pDef: 0, spd: 1 } }),
          ],
        ],
        mission([{ kind: 'survive', ticks: 5 }], 5),
      ),
      33,
    )
    const firstAct = res.log.events.find((e) => e.kind === 'act')! as { targetId: string }
    expect(firstAct.targetId).toBe('high')
  })

  it('focus overrides class priority for single-target attackers', () => {
    const res = runBattle(
      [hero({ id: 'arch', unitClass: 'archer', stats: { pAtk: 1, spd: 1000, critPct: 0 } })],
      encounter(
        [
          [
            enemy({ id: 'weak', stats: { maxHP: 1000, pDef: 0, spd: 1 }, hp: 5 }),
            enemy({ id: 'focusme', stats: { maxHP: 1000, pDef: 0, spd: 1 }, hp: 900 }),
          ],
        ],
        mission([{ kind: 'survive', ticks: 5 }], 5),
        { focus: { focusEnemyId: 'focusme' } },
      ),
      35,
    )
    const firstAct = res.log.events.find((e) => e.kind === 'act')! as { targetId: string }
    expect(firstAct.targetId).toBe('focusme')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Skills / SP
// ─────────────────────────────────────────────────────────────────────────────

describe('skills', () => {
  it('uses the first affordable skill and spends SP; basic attack when broke', () => {
    const bigSkill: SkillEffect = {
      id: 'fireball',
      name: 'Fireball',
      skillMult: 3,
      damageType: 'magic',
      element: 'fire',
      target: 'single',
      spCost: 60,
    }
    const res = runBattle(
      [
        hero({
          id: 'm',
          unitClass: 'mage',
          element: 'fire',
          maxSP: 100,
          sp: 100,
          skills: [bigSkill],
          stats: { mAtk: 100, pAtk: 5, spd: 100, critPct: 0 },
        }),
      ],
      encounter([[enemy({ id: 'e1', stats: { maxHP: 1e9, pDef: 0, mDef: 0, spd: 1 } })]], mission([{ kind: 'survive', ticks: 50 }], 50)),
      77,
    )
    const acts = res.log.events.filter((e) => e.kind === 'act') as { skillId: string }[]
    // First action uses the skill; once SP runs out it falls back to basic-attack.
    expect(acts[0]!.skillId).toBe('fireball')
    expect(acts.some((a) => a.skillId === 'basic-attack')).toBe(true)
    // Exactly one fireball is affordable at start (100 SP / 60 cost → 1 cast).
    expect(acts.filter((a) => a.skillId === 'fireball').length).toBe(1)
  })

  it('all-enemies skill hits every targetable enemy', () => {
    const aoe: SkillEffect = {
      id: 'meteor',
      name: 'Meteor',
      skillMult: 2,
      damageType: 'magic',
      element: 'fire',
      target: 'all-enemies',
      spCost: 0,
    }
    const res = runBattle(
      [hero({ id: 'm', unitClass: 'mage', skills: [aoe], stats: { mAtk: 1, spd: 1000, critPct: 0 } })],
      encounter(
        [
          [
            enemy({ id: 'a', stats: { maxHP: 1e9, mDef: 0, spd: 1 } }),
            enemy({ id: 'b', stats: { maxHP: 1e9, mDef: 0, spd: 1 } }),
            enemy({ id: 'c', stats: { maxHP: 1e9, mDef: 0, spd: 1 } }),
          ],
        ],
        mission([{ kind: 'survive', ticks: 3 }], 3),
      ),
      88,
    )
    // First action's hits should cover all three enemies.
    const firstActSeq = res.log.events.find((e) => e.kind === 'act')!.seq
    const hitsThisAction = res.log.events.filter(
      (e) => e.kind === 'hit' && e.seq > firstActSeq && e.seq < firstActSeq + 4,
    ) as { targetId: string }[]
    const targets = new Set(hitsThisAction.map((h) => h.targetId))
    expect(targets).toEqual(new Set(['a', 'b', 'c']))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Enrage keyword
// ─────────────────────────────────────────────────────────────────────────────

describe('enrage', () => {
  it('multiplies damage after the enrage tick', () => {
    const boss = enemy({
      id: 'boss',
      keywords: [{ kind: 'enrage', afterTick: 3, multiplier: 5 }],
      stats: { pAtk: 100, pDef: 0, spd: 1000, critPct: 0 }, // acts every tick
    })
    const res = runBattle(
      [hero({ id: 'tank', stats: { maxHP: 1e9, pDef: 0, spd: 1, pAtk: 0 } })],
      encounter([[boss]], mission([{ kind: 'survive', ticks: 6 }], 6)),
      55,
    )
    const hits = res.log.events.filter((e) => e.kind === 'hit') as { tick: number; amount: number }[]
    const preEnrage = hits.filter((h) => h.tick < 3)
    const postEnrage = hits.filter((h) => h.tick >= 3)
    expect(preEnrage.length).toBeGreaterThan(0)
    expect(postEnrage.length).toBeGreaterThan(0)
    const avgPre = preEnrage.reduce((s, h) => s + h.amount, 0) / preEnrage.length
    const avgPost = postEnrage.reduce((s, h) => s + h.amount, 0) / postEnrage.length
    expect(avgPost / avgPre).toBeCloseTo(5, 0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// unitsInit snapshot
// ─────────────────────────────────────────────────────────────────────────────

describe('log.unitsInit', () => {
  it('snapshots every hero + every enemy across all waves', () => {
    const res = runBattle(
      [hero({ id: 'h1', stats: { pAtk: 1000, spd: 100 } })],
      encounter(
        [[enemy({ id: 'w1a' }), enemy({ id: 'w1b' })], [enemy({ id: 'w2a' })]],
        mission([{ kind: 'defend', waves: 2 }]),
      ),
      9,
    )
    const ids = res.log.unitsInit.map((u) => u.id).sort()
    expect(ids).toEqual(['h1', 'w1a', 'w1b', 'w2a'])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Input immutability
// ─────────────────────────────────────────────────────────────────────────────

describe('purity', () => {
  it('never mutates the input units', () => {
    const h = hero({ id: 'h1', stats: { pAtk: 1000, spd: 100 }, hp: 100, sp: 100 })
    const e = enemy({ id: 'e1', stats: { maxHP: 50, pDef: 0, spd: 1 }, hp: 50 })
    const before = JSON.stringify({ h, e })
    runBattle([h], encounter([[e]], mission(annihilate)), 1)
    const after = JSON.stringify({ h, e })
    expect(after).toBe(before)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// GOLDEN SNAPSHOT — a full small battle, hard-pinned (not toMatchSnapshot).
// ─────────────────────────────────────────────────────────────────────────────

describe('golden snapshot', () => {
  function goldenBattle() {
    return runBattle(
      [
        hero({
          id: 'han',
          name: 'Han',
          unitClass: 'warrior',
          element: 'fire',
          level: 5,
          stats: { maxHP: 400, pAtk: 90, pDef: 30, spd: 70, critPct: 20 },
          maxSP: 100,
          sp: 100,
        }),
      ],
      encounter(
        [[enemy({ id: 'goblin', name: 'Goblin', element: 'wind', level: 3, stats: { maxHP: 220, pDef: 15, spd: 45, pAtk: 25 } })]],
        mission(annihilate),
      ),
      20260615,
    )
  }

  it('produces a stable outcome, event count, and rngDraws', () => {
    const res = goldenBattle()
    // These three values are the regression fence: any change to the loop order,
    // formula, or RNG draw order moves one of them.
    expect(res.outcome).toBe(GOLDEN.outcome)
    expect(res.log.events.length).toBe(GOLDEN.eventCount)
    expect(res.log.rngDraws).toBe(GOLDEN.rngDraws)
    expect(res.ticksElapsed).toBe(GOLDEN.ticksElapsed)
    expect(res.wavesCleared).toBe(GOLDEN.wavesCleared)
    // rngDraws must equal 2 per hit (crit + variance).
    const hitCount = res.log.events.filter((e) => e.kind === 'hit').length
    expect(res.log.rngDraws).toBe(hitCount * 2)
  })

  it('is byte-stable across reruns', () => {
    expect(JSON.stringify(goldenBattle().log.events)).toBe(JSON.stringify(goldenBattle().log.events))
  })
})

// Pinned golden values — captured from a verified run. Any change to the ATB
// loop order, damage formula, or RNG draw order moves one of these numbers.
// Battle: Han (Warrior, fire, Lv5, pAtk 90, crit 20%, spd 70) one party member
// vs a single wind Goblin (Lv3, 220 HP, pDef 15, spd 45), seed 20260615.
const GOLDEN = {
  outcome: 'win' as const,
  eventCount: 9, // battle-start + 3×(act+hit) + death + end
  rngDraws: 6, // 3 hits × (crit roll + variance draw)
  ticksElapsed: 29,
  wavesCleared: 1,
}
