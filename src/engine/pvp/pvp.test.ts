import { describe, it, expect } from 'vitest'
import {
  sectorOf,
  sectorRivals,
  raidTargets,
  sectorRank,
  serverRank,
  raidRival,
  raidRefusal,
  releaseCaptive,
  synthesizeCaptive,
  resolveInvasions,
  ransomHero,
  counterRaid,
  worldWeek,
  joinGuild,
  joinRefusal,
  claimGuildAid,
  guildRaid,
  serverWar,
  setDefense,
  GUILDS,
} from './index'
import { createAccount } from '../account'
import { advanceTime } from '../time'
import { reduce } from '../store'
import { playFloor, deployReport } from '../tower'
import { TUNING } from '../tuning'
import type { Captive, GameState, HeroId, OwnedHero } from '../types'

const P = TUNING.pvp
const DAY = 24 * 3_600_000

/** An account with the crack open and a strong party of `n` heroes at `level`. */
function pvpReadyAccount(level = 60, n = 3, seed = 21): { state: GameState; ids: HeroId[] } {
  const acct = createAccount(seed)
  const base = Object.values(acct.heroes)[0]!
  const heroes: Record<string, OwnedHero> = {}
  const ids: HeroId[] = []
  for (let i = 0; i < n; i++) {
    const id = `h_pvp${i}` as HeroId
    ids.push(id)
    heroes[id] = {
      ...base,
      id,
      name: `Defender ${i}`,
      star: 5,
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
      heroes,
      party: { ...acct.party, slots: [...ids, ...Array(5 - n).fill(null)] },
      meta: { ...acct.meta, crackOpen: true, pi: 300 },
      tower: { ...acct.tower, highestCleared: 45, currentFloor: 46 },
    },
  }
}

describe('sectors and rank', () => {
  it('buckets Masters by 10 floors and re-buckets on crossing a line', () => {
    const { state } = pvpReadyAccount()
    expect(sectorOf(state)).toBe(5)
    const a = sectorRivals(state)
    expect(a).toHaveLength(P.sectorSize - 1)
    expect(sectorRivals(state)).toEqual(a)
    const moved = { ...state, tower: { ...state.tower, highestCleared: 55 } }
    expect(sectorRivals(moved)[0]!.id).not.toBe(a[0]!.id)
    for (const r of a) expect(r.floor).toBeGreaterThanOrEqual(40)
  })

  it('rotates weekly raid targets and ranks by rating; F80+ is the top-5 tier', () => {
    const { state } = pvpReadyAccount()
    expect(raidTargets(state, 3)).toHaveLength(P.targetsPerWeek)
    expect(raidTargets(state, 3)).not.toEqual(raidTargets(state, 4))
    const better = { ...state, pvp: { ...state.pvp, rating: 5000 } }
    expect(sectorRank(better)).toBe(1)
    expect(serverRank({ ...state, tower: { ...state.tower, highestCleared: 82 } })).toBeLessThanOrEqual(5)
    expect(serverRank(state)).toBeGreaterThan(5)
  })
})

describe('outgoing raids', () => {
  it('need the crack open, a target in reach and a party; one raid per rival per week', () => {
    const { state } = pvpReadyAccount()
    const week = worldWeek(10 * DAY)
    const target = raidTargets(state, week)[0]!
    expect(raidRefusal({ ...state, meta: { ...state.meta, crackOpen: false } }, target.id, 10 * DAY)).toMatch(/closed/)
    expect(raidRefusal(state, 'r_nobody', 10 * DAY)).toMatch(/not in reach/)
    const after = raidRival(state, target.id, 10 * DAY).state
    expect(raidRefusal(after, target.id, 10 * DAY)).toMatch(/already/)
  })

  it('are non-lethal: a win loots the storeroom, raiders only lose a little Sanity', () => {
    const { state, ids } = pvpReadyAccount(90, 5)
    const week = worldWeek(10 * DAY)
    let won = null
    for (const t of raidTargets(state, week)) {
      const r = raidRival(state, t.id, 10 * DAY)
      for (const id of ids) expect(r.state.heroes[id]!.alive).toBe(true)
      if (r.outcome.won && !won) won = r
    }
    expect(won).not.toBeNull()
    expect(won!.state.gold).toBe(state.gold + won!.outcome.gold)
    expect(won!.state.pvp.rating).toBe(state.pvp.rating + P.ratingWin)
    expect(won!.state.heroes[ids[0]!]!.sanity).toBe(state.heroes[ids[0]!]!.sanity - P.raidSanity)
  })

  it('captives can be ransomed back or synthesized into your hero (the dark path)', () => {
    const { state, ids } = pvpReadyAccount()
    const captive: Captive = {
      id: 'cap_x',
      name: 'Knight of Nox_42',
      star: 5,
      level: 70,
      element: 'dark',
      growthGrades: { str: 10, agi: 10, vit: 10, int: 10, wil: 10 },
      fromMaster: 'Nox_42',
      ransomGold: 5000,
      ransomGems: 50,
    }
    const held = { ...state, pvp: { ...state.pvp, captives: [captive] } }
    const released = releaseCaptive(held, 'cap_x')
    expect(released.gold).toBe(held.gold + 5000)
    expect(released.gems).toBe(held.gems + 50)
    expect(released.pvp.captives).toEqual([])
    const fed = synthesizeCaptive(held, 'cap_x', ids[0]!)
    expect(fed.heroes[ids[0]!]!.growthGrades.str).toBeGreaterThan(held.heroes[ids[0]!]!.growthGrades.str)
    expect(fed.heroes[ids[1]!]!.favor).toBeLessThan(held.heroes[ids[1]!]!.favor)
  })
})

