/**
 * WP5 — Legacy of the fallen (spec 2026-10-12 S21 Echo bequest, S22 Nemesis records,
 * S23 New Arrivals and the Memorial's plaques).
 */
import { describe, it, expect } from 'vitest'
import { createAccount } from '../account'
import { ANCHORS, ENEMY_TEMPLATES, SKILLS } from '../content'
import { lifeReact, newHeroLife } from '../life'
import { reduce } from '../store'
import { TUNING } from '../tuning'
import { buildCombatUnit } from '../unit'
import type { CombatEvent, CombatUnitInit, FloorResult, GameState, HeroId, Nemesis, OwnedHero, PendingEcho, Seed } from '../types'
import {
  bequeathEcho,
  bestEchoStat,
  claimRecruit,
  claimRecruitWithHero,
  counterElement,
  echoPct,
  earnsPlaque,
  echoSkills,
  heirOptions,
  isRevengeFloor,
  killerOf,
  killingBlow,
  legacyExtraPct,
  legacyPct,
  plaqueCount,
  plaquePct,
  revengeFloorFor,
  revenantName,
  signatureSkillId,
} from '.'

const LG = TUNING.legacy

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o)
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v)
  }
  return o
}

/** An account with `n` extra Normal pulls (n + 1 heroes), at world-time 0. */
function roster(seed: number, n = 9): GameState {
  let s: GameState = { ...createAccount(seed), gold: TUNING.gacha.normalCostGold * n }
  for (let i = 0; i < n; i++) s = reduce(s, { type: 'SUMMON' })
  return s
}
const living = (s: GameState): OwnedHero[] => Object.values(s.heroes).filter((h) => h.alive)
const key = (a: string, b: string) => [a, b].sort().join('|')

function withRelations(s: GameState, rel: Record<string, number>): GameState {
  const relations = { ...s.life.relations }
  for (const [k, affinity] of Object.entries(rel)) relations[k] = { affinity, shared: 1 }
  return { ...s, life: { ...s.life, relations } }
}

function atFloor(s: GameState, floor: number): GameState {
  return { ...s, tower: { ...s.tower, currentFloor: floor, highestCleared: floor - 1 } }
}

interface Death {
  id: HeroId
  /** Enemy template id of the killer. */
  by: string
  level?: number
  /** Override the killer's unit instance (two deaths to one unit). */
  unit?: string
}

/**
 * A tower attempt in which each `deaths[i].id` is struck down by `deaths[i].by`: the
 * after-state (heroes dead) and a FloorResult whose log names the killers.
 */
function battle(before: GameState, deaths: Death[], opts: { cleared?: boolean; nemesisDefeated?: string[] } = {}) {
  const floor = before.tower.currentFloor
  const heroes = { ...before.heroes }
  for (const d of deaths) heroes[d.id] = { ...heroes[d.id]!, alive: false }
  const after: GameState = { ...before, heroes }
  const unitsInit: CombatUnitInit[] = []
  const events: CombatEvent[] = []
  let seq = 0
  deaths.forEach((d, i) => {
    const tpl = ENEMY_TEMPLATES[d.by]!
    const uid = d.unit ?? `e${floor}_w0_${i}`
    if (!unitsInit.some((u) => u.id === uid)) {
      unitsInit.push({ id: uid, name: tpl.name, side: 'enemy', line: 'front', unitClass: null, element: tpl.element, level: d.level ?? floor, maxHP: 100, maxSP: 0, cp: 100 })
    }
    events.push({ seq: seq++, tick: i + 1, kind: 'hit', actorId: uid, targetId: d.id, amount: 999, crit: false, hpAfter: 0 })
    events.push({ seq: seq++, tick: i + 1, kind: 'death', unitId: d.id })
  })
  const fallen = deaths.map((d) => d.id)
  const survivors = before.party.slots.filter((id): id is HeroId => !!id && !fallen.includes(id) && !!before.heroes[id]?.alive)
  const cleared = opts.cleared ?? false
  const result: FloorResult = {
    floor,
    cleared,
    firstClear: cleared,
    goldAwarded: 0,
    xpAwarded: 0,
    materialsAwarded: {} as FloorResult['materialsAwarded'],
    fallenHeroIds: fallen,
    skillProgress: [],
    hiddenFound: [],
    event: null,
    loopRollback: false,
    worldEnded: false,
    refusedHeroIds: [],
    worldSaved: false,
    ...(opts.nemesisDefeated ? { nemesisDefeated: opts.nemesisDefeated } : {}),
    result: {
      outcome: cleared ? 'win' : 'wipe',
      ticksElapsed: deaths.length + 1,
      wavesCleared: cleared ? 1 : 0,
      defeatedTargetTags: [],
      reachProgress: 0,
      allyHpPct: {},
      survivorHeroIds: survivors,
      fallenHeroIds: fallen,
      skillCasts: {},
      log: { seed: 0, floor, encounterContext: 'tower', unitsInit, events, outcome: cleared ? 'win' : 'wipe', rngDraws: 0 },
    },
  }
  return { after, result }
}

