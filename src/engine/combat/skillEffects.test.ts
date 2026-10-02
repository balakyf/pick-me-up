/**
 * Lane F · skills & roles: every effect kind (heal, regeneration, shield, buff, debuff,
 * DoT, stun, taunt, SP), multi-hit and the formation shapes, the statuses' clock, the SP
 * rhythm, the brain's support choices, the stalemate guard, determinism and RNG gating.
 */
import { describe, expect, it } from 'vitest'
import { runBattle } from './combat'
import { TUNING } from '../tuning'
import type { CombatEvent, CombatUnit, DerivedStats, Encounter, HeroId, Objective, ResolvedEffect, SkillEffect, SkillTarget } from '../types'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function stats(o: Partial<DerivedStats> = {}): DerivedStats {
  return { maxHP: 1000, pAtk: 100, mAtk: 100, pDef: 0, mDef: 0, spd: 50, critPct: 0, evaPct: 0, accPct: 100, statusRes: 0, ...o }
}

interface U {
  hp?: number
  sp?: number
  maxSP?: number
  cls?: CombatUnit['unitClass']
  line?: CombatUnit['line']
  skills?: SkillEffect[]
  keywords?: CombatUnit['keywords']
  isNpc?: boolean
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
    maxSP: o.maxSP ?? 100,
    currentHP: o.hp ?? st.maxHP,
    currentSP: o.sp ?? o.maxSP ?? 100,
    actionGauge: 0,
    alive: true,
    skills: o.skills ?? [],
    keywords: o.keywords ?? [],
    cp: 100,
    ...(side === 'hero' && !o.isNpc ? { sourceHeroId: id as unknown as HeroId } : {}),
    ...(o.isNpc ? { isNpc: true, targetTag: id } : {}),
  }
}
const hero = (id: string, s?: Partial<DerivedStats>, o?: U) => unit(id, 'hero', s, o)
const foe = (id: string, s?: Partial<DerivedStats>, o?: U) => unit(id, 'enemy', s, o)

function enc(waves: CombatUnit[][], objectives: Objective[] = [{ kind: 'annihilate' }], timer: number | null = null, extra: Partial<Encounter> = {}): Encounter {
  return { floor: 1, mission: { type: 'test', objectives, timer }, waves: waves.map((units) => ({ units })), encounterContext: 'tower', ...extra }
}
const survive = (ticks: number): Objective[] => [{ kind: 'survive', ticks }]

const basic: SkillEffect = { id: 'basic', name: 'Attack', skillMult: 1, damageType: 'physical', element: null, target: 'single', spCost: 0 }
function skill(id: string, target: SkillTarget, effects: ResolvedEffect[], extra: Partial<SkillEffect> = {}): SkillEffect {
  return { id, name: id, skillMult: 0, damageType: 'physical', element: null, target, spCost: 10, effects, ...extra }
}

type K = CombatEvent['kind']
const of = <T extends K>(evs: CombatEvent[], kind: T) => evs.filter((e): e is Extract<CombatEvent, { kind: T }> => e.kind === kind)
const actsOf = (evs: CombatEvent[], who: string) => of(evs, 'act').filter((e) => e.actorId === who).map((e) => e.skillId)

/** A sturdy dummy that never hurts anyone. */
const dummy = (id = 'dummy', s: Partial<DerivedStats> = {}) => foe(id, { maxHP: 1e7, pAtk: 0, mAtk: 0, spd: 1, ...s })
/** A first heal or shield at `tick`: weariness has shaved a little off it already. */
const worn = (v: number, tick: number) => Math.floor((v * (100 - Math.floor((tick * TUNING.roles.wearPctPer100Ticks) / 100))) / 100)

// ── Heal & regeneration ───────────────────────────────────────────────────────

