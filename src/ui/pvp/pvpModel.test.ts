import { describe, expect, it } from 'vitest'
import { createAccount } from '../../engine/account'
import { guildRaid, joinGuild, GUILDS, findRival } from '../../engine/pvp'
import { TUNING } from '../../engine/tuning'
import type { GameState, HeroId, InvasionRecord, OwnedHero } from '../../engine/types'
import {
  GUILD_LOOK,
  autoTeam,
  contributionRows,
  deadlineOf,
  guildLook,
  heldHeroes,
  invasionCard,
  invasionKey,
  pvpRefusal,
  raidCard,
  raidTotals,
  toggleTeam,
  unseenInvasions,
  worldTimeWords,
} from './pvpModel'
import { logNote } from './pvpText'
import { crestBanner, crestShield } from '../pixel/crests'

const DAY = 24 * 3_600_000

function account(n = 4): { s: GameState; ids: HeroId[] } {
  const acct = createAccount(77)
  const base = Object.values(acct.heroes)[0]!
  const heroes: Record<string, OwnedHero> = {}
  const ids: HeroId[] = []
  for (let i = 0; i < n; i++) {
    const id = `h_m${i}` as HeroId
    ids.push(id)
    heroes[id] = { ...base, id, name: `Member ${i}`, star: 4, xp: { level: 50 + i, xpIntoLevel: 0, heldXp: 0, atCap: false } }
  }
  return { ids, s: { ...acct, heroes, party: { ...acct.party, slots: [ids[0]!, null, null, null, null] }, tower: { ...acct.tower, highestCleared: 45 } } }
}

const rec = (over: Partial<InvasionRecord> = {}): InvasionRecord => ({ worldDay: 10, direction: 'in', rival: 'Wolf_12', won: false, goldDelta: -100, note: 'raided you and looted the storeroom', ...over })

describe('rival cards and guild banners', () => {
  it('every guild has a banner look; a lone raider gets the plain one', () => {
    for (const g of GUILDS) expect(GUILD_LOOK[g.id], g.id).toBeDefined()
    expect(guildLook(null).emblem).toBe('skull')
    expect(guildLook('nope').emblem).toBe('skull')
    expect(new Set(GUILDS.map((g) => GUILD_LOOK[g.id]!.emblem)).size).toBe(GUILDS.length)
  })

  it('crests are deterministic bitmaps for every guild, two folds that differ', () => {
    for (const g of [...GUILDS.map((x) => x.id), null]) {
      const a = crestBanner(guildLook(g), 0)
      expect(Array.from(a.px)).toEqual(Array.from(crestBanner(guildLook(g), 0).px))
      expect(Array.from(crestBanner(guildLook(g), 1).px).join()).not.toBe(Array.from(a.px).join())
      expect([crestShield(guildLook(g)).w, crestShield(guildLook(g)).h]).toEqual([14, 15])
    }
  })

  it('an invasion card names the raider, guild and whale; a raid card carries its line', () => {
    const c = invasionCard(rec({ guildId: 'unity' }))
    expect(c).toMatchObject({ kind: 'invasion', name: 'Wolf_12', guildId: 'unity', whale: true })
    const plain = invasionCard(rec({ guildId: 'morning_star' }))
    expect(plain.whale).toBe(false)
    expect(plain.line).toMatch(/crack/)
    const { s } = account()
    const rv = findRival(s, 'r5_0')!
    const k = raidCard(rv, 'counter', 'Aria')
    expect(k.kind).toBe('counter')
    expect(k.vars).toEqual({ name: 'Aria' })
    expect(raidCard(rv, 'raid').floor).toBe(rv.floor)
  })
})

describe('the invasions not yet watched', () => {
  it('keeps incoming battles with a replay the Master has not seen', () => {
    const replay = { seed: 1, floor: 40, heroes: [], foes: [] }
    const a = rec({ worldDay: 3, rivalId: 'r1_1', replay })
    const b = rec({ worldDay: 5, rivalId: 'r1_2', replay })
    const out = rec({ direction: 'out', replay })
    const old = rec({ worldDay: 1 })
    expect(unseenInvasions([b, a, out, old], new Set())).toEqual([b, a])
    expect(unseenInvasions([b, a], new Set([invasionKey(b)]))).toEqual([a])
    expect(invasionKey(a)).toBe('3|r1_1')
    expect(invasionKey(old)).toBe('1|Wolf_12')
  })
})

