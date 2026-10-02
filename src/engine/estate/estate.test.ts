import { describe, it, expect } from 'vitest'
import { createAccount } from '../account'
import { attemptFloorWithResult, reduce } from '../store'
import { TUNING } from '../tuning'
import type { ChronicleEntry, FallenRecord, GameState, HeroId, OwnedHero } from '../types'
import { lifeOf, newHeroLife, relationKey } from '../life'
import { giftPreferences, GIFTS } from '../favor'
import { SKILLS } from '../content'
import {
  BOUNTIES,
  DECOR,
  DECOR_EFFECT,
  DUEL,
  STATUE,
  TRAUMA,
  TraumaBook,
  afterFloor,
  afterLoss,
  withdrawChance,
  attentionScores,
  bountyHaul,
  bountyRefusal,
  burnoutChance,
  buyDecor,
  decorCost,
  decorGoldLeft,
  decorRefusal,
  defaultEstate,
  duelBattle,
  duelRefusal,
  activityNudge,
  estateLifeMods,
  estateLive,
  estateOf,
  fatigueAt,
  favouriteOf,
  giftMeaningBonus,
  giftMeanings,
  hostDuel,
  isBurntOut,
  jealousyMap,
  markAttention,
  moraleAdjust,
  raiseStatue,
  refocusCost,
  refocusDrill,
  refocusRefusal,
  refusesDeploy,
  statueCost,
  statueRefusal,
  stepTrauma,
  talkToHero,
  withEstate,
} from '.'
import { buildCombatUnit } from '../unit'

const HOUR = 3_600_000
const DAY = TUNING.life.slotMs * TUNING.life.slotsPerDay

/** An account with `n` extra Normal pulls, at world-time 0. */
function roster(seed: number, n = 9): GameState {
  let st: GameState = { ...createAccount(seed), gold: TUNING.gacha.normalCostGold * n }
  for (let i = 0; i < n; i++) st = reduce(st, { type: 'SUMMON' })
  return st
}
function living(s: GameState): OwnedHero[] {
  return Object.values(s.heroes).filter((h) => h.alive)
}
function rich(s: GameState, gold = 10_000_000): GameState {
  return { ...s, gold }
}
/** Kill a hero the way the memorial records it. */
function bury(s: GameState, h: OwnedHero): GameState {
  const rec: FallenRecord = {
    heroId: h.id,
    name: h.name,
    star: h.star,
    level: h.xp.level,
    heroClass: h.heroClass,
    element: h.element,
    portraitToken: h.portraitToken,
    cause: 'battle',
    floor: 3,
    day: 0,
    daysServed: 0,
    bestFloor: 3,
    mourners: [],
  }
  return { ...s, heroes: { ...s.heroes, [h.id]: { ...h, alive: false } }, life: { ...s.life, memorial: [...s.life.memorial, rec] } }
}
function setTrauma(s: GameState, id: HeroId, patch: Partial<ReturnType<typeof estateOf>['trauma'][HeroId] & object>): GameState {
  const e = estateOf(s)
  const cur = e.trauma[id] ?? { fatigue: 0, foughtAt: 0, burnoutUntil: null, veteran: false, withdrawn: null, lowSince: null }
  return { ...s, estate: { ...e, trauma: { ...e.trauma, [id]: { ...cur, ...patch } } } }
}

describe('estate slice', () => {
  it('defaults are empty, and an early v11 slice is completed on read', () => {
    const d = defaultEstate()
    expect(d.bounties).toEqual([])
    expect(d.duels.total).toBe(0)
    const old = { ...createAccount(1), estate: { statues: [], decor: {} } } as unknown as GameState
    const full = withEstate(old)
    expect(full.estate.trauma).toEqual({})
    expect(full.estate.bountySeq).toBe(1)
    expect(withEstate(full)).toBe(full)
  })
})

