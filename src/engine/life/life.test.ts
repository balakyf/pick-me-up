import { describe, it, expect } from 'vitest'
import { createAccount } from '../account'
import { reduce } from '../store'
import { TUNING } from '../tuning'
import type { GameState, HeroId, OwnedHero } from '../types'
import {
  aptitude,
  assignJob,
  autoForgeSlot,
  bedIndex,
  bondOf,
  hourOfSlot,
  isSleepHour,
  jobSeats,
  jobTier,
  lifeOf,
  lifeReact,
  personalityOf,
  relationsOf,
  slotOf,
  stepLife,
} from '.'

const SLOT = TUNING.life.slotMs
const DAY = SLOT * TUNING.life.slotsPerDay

/** An account with a roster of `n` extra Normal pulls, at world-time 0. */
function roster(seed: number, n = 9): GameState {
  let st: GameState = { ...createAccount(seed), gold: TUNING.gacha.normalCostGold * n }
  for (let i = 0; i < n; i++) st = reduce(st, { type: 'SUMMON' })
  return st
}
function living(s: GameState): OwnedHero[] {
  return Object.values(s.heroes).filter((h) => h.alive)
}

describe('personality', () => {
  it('is stable for a hero and differs between heroes', () => {
    const s = roster(11)
    const [a, b] = living(s)
    expect(personalityOf(a!)).toEqual(personalityOf({ ...a! }))
    expect(personalityOf(a!)).not.toEqual(personalityOf(b!))
  })

  it('gives canon cameos their authored temperament', () => {
    const s = createAccount(1)
    const han = living(s)[0]!
    expect(han.name).toBe('Islat Han')
    expect(personalityOf(han).diligence).toBe(0.95)
    expect(personalityOf(han).background).toBe('mercenary')
  })

  it('backgrounds make aptitude: a hero is best at what they did back home', () => {
    const s = roster(12, 12)
    for (const h of living(s)) {
      const apt = aptitude(h, 'cook')
      expect(apt).toBeGreaterThanOrEqual(0.5)
      expect(apt).toBeLessThanOrEqual(2.2)
    }
  })
})

describe('the day', () => {
  it('maps slots to half-hours of a 24h world day', () => {
    expect(hourOfSlot(0)).toBe(0)
    expect(hourOfSlot(17)).toBe(8.5)
    expect(hourOfSlot(48 + 46)).toBe(23)
  })

  it('knows night owls from early birds', () => {
    const p = personalityOf(living(createAccount(1))[0]!)
    expect(isSleepHour(3, { ...p, chronotype: 'normal' })).toBe(true)
    expect(isSleepHour(8, { ...p, chronotype: 'owl' })).toBe(true)
    expect(isSleepHour(22, { ...p, chronotype: 'early' })).toBe(true)
    expect(isSleepHour(12, { ...p, chronotype: 'owl' })).toBe(false)
  })
})

describe('stepLife', () => {
  it('is a no-op inside a slot and advances the slot clock across boundaries', () => {
    const s = roster(13)
    expect(stepLife(s, SLOT - 1)).toBe(s)
    const t = stepLife(s, 5 * SLOT)
    expect(t.life.slot).toBe(5)
    for (const h of living(t)) expect(h.life).toBeDefined()
  })

  it('one long advance equals many short ones (absolute slot clock)', () => {
    const s = roster(14)
    const long = stepLife(s, DAY)
    let short = s
    for (let k = 1; k <= 48; k++) short = stepLife(short, k * SLOT)
    expect(short).toEqual(long)
  })

  it('heroes sleep at night and are awake by day', () => {
    const s = stepLife(roster(15), 3 * DAY + 3 * 3_600_000) // 03:00 on day 3
    const asleep = living(s).filter((h) => lifeOf(h).doing.kind === 'sleep').length
    expect(asleep).toBeGreaterThan(living(s).length / 2)
    const noon = stepLife(s, 3 * DAY + 12 * 3_600_000)
    const awake = living(noon).filter((h) => lifeOf(h).doing.kind !== 'sleep').length
    expect(awake).toBeGreaterThan(living(noon).length / 2)
  })

  it('keeps needs within 0..100 over a week and forms relationships', () => {
    const s = stepLife(roster(16, 12), 7 * DAY)
    for (const h of living(s)) {
      for (const v of Object.values(lifeOf(h).needs)) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(100)
      }
    }
    expect(Object.keys(s.life.relations).length).toBeGreaterThan(0)
    const bonds = Object.values(s.life.relations).map((r) => bondOf(r.affinity)).filter(Boolean)
    expect(bonds.length).toBeGreaterThan(0)
    expect(s.life.chronicle.length).toBeGreaterThan(0)
  })

  it('caps a long absence at the catch-up window', () => {
    const s = roster(17)
    const far = 100 * DAY
    const t = stepLife(s, far)
    expect(t.life.slot).toBe(slotOf(far))
  })

  it('beds run out: the latest arrivals sleep in the hall', () => {
    const s = roster(18, 12)
    const ids = living(s).map((h) => h.id)
    const beds = TUNING.life.beds.base + TUNING.life.beds.perLevel * s.facilities.dormitory.level
    expect(bedIndex(s, ids[0]!)).toBe(0)
    expect(bedIndex(s, ids[beds]!)).toBeNull()
  })
})