describe('held heroes and their clocks', () => {
  it('measures what is left of the hold, urgent under a day', () => {
    const w = TUNING.pvp.captiveMs
    expect(deadlineOf(1000 + w, 1000)).toEqual({ left: w, spent: 0, urgent: false })
    expect(deadlineOf(1000 + 5 * 3_600_000, 1000).urgent).toBe(true)
    expect(deadlineOf(500, 1000)).toMatchObject({ left: 0, spent: 1 })
    expect(worldTimeWords(0)).toEqual({ key: 'any moment' })
    expect(worldTimeWords(5 * 3_600_000)).toEqual({ key: '{n} world-h', n: 5 })
    expect(worldTimeWords(DAY + 1)).toEqual({ key: '1 world-day' })
    expect(worldTimeWords(3 * DAY)).toEqual({ key: '{n} world-days', n: 3 })
  })

  it('lists the held, the soonest lost first, with whether the ransom can be paid', () => {
    const { s, ids } = account()
    const hold = (dl: number, gold: number) => ({ master: 'Nox_1', rivalId: 'r5_1', ransomGold: gold, ransomGems: 5, deadlineWorld: dl })
    const t: GameState = {
      ...s,
      gold: 1000,
      gems: 10,
      heroes: { ...s.heroes, [ids[1]!]: { ...s.heroes[ids[1]!]!, captiveOf: hold(9 * DAY, 500) }, [ids[2]!]: { ...s.heroes[ids[2]!]!, captiveOf: hold(2 * DAY, 5000) } },
    }
    const rows = heldHeroes(t, DAY)
    expect(rows.map((r) => r.hero.id)).toEqual([ids[2], ids[1]])
    expect(rows.map((r) => r.canPay)).toEqual([false, true])
    expect(pvpRefusal(t, t.heroes[ids[1]!]!)).toBe('Held by a rival Master.')
    expect(pvpRefusal(t, t.heroes[ids[0]!]!)).toBeNull()
  })
})

describe('the team of a raid', () => {
  it('starts from the fit party (or the strongest fit), and toggles within five', () => {
    const { s, ids } = account()
    expect(autoTeam(s, 5, () => 1)).toEqual([ids[0]])
    const noParty = { ...s, party: { ...s.party, slots: [null, null, null, null, null] } }
    expect(autoTeam(noParty, 2, (h) => h.xp.level)).toEqual([ids[3], ids[2]])
    expect(toggleTeam([ids[0]!], ids[1]!, 2)).toEqual([ids[0], ids[1]])
    expect(toggleTeam([ids[0]!, ids[1]!], ids[2]!, 2)).toEqual([ids[0], ids[1]])
    expect(toggleTeam([ids[0]!, ids[1]!], ids[0]!, 2)).toEqual([ids[1]])
  })
})

describe('the guild raid board', () => {
  it('lists each hero and each guildmate; the heroes add up to what the party dealt', () => {
    const { s } = account()
    const g = joinGuild({ ...s, meta: { ...s.meta, crackOpen: true } }, 'morning_star')
    const o = guildRaid(g, 10 * DAY).outcome
    const rows = contributionRows(o.log, o.roster, o.bossHp)
    expect(rows.filter((r) => r.kind === 'hero').reduce((n, r) => n + r.dealt, 0)).toBe(o.dealt)
    expect(rows.filter((r) => r.kind === 'mate')).toHaveLength(o.roster.length)
    expect(rows.map((r) => r.dealt)).toEqual([...rows.map((r) => r.dealt)].sort((a, b) => b - a))
    const tot = raidTotals(o.dealt, o.mates, o.bossHp)
    expect(tot.party + tot.mates + tot.left).toBeCloseTo(1, 6)
    expect(raidTotals(90, 50, 100)).toEqual({ party: 0.9, mates: 0.09999999999999998, left: 0 })
  })
})

describe('log words', () => {
  it('renders the engine notes through the dictionary patterns', () => {
    expect(logNote('raided you and carried off Aria')).toBe('raided you and carried off Aria')
    expect(logNote('stormed their lobby and freed Bo')).toBe('stormed their lobby and freed Bo')
  })
})