describe('decorations', () => {
  it('cost climbs along the curve and stops at the top level', () => {
    expect(decorCost('rugs', 0)).toBe(DECOR.rugs!.base)
    expect(decorCost('rugs', 1)).toBe(Math.round(DECOR.rugs!.base * 2.2))
    expect(decorCost('rugs', 5)).toBeNull()
    expect(decorCost('nope', 0)).toBeNull()
  })

  it('BUY_DECOR pays and raises the level; refusals are explicit', () => {
    let s = rich(createAccount(2), 100_000)
    s = reduce(s, { type: 'BUY_DECOR', decor: 'rugs' })
    expect(s.estate.decor.rugs).toBe(1)
    expect(s.gold).toBe(100_000 - DECOR.rugs!.base)
    // The tavern is not built on a fresh account.
    expect(decorRefusal(s, 'hearth')).toMatch(/Build/)
    expect(() => reduce(s, { type: 'BUY_DECOR', decor: 'hearth' })).toThrow()
    expect(decorRefusal({ ...s, gold: 0 }, 'rugs')).toMatch(/gold/)
    for (let i = 0; i < 4; i++) s = buyDecor(rich(s), 'rugs')
    expect(decorRefusal(rich(s), 'rugs')).toMatch(/finest/)
  })

  it('the whole catalogue is a real gold sink (over a million to max)', () => {
    expect(decorGoldLeft(createAccount(3))).toBeGreaterThan(1_000_000)
  })

  it('rugs make sleep restore more, pennants make training richer', () => {
    const s0 = roster(4, 1)
    const h = living(s0)[0]!
    const s = { ...s0, estate: { ...estateOf(s0), decor: { rugs: 3, banners: 2 } } }
    const mods = estateLifeMods(s)
    expect(mods.trainMult).toBeCloseTo(1 + 2 * DECOR_EFFECT.bannersXp)
    const life = { ...newHeroLife(0), doing: { kind: 'sleep' as const, place: 'dormitory' as const, untilSlot: 0 } }
    const w = { hero: h, life, sanity: 50, xp: h.xp }
    const before = life.needs.energy
    estateLive(mods, w, 'sleep', true)
    expect(life.needs.energy - before).toBeCloseTo(3 * DECOR_EFFECT.rugsEnergy)
  })
})

describe('weather and mood in the activity choice', () => {
  it('storms keep heroes off the yard; the withdrawn skip company', () => {
    const s0 = roster(25, 1)
    const h = living(s0)[0]!
    const m = estateLifeMods(s0)
    expect(activityNudge(m, h.id, 'train', 'yard', 'storm')).toBeLessThan(activityNudge(m, h.id, 'train', 'yard', 'clear'))
    expect(activityNudge(m, h.id, 'read', 'library', 'storm')).toBe(0)
    const w = estateLifeMods(setTrauma(s0, h.id, { withdrawn: { since: 0, cause: null, comfort: 0, lastTalkDay: -1 } }))
    expect(activityNudge(w, h.id, 'socialize', 'tavern', 'clear')).toBeLessThan(activityNudge(m, h.id, 'socialize', 'tavern', 'clear'))
  })
})

