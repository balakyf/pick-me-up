import { describe, it, expect } from 'vitest'
import { runBattle } from '../combat'
import { buildEnemyUnit, buildCombatUnit } from '../unit'
import { ENEMY_TEMPLATES, SKILLS } from '../content'
import type { CombatUnit, GameState, HeroId, KeywordTag, OwnedHero } from '../types'
import { CHALLENGE } from './tuning'
import { challengeOf } from './challenge'
import { ballistaBreak, buildRaidBoss, raidChestReady, raidRefusal, raidsOpen, runRaid, worldWeekOf } from './raid'
import { rosterIds, veteranState } from './fixtures.test-util'

const RD = CHALLENGE.raids
const WEEK = 7 * 24 * 3_600_000

function teams(s: GameState): { parties: HeroId[][]; crew: HeroId[] } {
  const ids = rosterIds(s)
  return { parties: [ids.slice(0, 5), ids.slice(5, 10), ids.slice(10, 15)], crew: ids.slice(15, 18) }
}

describe('raids: gating and the ballista', () => {
  it('open only once their anchor is cleared, and refuse bad line-ups', () => {
    const s = veteranState(3, 20, 35)
    expect(raidsOpen(s)).toEqual([20, 35])
    expect(raidsOpen(veteranState(3, 20, 19))).toEqual([])
    const { parties, crew } = teams(s)
    expect(raidRefusal(s, 20, parties, crew)).toBeNull()
    expect(raidRefusal(s, 25, parties, crew)).toMatch(/No raid/)
    expect(raidRefusal(s, 60, parties, crew)).toMatch(/Clear F60/)
    expect(raidRefusal(s, 20, [], crew)).toMatch(/at least one/)
    expect(raidRefusal(s, 20, [...parties, parties[0]!], [])).toMatch(/At most/)
    expect(raidRefusal(s, 20, [[...parties[0]!, parties[1]![0]!]], [])).toMatch(/at most 5/)
    expect(raidRefusal(s, 20, parties, [parties[0]![0]!])).toMatch(/one place/)
    const dead = { ...s, heroes: { ...s.heroes, [parties[0]![0]!]: { ...s.heroes[parties[0]![0]!]!, alive: false } } }
    expect(raidRefusal(dead, 20, parties, crew)).toMatch(/fit to fight/)
  })

  it('the break grows with the Master’s ballista skill and the crew; archers aim truer; the altar holds longer', () => {
    const s = veteranState(3, 20, 20)
    const hero = (patch: Partial<OwnedHero>) => ({ ...s.heroes[rosterIds(s)[0]!]!, heroClass: 'warrior', element: 'fire', ...patch }) as OwnedHero
    expect(ballistaBreak([], 0).ticks).toBe(0)
    expect(ballistaBreak([], 1).ticks).toBe(RD.breakPerSkill)
    expect(ballistaBreak([hero({})], 0).ticks).toBe(RD.breakPerCrew)
    expect(ballistaBreak([hero({ heroClass: 'archer' })], 0).ticks).toBe(Math.round(RD.breakPerCrew * RD.archerCrewMult))
    const altar = ballistaBreak([hero({ element: 'light' })], 0)
    expect(altar.altar).toBe(true)
    expect(altar.ticks).toBe(Math.round(RD.breakPerCrew * RD.altarMult))
  })

  it('the raid boss has a raid-sized HP pool and scales that the ballista breaks until its tick', () => {
    const s = veteranState(3, 20, 20)
    const { boss, adds } = buildRaidBoss(s, 20, 90)
    expect(boss.targetTag).toBe('halgiraf')
    expect(adds.length).toBeGreaterThan(0)
    expect(adds.every((a) => a.targetTag !== 'halgiraf')).toBe(true)
    const plain = buildRaidBoss(s, 20, 0).boss
    expect(boss.stats.maxHP).toBe(plain.stats.maxHP)
    expect(boss.keywords.filter((k) => k.kind === 'resist')).toEqual([
      { kind: 'resist', damageType: 'physical', reduction: RD.scaleReduction, fromTick: 90 },
      { kind: 'resist', damageType: 'magic', reduction: RD.scaleReduction, fromTick: 90 },
    ])
  })

  it('combat honours `fromTick`: scales that have not yet regrown let the full blow through', () => {
    const s = veteranState(3, 30, 20)
    const hero = buildCombatUnit(s.heroes[rosterIds(s)[0]!]!, 'front', SKILLS, s.inventory)
    const hit = (kw: KeywordTag): number => {
      const dummy: CombatUnit = { ...buildEnemyUnit(ENEMY_TEMPLATES.ogre_brute!, 30, 'dummy'), keywords: [kw] }
      const res = runBattle([hero], { floor: 20, mission: { type: 'x', objectives: [{ kind: 'annihilate' }], timer: 50 }, waves: [{ units: [dummy] }], encounterContext: 'tower' }, 7)
      const e = res.log.events.find((ev) => ev.kind === 'hit' && ev.actorId === hero.id)
      return e && e.kind === 'hit' ? e.amount : 0
    }
    const scaled = hit({ kind: 'resist', damageType: 'physical', reduction: 0.75 })
    const broken = hit({ kind: 'resist', damageType: 'physical', reduction: 0.75, fromTick: 1000 })
    expect(broken).toBeGreaterThan(scaled * 3)
  })
})