describe('heal', () => {
  const aid = skill('aid', 'ally-lowest', [{ kind: 'heal', from: 'maxHP', pct: 30 }])

  it('heals the most wounded ally (the escort too) from the caster, capped at max HP', () => {
    const medic = hero('medic', { spd: 200 }, { skills: [basic, aid] })
    const hurt = hero('hurt', { spd: 1 }, { hp: 200 })
    const r = runBattle([medic, hurt], enc([[dummy()]], survive(30), 30), 1)
    const heals = of(r.log.events, 'heal').filter((e) => e.sourceId === 'medic')
    expect(heals.length).toBeGreaterThan(0)
    expect(heals[0]!.unitId).toBe('hurt')
    expect(heals[0]!.amount).toBe(worn(300, heals[0]!.tick)) // 30% of 1000, a little worn
    // The support cast stays in place: its 'act' names the caster.
    const act = of(r.log.events, 'act').find((e) => e.skillId === 'aid')!
    expect(act.targetId).toBe('medic')
    // Never past max HP: the last heal stops at the top.
    for (const h of heals) expect(h.hpAfter).toBeLessThanOrEqual(1000)
  })

  it('is not cast while everyone is healthy (overheal is waste)', () => {
    const medic = hero('medic', { spd: 200 }, { skills: [basic, aid] })
    const r = runBattle([medic, hero('fine', { spd: 1 })], enc([[dummy()]], survive(20), 20), 2)
    expect(actsOf(r.log.events, 'medic')).not.toContain('aid')
  })

  it('a heal from mAtk scales with the caster', () => {
    const prayer = skill('prayer', 'ally-lowest', [{ kind: 'heal', from: 'mAtk', pct: 50 }])
    const r = runBattle([hero('cleric', { spd: 200, mAtk: 400 }, { skills: [basic, prayer] }), hero('hurt', { spd: 1 }, { hp: 100 })], enc([[dummy()]], survive(10), 10), 3)
    const h = of(r.log.events, 'heal')[0]!
    expect(h.amount).toBe(worn(200, h.tick))
  })
})

describe('regeneration (a heal over time)', () => {
  it('puts a regen status that pulses heals and wears off', () => {
    const regen = skill('regen', 'ally-lowest', [{ kind: 'regen', from: 'maxHP', pct: 5, turns: 3 }])
    const r = runBattle([hero('druid', { spd: 100 }, { skills: [basic, regen], sp: 10, maxSP: 10 }), hero('hurt', { spd: 1 }, { hp: 100 })], enc([[dummy()]], survive(80), 80), 4)
    const st = of(r.log.events, 'status').find((e) => e.status === 'regen')!
    expect(st.unitId).toBe('hurt')
    expect(st.value).toBe(worn(50, st.tick))
    const evs = r.log.events
    const from = evs.indexOf(st)
    const end = evs.findIndex((e, i) => i > from && e.kind === 'status-end' && e.status === 'regen')
    expect(end).toBeGreaterThan(from)
    expect((evs[end] as Extract<CombatEvent, { kind: 'status-end' }>).reason).toBe('expired')
    // Three turns, three pulses, each the regeneration's own amount.
    const pulses = of(evs.slice(from, end), 'heal').filter((e) => e.status === 'regen')
    expect(pulses.length).toBe(3)
    expect(pulses.every((p) => p.amount === st.value && p.sourceId === 'druid')).toBe(true)
  })
})

// ── Shields ───────────────────────────────────────────────────────────────────

