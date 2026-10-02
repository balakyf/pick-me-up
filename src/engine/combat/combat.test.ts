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
  BattleResult,
} from '../types'
import { panicChance } from '../kitchen'

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
  sanity?: number
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
    ...(o.sanity !== undefined ? { sanity: o.sanity } : {}),
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
// Panic (low Sanity) — Layer 3 §3.2. A hero below the panic threshold may lose
// its turn. The draw is GATED so a healthy hero adds zero RNG draws.
// ─────────────────────────────────────────────────────────────────────────────

describe('panic (low Sanity)', () => {
  // Tanky, fast hero vs a high-HP weak enemy → many ticks, many action (and thus
  // panic-roll) opportunities; the enemy barely scratches the hero.
  const buildBattle = (seed: number, opts: { sanity?: number; statusRes?: number } = {}) =>
    runBattle(
      [hero({ id: 'h1', stats: { pAtk: 40, spd: 60, statusRes: opts.statusRes ?? 0 }, sanity: opts.sanity })],
      encounter([[enemy({ id: 'e1', stats: { maxHP: 800, pDef: 20, spd: 30, pAtk: 5 } })]], mission(annihilate)),
      seed,
    )

  const hasPanic = (r: BattleResult) => r.log.events.some((e) => e.kind === 'panic')

  it('panicChance gates correctly (pure): 0 at/above threshold, positive below', () => {
    expect(panicChance(30, 0)).toBe(0)
    expect(panicChance(100, 0)).toBe(0)
    expect(panicChance(10, 0)).toBeCloseTo(0.2, 6)
    expect(panicChance(0, 50)).toBeCloseTo(0.15, 6) // statusRes halves it
    expect(panicChance(0, 100)).toBe(0) // fully mitigated
  })

  it('a healthy hero never panics and consumes the SAME draws as a no-Sanity control', () => {
    const control = buildBattle(123, { sanity: undefined })
    const healthy = buildBattle(123, { sanity: 100 })
    expect(hasPanic(healthy)).toBe(false)
    expect(healthy.log.rngDraws).toBe(control.log.rngDraws)
    expect(healthy.log.events).toEqual(control.log.events)
  })

  it('a near-zero-Sanity hero panics in at least some battles', () => {
    let saw = false
    for (let seed = 1; seed <= 40 && !saw; seed++) saw = hasPanic(buildBattle(seed, { sanity: 1 }))
    expect(saw).toBe(true)
  })

  it('every panic event names the panicking hero', () => {
    let panicRes: BattleResult | null = null
    for (let seed = 1; seed <= 40 && !panicRes; seed++) {
      const r = buildBattle(seed, { sanity: 1 })
      if (hasPanic(r)) panicRes = r
    }
    expect(panicRes).not.toBeNull()
    for (const e of panicRes!.log.events.filter((e) => e.kind === 'panic')) {
      expect((e as { unitId: string }).unitId).toBe('h1')
    }
  })

  it('is deterministic — same seed + Sanity reproduces the event stream', () => {
    const a = buildBattle(7, { sanity: 1 })
    const b = buildBattle(7, { sanity: 1 })
    expect(a.log.events).toEqual(b.log.events)
    expect(a.log.rngDraws).toBe(b.log.rngDraws)
  })

  it('statusRes ≥ 100 fully mitigates — no panic, no extra draw', () => {
    const control = buildBattle(7, { sanity: undefined, statusRes: 100 })
    const immune = buildBattle(7, { sanity: 1, statusRes: 100 })
    expect(hasPanic(immune)).toBe(false)
    expect(immune.log.rngDraws).toBe(control.log.rngDraws)
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

describe('looming (outlast, not kill)', () => {
  const giant = () =>
    enemy({
      id: 'giant',
      keywords: [{ kind: 'enrage', afterTick: 10_000, multiplier: 5 }, { kind: 'looming' }],
      stats: { maxHP: 1_000_000, pAtk: 10_000, pDef: 0, spd: 200 },
    })

  it('never shields a phased wavemate, and the wave clears without it', () => {
    const res = runBattle(
      [hero({ id: 'h1', unitClass: 'warrior', stats: { pAtk: 500, spd: 100 } })],
      encounter(
        [[giant(), enemy({ id: 'priest', targetTag: 'priest', keywords: [{ kind: 'phased' }], stats: { maxHP: 200, pDef: 0, spd: 1 } })]],
        mission([{ kind: 'defend', waves: 1 }, { kind: 'defeat', targetTag: 'priest' }]),
      ),
      5,
    )
    expect(res.outcome).toBe('win')
    expect(res.defeatedTargetTags).toContain('priest')
    // The giant was never needed: it is still standing, and the hero never chased it.
    const hitsOnGiant = res.log.events.filter((e) => e.kind === 'hit' && (e as { targetId: string }).targetId === 'giant')
    expect(hitsOnGiant.length).toBe(0)
  })

  it('sleeps until its enrage tick (it deals nothing before it wakes)', () => {
    const res = runBattle(
      [hero({ id: 'h1', unitClass: 'warrior', stats: { pAtk: 1, maxHP: 10_000, spd: 100 } })],
      encounter([[giant(), enemy({ id: 'imp', stats: { maxHP: 300, pAtk: 1, pDef: 0, spd: 1 } })]], mission([{ kind: 'survive', ticks: 200 }], 200)),
      5,
    )
    const giantHits = res.log.events.filter((e) => e.kind === 'hit' && (e as { actorId: string }).actorId === 'giant')
    expect(giantHits.length).toBe(0)
  })
})

describe('resist (a softer immune)', () => {
  it('cuts damage of its type by the reduction, and leaves the other type untouched', () => {
    const bolt: SkillEffect = { id: 'bolt', name: 'Bolt', skillMult: 1, damageType: 'magic', element: 'physical', target: 'single', spCost: 0 }
    const hitOn = (kw: KeywordTag[], cls: HeroClass) => {
      const res = runBattle(
        [hero({ id: 'h1', unitClass: cls, skills: cls === 'mage' ? [bolt] : [], stats: { pAtk: 100, mAtk: 100, spd: 100, critPct: 0 } })],
        encounter([[enemy({ id: 'w', keywords: kw, stats: { maxHP: 1_000_000, pDef: 0, mDef: 0, spd: 1, pAtk: 0, mAtk: 0 } })]], mission([{ kind: 'survive', ticks: 30 }], 30)),
        9,
      )
      return (res.log.events.find((e) => e.kind === 'hit') as { amount: number }).amount
    }
    const resist: KeywordTag[] = [{ kind: 'resist', damageType: 'physical', reduction: 0.75 }]
    const plainSteel = hitOn([], 'warrior')
    expect(hitOn(resist, 'warrior')).toBeLessThan(plainSteel * 0.3)
    expect(hitOn(resist, 'warrior')).toBeGreaterThan(0) // never a hard lock
    expect(hitOn(resist, 'mage')).toBe(hitOn([], 'mage'))
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
// Tactical Center — focus concentrate-fire bonus + overlook steering
// ─────────────────────────────────────────────────────────────────────────────

describe('focus concentrate-fire bonus', () => {
  // A practically unkillable enemy → battle always runs the full tick budget, so the
  // total draw count is independent of the (non-RNG) damage bonus.
  const runFocus = (focusBonus?: number) =>
    runBattle(
      [hero({ id: 'h1', stats: { pAtk: 60, spd: 1000, critPct: 0 } })],
      encounter(
        [[enemy({ id: 'e1', stats: { maxHP: 1_000_000_000, pDef: 20, spd: 1, pAtk: 1 } })]],
        mission(annihilate),
        { focus: { focusEnemyId: 'e1' }, focusBonus },
      ),
      99,
    )
  const firstHit = (focusBonus?: number) =>
    runFocus(focusBonus).log.events.find((e) => e.kind === 'hit')! as { amount: number }

  it('increases damage dealt to the focused enemy', () => {
    expect(firstHit(0.5).amount).toBeGreaterThan(firstHit(undefined).amount)
  })

  it('a zero/absent bonus is identical to no bonus (no behavior change)', () => {
    expect(firstHit(0).amount).toBe(firstHit(undefined).amount)
  })

  it('does not consume any extra RNG draws (determinism preserved)', () => {
    expect(runFocus(0.5).log.rngDraws).toBe(runFocus(undefined).log.rngDraws)
  })
})

describe('overlook steering', () => {
  const enemyFirstTarget = (overlookedAllyIds?: string[]) => {
    const res = runBattle(
      [
        hero({ id: 'tank', stats: { maxHP: 5000, spd: 1, pAtk: 1 } }),
        hero({ id: 'squishy', stats: { maxHP: 5000, spd: 1, pAtk: 1 } }),
      ],
      encounter(
        [[enemy({ id: 'e1', stats: { pAtk: 50, spd: 1000, pDef: 0 } })]],
        mission([{ kind: 'survive', ticks: 3 }], 3),
        overlookedAllyIds ? { focus: { overlookedAllyIds } } : {},
      ),
      7,
    )
    return res.log.events.find((e) => e.kind === 'act' && (e as { actorId: string }).actorId === 'e1') as {
      targetId: string
    }
  }

  it('an enemy avoids an overlooked ally while a non-overlooked ally lives', () => {
    const baseline = enemyFirstTarget()!.targetId // front-most = 'tank'
    expect(baseline).toBe('tank')
    expect(enemyFirstTarget(['tank'])!.targetId).toBe('squishy')
  })

  it('falls back to attacking someone when every ally is overlooked', () => {
    const t = enemyFirstTarget(['tank', 'squishy'])!.targetId
    expect(['tank', 'squishy']).toContain(t)
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
// Skill selection, HP-cost ultimates, cast tally (Layer 1 §2)
// ─────────────────────────────────────────────────────────────────────────────

describe('skill selection (strongest castable)', () => {
  const basic: SkillEffect = { id: 'basic', name: 'Attack', skillMult: 1, damageType: 'physical', element: null, target: 'single', spCost: 0 }
  const strike: SkillEffect = { id: 'strike', name: 'Strike', skillMult: 1.6, damageType: 'physical', element: null, target: 'single', spCost: 30 }
  const volley: SkillEffect = { id: 'volley', name: 'Volley', skillMult: 0.9, damageType: 'physical', element: null, target: 'all-enemies', spCost: 45 }
  const ult: SkillEffect = { id: 'ult', name: 'Ult', skillMult: 2.6, damageType: 'physical', element: null, target: 'single', spCost: 0, hpCost: 30 }
  const tank = (id: string) => enemy({ id, stats: { maxHP: 1e9, pDef: 0, spd: 1, pAtk: 0 } })
  const survive = (ticks: number) => mission([{ kind: 'survive', ticks }], ticks)
  const acts = (r: ReturnType<typeof runBattle>) =>
    (r.log.events.filter((e) => e.kind === 'act') as { skillId: string }[]).map((a) => a.skillId)

  it('a hero with the basic attack prepended still casts its authored skill (no longer basic-only)', () => {
    const r = runBattle(
      [hero({ id: 'h', skills: [basic, strike], sp: 100, stats: { spd: 1000, critPct: 0 } })],
      encounter([[tank('e')]], survive(5)),
      1,
    )
    expect(acts(r)[0]).toBe('strike')
  })

  it('scores an all-enemies skill by the damage it lands on every foe (AoE falloff counted)', () => {
    // Three fresh tanks: a 0.9 sweep lands 0.9 × 100/(100 + 2k) on each — 3 × 0.41 = 1.23,
    // short of a 1.6 single blow. Against three foes a swing would kill anyway, the sweep
    // takes all three and wins (overkill is wasted, so the strike scores one kill).
    const r = runBattle(
      [hero({ id: 'h', skills: [basic, strike, volley], sp: 100, stats: { spd: 1000, critPct: 0 } })],
      encounter([[tank('a'), tank('b'), tank('c')]], survive(5)),
      2,
    )
    expect(acts(r)[0]).toBe('strike')
    const frail = (id: string) => enemy({ id, stats: { maxHP: 1, pDef: 0, spd: 1, pAtk: 0 } })
    const swept = runBattle(
      [hero({ id: 'h', skills: [basic, strike, volley], sp: 100, stats: { spd: 1000, critPct: 0 } })],
      encounter([[frail('a'), frail('b'), frail('c')]], survive(5)),
      2,
    )
    expect(acts(swept)[0]).toBe('volley')
  })

  it('an HP-cost ultimate fires when affordable and drains its caster', () => {
    const r = runBattle(
      [hero({ id: 'h', skills: [basic, ult], hp: 100, stats: { maxHP: 100, spd: 1000, critPct: 0 } })],
      encounter([[tank('e')]], survive(3)),
      3,
    )
    expect(acts(r)[0]).toBe('ult')
    const cost = r.log.events.find((e) => e.kind === 'hp-cost') as { amount: number; hpAfter: number } | undefined
    expect(cost).toMatchObject({ amount: 30, hpAfter: 70 })
  })

  it('the ultimate gates itself off instead of killing its wielder', () => {
    const r = runBattle(
      [hero({ id: 'h', skills: [basic, ult], hp: 100, stats: { maxHP: 100, spd: 1000, critPct: 0 } })],
      encounter([[tank('e')]], survive(40)),
      4,
    )
    const costs = r.log.events.filter((e) => e.kind === 'hp-cost') as { hpAfter: number }[]
    // 100 → 70 → 40; a third cast would leave 10 HP, under the hpCostFloorPct (30%) floor.
    expect(costs.map((c) => c.hpAfter)).toEqual([70, 40])
    expect(costs.every((c) => c.hpAfter * 100 >= TUNING.combat.hpCostFloorPct * 100)).toBe(true)
    expect(acts(r).slice(2).every((id) => id === 'basic')).toBe(true)
    expect(r.survivorHeroIds).toContain('h')
  })

  it('an HP-cost skill is never chosen when current HP does not strictly exceed its cost', () => {
    const r = runBattle(
      [hero({ id: 'h', skills: [basic, ult], hp: 30, stats: { maxHP: 100, spd: 1000, critPct: 0 } })],
      encounter([[tank('e')]], survive(3)),
      5,
    )
    expect(acts(r)).not.toContain('ult')
  })

  it('tallies authored-skill casts per hero, excluding basic attacks and enemies', () => {
    const r = runBattle(
      [hero({ id: 'h', skills: [basic, strike], sp: 60, stats: { spd: 1000, critPct: 0 } })],
      encounter([[enemy({ id: 'e', skills: [strike], sp: 100, stats: { maxHP: 1e9, pDef: 0, spd: 50, pAtk: 0 } })]], survive(10)),
      6,
    )
    // 60 SP / 30 → two Strikes up front; the SP rhythm (lane F: SP back per action and per
    // wound) brings more later. The tally counts exactly the Strikes the hero cast — never
    // its basic attacks, never the enemy's casts.
    const strikes = r.log.events.filter((e) => e.kind === 'act' && e.actorId === 'h' && e.skillId === 'strike').length
    expect(strikes).toBeGreaterThanOrEqual(2)
    expect(r.log.events.some((e) => e.kind === 'act' && e.actorId === 'h' && e.skillId === 'basic')).toBe(true)
    expect(r.skillCasts).toEqual({ h: { strike: strikes } })
  })

  it('stays deterministic', () => {
    const run = () =>
      runBattle(
        [hero({ id: 'h', skills: [basic, strike, volley, ult], sp: 100, stats: { spd: 1000 } })],
        encounter([[tank('a'), tank('b')]], survive(20)),
        7,
      )
    expect(run().log).toEqual(run().log)
    expect(run().skillCasts).toEqual(run().skillCasts)
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
// Lane D (combat brain): blows land at TUNING.combat.damageScale (0.58), so Han needs four
// swings instead of three and the Goblin lives to answer twice (two 'act'+'hit' of its own).
const GOLDEN = {
  outcome: 'win' as const,
  eventCount: 15, // battle-start + 4 Han (act+hit) + 2 Goblin (act+hit) + death + end
  rngDraws: 12, // 6 hits × (crit roll + variance draw)
  ticksElapsed: 58, // the fight lasts twice as long: the point of damageScale
  wavesCleared: 1,
}

// ─────────────────────────────────────────────────────────────────────────────
// Conditional keywords (engravings / passives, Layer 1 completion)
// ─────────────────────────────────────────────────────────────────────────────

describe('conditional keywords', () => {
  /** One hero swing at a sturdy dummy; returns the first hit amount (or null on a guard). */
  function firstHit(heroKw: KeywordTag[], enemyKw: KeywordTag[] = [], extra: Partial<CombatUnit> = {}, heroOpts: Partial<UnitOpts> = {}) {
    const h = hero({ id: 'h1', stats: { spd: 200, pAtk: 100 }, keywords: heroKw, ...heroOpts })
    const e = { ...enemy({ id: 'e1', stats: { maxHP: 100000, spd: 1 }, keywords: enemyKw }), ...extra }
    const res = runBattle([h], encounter([[e]], mission(annihilate, 40)), 5)
    const ev = res.log.events.find((x) => (x.kind === 'hit' || x.kind === 'guard') && x.actorId === 'h1')!
    return { ev, res }
  }
  const baseline = () => (firstHit([]).ev as { amount: number }).amount

  it('immune zeroes damage of its type; vulnerable multiplies its element', () => {
    expect((firstHit([], [{ kind: 'immune', damageType: 'physical' }]).ev as { amount: number }).amount).toBe(0)
    const vuln = firstHit([], [{ kind: 'vulnerable', element: 'physical' }]).ev as { amount: number }
    // (Both blows are rounded once, so the scaled baseline may differ by a point.)
    expect(Math.abs(vuln.amount - baseline() * TUNING.combat.vulnerableMult)).toBeLessThanOrEqual(1)
  })

  it('opener boosts only the first action', () => {
    const { res } = firstHit([{ kind: 'opener', multiplier: 2 }])
    const hits = res.log.events.filter((x) => x.kind === 'hit' && x.actorId === 'h1') as { amount: number }[]
    expect(hits[0]!.amount).toBeGreaterThan(hits[1]!.amount * 1.7)
  })

  it('bane multiplies damage against its family only', () => {
    const dragon = firstHit([{ kind: 'bane', family: 'dragon', multiplier: 1.5 }], [], { family: 'dragon' }).ev as { amount: number }
    const beast = firstHit([{ kind: 'bane', family: 'dragon', multiplier: 1.5 }], [], { family: 'beast' }).ev as { amount: number }
    expect(beast.amount).toBe(baseline())
    expect(dragon.amount).toBeGreaterThan(beast.amount * 1.4)
  })

  it('guard reduces incoming damage; a ranged-only guard ignores melee', () => {
    const guarded = firstHit([], [{ kind: 'guard', reduction: 0.5 }]).ev as { amount: number }
    expect(guarded.amount).toBeLessThan(baseline() * 0.55)
    const melee = firstHit([], [{ kind: 'guard', reduction: 0.5, vs: 'ranged' }]).ev as { amount: number }
    expect(melee.amount).toBe(baseline())
    const archer = firstHit([], [{ kind: 'guard', reduction: 0.5, vs: 'ranged' }], {}, { unitClass: 'archer' }).ev as { amount: number }
    expect(archer.amount).toBeLessThan(baseline() * 0.55)
  })

  it('aegis negates the first hits with a guard event and no HP loss', () => {
    const { res } = firstHit([], [{ kind: 'aegis', charges: 2 }])
    const onEnemy = res.log.events.filter((x) => (x.kind === 'hit' || x.kind === 'guard') && x.actorId === 'h1')
    expect(onEnemy[0]!.kind).toBe('guard')
    expect(onEnemy[1]!.kind).toBe('guard')
    expect(onEnemy[2]!.kind).toBe('hit')
  })

  it('lifesteal heals the attacker (never above max HP)', () => {
    const h = hero({ id: 'h1', stats: { spd: 200, pAtk: 100, maxHP: 1000 }, hp: 500, keywords: [{ kind: 'lifesteal', fraction: 0.5 }] })
    const e = enemy({ id: 'e1', stats: { maxHP: 100000, spd: 1 } })
    const res = runBattle([h], encounter([[e]], mission(annihilate, 40)), 5)
    const heals = res.log.events.filter((x) => x.kind === 'heal') as { amount: number; hpAfter: number }[]
    expect(heals.length).toBeGreaterThan(0)
    for (const x of heals) expect(x.hpAfter).toBeLessThanOrEqual(1000)
  })

  it('frenzy boosts damage only below its HP threshold', () => {
    const kw: KeywordTag[] = [{ kind: 'frenzy', belowHpPct: 50, multiplier: 2 }]
    const high = firstHit(kw).ev as { amount: number }
    const low = firstHit(kw, [], {}, { hp: 10 }).ev as { amount: number }
    expect(high.amount).toBe(baseline())
    expect(low.amount).toBeGreaterThan(high.amount * 1.8)
  })

  it('no keyword draws RNG — rngDraws match an unkeyed replay', () => {
    const plain = firstHit([]).res.log.rngDraws
    const keyed = firstHit(
      [{ kind: 'opener', multiplier: 2 }, { kind: 'lifesteal', fraction: 0.2 }],
      [{ kind: 'guard', reduction: 0.2 }, { kind: 'aegis', charges: 1 }],
    ).res.log.rngDraws
    expect(keyed).toBe(plain)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Reach / Acquire objectives (Layer 2 full climb)
// ─────────────────────────────────────────────────────────────────────────────

describe('reach and acquire objectives', () => {
  it('reach: every hero action is a step; covering the distance wins without a kill', () => {
    const h = hero({ id: 'h1', stats: { spd: 200, pAtk: 1 } })
    const e = enemy({ id: 'e1', stats: { maxHP: 100000, spd: 10, pAtk: 1 } })
    const res = runBattle([h], encounter([[e]], mission([{ kind: 'reach', distance: 5 }])), 3)
    expect(res.outcome).toBe('win')
    expect(res.reachProgress).toBe(5)
    expect(res.defeatedTargetTags).toEqual([])
  })

  it('reach keeps counting once every enemy is down', () => {
    const h = hero({ id: 'h1', stats: { spd: 200, pAtk: 500 } })
    const e = enemy({ id: 'e1', stats: { maxHP: 10, spd: 1 } })
    const res = runBattle([h], encounter([[e]], mission([{ kind: 'reach', distance: 6 }])), 3)
    expect(res.outcome).toBe('win')
    expect(res.reachProgress).toBe(6)
  })

  it('acquire: the carrier falling wins at once, even with others standing', () => {
    const h = hero({ id: 'h1', stats: { spd: 200, pAtk: 500 } })
    const carrier = enemy({ id: 'e1', stats: { maxHP: 10, spd: 1 }, targetTag: 'jewel' })
    const guard = enemy({ id: 'e2', stats: { maxHP: 100000, spd: 1 } })
    const res = runBattle([h], encounter([[carrier, guard]], mission([{ kind: 'acquire', targetTag: 'jewel' }])), 3)
    expect(res.outcome).toBe('win')
    expect(res.defeatedTargetTags).toEqual(['jewel'])
  })

  it('reports each NPC ally’s final HP percentage', () => {
    const h = hero({ id: 'h1', stats: { spd: 200, pAtk: 500 } })
    const npc = { ...hero({ id: 'n1', stats: { maxHP: 200 } }), isNpc: true, targetTag: 'vip', sourceHeroId: undefined }
    const e = enemy({ id: 'e1', stats: { maxHP: 10, spd: 1 } })
    const res = runBattle([h], encounter([[e]], mission(annihilate), { allies: [npc] }), 3)
    expect(res.allyHpPct).toEqual({ vip: 100 })
  })
})