/** Run a scripted battle through lifeReact, as the reducer does. */
function fight(before: GameState, deaths: Death[], opts?: { cleared?: boolean; nemesisDefeated?: string[] }): GameState {
  const { after, result } = battle(before, deaths, opts)
  return lifeReact(before, after, { type: 'ATTEMPT_FLOOR' }, 0, result)
}

/** A 10-hero roster at floor 12 with the first five in the party. */
function party(seed: number): GameState {
  let s = roster(seed)
  const ids = living(s).map((h) => h.id).slice(0, 5)
  s = reduce(s, { type: 'SET_PARTY', slots: ids, lines: ['front', 'front', 'mid', 'back', 'back'] })
  return atFloor(s, 12)
}

// ─────────────────────────────────────────────────────────────────────────────
// S21 — Echo bequest
// ─────────────────────────────────────────────────────────────────────────────

describe('a death leaves an Echo', () => {
  it('creates exactly one pending echo, with heirs sorted by affinity (closest first)', () => {
    const s0 = party(101)
    const [a, b, c, d] = living(s0)
    const s = withRelations(s0, { [key(a!.id, b!.id)]: 20, [key(a!.id, c!.id)]: 70, [key(a!.id, d!.id)]: 45 })
    const after = fight(s, [{ id: a!.id, by: 'skeleton' }])
    expect(after.life.legacy.pending).toHaveLength(1)
    const p = after.life.legacy.pending[0]!
    expect(p.fallenId).toBe(a!.id)
    expect(p.fallenName).toBe(a!.name)
    expect(p.floor).toBe(12)
    expect(p.pct).toBe(LG.echoPct)
    expect(p.stat).toBe(bestEchoStat(a!))
    expect(p.candidates).toEqual([c!.id, d!.id, b!.id])
    expect(p.candidates).toHaveLength(LG.heirCandidates)
  })

  it('among heroes equally close, suggests the ones who stood in the party first', async () => {
    // Playtest 2026-10-13: a 3-hero party lost two; the survivor who fought beside them
    // was not offered, three higher-level bench heroes were.
    const { rankHeirs } = await import('.')
    const s0 = roster(105)
    const all = living(s0)
    const fallen = all[0]!
    // The party: the fallen and the hero the old order ranked LAST (lowest level, then the
    // highest id); everyone else waits on the bench.
    const before = rankHeirs(s0, fallen.id)
    const comrade = s0.heroes[before[before.length - 1]!]!
    expect(before[0]).not.toBe(comrade.id)
    const s = reduce(s0, { type: 'SET_PARTY', slots: [fallen.id, comrade.id, null, null, null], lines: ['front', 'front', 'mid', 'back', 'back'] })
    expect(rankHeirs(s, fallen.id)[0]).toBe(comrade.id)
  })

  it('never offers the dead as heirs, and fills with the next closest when friends are gone', () => {
    const s0 = party(102)
    const [a, b, c] = living(s0)
    const s = withRelations(s0, { [key(a!.id, b!.id)]: 80 })
    const after = fight(s, [
      { id: a!.id, by: 'skeleton' },
      { id: b!.id, by: 'soldier' },
    ])
    const pa = after.life.legacy.pending.find((p) => p.fallenId === a!.id)!
    expect(pa.candidates).not.toContain(b!.id)
    expect(pa.candidates).not.toContain(a!.id)
    // Later, a suggested heir is lost: the options still offer three living heroes.
    const lost: GameState = { ...after, heroes: { ...after.heroes, [pa.candidates[0]!]: { ...after.heroes[pa.candidates[0]!]!, alive: false } } }
    const opts = heirOptions(lost, pa)
    expect(opts).toHaveLength(LG.heirCandidates)
    expect(opts).not.toContain(pa.candidates[0])
    for (const id of opts) expect(lost.heroes[id]!.alive).toBe(true)
    void c
  })

  it('an Echo stranded by a wipe can pass to a newcomer', () => {
    let s = atFloor(createAccount(103), 4)
    const han = living(s)[0]!
    s = fight(s, [{ id: han.id, by: 'goblin' }])
    const p = s.life.legacy.pending[0]!
    expect(p.candidates).toEqual([])
    expect(heirOptions(s, p)).toEqual([])
    s = { ...s, gold: TUNING.gacha.normalCostGold }
    s = reduce(s, { type: 'SUMMON' })
    const newcomer = living(s)[0]!
    expect(heirOptions(s, p)).toEqual([newcomer.id])
    s = reduce(s, { type: 'BEQUEATH_ECHO', fallenId: han.id, heirId: newcomer.id })
    expect(s.heroes[newcomer.id]!.life!.echoes).toHaveLength(1)
  })

  it('the skill fragment is the fallen’s highest-level skill', () => {
    const h = { skills: [{ id: 'power_strike', level: 2, xp: 0 }, { id: 'arcane_burst', level: 4, xp: 0 }, { id: 'shadow_flurry', level: 4, xp: 0 }] }
    expect(signatureSkillId(h)).toBe('arcane_burst')
    expect(signatureSkillId({ skills: [] })).toBeUndefined()
  })

  it('the best stat follows the build (a high-INT hero passes on M.ATK)', () => {
    const base = living(createAccount(104))[0]!
    const mage = { ...base, baseAttrs: { str: 2, agi: 3, vit: 3, int: 14, wil: 4 } }
    const tank = { ...base, baseAttrs: { str: 3, agi: 2, vit: 14, int: 2, wil: 3 } }
    const quick = { ...base, baseAttrs: { str: 3, agi: 16, vit: 3, int: 2, wil: 3 } }
    expect(bestEchoStat(mage)).toBe('mAtk')
    expect(['maxHP', 'pDef']).toContain(bestEchoStat(tank))
    expect(['spd', 'pAtk']).toContain(bestEchoStat(quick))
  })

  it('synthesis fodder that never climbed leaves no Echo; a veteran does', () => {
    const s = roster(105)
    const [a, b] = living(s)
    const vet: GameState = { ...s, heroes: { ...s.heroes, [b!.id]: { ...b!, life: { ...b!.life!, bestFloor: 6 } } } }
    const dead: GameState = { ...vet, heroes: { ...vet.heroes, [a!.id]: { ...vet.heroes[a!.id]!, alive: false }, [b!.id]: { ...vet.heroes[b!.id]!, alive: false } } }
    const after = lifeReact(vet, dead, { type: 'SYNTHESIZE', mode: 'salvage', survivorId: null, sacrificeIds: [a!.id, b!.id] }, 0)
    expect(after.life.legacy.pending.map((p) => p.fallenId)).toEqual([b!.id])
    expect(after.life.legacy.nemeses).toEqual([])
    expect(after.life.legacy.recruitTokens).toBe(0)
  })
})