describe('shield', () => {
  const ward = skill('ward', 'self', [{ kind: 'shield', from: 'maxHP', pct: 20, turns: 12 }])

  it('soaks blows before HP, announces what it soaked, and breaks when spent', () => {
    // The knight shields itself on its first turn (it cannot afford a second for a while),
    // then a brute keeps hitting it.
    const knight = hero('knight', { spd: 100 }, { skills: [basic, { ...ward, spCost: 60 }], sp: 60, maxSP: 100 })
    const brute = foe('brute', { maxHP: 1e7, pAtk: 150, spd: 200 })
    const r = runBattle([knight], enc([[brute]], survive(60), 60), 5)
    const evs = r.log.events
    const st = of(evs, 'status').find((e) => e.status === 'shield')!
    expect(st.value).toBe(worn(200, st.tick))
    const from = evs.indexOf(st)
    const broke = evs.findIndex((e, i) => i > from && e.kind === 'status-end' && e.status === 'shield')
    expect(broke).toBeGreaterThan(from)
    expect((evs[broke] as Extract<CombatEvent, { kind: 'status-end' }>).reason).toBe('broken')
    const soaks = of(evs.slice(from, broke), 'shield')
    expect(soaks.length).toBeGreaterThan(0)
    expect(soaks.reduce((a, e) => a + e.absorbed, 0)).toBe(st.value)
    expect(soaks.at(-1)!.left).toBe(0)
    // A blow swallowed whole lands as no hit; one that breaks through hits for the rest.
    const firstSoak = evs.indexOf(soaks[0]!)
    const next = evs[firstSoak + 1]!
    if (soaks[0]!.left > 0) expect(next.kind).not.toBe('hit')
  })

  it('goes on the ally the foes are lined up on (ally-threatened)', () => {
    const barrier = skill('barrier', 'ally-threatened', [{ kind: 'shield', from: 'mAtk', pct: 100, turns: 3 }])
    const mage = hero('mage', { spd: 300 }, { skills: [basic, barrier], line: 'back', sp: 10, maxSP: 10 })
    const front = hero('front', { spd: 1, maxHP: 2000 })
    const r = runBattle([front, mage], enc([[foe('brute', { maxHP: 1e7, pAtk: 80, spd: 40 })]], survive(20), 20), 6)
    const st = of(r.log.events, 'status').find((e) => e.status === 'shield')!
    expect(st.unitId).toBe('front') // the front-most hero is the brute's mark
  })
})

// ── Buffs & debuffs ───────────────────────────────────────────────────────────

describe('buffs and debuffs', () => {
  it('an attack buff makes the next blows land harder, then wears off', () => {
    const cry = skill('cry', 'all-allies', [{ kind: 'buff', stat: 'atk', pct: 50, turns: 3 }])
    const h = hero('h', { spd: 100 }, { skills: [basic, cry], sp: 10, maxSP: 10 })
    const r = runBattle([h], enc([[dummy()]], survive(120), 120), 7)
    const buffAt = r.log.events.findIndex((e) => e.kind === 'status' && e.status === 'atk-up')
    expect(buffAt).toBeGreaterThan(-1)
    const bare = runBattle([hero('h', { spd: 100 }, { skills: [basic] })], enc([[dummy()]], survive(30), 30), 7)
    const plain = of(bare.log.events, 'hit')[0]!.amount
    const buffed = of(r.log.events.slice(buffAt), 'hit').find((e) => e.actorId === 'h')!.amount
    expect(buffed / plain).toBeGreaterThan(1.4)
    expect(of(r.log.events, 'status-end').some((e) => e.status === 'atk-up')).toBe(true)
  })

  it('never stacks a buff that is already up', () => {
    const cry = skill('cry', 'self', [{ kind: 'buff', stat: 'atk', pct: 60, turns: 6 }])
    // Six turns at spd 100 is 60 ticks: by tick 28 the buff has most of its clock left.
    const r = runBattle([hero('h', { spd: 100 }, { skills: [basic, cry] })], enc([[dummy()]], survive(28), 28), 8)
    const casts = actsOf(r.log.events, 'h').filter((x) => x === 'cry').length
    expect(casts).toBe(1)
  })

  it('a Mark (guard down) makes the marked foe take more, and goes on the toughest foe', () => {
    const mark = skill('mark', 'single', [{ kind: 'debuff', stat: 'guard', pct: 50, turns: 4 }], { skillMult: 0.1, spCost: 5 })
    const archer = hero('archer', { spd: 100 }, { skills: [basic, mark], cls: 'archer', sp: 5, maxSP: 5 })
    const boss = dummy('boss', { maxHP: 1e7 })
    const small = dummy('small', { maxHP: 1e6 })
    const r = runBattle([archer], enc([[small, boss]], survive(60), 60), 9)
    const st = of(r.log.events, 'status').find((e) => e.status === 'guard-down')!
    expect(st.unitId).toBe('boss')
  })

  it('a crit buff adds points to the crit roll (the draw count is unchanged)', () => {
    const steady = skill('steady', 'self', [{ kind: 'buff', stat: 'crit', pct: 100, turns: 10 }])
    const r = runBattle([hero('h', { spd: 100 }, { skills: [basic, steady], sp: 10, maxSP: 10 })], enc([[dummy()]], survive(60), 60), 10)
    const after = r.log.events.findIndex((e) => e.kind === 'status' && e.status === 'crit-up')
    const hits = of(r.log.events.slice(after), 'hit')
    expect(hits.length).toBeGreaterThan(1)
    expect(hits.every((e) => e.crit)).toBe(true)
    expect(r.log.rngDraws).toBe(of(r.log.events, 'hit').length * 2)
  })
})