describe('statues', () => {
  it('cost scales with the hero’s stars and level', () => {
    expect(statueCost({ star: 1, level: 10 })).toBe(STATUE.base + STATUE.perStar2 + 10 * STATUE.perLevel)
    expect(statueCost({ star: 5, level: 80 })).toBeGreaterThan(statueCost({ star: 3, level: 40 }))
  })

  it('only the fallen get one, once; mourners remember it and the withdrawn come back', () => {
    const s0 = roster(5, 4)
    const [a, b] = living(s0)
    expect(statueRefusal(rich(s0), a!.id)).toMatch(/fallen/)
    let s = bury(rich(s0), a!)
    // b was a friend, lost a, and withdrew over it.
    const lb = { ...lifeOf(s.heroes[b!.id]!), memories: [...lifeOf(s.heroes[b!.id]!).memories, { kind: 'friendDied' as const, day: 0, other: a!.id, weight: 90 }] }
    s = { ...s, heroes: { ...s.heroes, [b!.id]: { ...s.heroes[b!.id]!, life: lb } } }
    s = setTrauma(s, b!.id, { withdrawn: { since: 0, cause: a!.id, comfort: 0, lastTalkDay: -1 } })
    const gold = s.gold
    const after = raiseStatue(s, a!.id, 0)
    expect(after.estate.statues).toEqual([a!.id])
    expect(after.gold).toBe(gold - statueCost({ star: a!.star, level: a!.xp.level }))
    expect(after.estate.trauma[b!.id]?.withdrawn ?? null).toBeNull()
    expect(lifeOf(after.heroes[b!.id]!).memories.some((m) => m.kind === 'statue' && m.other === a!.id)).toBe(true)
    expect(after.life.chronicle.some((e) => e.kind === 'statue')).toBe(true)
    expect(statueRefusal(after, a!.id)).toMatch(/already/)
  })

  it('a statue calms visitors at the Memorial and speeds a mourner’s grief', () => {
    const s0 = roster(6, 2)
    const [a, b] = living(s0)
    const s = { ...bury(s0, a!), estate: { ...estateOf(s0), statues: [a!.id] } }
    const mods = estateLifeMods(s)
    const life = {
      ...newHeroLife(0),
      grief: 40,
      doing: { kind: 'mourn' as const, place: 'memorial' as const, untilSlot: 0 },
      memories: [{ kind: 'friendDied' as const, day: 0, other: a!.id, weight: 90 }],
    }
    const w = { hero: b!, life, sanity: 40, xp: b!.xp }
    estateLive(mods, w, 'mourn', false)
    expect(w.sanity).toBeCloseTo(40 + STATUE.memorialSanity)
    expect(life.grief).toBeCloseTo(40 - STATUE.griefDecay)
  })
})

describe('bounty board', () => {
  it('sends bench heroes (never the party), pays gold, and they come back with materials', () => {
    const s0 = rich(roster(7, 6), 50_000)
    const party = new Set(s0.party.slots.filter(Boolean))
    const bench = living(s0).filter((h) => !party.has(h.id))
    const inParty = living(s0).find((h) => party.has(h.id))!
    expect(bountyRefusal(s0, 'forage', [inParty.id])).toMatch(/party/)
    expect(bountyRefusal(s0, 'patrol', [bench[0]!.id, bench[1]!.id])).toMatch(/floor/)
    expect(bountyRefusal(s0, 'forage', [bench[0]!.id, bench[1]!.id])).toMatch(/needs 1/)
    const hero = bench[0]!
    let s = reduce(s0, { type: 'POST_BOUNTY', bounty: 'forage', heroIds: [hero.id] })
    expect(s.gold).toBe(50_000 - BOUNTIES.forage!.gold)
    expect(s.estate.bounties).toHaveLength(1)
    expect(refusesDeploy(s, hero.id)).toBe(true)
    expect(bountyRefusal(s, 'forage', [hero.id])).toMatch(/already/)
    const haul = bountyHaul(s, s.estate.bounties[0]!)
    expect(bountyHaul(s, s.estate.bounties[0]!)).toEqual(haul)
    const stones = s.materials.promotionStone ?? 0
    // Away during the job (the life sim keeps them offsite), home after.
    s = reduce(s, { type: 'TICK' }, 2 * HOUR)
    expect(lifeOf(s.heroes[hero.id]!).doing.kind).toBe('away')
    s = reduce(s, { type: 'TICK' }, BOUNTIES.forage!.ms + HOUR)
    expect(s.estate.bounties).toHaveLength(0)
    expect(s.estate.bountyLog[0]!.heroIds).toEqual([hero.id])
    expect((s.materials.promotionStone ?? 0) - stones).toBe(haul.materials.promotionStone)
    const xpOf = (h: OwnedHero) => h.xp.level * 1e9 + h.xp.xpIntoLevel + h.xp.heldXp
    expect(xpOf(s.heroes[hero.id]!)).toBeGreaterThan(xpOf(hero))
    expect(refusesDeploy(s, hero.id)).toBe(false)
    expect(s.life.chronicle.some((e) => e.kind === 'bounty')).toBe(true)
  })
})

