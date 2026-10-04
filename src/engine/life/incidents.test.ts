import { describe, it, expect } from 'vitest'
import { createAccount } from '../account'
import { reduce, resolveIncidentWithResult } from '../store'
import { TUNING } from '../tuning'
import type { CampIncident, GameState, HeroId, OwnedHero } from '../types'
import { gazette, incidentsOf, lifeReact, relationKey, sectionOf, stepLife, GRIEF, INCIDENT } from '.'
import { toWorldTime } from '../time'

const SLOT = TUNING.life.slotMs
const DAY = SLOT * TUNING.life.slotsPerDay

function roster(seed: number, n = 12): GameState {
  let st: GameState = { ...createAccount(seed), gold: TUNING.gacha.normalCostGold * n }
  for (let i = 0; i < n; i++) st = reduce(st, { type: 'SUMMON' })
  return st
}
const living = (s: GameState) => Object.values(s.heroes).filter((h) => h.alive) as OwnedHero[]

/** A roster that has lived a day, with two heroes who loathe each other and a pending brawl. */
function brawling(seed: number): { s: GameState; inc: CampIncident; a: HeroId; b: HeroId } {
  const s0 = stepLife(roster(seed), DAY)
  const [a, b] = living(s0).map((h) => h.id) as [HeroId, HeroId]
  const inc: CampIncident = { id: `i${s0.life.slot}`, kind: 'brawl', heroIds: [a, b], at: s0.life.slot * SLOT, untilSlot: s0.life.slot + 6, detail: 'yard' }
  const s = {
    ...s0,
    meta: { ...s0.meta, lastSeenAtWorld: s0.life.slot * SLOT },
    life: { ...s0.life, incidents: [inc], relations: { ...s0.life.relations, [relationKey(a, b)]: { affinity: -70, shared: 0 } } },
  }
  return { s, inc, a, b }
}