// ── DoTs, stuns, taunts, SP ──────────────────────────────────────────────────

describe('damage over time', () => {
  const venom = skill('venom', 'single', [{ kind: 'dot', dot: 'poison', from: 'maxHP', pct: 10, turns: 3 }], { skillMult: 0.1, spCost: 5 })

  it('pulses its damage each turn and can kill (the mission is checked then)', () => {
    const r = runBattle([hero('h', { spd: 100, pAtk: 1 }, { skills: [basic, venom], sp: 5, maxSP: 5 })], enc([[foe('rat', { maxHP: 250, pAtk: 0, spd: 1 })]]), 11)
    const dots = of(r.log.events, 'dot')
    expect(dots.length).toBeGreaterThanOrEqual(1)
    expect(dots[0]!.amount).toBe(25)
    expect(dots[0]!.status).toBe('poison')
    expect(r.outcome).toBe('win')
  })

  it('pulses exactly its turns, however the ticks divide (a quick caster’s 3-turn poison is 3 pulses)', () => {
    const sting = skill('sting', 'single', [{ kind: 'dot', dot: 'poison', from: 'maxHP', pct: 1, turns: 3 }], { skillMult: 0.01, spCost: 100 })
    const r = runBattle([hero('h', { spd: 600, pAtk: 1 }, { skills: [basic, sting], sp: 100, maxSP: 100 })], enc([[dummy()]], survive(30), 30), 11)
    const put = of(r.log.events, 'status').filter((e) => e.status === 'poison')
    expect(put).toHaveLength(1)
    expect(put[0]!.ticks % 3).not.toBe(0) // the clock does not divide by the turns…
    expect(of(r.log.events, 'dot')).toHaveLength(3) // …and still three pulses
  })

  it("a frenzy's own bleed never kills its bearer (only a foe does)", () => {
    const frenzy = skill('frenzy', 'single', [{ kind: 'dot', dot: 'bleed', from: 'maxHP', pct: 60, turns: 3, to: 'self' }], { skillMult: 50, spCost: 10 })
    const r = runBattle([hero('h', { spd: 100 }, { skills: [basic, frenzy], sp: 10, maxSP: 10 })], enc([[dummy()]], survive(30), 30), 19)
    const dots = of(r.log.events, 'dot').filter((e) => e.unitId === 'h')
    expect(dots.length).toBeGreaterThanOrEqual(2)
    expect(dots.every((e) => e.hpAfter >= 1)).toBe(true)
    expect(r.outcome).toBe('win')
    expect(r.fallenHeroIds).toEqual([])
  })

  it('an element DoT picks its kind by element; an immune foe shrugs it off', () => {
    const scorch = skill('scorch', 'single', [{ kind: 'dot', dot: 'element', from: 'atk', pct: 60, turns: 2 }], { skillMult: 0.5, element: 'fire', spCost: 5 })
    const r = runBattle([hero('h', { spd: 100 }, { skills: [basic, scorch] })], enc([[dummy()]], survive(30), 30), 12)
    expect(of(r.log.events, 'status').find((e) => e.status === 'burn')).toBeDefined()
    const immune = dummy('ghost')
    immune.keywords = [{ kind: 'immune', damageType: 'physical' }]
    const r2 = runBattle([hero('h', { spd: 100 }, { skills: [basic, scorch] })], enc([[immune]], survive(30), 30), 12)
    expect(of(r2.log.events, 'status').some((e) => e.status === 'burn')).toBe(false)
  })

  it('a shield soaks a DoT pulse before the HP does', () => {
    const ward = skill('ward', 'self', [{ kind: 'shield', from: 'maxHP', pct: 50, turns: 20 }])
    const shaman = foe('shaman', { maxHP: 1e7, pAtk: 1, spd: 300 }, { skills: [basic, skill('spit', 'single', [{ kind: 'dot', dot: 'poison', from: 'maxHP', pct: 5, turns: 4 }], { skillMult: 0.01, spCost: 1 })] })
    const r = runBattle([hero('h', { spd: 400 }, { skills: [ward], sp: 10, maxSP: 10 })], enc([[shaman]], survive(40), 40), 13)
    const evs = r.log.events
    const dotAt = evs.findIndex((e) => e.kind === 'status' && e.status === 'poison')
    expect(dotAt).toBeGreaterThan(-1)
    expect(of(evs.slice(dotAt), 'shield').length).toBeGreaterThan(0)
  })
})