describe('incoming invasions and the kidnap-chain', () => {
  /** Roll many days so an invasion lands; a hopeless defense so it falls. */
  function invadedWeakDefense(level: number) {
    const { state, ids } = pvpReadyAccount(level, 3)
    const weak: GameState = {
      ...state,
      heroes: Object.fromEntries(
        ids.map((id) => [id, { ...state.heroes[id]!, baseAttrs: { str: 1, agi: 1, vit: 1, int: 1, wil: 1 }, growthGrades: { str: 0, agi: 0, vit: 0, int: 0, wil: 0 } }]),
      ),
      meta: { ...state.meta, lastSeenAtWorld: 0 },
      pvp: { ...state.pvp, lastInvasionDay: 0 },
    }
    for (let d = 1; d <= 30; d++) {
      const s = resolveInvasions(weak, d * DAY)
      if (s.pvp.log.some((r) => r.direction === 'in' && !r.won)) return { before: weak, after: s, ids, day: d }
    }
    throw new Error('no invasion landed')
  }

  it('below Lv40 a fallen defender is scarred, never captured', () => {
    const { before, after, ids } = invadedWeakDefense(20)
    for (const id of ids) {
      expect(after.heroes[id]!.captiveOf).toBeNull()
      expect(after.heroes[id]!.alive).toBe(true)
    }
    expect(after.gold).toBeLessThan(before.gold)
    const g = (h: OwnedHero) => Object.values(h.growthGrades).reduce((a, b) => a + b, 0)
    expect(ids.some((id) => g(after.heroes[id]!) <= g(before.heroes[id]!))).toBe(true)
  })

  it('at Lv40+ the fallen are captured; ransom frees them; the deadline synthesizes them', () => {
    const { after, ids } = invadedWeakDefense(60)
    const taken = ids.filter((id) => after.heroes[id]!.captiveOf)
    expect(taken.length).toBeGreaterThan(0)
    const id = taken[0]!
    const hold = after.heroes[id]!.captiveOf!
    // Captives can't deploy.
    const heldOnly = { ...after, party: { ...after.party, slots: [id, null, null, null, null] } }
    expect(deployReport(heldOnly)[0]).toMatchObject({ heroId: id, fit: false, reason: 'captive' })
    expect(() => playFloor(heldOnly)).toThrow(/no one is fit to fight/)
    const rich = { ...after, gold: 1_000_000, gems: 10_000 }
    expect(ransomHero(rich, id).heroes[id]!.captiveOf).toBeNull()
    const lost = resolveInvasions({ ...after, meta: { ...after.meta, crackOpen: false } }, hold.deadlineWorld + 1)
    expect(lost.heroes[id]!.alive).toBe(false)
    expect(lost.pvp.log[0]!.note).toMatch(/synthesized/)
  })

  it('a counter-raid can free a captive; a shield blocks re-raids', () => {
    const { after, ids } = invadedWeakDefense(60)
    const id = ids.find((x) => after.heroes[x]!.captiveOf)!
    const strong = createAccount(99)
    const hero = Object.values(strong.heroes)[0]!
    const champ: OwnedHero = { ...hero, id: 'h_champ' as HeroId, star: 7, xp: { level: 150, xpIntoLevel: 0, heldXp: 0, atCap: false }, baseAttrs: { str: 900, agi: 900, vit: 900, int: 900, wil: 900 }, growthGrades: { str: 10, agi: 10, vit: 10, int: 10, wil: 10 } }
    const s = { ...after, heroes: { ...after.heroes, [champ.id]: champ }, party: { ...after.party, slots: [champ.id, null, null, null, null] } }
    const r = counterRaid(s, id, 40 * DAY)
    expect(r.won).toBe(true)
    expect(r.state.heroes[id]!.captiveOf).toBeNull()
    expect(after.pvp.shieldUntil).toBeGreaterThan(0)
  })

  it('a closed crack means no invasions at all', () => {
    const { state } = pvpReadyAccount()
    const closed = { ...state, meta: { ...state.meta, crackOpen: false } }
    expect(resolveInvasions(closed, 30 * DAY).pvp.log).toEqual([])
  })

  it('the defense roster is preset (5 slots, living only)', () => {
    const { state, ids } = pvpReadyAccount()
    expect(setDefense(state, [ids[0]!, null, null, null, null]).pvp.defense[0]).toBe(ids[0])
    expect(() => setDefense(state, [ids[0]!])).toThrow(/5 slots/)
  })
})