describe('camp incidents (lane L)', () => {
  it('happen over a few days, deterministically', () => {
    const s = stepLife(roster(51), 4 * DAY)
    const all = s.life.chronicle.filter((e) => e.kind === 'incident').length + incidentsOf(s).length
    expect(all).toBeGreaterThan(0)
    expect(stepLife(roster(51), 4 * DAY)).toEqual(s)
  })

  it('one long advance equals many short ones, incidents and their settling included', () => {
    for (const seed of [52, 53]) {
      const s = roster(seed)
      const long = stepLife(s, 3 * DAY)
      let short = s
      for (let k = 1; k <= 3 * 48; k++) short = stepLife(short, k * SLOT)
      expect(short).toEqual(long)
      expect(long.life.chronicle.some((e) => e.kind === 'incident')).toBe(true)
    }
  })

  it('an unanswered incident settles itself when its time is up — the same as letting it be', () => {
    const { s, inc } = brawling(54)
    const byClock = stepLife(s, (inc.untilSlot + 1) * SLOT)
    expect(incidentsOf(byClock).some((i) => i.id === inc.id)).toBe(false)
    const line = byClock.life.chronicle.find((e) => e.kind === 'incident' && e.detail?.startsWith('brawl:') && e.at === inc.untilSlot * SLOT)
    expect(line).toBeDefined()
    const let_ = reduce(s, { type: 'RESOLVE_INCIDENT', id: inc.id, choice: 'let' })
    const said = let_.life.chronicle[let_.life.chronicle.length - 1]!
    // The same draw decides it either way (rngFor(seed, 'incident-let', id)).
    expect(said.detail!.split(':')[1]).toBe(line!.detail!.split(':')[1])
  })

  it('stepping into a brawl makes the two talk it out', () => {
    const { s, inc, a, b } = brawling(55)
    const next = reduce(s, { type: 'RESOLVE_INCIDENT', id: inc.id, choice: 'intervene' })
    expect(incidentsOf(next)).toHaveLength(0)
    expect(next.life.relations[relationKey(a, b)]!.affinity).toBe(-70 + INCIDENT.brawl.interveneAffinity)
    expect(next.heroes[a]!.sanity).toBeGreaterThanOrEqual(Math.min(100, s.heroes[a]!.sanity))
    expect(next.life.chronicle[next.life.chronicle.length - 1]!.detail).toBe('brawl:separated:yard')
  })

  it('the *WithResult helper agrees with reduce and names the outcome', () => {
    const { s, inc } = brawling(56)
    const r = resolveIncidentWithResult(s, inc.id, 'intervene', 0)
    expect(r.outcome).toBe('separated')
    expect(r.state).toEqual(reduce(s, { type: 'RESOLVE_INCIDENT', id: inc.id, choice: 'intervene' }, toWorldTime(0)))
  })

  it('refuses an unknown incident, an unknown answer, and one whose hero has fallen', () => {
    const { s, inc, a } = brawling(57)
    expect(() => reduce(s, { type: 'RESOLVE_INCIDENT', id: 'nope', choice: 'let' })).toThrow(/^resolveIncident: no such incident/)
    expect(() => reduce(s, { type: 'RESOLVE_INCIDENT', id: inc.id, choice: 'maybe' as 'let' })).toThrow(/^resolveIncident: unknown choice/)
    const dead = { ...s, heroes: { ...s.heroes, [a]: { ...s.heroes[a]!, alive: false } } }
    expect(() => reduce(dead, { type: 'RESOLVE_INCIDENT', id: inc.id, choice: 'intervene' })).toThrow(/^resolveIncident: a hero involved has fallen/)
    // …and the life clock forgets an incident whose hero fell.
    expect(incidentsOf(stepLife(dead, (s.life.slot + 1) * SLOT))).toHaveLength(0)
  })

  it('a homesick newcomer steadies when the Master sits with them', () => {
    const s0 = stepLife(roster(58), DAY)
    const h = living(s0)[3]!
    const inc: CampIncident = { id: `i${s0.life.slot}`, kind: 'homesick', heroIds: [h.id], at: 0, untilSlot: s0.life.slot + 10 }
    const s = { ...s0, heroes: { ...s0.heroes, [h.id]: { ...h, sanity: 50 } }, life: { ...s0.life, incidents: [inc] } }
    const sat = reduce(s, { type: 'RESOLVE_INCIDENT', id: inc.id, choice: 'intervene' })
    const left = reduce(s, { type: 'RESOLVE_INCIDENT', id: inc.id, choice: 'let' })
    expect(sat.heroes[h.id]!.sanity).toBe(50 + INCIDENT.homesick.interveneSanity)
    expect(left.heroes[h.id]!.sanity).toBe(50 + INCIDENT.homesick.letSanity)
  })
})