describe('trauma: burnout', () => {
  it('fatigue builds per floor and recovers an hour at a time', () => {
    const s = roster(8, 1)
    const h = living(s)[0]!
    const book = new TraumaBook({})
    afterFloor(s, book, h.id, 0, 10 * HOUR, [])
    afterFloor(s, book, h.id, 1, 10 * HOUR, [])
    expect(fatigueAt(book.get(h.id), 10 * HOUR)).toBe(2)
    expect(fatigueAt(book.get(h.id), 11 * HOUR)).toBe(1)
    expect(fatigueAt(book.get(h.id), 20 * HOUR)).toBe(0)
  })

  it('no risk below the threshold; past it a hero can burn out, refuse the tower, and become a veteran', () => {
    const s0 = roster(9, 1)
    const h = living(s0)[0]!
    expect(burnoutChance(h, TRAUMA.burnAt - 1)).toBe(0)
    expect(burnoutChance(h, TRAUMA.burnAt + 3)).toBeGreaterThan(0)
    // Keep fighting until it happens (deterministic per attempt index).
    let burnt: GameState | null = null
    for (let attempt = 0; attempt < 60 && !burnt; attempt++) {
      const s = setTrauma(s0, h.id, { fatigue: TRAUMA.burnAt + 4, foughtAt: 5 * HOUR })
      const book = new TraumaBook(s.estate.trauma)
      afterFloor(s, book, h.id, attempt, 5 * HOUR, [])
      if (book.get(h.id).burnoutUntil) burnt = { ...s, estate: { ...s.estate, trauma: book.map }, meta: { ...s.meta, lastSeenAtWorld: 5 * HOUR } }
    }
    expect(burnt).not.toBeNull()
    expect(isBurntOut(burnt!, h.id)).toBe(true)
    expect(refusesDeploy(burnt!, h.id)).toBe(true)
    expect(burnt!.estate.trauma[h.id]!.veteran).toBe(true)
    expect(estateLifeMods(burnt!).veterans.has(h.id)).toBe(true)
    // A day later it has passed.
    const later = stepTrauma(burnt!, 5 * HOUR + TRAUMA.burnoutMs + 1)
    expect(isBurntOut(later, h.id, 5 * HOUR + TRAUMA.burnoutMs + 1)).toBe(false)
    expect(later.estate.trauma[h.id]!.veteran).toBe(true)
  })

  it('a burnt-out hero in the party is refused at the tower (with the true reason)', () => {
    const s0 = roster(10, 1)
    const [h, other] = living(s0)
    const party = { slots: [h!.id, other!.id, null, null, null], lines: s0.party.lines }
    const s = setTrauma({ ...s0, party }, h!.id, { burnoutUntil: 1e15 })
    const { result } = attemptFloorWithResult(s)
    expect(result.refusedHeroIds).toContain(h!.id)
    expect(result.refusals).toContainEqual({ heroId: h!.id, reason: 'burnout' })
    expect(result.result.log.unitsInit.some((u) => u.id === h!.id)).toBe(false)
  })

  it('a party of nobody but the burnt out cannot enter at all', () => {
    const s0 = roster(10, 0)
    const h = living(s0)[0]!
    const s = setTrauma(s0, h.id, { burnoutUntil: 1e15 })
    expect(() => attemptFloorWithResult(s)).toThrow(/no one is fit to fight/)
  })
})