describe('stun', () => {
  it('pushes the target’s action gauge back: it acts later, dazed until its turn', () => {
    const bash = skill('bash', 'single', [{ kind: 'stun', push: 90 }], { skillMult: 0.1, spCost: 0 })
    const mk = (skills: SkillEffect[]) => runBattle([hero('h', { spd: 100 }, { skills })], enc([[foe('ogre', { maxHP: 1e7, pAtk: 1, spd: 90 })]], survive(40), 40), 14)
    const plain = mk([basic])
    const stunned = mk([bash])
    const firstOgre = (r: ReturnType<typeof runBattle>) => r.log.events.find((e) => e.kind === 'act' && e.actorId === 'ogre')!.tick
    expect(firstOgre(stunned)).toBeGreaterThan(firstOgre(plain))
    const st = of(stunned.log.events, 'status').find((e) => e.status === 'stun')!
    expect(st.ticks).toBe(0) // until it acts
    const end = of(stunned.log.events, 'status-end').find((e) => e.status === 'stun')!
    expect(end.reason).toBe('acted')
    // The status ends as the ogre's turn comes round, right before its act.
    const endAt = stunned.log.events.indexOf(end)
    expect(stunned.log.events[endAt + 1]).toMatchObject({ kind: 'act', actorId: 'ogre' })
  })

  it('no stun-lock: a dazed foe is not stunned again', () => {
    const bash = skill('bash', 'single', [{ kind: 'stun', push: 90 }], { skillMult: 0.1, spCost: 0 })
    const r = runBattle([hero('a', { spd: 500 }, { skills: [bash] }), hero('b', { spd: 500 }, { skills: [bash] })], enc([[foe('ogre', { maxHP: 1e7, pAtk: 1, spd: 50 })]], survive(30), 30), 15)
    const evs = r.log.events
    let dazed = false
    for (const e of evs) {
      if (e.kind === 'status' && e.status === 'stun') {
        expect(dazed).toBe(false)
        dazed = true
      }
      if (e.kind === 'status-end' && e.status === 'stun') dazed = false
    }
  })
})

