/**
 * Lane Q · PvP on stage: invasions keep their battle for a replay, raids and counter-raids
 * take a hand-picked team, the guild raid names each guildmate's share, the server war
 * returns its three battles. Deterministic, refused cleanly, and nothing the sim reads moves.
 */
import { describe, it, expect } from 'vitest'
import {
  counterRaid,
  counterRaidRefusal,
  guildRaid,
  guildmates,
  joinGuild,
  mateShares,
  pvpReplayLog,
  raidRefusal,
  raidRival,
  raidTargets,
  resolveInvasions,
  serverWar,
  teamRefusal,
  teamSlots,
  worldWeek,
} from './index'
import { PVP_STAGE } from './tuning'
import { createAccount } from '../account'
import { reduce, raidWithResult, counterRaidWithResult } from '../store'
import { toWorldTime } from '../time'
import type { GameState, HeroId, OwnedHero } from '../types'

const DAY = 24 * 3_600_000

function account(level = 60, n = 6, seed = 31): { state: GameState; ids: HeroId[] } {
  const acct = createAccount(seed)
  const base = Object.values(acct.heroes)[0]!
  const heroes: Record<string, OwnedHero> = {}
  const ids: HeroId[] = []
  for (let i = 0; i < n; i++) {
    const id = `h_q${i}` as HeroId
    ids.push(id)
    heroes[id] = {
      ...base,
      id,
      name: `Holder ${i}`,
      star: 5,
      heroClass: i % 2 ? 'mage' : 'warrior',
      xp: { level, xpIntoLevel: 0, heldXp: 0, atCap: false },
      baseAttrs: { str: 60, agi: 60, vit: 60, int: 60, wil: 60 },
      growthGrades: { str: 8, agi: 8, vit: 8, int: 8, wil: 8 },
    }
  }
  return {
    ids,
    state: {
      ...acct,
      gold: 100_000,
      gems: 5_000,
      heroes,
      party: { ...acct.party, slots: [ids[0]!, ids[1]!, ids[2]!, null, null] },
      meta: { ...acct.meta, crackOpen: true, pi: 300, lastSeenAtWorld: 0 },
      tower: { ...acct.tower, highestCleared: 45, currentFloor: 46 },
      pvp: { ...acct.pvp, lastInvasionDay: 0 },
    },
  }
}

/** Roll days until invasions have landed; `weak` makes the defense fall. */
function invaded(weak: boolean, level = 60) {
  const { state, ids } = account(level, 3)
  const s0: GameState = weak
    ? {
        ...state,
        heroes: Object.fromEntries(ids.map((id) => [id, { ...state.heroes[id]!, baseAttrs: { str: 1, agi: 1, vit: 1, int: 1, wil: 1 }, growthGrades: { str: 0, agi: 0, vit: 0, int: 0, wil: 0 } }])),
      }
    : state
  for (let d = 1; d <= 40; d++) {
    const s = resolveInvasions(s0, d * DAY)
    if (s.pvp.log.some((r) => r.direction === 'in')) return { before: s0, after: s, ids }
  }
  throw new Error('no invasion landed')
}