describe('trauma: withdrawal', () => {
  it('long despair turns a hero inward', () => {
    const s0 = roster(11, 1)
    const h = living(s0)[0]!
    let s = { ...s0, heroes: { ...s0.heroes, [h.id]: { ...h, sanity: 10 } } }
    s = stepTrauma(s, HOUR)
    expect(s.estate.trauma[h.id]!.lowSince).toBe(HOUR)
    s = stepTrauma(s, HOUR + TRAUMA.despairMs)
    expect(s.estate.trauma[h.id]!.withdrawn).not.toBeNull()
    expect(s.life.chronicle.some((e) => e.kind === 'withdrawn')).toBe(true)
  })

  it('daily talks (one a day), a gift, or time bring them back', () => {
    const s0 = roster(12, 1)
    const h = living(s0)[0]!
    let s = setTrauma({ ...s0, meta: { ...s0.meta, lastSeenAtWorld: 0 } }, h.id, { withdrawn: { since: 0, cause: null, comfort: 0, lastTalkDay: -1 } })
    s = talkToHero(s, h.id, 1 * HOUR)
    expect(s.estate.trauma[h.id]!.withdrawn!.comfort).toBe(TRAUMA.talkComfort)
    // A second talk the same day adds nothing.
    expect(talkToHero(s, h.id, 2 * HOUR)).toBe(s)
    s = talkToHero(s, h.id, DAY + HOUR)
    s = talkToHero(s, h.id, 2 * DAY + HOUR)
    s = talkToHero(s, h.id, 3 * DAY + HOUR)
    expect(s.estate.trauma[h.id]?.withdrawn ?? null).toBeNull()
    expect(lifeOf(s.heroes[h.id]!).memories.some((m) => m.kind === 'comforted')).toBe(true)
    expect(s.life.chronicle.some((e) => e.kind === 'recovered')).toBe(true)
  })

  it('a withdrawn hero skips company and fights a little worse', () => {
    const s0 = roster(13, 1)
    const h = living(s0)[0]!
    const s = setTrauma(s0, h.id, { withdrawn: { since: 0, cause: null, comfort: 0, lastTalkDay: -1 } })
    const unit = buildCombatUnit(h, 'front', SKILLS, s.inventory)
    const dulled = moraleAdjust(s, unit)
    expect(dulled.stats.pAtk).toBeLessThan(unit.stats.pAtk)
    expect(moraleAdjust(s0, unit)).toBe(unit)
    expect(estateLifeMods(s).withdrawn.has(h.id)).toBe(true)
  })

  it('a close friend’s death may withdraw the survivor (deterministically)', () => {
    const s0 = roster(14, 12)
    const [dead, ...rest] = living(s0)
    const rel = { ...s0.life.relations }
    for (const o of rest) rel[relationKey(dead!.id, o.id)] = { affinity: 80, shared: 3 }
    const s = { ...s0, life: { ...s0.life, relations: rel } }
    const killed = { ...s, heroes: { ...s.heroes, [dead!.id]: { ...dead!, alive: false } } }
    const run = () => {
      const b = new TraumaBook({})
      const chronicle: ChronicleEntry[] = []
      for (const o of rest) afterLoss(killed, b, o.id, dead!.id, 0, chronicle)
      return { ids: Object.keys(b.map).sort(), chronicle }
    }
    const first = run()
    expect(run()).toEqual(first)
    // With a dozen close friends grieving, someone withdraws.
    expect(first.ids.length).toBeGreaterThan(0)
    expect(first.chronicle.every((e) => e.kind === 'withdrawn' && e.heroIds[1] === dead!.id)).toBe(true)
    for (const o of rest) expect(withdrawChance(o)).toBeGreaterThan(0)
  })
})