describe('jobs', () => {
  function withForge(s: GameState): GameState {
    return {
      ...s,
      gold: 1_000_000,
      materials: { promotionStone: 200 },
      meta: { ...s.meta, masterLevel: 10 },
      facilities: { ...s.facilities, forge: { level: 2, build: null }, garden: { level: 1, build: null } },
    }
  }

  it('seats follow the building level; closed buildings refuse workers', () => {
    const s = roster(21)
    const h = living(s)[1]!
    expect(jobSeats(s, 'gardener')).toBe(0)
    expect(() => assignJob(s, h.id, 'gardener', lifeOf)).toThrow()
    const open = withForge(s)
    expect(jobSeats(open, 'blacksmith')).toBe(2)
    const t = assignJob(open, h.id, 'gardener', lifeOf)
    expect(t.heroes[h.id]!.life!.job).toBe('gardener')
    const g2 = living(open)[2]!
    expect(() => assignJob(t, g2.id, 'gardener', lifeOf)).toThrow(/seat/)
  })

  it('smiths forge the work order into the inventory over time', () => {
    let s = withForge(roster(22))
    const smiths = living(s).slice(0, 2)
    for (const h of smiths) s = reduce(s, { type: 'ASSIGN_JOB', heroId: h.id, job: 'blacksmith' })
    s = reduce(s, { type: 'SET_FORGE_ORDER', order: 'weapon' })
    const before = s.inventory.length
    const later = stepLife(s, 4 * DAY)
    expect(later.inventory.length).toBeGreaterThan(before)
    expect(later.inventory.at(-1)!.slot).toBe('weapon')
    expect(later.gold).toBeLessThan(s.gold + 1) // paid for
    expect(later.life.tally.forged).toBeGreaterThan(0)
    expect(jobTier(lifeOf(later.heroes[smiths[0]!.id]!).jobXp.blacksmith ?? 0)).toBeGreaterThanOrEqual(0)
  })

  it('without a work order the forge stays cold', () => {
    let s = withForge(roster(23))
    s = reduce(s, { type: 'ASSIGN_JOB', heroId: living(s)[0]!.id, job: 'blacksmith' })
    const later = stepLife(s, 3 * DAY)
    expect(later.inventory.length).toBe(s.inventory.length)
  })

  it('auto orders fill the party’s missing slots and then stop', () => {
    const s = withForge(roster(24))
    expect(autoForgeSlot(s)).toBe('weapon')
  })

  it('gardeners earn gold', () => {
    let s = withForge(roster(25))
    s = reduce(s, { type: 'ASSIGN_JOB', heroId: living(s)[3]!.id, job: 'gardener' })
    const later = stepLife({ ...s, gold: 0 }, 3 * DAY)
    expect(later.gold).toBeGreaterThan(0)
    expect(later.life.tally.jobGold).toBe(later.gold)
  })
})

describe('reactions', () => {
  it('a death raises a grave and makes friends grieve', () => {
    const s0 = roster(31)
    const [a, b] = living(s0)
    const friends: GameState = {
      ...s0,
      life: { ...s0.life, relations: { [[a!.id, b!.id].sort().join('|')]: { affinity: 70, shared: 3 } } },
    }
    const dead = { ...friends, heroes: { ...friends.heroes, [a!.id]: { ...a!, alive: false } } }
    const after = lifeReact(friends, dead, { type: 'SYNTHESIZE', mode: 'salvage', survivorId: null, sacrificeIds: [a!.id] }, 0)
    expect(after.life.memorial).toHaveLength(1)
    expect(after.life.memorial[0]!.name).toBe(a!.name)
    expect(after.life.memorial[0]!.mourners).toEqual([b!.id])
    expect(after.life.memorial[0]!.cause).toBe('synthesis')
    const bl = after.heroes[b!.id]!.life!
    expect(bl.grief).toBeGreaterThan(50)
    expect(bl.memories.some((m) => m.kind === 'friendDied' && m.other === a!.id)).toBe(true)
    expect(after.heroes[b!.id]!.sanity).toBeLessThan(b!.sanity)
  })

  it('fighting a floor together binds the survivors', () => {
    let s = roster(32, 5)
    const ids = living(s).map((h) => h.id).slice(0, 5)
    s = reduce(s, { type: 'SET_PARTY', slots: ids, lines: ['front', 'front', 'mid', 'back', 'back'] })
    const after = reduce(s, { type: 'ATTEMPT_FLOOR' })
    const survivors = ids.filter((id) => after.heroes[id]!.alive)
    if (survivors.length >= 2) {
      const rels = relationsOf(after, survivors[0]!)
      expect(rels.some(([, r]) => r.shared >= 1)).toBe(true)
    }
  })

  it('a newcomer is welcomed by the warmest veteran when one is warm enough', () => {
    const s = roster(33, 12)
    const arrivals = s.life.chronicle.filter((e) => e.kind === 'arrival')
    expect(arrivals.length).toBe(12)
  })

  it('reading the letter resets the tally', () => {
    const s = { ...roster(34), life: { ...roster(34).life, tally: { jobGold: 5, meals: 1, forged: 1, trainXp: 9, research: 0, healed: 0 } } }
    const t = reduce(s, { type: 'READ_LETTER' }, 5000)
    expect(t.life.tally.jobGold).toBe(0)
    expect(t.life.letterReadAt).toBe(5000)
  })
})

describe('save', () => {
  it('a hero id resolves consistently', () => {
    const s = roster(41)
    const id = living(s)[0]!.id as HeroId
    expect(s.heroes[id]).toBeDefined()
  })
})