describe('raids: the shared HP pool, permadeath, rewards', () => {
  it('parties fight one after another against ONE HP pool (the boss keeps its wounds)', () => {
    const s = veteranState(7, 19, 20)
    const { parties } = teams(s)
    const { outcome } = runRaid(s, 20, parties, [], 0, 0)
    expect(outcome.parties.length).toBeGreaterThan(1)
    expect(outcome.parties[0]!.bossHpBefore).toBe(outcome.bossMaxHp)
    for (let i = 1; i < outcome.parties.length; i++) {
      expect(outcome.parties[i]!.bossHpBefore).toBe(outcome.parties[i - 1]!.bossHpAfter)
      expect(outcome.parties[i]!.bossHpAfter).toBeLessThanOrEqual(outcome.parties[i]!.bossHpBefore)
    }
    // Deterministic.
    expect(runRaid(s, 20, parties, [], 0, 0).outcome.parties.map((p) => p.bossHpAfter)).toEqual(outcome.parties.map((p) => p.bossHpAfter))
  })

  it('the ballista crew turns a failing raid into a win', () => {
    const s = veteranState(7, 19, 20)
    const { parties, crew } = teams(s)
    const without = runRaid(s, 20, parties, [], 0.6, 0).outcome
    const withCrew = runRaid(s, 20, parties, crew, 0.6, 0).outcome
    const dealt = (o: typeof without) => o.bossMaxHp - o.parties.at(-1)!.bossHpAfter
    expect(dealt(withCrew)).toBeGreaterThan(dealt(without))
    expect(withCrew.cleared).toBe(true)
  })

  it('permadeath applies; the weekly chest pays once; the ballista minigame is practised', () => {
    const s = veteranState(7, 19, 20)
    const { parties, crew } = teams(s)
    const r = runRaid(s, 20, parties, crew, 0.6, 0)
    expect(r.outcome.cleared).toBe(true)
    expect(r.outcome.rewarded).toBe(true)
    for (const id of r.outcome.fallen) expect(r.state.heroes[id]!.alive).toBe(false)
    const survivor = parties.flat().find((id) => !r.outcome.fallen.includes(id))!
    expect(r.state.heroes[survivor]!.sanity).toBeLessThan(s.heroes[survivor]!.sanity)
    expect(r.state.heroes[crew[0]!]!.sanity).toBe(s.heroes[crew[0]!]!.sanity - RD.crewSanity)
    expect(r.state.gems).toBe(s.gems + r.outcome.gems)
    expect(r.state.materials.promotionStone).toBe((s.materials.promotionStone ?? 0) + r.outcome.materials.promotionStone!)
    expect(r.state.meta.skill.ballista).toBeGreaterThan(s.meta.skill.ballista)
    expect(challengeOf(r.state).raids['20']).toEqual({ clears: 1, attempts: 1, lastClearWeek: 0 })
    expect(raidChestReady(r.state, 20, 0)).toBe(false)
    expect(raidChestReady(r.state, 20, WEEK)).toBe(true)
    expect(worldWeekOf(WEEK)).toBe(1)
    // A second clear the same week: no chest.
    const alive = rosterIds(r.state)
    const again = runRaid(r.state, 20, [alive.slice(0, 5), alive.slice(5, 10), alive.slice(10, 15)], alive.slice(15, 18), undefined, 0)
    if (again.outcome.cleared) expect(again.outcome.rewarded).toBe(false)
    expect(again.state.meta.skill.ballista).toBe(r.state.meta.skill.ballista)
  })

  it('five pages of the Book of Reverse Heaven bind into a Book', () => {
    const s = veteranState(7, 19, 20)
    const { parties, crew } = teams(s)
    let found = false
    for (let week = 0; week < 60 && !found; week++) {
      const primed = { ...s, materials: { ...s.materials, reverseHeavenPage: RD.pagesPerBook - 1 } }
      const r = runRaid(primed, 20, parties, crew, 0.6, week * WEEK)
      if (r.outcome.materials.reverseHeavenPage) {
        found = true
        expect(r.outcome.bookBound).toBe(true)
        expect(r.state.materials.bookOfReverseHeaven).toBe((s.materials.bookOfReverseHeaven ?? 0) + 1)
        expect(r.state.materials.reverseHeavenPage).toBe(0)
      }
    }
    expect(found).toBe(true)
  })
})