describe('guilds and server wars', () => {
  it('whale guilds only admit big spenders', () => {
    const { state } = pvpReadyAccount()
    const whale = GUILDS.find((g) => g.whale)!
    const plain = GUILDS.find((g) => !g.whale)!
    expect(joinRefusal(state, whale.id)).toMatch(/spent/)
    const rich = { ...state, meta: { ...state.meta, wallet: { spentUsd: 200, purchases: {} } } }
    expect(joinGuild(rich, whale.id).pvp.guild).toBe(whale.id)
    expect(joinGuild(state, plain.id).pvp.guild).toBe(plain.id)
  })

  it('aid is daily; the guild raid and the server war are weekly', () => {
    const { state } = pvpReadyAccount(90, 5)
    const s = joinGuild(state, 'morning_star')
    const aided = claimGuildAid(s, 2 * DAY)
    expect(aided.materials.promotionStone).toBe((s.materials.promotionStone ?? 0) + TUNING.guild.aidStones)
    expect(() => claimGuildAid(aided, 2 * DAY)).toThrow(/already/)
    const raid = guildRaid(aided, 2 * DAY)
    expect(raid.outcome.dealt).toBeGreaterThan(0)
    expect(() => guildRaid(raid.state, 3 * DAY)).toThrow(/already/)
    const war = serverWar(raid.state, 3 * DAY)
    expect(war.wins).toBeGreaterThanOrEqual(0)
    expect(war.state.pvp.war.wins + war.state.pvp.war.losses).toBe(1)
    expect(() => serverWar(war.state, 4 * DAY)).toThrow(/over/)
  })
})

describe('the account lifecycle and the terminus', () => {
  it('six months at zero PI deletes the account; only TICK still works', () => {
    const acct = createAccount(5)
    // A world that never had any PI isn't fading…
    expect(advanceTime(acct, TUNING.lifecycle.deleteMs * 2).meta.deleted).toBe(false)
    // …but one that had some, and let it fade to nothing, greys and is deleted.
    const faded = advanceTime({ ...acct, meta: { ...acct.meta, pi: 1.02 } }, 30 * DAY)
    expect(faded.meta.piZeroSince).not.toBeNull()
    const gone = advanceTime(faded, faded.meta.piZeroSince! + TUNING.lifecycle.deleteMs + 10)
    expect(gone.meta.deleted).toBe(true)
    expect(() => reduce(gone, { type: 'SUMMON' })).toThrow(/greyed/)
    expect(reduce(gone, { type: 'TICK' })).toBeDefined()
    const alive = advanceTime({ ...acct, meta: { ...acct.meta, pi: 50 } }, TUNING.lifecycle.deleteMs + 10)
    expect(alive.meta.deleted).toBe(false)
  })

  it('F90: subversion needs the truths, and a subverted clear saves the world', () => {
    const acct = createAccount(11)
    const id = Object.keys(acct.heroes)[0] as HeroId
    const god: OwnedHero = { ...acct.heroes[id]!, star: 7, heroClass: 'mage', element: 'light', xp: { level: 150, xpIntoLevel: 0, heldXp: 0, atCap: false }, baseAttrs: { str: 999, agi: 999, vit: 999, int: 999, wil: 999 }, growthGrades: { str: 10, agi: 10, vit: 10, int: 10, wil: 10 } }
    const s: GameState = { ...acct, heroes: { [id]: god }, tower: { ...acct.tower, currentFloor: 90, highestCleared: 89 } }
    expect(() => playFloor(s, undefined, undefined, true)).toThrow(/truths/)
    const wise = { ...s, tower: { ...s.tower, hiddenFound: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] } }
    const saved = playFloor(wise, undefined, undefined, true)
    expect(saved.result.worldSaved).toBe(true)
    expect(saved.result.worldEnded).toBe(false)
    expect(saved.state.tower.worldSaved).toBe(true)
    expect(playFloor(s).result.worldEnded).toBe(true)
  })
})

describe('invasion fairness', () => {
  it('an absent Master always gets the full ransom window, and opening the crack starts a shielded clock', () => {
    const acct = createAccount(21)
    const id = Object.keys(acct.heroes)[0] as HeroId
    const base = acct.heroes[id]!
    const heroes = { [id]: { ...base, xp: { level: 60, xpIntoLevel: 0, heldXp: 0, atCap: false }, baseAttrs: { str: 1, agi: 1, vit: 1, int: 1, wil: 1 }, growthGrades: { str: 0, agi: 0, vit: 0, int: 0, wil: 0 } } }
    const s: GameState = { ...acct, heroes, meta: { ...acct.meta, crackOpen: true }, pvp: { ...acct.pvp, lastInvasionDay: 0 } }
    const back = resolveInvasions(s, 7 * DAY)
    const held = Object.values(back.heroes).filter((h) => h.captiveOf)
    for (const h of held) expect(h.captiveOf!.deadlineWorld).toBeGreaterThanOrEqual(7 * DAY + TUNING.pvp.captiveMs)
    for (const h of Object.values(back.heroes)) expect(h.alive).toBe(true)
  })
})