describe('favoritism', () => {
  it('attention over a rolling window names a favourite', () => {
    const s0 = roster(15, 5)
    const [fav, other] = living(s0)
    let marks = markAttention([], fav!.id, 10, 2)
    marks = markAttention(marks, fav!.id, 10, 2)
    marks = markAttention(marks, fav!.id, 11, 2)
    marks = markAttention(marks, other!.id, 11, 1)
    expect(attentionScores(marks, 11).get(fav!.id)).toBe(6)
    const s = { ...s0, estate: { ...estateOf(s0), attention: marks } }
    expect(favouriteOf(s, 11)).toBe(fav!.id)
    // Three days on, the window has moved past it.
    expect(favouriteOf(s, 14)).toBeNull()
  })

  it('envious, neglected heroes turn jealous; a day of it costs favor and warmth', () => {
    const s0 = roster(16, 20)
    const [fav] = living(s0)
    const marks = markAttention([], fav!.id, 10, 6)
    const s1 = { ...s0, estate: { ...estateOf(s0), attention: marks, clock: 10 * DAY + HOUR } }
    const jealous = jealousyMap(s1, 10)
    const ids = Object.keys(jealous) as HeroId[]
    expect(ids.length).toBeGreaterThan(0)
    expect(ids.every((id) => jealous[id] === fav!.id)).toBe(true)
    const j = ids[0]!
    const s2 = { ...s1, heroes: { ...s1.heroes, [j]: { ...s1.heroes[j]!, favor: 50 } } }
    const after = stepTrauma(s2, 11 * DAY + HOUR)
    // The favourite still leads on day 11 (the mark is inside the window).
    expect(after.estate.jealous[j]).toBe(fav!.id)
    expect(after.heroes[j]!.favor).toBeLessThan(50)
    expect(after.life.relations[relationKey(j, fav!.id)]!.affinity).toBeLessThan(0)
  })

  it('talks, gifts and deployments are all attention', () => {
    let s = rich(roster(17, 2))
    const h = living(s).find((x) => !s.party.slots.includes(x.id))!
    s = reduce(s, { type: 'TALK_TO_HERO', heroId: h.id })
    s = reduce(s, { type: 'GIVE_GIFT', heroId: h.id, giftId: 'honey_cake' })
    const today = Math.floor(s.meta.lastSeenAtWorld / DAY)
    expect(attentionScores(s.estate.attention, today).get(h.id)).toBe(3)
  })
})

describe('gift meaning drift', () => {
  it('a dead friend’s favourite comes to mean something — enough to beat a dislike', () => {
    const s0 = roster(18, 12)
    const heroes = living(s0)
    // Find a pair where the dead friend's favourite is the survivor's dislike.
    let pair: [OwnedHero, OwnedHero] | null = null
    for (const a of heroes) for (const b of heroes) if (a !== b && giftPreferences(b.id).liked === giftPreferences(a.id).disliked) pair = pair ?? [a, b]
    const [survivor, friend] = pair ?? [heroes[0]!, heroes[1]!]
    const life = { ...lifeOf(survivor), memories: [...lifeOf(survivor).memories, { kind: 'friendDied' as const, day: 0, other: friend.id, weight: 90 }] }
    const s: GameState = { ...s0, heroes: { ...s0.heroes, [survivor.id]: { ...survivor, life } } }
    const meanings = giftMeanings(s, survivor.id)
    const cat = giftPreferences(friend.id).liked
    expect(meanings[0]).toEqual({ category: cat, because: friend.id, weight: 2 })
    const gift = Object.values(GIFTS).find((g) => g.category === cat && g.gems === 0)!
    expect(giftMeaningBonus(s, s.heroes[survivor.id]!, gift.id)).toBeGreaterThan(0)
    // Through the reducer the gift lands warmer than it would have.
    const plain = reduce(rich(s0), { type: 'GIVE_GIFT', heroId: survivor.id, giftId: gift.id })
    const meant = reduce(rich(s), { type: 'GIVE_GIFT', heroId: survivor.id, giftId: gift.id })
    expect(meant.heroes[survivor.id]!.favor).toBeGreaterThan(plain.heroes[survivor.id]!.favor)
  })
})

