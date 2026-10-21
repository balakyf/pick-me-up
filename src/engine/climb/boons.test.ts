/** Boons: pick 1 of 3 after an Elite or Boss clear; they last the Sortie (spec 2026-10-12 S14). */
import { describe, it, expect } from 'vitest'
import {
  BOONS,
  boonOffer,
  applyBoonsToUnits,
  boonBattleMods,
  boonOrders,
  boonGoldMult,
  boonXpMult,
  boonDrainMult,
  isBoon,
} from './boons'
import { newSortie } from './sortie'
import { chooseDoor } from './doors'
import { floorKindBase } from './kinds'
import { playFloor, ordersAllowed } from '../tower'
import { resolveEvent, EVENT_OPTION_LABEL } from '../events'
import { runBattle, SECOND_WIND_NOTE } from '../combat'
import { buildCombatUnit, buildEnemyUnit } from '../unit'
import { ENEMY_TEMPLATES, SKILLS } from '../content'
import { createAccount } from '../account'
import { reduce } from '../store'
import { suggestParty } from '../scout'
import { TUNING } from '../tuning'
import type { BoonId, CombatUnit, Door, Encounter, GameState, HeroId, OwnedHero, Sortie } from '../types'

const CL = TUNING.climb
const BV = CL.boonValues

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o)
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v)
  }
  return o
}

function roster(seed: number, n: number): GameState {
  let s: GameState = { ...createAccount(seed, { now: 0 }), gold: TUNING.gacha.normalCostGold * n }
  for (let i = 0; i < n; i++) s = reduce(s, { type: 'SUMMON' })
  return reduce(s, { type: 'SET_PARTY', ...suggestParty(s) })
}

/** A party of gods: every floor falls, nobody dies. */
function gods(seed = 9): GameState {
  const s = roster(seed, 4)
  const heroes: Record<HeroId, OwnedHero> = {}
  for (const h of Object.values(s.heroes)) {
    heroes[h.id] = { ...h, star: 7, xp: { ...h.xp, level: 150 }, baseAttrs: { str: 999, agi: 999, vit: 999, int: 999, wil: 999 } }
  }
  return { ...s, heroes, gold: 0 }
}

function withSortie(s: GameState, boons: BoonId[], floor = s.tower.currentFloor): GameState {
  const sortie: Sortie = { ...newSortie(floor), boons }
  return { ...s, tower: { ...s.tower, sortie } }
}

function at(s: GameState, floor: number, doors: Door[] | null = null): GameState {
  return { ...s, tower: { ...s.tower, currentFloor: floor, highestCleared: floor - 1, doors, kind: doors?.[0]?.kind ?? floorKindBase(floor) } }
}

describe('the Boon set', () => {
  it('has the twelve Boons of the spec, each named and described', () => {
    expect(Object.keys(BOONS)).toHaveLength(12)
    for (const [id, b] of Object.entries(BOONS)) {
      expect(b.id).toBe(id)
      expect(b.name.length).toBeGreaterThan(0)
      expect(b.description.length).toBeGreaterThan(0)
      expect(isBoon(id)).toBe(true)
      // The event panel shows a Boon option by its name.
      expect(EVENT_OPTION_LABEL[id]).toBe(b.name)
    }
    expect(isBoon('rest')).toBe(false)
    expect(isBoon('toString')).toBe(false)
  })
})

describe('boonOffer', () => {
  const s = withSortie(createAccount(11, { now: 0 }), [])

  it('offers `boons.offer` distinct Boons, the same ones every time for a floor', () => {
    const offer = boonOffer(s, 7)
    expect(offer).toHaveLength(CL.boons.offer)
    expect(new Set(offer).size).toBe(offer.length)
    for (const id of offer) expect(isBoon(id)).toBe(true)
    expect(boonOffer(s, 7)).toEqual(offer)
    // Another floor draws on its own stream.
    const others = [8, 9, 11, 12, 13].map((f) => boonOffer(s, f).join())
    expect(others.some((o) => o !== offer.join())).toBe(true)
  })

  it('never offers a Boon the Sortie holds; none on campus or once the Sortie is full', () => {
    const held: BoonId[] = ['ironVow', 'volley', 'calmMind']
    for (let f = 3; f < 30; f++) for (const id of boonOffer(withSortie(s, held), f)) expect(held).not.toContain(id)
    expect(boonOffer({ ...s, tower: { ...s.tower, sortie: null } }, 7)).toEqual([])
    const full = Object.keys(BOONS).slice(0, CL.boons.max)
    expect(boonOffer(withSortie(s, full), 7)).toEqual([])
  })
})