describe('BEQUEATH_ECHO', () => {
  function withPending(seed: number) {
    const s0 = party(seed)
    const [a, b] = living(s0)
    const s = fight(withRelations(s0, { [key(a!.id, b!.id)]: 60 }), [{ id: a!.id, by: 'skeleton' }])
    return { s, fallen: a!, heir: s.heroes[b!.id]! }
  }

  it('applies exactly +10% of the fallen’s best stat to the heir’s combat unit', () => {
    const { s, fallen, heir } = withPending(201)
    const p = s.life.legacy.pending[0]!
    const after = reduce(s, { type: 'BEQUEATH_ECHO', fallenId: fallen.id, heirId: heir.id })
    const unit = buildCombatUnit(after.heroes[heir.id]!, 'front', SKILLS, after.inventory)
    const expected = buildCombatUnit(heir, 'front', SKILLS, s.inventory, { [p.stat]: LG.echoPct })
    expect(unit.stats).toEqual(expected.stats)
    const plain = buildCombatUnit(heir, 'front', SKILLS, s.inventory)
    expect(unit.stats[p.stat]).toBeGreaterThan(plain.stats[p.stat])
    for (const k of ['maxHP', 'pAtk', 'mAtk', 'pDef', 'mDef', 'spd'] as const) if (k !== p.stat) expect(unit.stats[k]).toBe(plain.stats[k])
  })

  it('writes the Echo, the "inherited" memory and the bequest chronicle, and clears the pending echo', () => {
    const { s, fallen, heir } = withPending(202)
    const after = reduce(s, { type: 'BEQUEATH_ECHO', fallenId: fallen.id, heirId: heir.id }, 7_000)
    const life = after.heroes[heir.id]!.life!
    expect(life.echoes).toHaveLength(1)
    expect(life.echoes![0]).toMatchObject({ fromHeroId: fallen.id, fromName: fallen.name, pct: LG.echoPct })
    expect(life.memories.some((m) => m.kind === 'inherited' && m.other === fallen.id)).toBe(true)
    expect(after.life.chronicle.at(-1)).toMatchObject({ kind: 'bequest', heroIds: [heir.id, fallen.id] })
    expect(after.life.legacy.pending).toEqual([])
    expect(echoPct(after.heroes[heir.id]!)).toEqual({ [life.echoes![0]!.stat]: LG.echoPct })
  })

  it('refuses a dead heir, a hero who is not a suggested heir, and a second bequest', () => {
    const { s, fallen, heir } = withPending(203)
    const p = s.life.legacy.pending[0]!
    const outsider = (Object.keys(s.heroes) as HeroId[]).find((id) => id !== fallen.id && !heirOptions(s, p).includes(id) && s.heroes[id]!.alive)!
    expect(() => reduce(s, { type: 'BEQUEATH_ECHO', fallenId: fallen.id, heirId: outsider })).toThrow(/not among the suggested heirs/)
    expect(() => reduce(s, { type: 'BEQUEATH_ECHO', fallenId: fallen.id, heirId: fallen.id })).toThrow(/Only the living/)
    const done = reduce(s, { type: 'BEQUEATH_ECHO', fallenId: fallen.id, heirId: heir.id })
    expect(() => reduce(done, { type: 'BEQUEATH_ECHO', fallenId: fallen.id, heirId: heir.id })).toThrow(/already been passed on/)
  })

  it('enforces the per-heir cap', () => {
    const { s, heir } = withPending(204)
    const full = Array.from({ length: LG.echoMaxPerHeir }, (_, i) => ({ fromHeroId: `h_x${i}` as HeroId, fromName: 'X', stat: 'pAtk' as const, pct: 0.1, at: 0 }))
    const capped = { ...s, heroes: { ...s.heroes, [heir.id]: { ...heir, life: { ...heir.life!, echoes: full } } } }
    const p = capped.life.legacy.pending[0]!
    expect(heirOptions(capped, p)).not.toContain(heir.id)
    expect(() => reduce(capped, { type: 'BEQUEATH_ECHO', fallenId: p.fallenId, heirId: heir.id })).toThrow(/all the echoes they can/)
  })

  it('a skill fragment lifts a skill the heir knows by one level (and nothing otherwise)', () => {
    const echo = { fromHeroId: 'h_a' as HeroId, fromName: 'A', stat: 'pAtk' as const, pct: 0.1, skillId: 'power_strike', at: 0 }
    const known = [{ id: 'power_strike', level: 2, xp: 5 }]
    expect(echoSkills(known, [echo])).toEqual([{ id: 'power_strike', level: 3, xp: 5 }])
    const other = [{ id: 'arcane_burst', level: 2, xp: 0 }]
    expect(echoSkills(other, [echo])).toBe(other)
    // In combat: the heir's Power Strike hits harder.
    const base = living(createAccount(205))[0]!
    const hero = { ...base, skills: known }
    const plain = buildCombatUnit(hero, 'front', SKILLS)
    const lifted = buildCombatUnit({ ...hero, life: { ...(hero.life ?? newHeroLife(0)), echoes: [echo] } }, 'front', SKILLS)
    const mult = (u: typeof plain) => u.skills.find((x) => x.id === 'power_strike')!.skillMult
    expect(mult(lifted)).toBeGreaterThan(mult(plain))
  })

  it('is pure: frozen inputs are never mutated', () => {
    const { s, fallen, heir } = withPending(206)
    const frozen = deepFreeze(JSON.parse(JSON.stringify(s)) as GameState)
    expect(() => bequeathEcho(frozen, fallen.id, heir.id, 0)).not.toThrow()
    expect(frozen).toEqual(JSON.parse(JSON.stringify(s)))
  })
})