describe('taunt', () => {
  const shieldUp = skill('shield_up', 'self', [
    { kind: 'taunt', turns: 6 },
    { kind: 'buff', stat: 'guard', pct: 30, turns: 6 },
  ])

  it('foes must strike the taunter (over their class rule)', () => {
    const tank = hero('tank', { spd: 100, maxHP: 3000 }, { skills: [basic, shieldUp], sp: 10, maxSP: 10 })
    const squishy = hero('squishy', { spd: 1, maxHP: 300 }, { line: 'back' })
    // An assassin strikes the lowest HP foe — the squishy mage — until the tank taunts.
    const assassin = foe('assassin', { maxHP: 1e7, pAtk: 400, spd: 60 }, { cls: 'archer' })
    const r = runBattle([tank, squishy], enc([[assassin]], survive(40), 40), 16)
    const evs = r.log.events
    const tauntAt = evs.findIndex((e) => e.kind === 'status' && e.status === 'taunt')
    expect(tauntAt).toBeGreaterThan(-1)
    const endAt = evs.findIndex((e, i) => i > tauntAt && e.kind === 'status-end' && e.status === 'taunt')
    const during = evs.slice(tauntAt, endAt === -1 ? undefined : endAt).filter((e) => e.kind === 'act' && e.actorId === 'assassin') as Extract<CombatEvent, { kind: 'act' }>[]
    expect(during.length).toBeGreaterThan(0)
    expect(during.every((e) => e.targetId === 'tank')).toBe(true)
  })

  it('the brain taunts when a squishier friend is the one being hit — not when it is itself the mark', () => {
    const alone = runBattle([hero('tank', { spd: 300, maxHP: 3000 }, { skills: [basic, shieldUp] })], enc([[foe('brute', { maxHP: 1e7, pAtk: 30, spd: 60 })]], survive(30), 30), 17)
    expect(actsOf(alone.log.events, 'tank')).not.toContain('shield_up')
  })

  it('a dearer blow out of reach never swallows the taunt (saving up replaces only a blow that does nothing)', () => {
    const big: SkillEffect = { ...basic, id: 'big', name: 'big', skillMult: 2, spCost: 90 }
    const tank = hero('tank', { spd: 100, maxHP: 3000 }, { skills: [basic, shieldUp, big], sp: 20, maxSP: 100 })
    const squishy = hero('squishy', { spd: 1, maxHP: 300 }, { line: 'back' })
    const assassin = foe('assassin', { maxHP: 1e7, pAtk: 400, spd: 60 }, { cls: 'archer' })
    const r = runBattle([tank, squishy], enc([[assassin]], survive(40), 40), 16)
    expect(actsOf(r.log.events, 'tank')).toContain('shield_up')
  })

  it("the Master's focus still beats a foe's taunt", () => {
    const knight = foe('knight', { maxHP: 1e7, pAtk: 1, spd: 500 }, { skills: [basic, shieldUp] })
    const priest = dummy('priest', { maxHP: 1e6 })
    const r = runBattle([hero('h', { spd: 100 })], enc([[knight, priest]], survive(40), 40, { focus: { focusEnemyId: 'priest' } }), 18)
    const mine = of(r.log.events, 'act').filter((e) => e.actorId === 'h')
    expect(of(r.log.events, 'status').some((e) => e.status === 'taunt' && e.unitId === 'knight')).toBe(true)
    expect(mine.every((e) => e.targetId === 'priest')).toBe(true)
  })
})

describe('SP restore and drain', () => {
  it('drains a foe’s SP (logged) and gives an ally SP', () => {
    const siphon = skill('siphon', 'single', [{ kind: 'sp', amount: -30 }], { skillMult: 0.1, spCost: 1 })
    const caster = foe('caster', { maxHP: 1e7, spd: 1 }, { skills: [basic, skill('nuke', 'single', [], { skillMult: 2, spCost: 50 })] })
    const r = runBattle([hero('h', { spd: 300 }, { skills: [siphon] })], enc([[caster]], survive(10), 10), 19)
    const sp = of(r.log.events, 'sp')
    expect(sp.length).toBeGreaterThan(0)
    expect(sp[0]).toMatchObject({ unitId: 'caster', amount: -30, spAfter: 70, sourceId: 'h' })
  })
})

// ── Multi-hit and formation shapes ───────────────────────────────────────────

describe('multi-hit and shapes', () => {
  it('a flurry strikes three times, each hit its own event and its own rolls', () => {
    const flurry: SkillEffect = { ...basic, id: 'flurry', name: 'Flurry', skillMult: 0.45, hits: 3, spCost: 10 }
    const r = runBattle([hero('t', { spd: 100 }, { skills: [basic, flurry], sp: 10, maxSP: 10 })], enc([[dummy()]], survive(25), 25), 20)
    const act = r.log.events.findIndex((e) => e.kind === 'act' && e.skillId === 'flurry')
    const hits = r.log.events.slice(act + 1, act + 4)
    expect(hits.map((e) => e.kind)).toEqual(['hit', 'hit', 'hit'])
    expect(r.log.rngDraws).toBe(of(r.log.events, 'hit').length * 2)
  })

  it('a cleave strikes its target and the neighbour for half', () => {
    const thrust: SkillEffect = { ...basic, id: 'thrust', name: 'Thrust', skillMult: 1, target: 'cleave', spCost: 1 }
    const r = runBattle([hero('s', { spd: 100 }, { skills: [thrust] })], enc([[dummy('a'), dummy('b'), dummy('c')]], survive(25), 25), 21)
    const act = r.log.events.findIndex((e) => e.kind === 'act')
    const [h1, h2] = r.log.events.slice(act + 1, act + 3) as Extract<CombatEvent, { kind: 'hit' }>[]
    expect(h1!.targetId).toBe('a')
    expect(h2!.targetId).toBe('b')
    expect(Math.abs(h2!.amount - h1!.amount / 2)).toBeLessThanOrEqual(h1!.amount * 0.06 + 1)
  })

  it('a front-row blow strikes only the front-most line', () => {
    const sweep: SkillEffect = { ...basic, id: 'sweep', name: 'Sweep', target: 'front-row', spCost: 1 }
    const back = dummy('back')
    back.line = 'back'
    const r = runBattle([hero('s', { spd: 100 }, { skills: [sweep] })], enc([[dummy('f1'), dummy('f2'), back]], survive(25), 25), 22)
    const struck = new Set(of(r.log.events, 'hit').map((e) => e.targetId))
    expect([...struck].sort()).toEqual(['f1', 'f2'])
  })
})