describe('grief that plays out (lane L)', () => {
  it('a rival who falls leaves guilt behind', () => {
    const s0 = roster(61)
    const [a, b] = living(s0) as [OwnedHero, OwnedHero]
    const before: GameState = { ...s0, life: { ...s0.life, relations: { [relationKey(a.id, b.id)]: { affinity: -50, shared: 0 } } } }
    const after = { ...before, heroes: { ...before.heroes, [a.id]: { ...a, alive: false } } }
    const s = lifeReact(before, after, { type: 'SYNTHESIZE', mode: 'salvage', survivorId: null, sacrificeIds: [a.id] }, 0)
    const rival = s.heroes[b.id]!
    expect(rival.life!.grief).toBeGreaterThanOrEqual(GRIEF.guilt)
    expect(rival.life!.memories.some((m) => m.kind === 'guilt' && m.other === a.id)).toBe(true)
    expect(s.life.chronicle.some((e) => e.kind === 'guilt' && e.heroIds[0] === b.id && e.heroIds[1] === a.id)).toBe(true)
  })

  it('a week after a death, the friends left behind remember', () => {
    const s0 = stepLife(roster(62), DAY / 2)
    const [a, b] = living(s0) as [OwnedHero, OwnedHero]
    const friends: GameState = { ...s0, life: { ...s0.life, relations: { ...s0.life.relations, [relationKey(a.id, b.id)]: { affinity: 70, shared: 3 } } } }
    const dead = { ...friends, heroes: { ...friends.heroes, [a.id]: { ...a, alive: false } } }
    const s = lifeReact(friends, dead, { type: 'SYNTHESIZE', mode: 'salvage', survivorId: null, sacrificeIds: [a.id] }, DAY / 2)
    const grave = s.life.memorial.find((g) => g.heroId === a.id)!
    expect(grave.mourners).toContain(b.id)
    // Just before the week is out, then just after.
    const eve = stepLife(s, (grave.day + 7) * DAY - SLOT)
    const after = stepLife(eve, (grave.day + 7) * DAY + SLOT)
    expect(after.heroes[b.id]!.life!.memories.some((m) => m.kind === 'anniversary' && m.other === a.id)).toBe(true)
    const line = after.life.chronicle.find((e) => e.kind === 'anniversary')!
    expect(line.heroIds).toEqual([a.id, b.id])
    expect(line.detail).toBe('1')
    expect(after.heroes[b.id]!.life!.grief).toBeGreaterThan(eve.heroes[b.id]!.life!.grief)
  })

  it('a friend’s company eases grief faster than solitude', () => {
    const s0 = stepLife(roster(63, 6), DAY / 2)
    const hs = living(s0)
    const g = hs[0]!
    // Everyone a close friend of the griever vs. strangers to them.
    const rel: GameState['life']['relations'] = {}
    for (const o of hs.slice(1)) rel[relationKey(g.id, o.id)] = { affinity: 70, shared: 2 }
    const grieving = { ...g, life: { ...g.life!, grief: 80 } }
    const withFriends: GameState = { ...s0, heroes: { ...s0.heroes, [g.id]: grieving }, life: { ...s0.life, relations: rel } }
    const alone: GameState = { ...withFriends, life: { ...withFriends.life, relations: {} } }
    const a = stepLife(withFriends, 2 * DAY).heroes[g.id]!.life!.grief
    const b = stepLife(alone, 2 * DAY).heroes[g.id]!.life!.grief
    expect(a).toBeLessThan(b)
  })
})

describe('the Gazette (lane L)', () => {
  it('gathers the chronicle by section, with a front page and the outlook', () => {
    const s0 = stepLife(roster(71), DAY)
    const [a, b] = living(s0) as [OwnedHero, OwnedHero]
    const at = s0.meta.lastSeenAtWorld
    const s: GameState = {
      ...s0,
      life: {
        ...s0.life,
        letterReadAt: 0,
        chronicle: [
          { at: at + 1, kind: 'friends', heroIds: [a.id, b.id] },
          { at: at + 2, kind: 'jobTier', heroIds: [a.id], detail: 'cook:1' },
          { at: at + 3, kind: 'death', heroIds: [b.id], floor: 12, detail: 'battle' },
          { at: at + 4, kind: 'incident', heroIds: [a.id, b.id], detail: 'sworn' },
          { at: at + 5, kind: 'incident', heroIds: [a.id], detail: 'fire' },
          { at: at + 6, kind: 'consoled', heroIds: [a.id, b.id] },
        ],
        incidents: [{ id: 'i1', kind: 'homesick', heroIds: [a.id], at, untilSlot: s0.life.slot + 5 }],
      },
    }
    const g = gazette(s, 0)
    expect(g.headline?.kind).toBe('death')
    expect(g.sections.map((x) => x.key)).toEqual(['fallen', 'grief', 'incidents', 'hearts', 'work'])
    expect(g.sections.find((x) => x.key === 'hearts')!.entries.map((e) => e.kind)).toEqual(['friends', 'incident'])
    expect(g.masterXp).toBe(TUNING.lobby.master.xpPerJobTier)
    expect(g.pending).toHaveLength(1)
    expect(g.total).toBe(6)
    expect(Object.values(g.outlook.counts).reduce((x, y) => x + y, 0)).toBe(living(s).length)
    // Only what happened after `since`.
    expect(gazette(s, at + 3).total).toBe(3)
    expect(sectionOf({ at: 0, kind: 'incident', heroIds: [], detail: 'brawl:worse:yard' })).toBe('incidents')
  })
})