describe('tryout duels', () => {
  it('validates the pair, the day’s limit and the purse', () => {
    const s = rich(roster(19, 3))
    const [a, b] = living(s)
    expect(duelRefusal(s, a!.id, a!.id)).toMatch(/themselves/)
    expect(duelRefusal({ ...s, gold: 0 }, a!.id, b!.id)).toMatch(/gold/)
    expect(duelRefusal(s, a!.id, b!.id)).toBeNull()
  })

  it('is fought with the real combat engine, replayably, and moves the pair’s feelings', () => {
    let s = rich(roster(20, 3))
    const [a, b] = living(s)
    s = reduce(s, { type: 'TICK' }, HOUR)
    const replay = duelBattle(s, a!.id, b!.id)
    const after = hostDuel(s, a!.id, b!.id, HOUR)
    const last = after.estate.duels.last!
    const expected = replay.outcome === 'win' ? a!.id : replay.outcome === 'wipe' ? b!.id : null
    expect(last.winner).toBe(expected)
    expect(after.gold).toBeLessThan(s.gold)
    expect(after.estate.duels.today).toBe(1)
    const rel = after.life.relations[relationKey(a!.id, b!.id)]!
    expect(rel.affinity).not.toBe(s.life.relations[relationKey(a!.id, b!.id)]?.affinity ?? 0)
    expect(lifeOf(after.heroes[a!.id]!).memories.some((m) => m.kind === 'duel' && m.other === b!.id)).toBe(true)
    expect(after.heroes[a!.id]!.sanity).toBeLessThanOrEqual(s.heroes[a!.id]!.sanity - DUEL.sanityCost + 0.01)
    // Nobody dies in a tryout.
    expect(after.heroes[a!.id]!.alive && after.heroes[b!.id]!.alive).toBe(true)
  })

  it('rivals come out respectful or bitter', () => {
    let s = rich(roster(21, 3))
    const [a, b] = living(s)
    s = { ...s, life: { ...s.life, relations: { ...s.life.relations, [relationKey(a!.id, b!.id)]: { affinity: -45, shared: 0 } } } }
    const after = hostDuel(s, a!.id, b!.id, 0)
    const mood = after.estate.duels.last!.mood
    expect(['respect', 'bitter']).toContain(mood)
    const aff = after.life.relations[relationKey(a!.id, b!.id)]!.affinity
    expect(aff).toBe(mood === 'respect' ? -45 + DUEL.respect : -45 + DUEL.bitter)
  })

  it('stops after the day’s tryouts', () => {
    let s = rich(roster(22, 4))
    const [a, b, c] = living(s)
    for (let i = 0; i < DUEL.perDay; i++) s = { ...hostDuel(s, a!.id, i % 2 ? b!.id : c!.id, 0), heroes: s.heroes }
    expect(duelRefusal(s, a!.id, b!.id)).toMatch(/tryouts/)
  })
})

describe('paid drill refocus', () => {
  it('redirects a running drill for gold, keeping its timer', () => {
    let s = rich(roster(23, 1))
    s = { ...s, facilities: { ...s.facilities, trainingCenter: { level: 1, build: null } } }
    const h = living(s)[0]!
    expect(refocusRefusal(s, h.id, 'basic_shield')).toMatch(/not drilling/)
    s = reduce(s, { type: 'TRAIN_SKILL', heroId: h.id, skillId: 'basic_swordsmanship' })
    const until = s.heroes[h.id]!.training!.completesAtWorld
    const gold = s.gold
    expect(refocusRefusal(s, h.id, 'basic_swordsmanship')).toMatch(/already/)
    s = refocusDrill(s, h.id, 'basic_shield')
    expect(s.heroes[h.id]!.training).toMatchObject({ skillId: 'basic_shield', completesAtWorld: until })
    expect(s.gold).toBe(gold - refocusCost('basic_shield', s.heroes[h.id]!.training!.mode))
  })
})

describe('determinism', () => {
  it('two identical estates advance identically', () => {
    const run = () => {
      let s = rich(roster(24, 6))
      const bench = living(s).filter((h) => !s.party.slots.includes(h.id))
      s = reduce(s, { type: 'POST_BOUNTY', bounty: 'forage', heroIds: [bench[0]!.id] })
      s = reduce(s, { type: 'BUY_DECOR', decor: 'fountain' })
      s = reduce(s, { type: 'HOST_DUEL', a: bench[1]!.id, b: bench[2]!.id })
      s = reduce(s, { type: 'TICK' }, 2 * DAY)
      return s
    }
    expect(run()).toEqual(run())
  })
})