// ── The statuses' clock, the SP rhythm, gating, determinism ──────────────────

describe('the clock, the rhythm, the gates', () => {
  it('heal fatigue and weariness: each heal a unit takes closes less, and long fights wear every heal down', () => {
    const aid = skill('aid', 'ally-lowest', [{ kind: 'heal', from: 'maxHP', pct: 30 }], { spCost: 0 })
    const r = runBattle([hero('medic', { spd: 200 }, { skills: [aid] }), hero('hurt', { spd: 1, maxHP: 100000 }, { hp: 1000 })], enc([[dummy()]], survive(60), 60), 42)
    const heals = of(r.log.events, 'heal').filter((e) => e.unitId === 'hurt')
    expect(heals.length).toBeGreaterThan(3)
    // 30% of 100 000 = 30 000, less 25% per heal already taken and the fight's weariness.
    heals.slice(0, 4).forEach((h, i) => {
      const pct = Math.max(TUNING.roles.healFatigueFloorPct, 100 - TUNING.roles.healFatiguePct * i - Math.floor((h.tick * TUNING.roles.wearPctPer100Ticks) / 100))
      expect(h.amount).toBe(Math.floor((30000 * pct) / 100))
    })
  })

  it('statuses last the caster’s own turns, in ticks (a slow caster’s status lasts longer)', () => {
    const cry = skill('cry', 'self', [{ kind: 'buff', stat: 'def', pct: 20, turns: 2 }])
    const at = (spd: number) => of(runBattle([hero('h', { spd }, { skills: [cry] })], enc([[dummy()]], survive(30), 30), 23).log.events, 'status')[0]!.ticks
    expect(at(50)).toBe(Math.ceil((2 * TUNING.combat.actionGaugeMax) / 50))
    expect(at(100)).toBe(Math.ceil((2 * TUNING.combat.actionGaugeMax) / 100))
  })

  it('every action feeds the SP pool (spAfter on the act shows it)', () => {
    const r = runBattle([hero('h', { spd: 100 }, { sp: 0, maxSP: 100 })], enc([[dummy()]], survive(40), 40), 24)
    const sp = of(r.log.events, 'act').filter((e) => e.actorId === 'h').map((e) => e.spAfter!)
    expect(sp[1]! - sp[0]!).toBe(TUNING.roles.spPerAction)
  })

  it('taking damage feeds the SP pool too', () => {
    const r = runBattle([hero('h', { spd: 10, maxHP: 1000 }, { sp: 0, maxSP: 100 })], enc([[foe('brute', { maxHP: 1e7, pAtk: 30, spd: 200 })]], survive(150), 150), 25)
    const first = of(r.log.events, 'act').find((e) => e.actorId === 'h')!
    expect(first.spAfter!).toBeGreaterThan(0)
  })

  it('a chance-based status rolls only when 0 < chance < 100 (a sure one draws nothing)', () => {
    const sure = skill('sure', 'single', [{ kind: 'debuff', stat: 'atk', pct: 10, turns: 2 }], { skillMult: 0.1, spCost: 0 })
    const maybe = skill('maybe', 'single', [{ kind: 'debuff', stat: 'atk', pct: 10, turns: 2, chance: 50 }], { skillMult: 0.1, spCost: 0 })
    const run = (s: SkillEffect) => runBattle([hero('h', { spd: 100 }, { skills: [s] })], enc([[dummy()]], survive(25), 25), 26)
    const a = run(sure)
    expect(a.log.rngDraws).toBe(of(a.log.events, 'hit').length * 2)
    const b = run(maybe)
    expect(b.log.rngDraws).toBe(of(b.log.events, 'hit').length * 3)
  })

  it('statusRes shaves a foe’s chance (a 100% stun on a resolute foe is a roll)', () => {
    const bash = skill('bash', 'single', [{ kind: 'stun', push: 50 }], { skillMult: 0.1, spCost: 0 })
    const r = runBattle([hero('h', { spd: 100 }, { skills: [bash] })], enc([[dummy('rock', { statusRes: 80 })]], survive(25), 25), 27)
    expect(r.log.rngDraws).toBeGreaterThan(of(r.log.events, 'hit').length * 2)
  })

  it('is deterministic: the same seed gives the same log, statuses and all', () => {
    const kit = [
      basic,
      skill('aid', 'ally-lowest', [{ kind: 'heal', from: 'maxHP', pct: 20 }]),
      skill('venom', 'single', [{ kind: 'dot', dot: 'poison', from: 'atk', pct: 30, turns: 3, chance: 50 }], { skillMult: 0.5 }),
      { ...basic, id: 'flurry', name: 'Flurry', skillMult: 0.45, hits: 3, spCost: 15 },
    ]
    const run = () =>
      runBattle(
        [hero('a', { spd: 90 }, { skills: kit }), hero('b', { spd: 70, maxHP: 600 }, { skills: kit })],
        enc([[foe('x', { maxHP: 3000, pAtk: 90, spd: 60 }), foe('y', { maxHP: 2000, pAtk: 70, spd: 80 }, { cls: 'archer' })]]),
        31337,
      )
    expect(JSON.stringify(run().log)).toBe(JSON.stringify(run().log))
  })
})