describe('a hero without Echoes is untouched', () => {
  it('buildCombatUnit is byte-identical', () => {
    for (const h of living(roster(207, 4))) {
      const a = buildCombatUnit(h, 'front', SKILLS)
      const b = buildCombatUnit({ ...h, life: { ...h.life!, echoes: [] } }, 'front', SKILLS)
      expect(JSON.stringify(b)).toBe(JSON.stringify(a))
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// S22 — Nemesis records
// ─────────────────────────────────────────────────────────────────────────────

describe('the killer remembers', () => {
  it('names the actor of the last hit before the death', () => {
    const s = party(301)
    const [a] = living(s)
    const { result } = battle(s, [{ id: a!.id, by: 'soldier' }])
    // An earlier hit by someone else does not count: the last blow does.
    const log = result.result.log
    const early: CombatEvent = { seq: -1, tick: 0, kind: 'hit', actorId: 'nobody', targetId: a!.id, amount: 1, crit: false, hpAfter: 50 }
    expect(killingBlow({ ...log, events: [early, ...log.events] }, a!.id)!.name).toBe('Human Soldier')
    expect(killingBlow(log, 'h_none')).toBeNull()
  })

  it('records a Nemesis with a revenge floor 3-7 floors up, never an anchor', () => {
    const s = party(302)
    const [a] = living(s)
    const after = fight(s, [{ id: a!.id, by: 'knight', level: 14 }])
    const n = after.life.legacy.nemeses[0]!
    expect(n).toMatchObject<Partial<Nemesis>>({
      id: `nem_${a!.id}`,
      templateId: 'knight',
      name: 'Knight',
      element: ENEMY_TEMPLATES.knight!.element,
      level: 14,
      heroId: a!.id,
      heroName: a!.name,
      diedFloor: 12,
      status: 'waiting',
    })
    expect(n.revengeFloor).toBeGreaterThanOrEqual(12 + 3)
    expect(n.revengeFloor).toBeLessThanOrEqual(12 + 7)
    expect(isRevengeFloor(n.revengeFloor)).toBe(true)
    // The grave remembers who did it, and the Memorial learned the family.
    expect(killerOf(after.life.memorial[0]!)).toMatchObject({ templateId: 'knight', name: 'Knight', family: 'humanoid' })
    expect(after.life.legacy.lessons).toEqual(['humanoid'])
  })

  it('revenge floors stay in the window and skip anchors, the loop and the world’s end', () => {
    const seed = 77 as Seed
    for (let died = 3; died <= 85; died++) {
      for (const id of ['h_000001', 'h_000002', 'h_000003', 'h_000004'] as HeroId[]) {
        const f = revengeFloorFor(seed, id, died)
        if (f === null) {
          expect(died + 3).toBeGreaterThanOrEqual(TUNING.tower.worldEndFloor - 7)
          continue
        }
        expect(isRevengeFloor(f)).toBe(true)
        expect(f % 5).not.toBe(0)
        expect(ANCHORS[f]).toBeUndefined()
        const windowHasRoom = [3, 4, 5, 6, 7].some((k) => isRevengeFloor(died + k))
        if (windowHasRoom) {
          expect(f).toBeGreaterThanOrEqual(died + 3)
          expect(f).toBeLessThanOrEqual(died + 7)
        } else expect(f).toBeGreaterThan(died + 7)
      }
    }
    // The loop (F36-40) is never haunted.
    for (let f = TUNING.tower.loop.start; f <= TUNING.tower.loop.gate; f++) expect(isRevengeFloor(f)).toBe(false)
  })

  it('is deterministic per hero', () => {
    expect(revengeFloorFor(9 as Seed, 'h_000123' as HeroId, 11)).toBe(revengeFloorFor(9 as Seed, 'h_000123' as HeroId, 11))
    const s = party(303)
    const [a] = living(s)
    expect(fight(s, [{ id: a!.id, by: 'skeleton' }])).toEqual(fight(s, [{ id: a!.id, by: 'skeleton' }]))
  })

  it('caps the waiting Nemeses, and one killer names only its first victim', () => {
    const s = party(304)
    const [a, b, c, d, e] = living(s)
    const once = fight(s, [
      { id: a!.id, by: 'skeleton', unit: 'u1' },
      { id: b!.id, by: 'skeleton', unit: 'u1' },
      { id: c!.id, by: 'soldier' },
    ])
    expect(once.life.legacy.nemeses.map((n) => n.heroId)).toEqual([a!.id, c!.id])
    const twice = fight(atFloor(once, 13), [
      { id: d!.id, by: 'knight' },
      { id: e!.id, by: 'assassin' },
    ])
    expect(twice.life.legacy.nemeses.filter((n) => n.status === 'waiting')).toHaveLength(LG.nemesis.maxActive)
    expect(twice.life.legacy.nemeses.map((n) => n.heroId)).toEqual([a!.id, c!.id, d!.id])
  })

  it('a Bane that kills again is recognised by its revenant name', () => {
    const s = party(308)
    const [a, b] = living(s)
    const first = fight(s, [{ id: a!.id, by: 'wraith' }])
    const n = first.life.legacy.nemeses[0]!
    expect(revenantName(n)).toBe(`${a!.name.split(' ')[0]}'s Bane`)
    // On its floor, the revenant (named "Mira's Bane") strikes b down.
    const at = atFloor(first, n.revengeFloor)
    const { after, result } = battle(at, [{ id: b!.id, by: 'wraith' }])
    const unit = result.result.log.unitsInit[0]!
    const log = { ...result.result.log, unitsInit: [{ ...unit, name: revenantName(n) }] }
    const renamed: FloorResult = { ...result, result: { ...result.result, log } }
    const again = lifeReact(at, after, { type: 'ATTEMPT_FLOOR' }, 0, renamed)
    expect(killerOf(again.life.memorial.at(-1)!)).toMatchObject({ templateId: 'wraith', name: 'Wraith' })
  })

  it('an anchor boss is not a Nemesis (its floor is the rematch), but the grave still names it', () => {
    const s = atFloor(party(305), 10)
    const [a] = living(s)
    const after = fight(s, [{ id: a!.id, by: 'lv999_creature' }])
    expect(after.life.legacy.nemeses).toEqual([])
    expect(killerOf(after.life.memorial[0]!)!.templateId).toBe('lv999_creature')
  })

  it('a death away from the tower (a captor) leaves an Echo but no Nemesis', () => {
    const s = roster(306)
    const [a] = living(s)
    const vet: GameState = { ...s, heroes: { ...s.heroes, [a!.id]: { ...a!, life: { ...a!.life!, bestFloor: 3 } } } }
    const dead: GameState = { ...vet, heroes: { ...vet.heroes, [a!.id]: { ...vet.heroes[a!.id]!, alive: false } } }
    const after = lifeReact(vet, dead, { type: 'TICK' }, 0)
    expect(after.life.memorial[0]!.cause).toBe('captor')
    expect(after.life.legacy.pending).toHaveLength(1)
    expect(after.life.legacy.nemeses).toEqual([])
    expect(killerOf(after.life.memorial[0]!)).toBeNull()
  })

  it('when the Bane falls, the friends of the fallen remember it and grieve less — once', () => {
    const s0 = party(307)
    const [a, b, c] = living(s0)
    const s1 = withRelations(s0, { [key(a!.id, b!.id)]: 70 })
    const died = fight(s1, [{ id: a!.id, by: 'soldier' }])
    const n = died.life.legacy.nemeses[0]!
    const griefBefore = died.heroes[b!.id]!.life!.grief
    expect(griefBefore).toBeGreaterThan(0)
    const at = atFloor(died, n.revengeFloor)
    const won = fight(at, [], { cleared: true, nemesisDefeated: [n.id] })
    expect(won.life.legacy.nemeses[0]!.status).toBe('avenged')
    const bl = won.heroes[b!.id]!.life!
    expect(bl.memories.some((m) => m.kind === 'avenged' && m.other === a!.id)).toBe(true)
    expect(bl.grief).toBeLessThan(griefBefore)
    // A survivor who fought it remembers too.
    expect(won.heroes[c!.id]!.life!.memories.some((m) => m.kind === 'avenged')).toBe(true)
    const rev = won.life.chronicle.filter((e) => e.kind === 'revenge')
    expect(rev).toHaveLength(1)
    expect(rev[0]!.detail).toBe(n.id)
    // Defeating an already-avenged Bane again changes nothing.
    const again = fight(won, [], { cleared: true, nemesisDefeated: [n.id] })
    expect(again.life.chronicle.filter((e) => e.kind === 'revenge')).toHaveLength(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// S23 — New Arrivals, lessons and plaques
// ─────────────────────────────────────────────────────────────────────────────

describe('New Arrivals', () => {
  it('a death that leaves fewer than five living heroes rings the bell, capped at two tokens', () => {
    let s = atFloor(roster(401, 5), 12) // 6 heroes
    const ids = living(s).map((h) => h.id)
    s = fight(s, [{ id: ids[0]!, by: 'skeleton' }]) // 5 left: no token
    expect(s.life.legacy.recruitTokens).toBe(0)
    s = fight(s, [{ id: ids[1]!, by: 'skeleton' }]) // 4 left
    expect(s.life.legacy.recruitTokens).toBe(1)
    s = fight(s, [{ id: ids[2]!, by: 'skeleton' }])
    s = fight(s, [{ id: ids[3]!, by: 'skeleton' }])
    expect(s.life.legacy.recruitTokens).toBe(LG.recruit.maxTokens)
  })

  it('a battle without deaths rings nothing, even with a small roster', () => {
    const s = atFloor(createAccount(402), 3)
    expect(fight(s, [], { cleared: true }).life.legacy.recruitTokens).toBe(0)
  })

  it('CLAIM_RECRUIT spends a token on a free pull of at least 2★', () => {
    for (const seed of [403, 404, 405, 406, 407, 408]) {
      const s0 = createAccount(seed)
      const s = { ...s0, gold: 120, life: { ...s0.life, legacy: { ...s0.life.legacy, recruitTokens: 2 } } }
      const { state, hero } = claimRecruitWithHero(s)
      expect(hero.star).toBeGreaterThanOrEqual(LG.recruit.minStar)
      expect(state.gold).toBe(120)
      expect(state.life.legacy.recruitTokens).toBe(1)
      expect(state.heroes[hero.id]).toBeDefined()
      // Through the reducer: the newcomer arrives like any summon.
      const r = reduce(s, { type: 'CLAIM_RECRUIT' })
      expect(Object.keys(r.heroes)).toHaveLength(Object.keys(s.heroes).length + 1)
      expect(r.life.chronicle.at(-1)!.kind).toBe('arrival')
      expect(r.gold).toBe(120)
    }
  })

  it('CLAIM_RECRUIT is refused without a token, and pure with one', () => {
    expect(() => claimRecruit(createAccount(409))).toThrow(/No one is waiting at the bell/)
    const s0 = createAccount(410)
    const s = deepFreeze({ ...s0, life: { ...s0.life, legacy: { ...s0.life.legacy, recruitTokens: 1 } } })
    expect(() => claimRecruit(s)).not.toThrow()
    expect(s.life.legacy.recruitTokens).toBe(1)
  })
})

describe('the Memorial teaches', () => {
  it('each plaque adds +0.5% to every stat, capped at +5%', () => {
    expect(plaquePct(0)).toBe(0)
    expect(plaquePct(1)).toBe(0.005)
    expect(plaquePct(3)).toBe(0.015)
    expect(plaquePct(10)).toBe(LG.memorial.capPct)
    expect(plaquePct(40)).toBe(LG.memorial.capPct)
    const s = createAccount(501)
    expect(legacyPct(s)).toBe(0)
    expect(legacyExtraPct(s)).toEqual({})
    const graves = { ...s, life: { ...s.life, memorial: Array.from({ length: 4 }, () => s.life.memorial[0]!).fill({} as never) } }
    expect(legacyPct(graves)).toBe(0.02)
    expect(legacyExtraPct(graves)).toEqual({ pAtk: 0.02, mAtk: 0.02, maxHP: 0.02, pDef: 0.02, mDef: 0.02, spd: 0.02 })
  })

  it('synthesis fodder that never climbed earns no plaque (the +5% cannot be bought with gold)', () => {
    const s = roster(503)
    const [a, b, c] = living(s)
    const vet: GameState = { ...s, heroes: { ...s.heroes, [b!.id]: { ...b!, life: { ...b!.life!, bestFloor: 4 } } } }
    const dead: GameState = { ...vet, heroes: { ...vet.heroes, [a!.id]: { ...vet.heroes[a!.id]!, alive: false }, [b!.id]: { ...vet.heroes[b!.id]!, alive: false } } }
    const synth = lifeReact(vet, dead, { type: 'SYNTHESIZE', mode: 'salvage', survivorId: null, sacrificeIds: [a!.id, b!.id] }, 0)
    expect(synth.life.memorial).toHaveLength(2)
    expect(synth.life.memorial.map(earnsPlaque)).toEqual([false, true])
    expect(plaqueCount(synth)).toBe(1)
    expect(legacyPct(synth)).toBe(LG.memorial.pctPerPlaque)
    // A hero who falls in the climb always earns one.
    const climbed = fight(atFloor(synth, 6), [{ id: c!.id, by: 'goblin' }])
    expect(plaqueCount(climbed)).toBe(2)
    expect(legacyPct(climbed)).toBe(2 * LG.memorial.pctPerPlaque)
  })

  it('lessons are sorted and unique', () => {
    const s = party(502)
    const [a, b, c] = living(s)
    const after = fight(s, [
      { id: a!.id, by: 'wolf' },
      { id: b!.id, by: 'skeleton' },
      { id: c!.id, by: 'goblin' },
    ])
    expect(after.life.legacy.lessons).toEqual(['beast', 'humanoid', 'undead'])
  })

  it('names the element that answers a killer', () => {
    expect(counterElement('wind')).toBe('fire')
    expect(counterElement('fire')).toBe('water')
    expect(counterElement('dark')).toBe('light')
    expect(counterElement('physical')).toBeNull()
  })
})

describe('in the real climb', () => {
  it('a deadly tower floor leaves one Echo per fallen hero, a grave that names the killer and a Nemesis', () => {
    let found = false
    for (const seed of [601, 602, 603, 604]) {
      const s = atFloor(party(seed), 23)
      const after = reduce(s, { type: 'ATTEMPT_FLOOR' })
      const fallen = Object.keys(s.heroes).filter((id) => s.heroes[id as HeroId]!.alive && !after.heroes[id as HeroId]!.alive)
      if (fallen.length === 0) continue
      found = true
      const pend: PendingEcho[] = after.life.legacy.pending
      expect(pend.map((p) => p.fallenId).sort()).toEqual([...fallen].sort())
      for (const g of after.life.memorial) expect(killerOf(g)).not.toBeNull()
      expect(after.life.legacy.nemeses.length).toBeGreaterThan(0)
      expect(after.life.legacy.nemeses.length).toBeLessThanOrEqual(LG.nemesis.maxActive)
      // Deterministic.
      expect(reduce(s, { type: 'ATTEMPT_FLOOR' })).toEqual(after)
    }
    expect(found).toBe(true)
  })

  it('is pure through the reducer (frozen state in, untouched)', () => {
    const s = atFloor(party(605), 23)
    const snapshot = JSON.parse(JSON.stringify(s))
    deepFreeze(s)
    expect(() => reduce(s, { type: 'ATTEMPT_FLOOR' })).not.toThrow()
    expect(JSON.parse(JSON.stringify(s))).toEqual(snapshot)
  })
})