describe('invasions on stage', () => {
  it('an invasion keeps its battle, and the replay plays out exactly as it was resolved', () => {
    for (const weak of [true, false]) {
      const { after } = invaded(weak)
      const rec = after.pvp.log.find((r) => r.direction === 'in')!
      expect(rec.replay, `weak=${weak}`).toBeDefined()
      expect(rec.rivalId).toMatch(/^r\d+_\d+$/)
      expect(rec.guildId).toBeTruthy()
      const log = pvpReplayLog(rec.replay!)
      expect(log.outcome === 'win', `weak=${weak}`).toBe(rec.won)
      // The defenders are the Master's heroes; the replay is the same twice.
      expect(log.unitsInit.filter((u) => u.side === 'hero').every((u) => u.id.length > 0)).toBe(true)
      expect(JSON.stringify(pvpReplayLog(rec.replay!))).toBe(JSON.stringify(log))
    }
  })

  it('a fallen defender in the replay is the hero the raiders carried off', () => {
    const { after, ids } = invaded(true)
    const rec = after.pvp.log.find((r) => r.direction === 'in' && !r.won)!
    const log = pvpReplayLog(rec.replay!)
    const fallen = new Set(log.events.filter((e) => e.kind === 'death').map((e) => (e as { unitId: string }).unitId))
    const taken = ids.filter((id) => after.heroes[id]!.captiveOf)
    expect(taken.length).toBeGreaterThan(0)
    const heroIds = log.unitsInit.filter((u) => u.side === 'hero' && fallen.has(u.id)).length
    expect(heroIds).toBeGreaterThanOrEqual(taken.length)
  })

  it('only the newest few log lines keep their replay', () => {
    const { state } = account(60, 3)
    let s: GameState = state
    // The same defenders stand every day (nobody stays carried off), so every invasion is fought.
    for (let d = 1; d <= 60; d++) s = resolveInvasions({ ...s, heroes: state.heroes, pvp: { ...s.pvp, shieldUntil: 0 } }, d * DAY)
    const withReplay = s.pvp.log.filter((r) => r.replay)
    expect(s.pvp.log.filter((r) => r.direction === 'in').length).toBeGreaterThan(PVP_STAGE.replaysKept)
    expect(withReplay.length).toBe(PVP_STAGE.replaysKept)
    // …and they are the newest.
    const firstWithout = s.pvp.log.findIndex((r) => r.direction === 'in' && !r.replay)
    expect(firstWithout).toBeGreaterThan(s.pvp.log.indexOf(withReplay.at(-1)!))
  })
})

describe('a hand-picked raiding team', () => {
  it('teamSlots puts the picked heroes on the party line, or their class line', () => {
    const { state, ids } = account()
    expect(teamSlots(state).slots).toEqual(state.party.slots)
    const t = teamSlots(state, [ids[4]!, ids[0]!])
    expect(t.slots).toEqual([ids[4], ids[0], null, null, null])
    expect(t.lines[0]).toBe('front') // a warrior off the board
    expect(t.lines[1]).toBe(state.party.lines[0]) // on the board: their party line
    expect(teamSlots(state, [ids[3]!]).lines[0]).toBe('back') // a mage off the board
  })

  it('refuses an empty, oversized, repeated or unfit team', () => {
    const { state, ids } = account()
    expect(teamRefusal(state)).toBeNull()
    expect(teamRefusal(state, [])).toMatch(/at least one/)
    expect(teamRefusal(state, ids)).toMatch(/at most five/)
    expect(teamRefusal(state, [ids[0]!, ids[0]!])).toMatch(/only go once/)
    const tired = { ...state, heroes: { ...state.heroes, [ids[5]!]: { ...state.heroes[ids[5]!]!, sanity: 0 } } }
    expect(teamRefusal(tired, [ids[5]!])).toMatch(/cannot go/)
    const target = raidTargets(state, worldWeek(10 * DAY))[0]!
    expect(raidRefusal(state, target.id, 10 * DAY, [])).toMatch(/at least one/)
    expect(() => raidRival(state, target.id, 10 * DAY, [ids[0]!, ids[0]!])).toThrow(/^raidRival: A hero can only go once/)
  })

  it('only the team goes (and pays the Sanity); deterministic; reduce agrees with the helper', () => {
    const { state, ids } = account()
    const target = raidTargets(state, worldWeek(10 * DAY))[0]!
    const team = [ids[3]!, ids[4]!]
    const a = raidRival(state, target.id, 10 * DAY, team)
    const b = raidRival(state, target.id, 10 * DAY, team)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    const heroSide = a.outcome.log.unitsInit.filter((u) => u.side === 'hero').map((u) => u.id)
    expect(heroSide).toHaveLength(2)
    expect(a.state.heroes[ids[3]!]!.sanity).toBeLessThan(state.heroes[ids[3]!]!.sanity)
    expect(a.state.heroes[ids[0]!]!.sanity).toBe(state.heroes[ids[0]!]!.sanity)
    expect(a.state.pvp.log[0]!.rivalId).toBe(target.id)
    // Through the store: the dispatch and the *WithResult helper agree.
    const now = 40 * DAY
    const nowWorld = toWorldTime(now)
    const tg = raidTargets(state, worldWeek(nowWorld))[0]!
    const viaHelper = raidWithResult(state, tg.id, now, team)
    const viaReduce = reduce(state, { type: 'RAID_RIVAL', rivalId: tg.id, heroIds: team }, nowWorld)
    expect(viaReduce.gold).toBe(viaHelper.state.gold)
    expect(viaReduce.pvp.rating).toBe(viaHelper.state.pvp.rating)
    // Without heroIds the party goes, as before.
    const party = raidRival(state, target.id, 10 * DAY)
    expect(party.outcome.log.unitsInit.filter((u) => u.side === 'hero')).toHaveLength(3)
  })

  it('a counter-raid takes a team too, and returns its battle and captor', () => {
    const { after, ids } = invaded(true)
    const held = ids.find((id) => after.heroes[id]!.captiveOf)!
    const strong = createAccount(99)
    const champ: OwnedHero = {
      ...Object.values(strong.heroes)[0]!,
      id: 'h_champ' as HeroId,
      star: 7,
      xp: { level: 150, xpIntoLevel: 0, heldXp: 0, atCap: false },
      baseAttrs: { str: 900, agi: 900, vit: 900, int: 900, wil: 900 },
      growthGrades: { str: 10, agi: 10, vit: 10, int: 10, wil: 10 },
    }
    const s = { ...after, heroes: { ...after.heroes, [champ.id]: champ } }
    expect(counterRaidRefusal(s, held, [held])).toMatch(/cannot go/)
    expect(counterRaidRefusal(s, champ.id)).toMatch(/not held/)
    expect(counterRaidRefusal({ ...s, meta: { ...s.meta, crackOpen: false } }, held)).toMatch(/closed/)
    const r = counterRaid(s, held, 45 * DAY, [champ.id])
    expect(r.won).toBe(true)
    expect(r.log.unitsInit.filter((u) => u.side === 'hero').map((u) => u.id)).toEqual(['h_champ'])
    expect(r.captor.name).toBe(after.heroes[held]!.captiveOf!.master)
    expect(r.state.heroes[held]!.captiveOf).toBeNull()
    const again = counterRaidWithResult(s, held, 0, [champ.id])
    expect(again.won).toBe(true)
  })
})