describe('stat Boons', () => {
  const s = roster(21, 6)
  const units = (st: GameState): CombatUnit[] =>
    Object.values(st.heroes).map((h, i) => buildCombatUnit(h, i % 2 === 0 ? 'front' : 'back', SKILLS, st.inventory))

  it('lift only the heroes they name, by their TUNING share, and re-derive CP', () => {
    const base = units(s)
    deepFreeze(base)
    const lifted = applyBoonsToUnits(s, base, ['shieldwall', 'volley', 'arcaneTide', 'sanctuary'])
    base.forEach((u, i) => {
      const v = lifted[i]!
      const up = (k: 'pDef' | 'mDef' | 'spd' | 'mAtk' | 'maxHP', pct: number, when: boolean) =>
        expect(v.stats[k], `${u.name} ${k}`).toBe(when ? Math.round(u.stats[k] * (1 + pct)) : u.stats[k])
      up('pDef', BV.shieldwall, u.unitClass === 'warrior')
      up('mDef', BV.shieldwall, u.unitClass === 'warrior')
      up('spd', BV.volley, u.unitClass === 'archer')
      up('mAtk', BV.arcaneTide, u.unitClass === 'mage')
      up('maxHP', BV.sanctuary, u.line === 'back')
      expect(v.currentHP).toBe(v.stats.maxHP)
      if (v !== u) expect(v.cp).toBeGreaterThanOrEqual(u.cp)
      else expect(v.stats).toEqual(u.stats)
    })
  })

  it('Underdog lifts every stat of 1-2★ heroes only', () => {
    const base = units(s)
    const lifted = applyBoonsToUnits(s, base, ['underdog'])
    base.forEach((u, i) => {
      const star = s.heroes[u.sourceHeroId!]!.star
      const v = lifted[i]!
      if (star <= 2) {
        expect(v.stats.pAtk).toBe(Math.round(u.stats.pAtk * (1 + BV.underdog)))
        expect(v.cp).toBeGreaterThan(u.cp)
      } else expect(v).toBe(u)
    })
  })

  it('are the identity with no Boons, and leave enemies alone', () => {
    const base = units(s)
    expect(applyBoonsToUnits(s, base, [])).toBe(base)
    const goblin = buildEnemyUnit(ENEMY_TEMPLATES.goblin!, 5, 'g', {})
    expect(applyBoonsToUnits(s, [goblin], ['underdog', 'volley'])[0]).toBe(goblin)
  })
})

describe('Boons that act elsewhere', () => {
  it('Quartermaster adds an order; War Chest, Scholar’s Lamp and Calm Mind scale the floor', () => {
    const s = createAccount(4, { now: 0 })
    expect(ordersAllowed(withSortie(s, ['quartermaster']))).toBe(ordersAllowed(s) + BV.quartermaster)
    expect(boonOrders([])).toBe(0)
    expect(boonGoldMult(['warChest'])).toBe(1 + BV.warChest)
    expect(boonXpMult(['scholarsLamp'])).toBe(1 + BV.scholarsLamp)
    expect(boonDrainMult(['calmMind'])).toBe(1 - BV.calmMind)
    expect([boonGoldMult([]), boonXpMult([]), boonDrainMult([])]).toEqual([1, 1, 1])
    expect(boonBattleMods([])).toEqual({})
  })

  it('War Chest and Scholar’s Lamp pay out on a cleared floor', () => {
    const s = at(gods(), 7)
    const plain = playFloor(withSortie(s, [])).result
    const rich = playFloor(withSortie(s, ['warChest', 'scholarsLamp'])).result
    expect(rich.goldAwarded).toBe(Math.round(plain.goldAwarded * (1 + BV.warChest)))
    expect(rich.xpAwarded).toBe(Math.round(plain.xpAwarded * (1 + BV.scholarsLamp)))
  })

  it('Calm Mind softens the Sanity drain', () => {
    const s = at(gods(), 7)
    const id = s.party.slots.find((x) => x !== null)!
    const before = s.heroes[id]!.sanity
    const plain = before - playFloor(withSortie(s, [])).state.heroes[id]!.sanity
    const calm = before - playFloor(withSortie(s, ['calmMind'])).state.heroes[id]!.sanity
    expect(plain).toBeGreaterThan(0)
    expect(calm).toBe(Math.round(plain * (1 - BV.calmMind)))
  })
})