// ── Stalemate ─────────────────────────────────────────────────────────────────

describe('stalemate', () => {
  it('heals that out-pace every blow do not hold a fight to the clock: the party falls back', () => {
    // A priest heals its knight faster than the lone hero can hurt it.
    const grace = skill('grace', 'ally-lowest', [{ kind: 'heal', from: 'mAtk', pct: 100 }], { spCost: 0 })
    const priest = foe('priest', { maxHP: 1e6, mAtk: 500, spd: 200, pAtk: 0 }, { skills: [basic, grace], line: 'back' })
    const knight = foe('knight', { maxHP: 5000, pAtk: 1, spd: 50 })
    const r = runBattle([hero('h', { spd: 100, pAtk: 100 })], enc([[knight, priest]]), 40)
    expect(r.outcome).toBe('retreat')
    expect(r.log.events.some((e) => e.kind === 'mission' && e.code === 'futile')).toBe(true)
    expect(r.ticksElapsed).toBeLessThan(TUNING.combat.maxTicks)
  })

  it('never in a fight with its own clock (a raid or the guild boss: every chip until the timer counts)', () => {
    const grace = skill('grace', 'ally-lowest', [{ kind: 'heal', from: 'mAtk', pct: 100 }], { spCost: 0 })
    const priest = foe('priest', { maxHP: 1e6, mAtk: 500, spd: 200, pAtk: 0 }, { skills: [basic, grace], line: 'back' })
    const knight = foe('knight', { maxHP: 5000, pAtk: 1, spd: 50 })
    const r = runBattle([hero('h', { spd: 100, pAtk: 100 })], enc([[knight, priest]], [{ kind: 'annihilate' }], 400), 40)
    expect(r.outcome).toBe('timeout')
    expect(r.log.events.some((e) => e.kind === 'mission' && e.code === 'futile')).toBe(false)
  })

  it('never on a Survival (waiting wins it)', () => {
    const grace = skill('grace', 'ally-lowest', [{ kind: 'heal', from: 'mAtk', pct: 100 }], { spCost: 0 })
    const priest = foe('priest', { maxHP: 1e6, mAtk: 500, spd: 200, pAtk: 0 }, { skills: [basic, grace] })
    const r = runBattle([hero('h', { spd: 100, maxHP: 1e6 })], enc([[foe('knight', { maxHP: 5000, pAtk: 1, spd: 50 }), priest]], survive(300), 300), 41)
    expect(r.outcome).toBe('win')
  })
})