describe('the guild raid and the server war, on stage', () => {
  it('names each guildmate and splits their damage exactly, deterministically', () => {
    const { state } = account(60, 3)
    const g = joinGuild(state, 'morning_star')
    const mates = guildmates(g)
    expect(mates.length).toBe(PVP_STAGE.guildmates)
    expect(new Set(mates.map((m) => m.name)).size).toBe(mates.length)
    const shares = mateShares(g, 7, 123_457)
    expect(shares.reduce((n, s) => n + s.dealt, 0)).toBe(123_457)
    expect(shares.map((s) => s.dealt)).toEqual([...shares.map((s) => s.dealt)].sort((a, b) => b - a))
    expect(mateShares(g, 7, 123_457)).toEqual(shares)
    expect(mateShares(g, 8, 123_457)).not.toEqual(shares)
    expect(guildmates(state)).toEqual([])
  })

  it('the raid outcome carries the battle and the roster; the roster adds up to the mates', () => {
    const { state } = account(60, 3)
    const g = joinGuild(state, 'morning_star')
    const r = guildRaid(g, 10 * DAY)
    expect(r.outcome.roster.reduce((n, s) => n + s.dealt, 0)).toBe(r.outcome.mates)
    expect(r.outcome.log.unitsInit.some((u) => u.templateId === 'fragment_colossus')).toBe(true)
    expect(JSON.stringify(guildRaid(g, 10 * DAY).outcome)).toBe(JSON.stringify(r.outcome))
    expect(() => guildRaid(r.state, 10 * DAY)).toThrow(/^guildRaid: /)
  })

  it('the server war returns its three battles, and the wins are the battles won', () => {
    const { state } = account(60, 3)
    const g = joinGuild(state, 'morning_star')
    const w = serverWar(g, 10 * DAY)
    expect(w.battles).toHaveLength(3)
    expect(w.battles.filter((b) => b.won).length).toBe(w.wins)
    expect(w.enemyGuildId).not.toBe('morning_star')
    expect(w.battles.map((b) => b.log.outcome === 'win')).toEqual(w.battles.map((b) => b.won))
  })
})