describe('battle Boons', () => {
  function duel(mods: Parameters<typeof runBattle>[3], focus?: Encounter['focus']) {
    const s = roster(5, 3)
    const heroes = Object.values(s.heroes).map((h) => buildCombatUnit(h, 'front', SKILLS, s.inventory))
    const foes = [0, 1, 2].map((i) => buildEnemyUnit(ENEMY_TEMPLATES.goblin!, 12, `g${i}`, {}))
    const enc: Encounter = { floor: 9, mission: { type: 'Subjugation', objectives: [{ kind: 'annihilate' }], timer: null }, waves: [{ units: foes }], encounterContext: 'tower' }
    if (focus) enc.focus = focus
    return { heroes, foes, res: runBattle(heroes, enc, 77, mods) }
  }

  it('Hunter’s Mark: the Focus target takes more damage from the party', () => {
    const plain = duel({}, { focusEnemyId: 'g0', overlookedAllyIds: [] })
    const marked = duel({ focusVulnerability: BV.huntersMark }, { focusEnemyId: 'g0', overlookedAllyIds: [] })
    const firstOn = (r: typeof plain) => r.res.log.events.find((e) => e.kind === 'hit' && e.targetId === 'g0') as { amount: number; crit: boolean }
    const a = firstOn(plain)
    const b = firstOn(marked)
    expect(b.amount).toBeGreaterThan(a.amount)
    // No Boon draws RNG.
    expect(marked.res.log.rngDraws).toBeGreaterThan(0)
  })

  it('Iron Vow: a Protected hero takes less damage', () => {
    const probe = duel({})
    const target = probe.heroes[0]!.id
    const spare = probe.heroes.slice(1).map((h) => h.id)
    // Protect every hero, so the first blow lands on a Protected one either way.
    const all = [target, ...spare]
    const plain = duel({}, { overlookedAllyIds: all })
    const vowed = duel({ protectedReduction: BV.ironVow }, { overlookedAllyIds: all })
    const firstHeroHit = (r: typeof plain) => r.res.log.events.find((e) => e.kind === 'hit' && all.includes(e.targetId)) as { amount: number }
    expect(firstHeroHit(vowed).amount).toBeLessThan(firstHeroHit(plain).amount)
  })

  it('Second Wind: the first hero knocked low rallies, once a battle', () => {
    const s = roster(6, 2)
    const hero = buildCombatUnit(Object.values(s.heroes)[0]!, 'front', SKILLS, s.inventory)
    const ogre = buildEnemyUnit(ENEMY_TEMPLATES.goblin!, 30, 'ogre', {})
    const enc: Encounter = { floor: 30, mission: { type: 'Subjugation', objectives: [{ kind: 'annihilate' }], timer: null }, waves: [{ units: [ogre] }], encounterContext: 'tower' }
    const mods = { secondWind: { below: 0.99, heal: BV.secondWind.heal } }
    const res = runBattle([hero], enc, 3, mods)
    const notes = res.log.events.filter((e) => e.kind === 'mission' && e.note === SECOND_WIND_NOTE)
    expect(notes).toHaveLength(1)
    const heal = res.log.events.find((e) => e.kind === 'heal' && e.unitId === hero.id) as { amount: number } | undefined
    expect(heal?.amount ?? 0).toBeGreaterThan(0)
    expect(heal!.amount).toBeLessThanOrEqual(Math.round(hero.stats.maxHP * BV.secondWind.heal))
    // Without the Boon, the same fight has no rally.
    expect(runBattle([hero], enc, 3).log.events.some((e) => e.kind === 'mission' && e.note === SECOND_WIND_NOTE)).toBe(false)
  })
})

describe('Boons in the climb', () => {
  it('an Elite clear opens a Boon choice; resolving it adds the Boon to the Sortie', () => {
    const doors: Door[] = [
      { kind: 'path', reward: 'gold' },
      { kind: 'elite', reward: 'boon' },
    ]
    const s = at(gods(), 7, doors)
    const { state, result } = playFloor(chooseDoor(s, 1))
    expect(result.event?.kind).toBe('boon')
    expect(state.tower.event?.options).toHaveLength(CL.boons.offer)
    const pick = state.tower.event!.options[1]!
    const after = resolveEvent(state, pick).state
    expect(after.tower.event).toBeNull()
    expect(after.tower.sortie?.boons).toEqual([pick])
    // A Boon that is not offered is refused.
    expect(() => resolveEvent(state, 'rest')).toThrow(/not offered/)
  })

  it('a stat Boon changes the deployed units; it expires when the Sortie ends', () => {
    const s = at(roster(31, 6), 8)
    const lowStars = Object.values(s.heroes).filter((h) => h.star <= 2 && s.party.slots.includes(h.id))
    expect(lowStars.length).toBeGreaterThan(0)
    const cp = (st: GameState) => playFloor(st).result.result.log.unitsInit.filter((u) => u.side === 'hero').reduce((n, u) => n + u.cp, 0)
    const boosted = withSortie(s, ['underdog'])
    expect(cp(boosted)).toBeGreaterThan(cp(s))
    // Home to campus: the Sortie, and its Boons, are gone.
    const home = reduce(boosted, { type: 'RETURN_TO_CAMPUS' })
    expect(home.tower.sortie).toBeNull()
    expect(cp(home)).toBe(cp(s))
  })

  it('a Boss’s repeat clear offers a Boon at once (its first clear chains it after the bonus)', () => {
    const g = at(gods(), 25)
    const repeat = playFloor({ ...g, tower: { ...g.tower, highestCleared: 30 } }).result
    expect(repeat.event?.kind).toBe('boon')
    const first = playFloor(g)
    expect(first.result.event?.kind).toBe('bonus')
    expect(resolveEvent(first.state, 'rest').state.tower.event?.kind).toBe('boon')
  })
})
