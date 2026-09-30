import { describe, it, expect } from 'vitest'
import {
  maxTrainableGrade,
  drillXp,
  trainingMode,
  drillCost,
  trainingRefusal,
  canTrain,
  startTraining,
  completeTraining,
  skipTraining,
  trainingOptions,
  practiceFocus,
  practiceRate,
  practise,
} from './training'
import { createAccount } from '../account'
import { advanceTime } from '../time'
import { reduce } from '../store'
import { playFloor } from '../tower'
import { canUpgrade, unlockMasterLevel } from '../facilities'
import { stepLife } from '../life'
import { SKILLS } from '../content'
import { TUNING } from '../tuning'
import type { GameState, HeroId, HeroSkill, OwnedHero } from '../types'

const T = TUNING.skills.training

/** A fresh account with the Training Center at `level`, lots of gold, and the starter's skills set. */
function withCenter(level: number, skills?: HeroSkill[], gold = 100_000): { state: GameState; id: HeroId } {
  const acct = createAccount(4242, { now: 0 })
  const id = Object.keys(acct.heroes)[0] as HeroId
  const hero = acct.heroes[id]!
  return {
    id,
    state: {
      ...acct,
      gold,
      gems: 100,
      facilities: { ...acct.facilities, trainingCenter: { level, build: null } },
      heroes: { ...acct.heroes, [id]: { ...hero, skills: skills ?? hero.skills } },
    },
  }
}
const hs = (id: string, level = 1, xp = 0): HeroSkill => ({ id, level, xp })
const heroOf = (s: GameState, id: HeroId): OwnedHero => s.heroes[id]!

describe('facility level effects', () => {
  it('max trainable grade rises with level; nothing is trainable before the centre is built', () => {
    expect(maxTrainableGrade(0)).toBeNull()
    expect(maxTrainableGrade(1)).toBe('E')
    expect(maxTrainableGrade(2)).toBe('D')
    expect(maxTrainableGrade(3)).toBe('D')
    expect(maxTrainableGrade(4)).toBe('C')
    expect(maxTrainableGrade(9)).toBe('B')
  })

  it('drill XP (refine speed) rises with level', () => {
    expect(drillXp(1)).toBe(T.drillXpBase)
    expect(drillXp(3)).toBe(T.drillXpBase + 2 * T.drillXpPerLevel)
  })
})

describe('trainingMode / drillCost', () => {
  it('owned → refine; trainable and not owned → learn; otherwise null', () => {
    const { state, id } = withCenter(4, [hs('berserk')])
    const h = heroOf(state, id)
    expect(trainingMode(h, 'berserk')).toBe('refine')
    expect(trainingMode(h, 'composure')).toBe('learn')
    expect(trainingMode(h, 'exceed')).toBeNull() // merge-only
    expect(trainingMode(h, 'power_strike')).toBeNull() // innate/promotion skill, not taught
    expect(trainingMode(h, 'nope')).toBeNull()
  })

  it('costs gold by grade; a learn drill costs more', () => {
    expect(drillCost('berserk', 'refine')).toBe(T.drillGold.D)
    expect(drillCost('berserk', 'learn')).toBe(T.drillGold.D! * T.learnMult)
  })
})

describe('trainingRefusal', () => {
  it('refuses while the centre is unbuilt', () => {
    const { state, id } = withCenter(0, [hs('berserk')])
    expect(trainingRefusal(state, id, 'berserk')).toMatch(/not built/i)
  })

  it('refuses a grade above the centre’s ceiling', () => {
    const { state, id } = withCenter(1, [hs('berserk')]) // D skill, Lv1 centre teaches up to E
    expect(trainingRefusal(state, id, 'berserk')).toMatch(/grade/i)
    const ok = withCenter(2, [hs('berserk')])
    expect(trainingRefusal(ok.state, ok.id, 'berserk')).toBeNull()
  })

  it('refuses a capped skill, a dead or busy hero, and too little gold', () => {
    const capped = withCenter(4, [hs('berserk', 4)])
    expect(trainingRefusal(capped.state, capped.id, 'berserk')).toMatch(/max/i)

    const { state, id } = withCenter(4, [hs('berserk')])
    const dead = { ...state, heroes: { ...state.heroes, [id]: { ...heroOf(state, id), alive: false } } }
    expect(trainingRefusal(dead, id, 'berserk')).toMatch(/fallen/i)
    const promoting = { ...state, heroes: { ...state.heroes, [id]: { ...heroOf(state, id), promotion: { completesAtWorld: 5 } } } }
    expect(trainingRefusal(promoting, id, 'berserk')).toMatch(/promot/i)
    const busy = startTraining(state, id, 'berserk', 0)
    expect(trainingRefusal(busy, id, 'berserk')).toMatch(/already/i)

    const poor = withCenter(4, [hs('berserk')], 0)
    expect(trainingRefusal(poor.state, poor.id, 'berserk')).toMatch(/gold/i)
    expect(canTrain(poor.state, poor.id, 'berserk')).toBe(false)
  })

  it('refuses skills the centre cannot teach', () => {
    const { state, id } = withCenter(9, [])
    expect(trainingRefusal(state, id, 'exceed')).toMatch(/cannot/i)
  })
})

describe('startTraining', () => {
  it('pays gold and sets a world-time drill', () => {
    const { state, id } = withCenter(4, [hs('berserk')])
    const next = startTraining(state, id, 'berserk', 1000)
    expect(next.gold).toBe(state.gold - drillCost('berserk', 'refine'))
    expect(heroOf(next, id).training).toEqual({ skillId: 'berserk', mode: 'refine', completesAtWorld: 1000 + T.drillDurationMs })
  })

  it('throws when refused and never mutates its input', () => {
    const { state, id } = withCenter(0, [hs('berserk')])
    const copy = JSON.parse(JSON.stringify(state))
    expect(() => startTraining(state, id, 'berserk', 0)).toThrow()
    expect(state).toEqual(copy)
  })
})

describe('completeTraining', () => {
  it('a refine drill adds use-XP and can level the skill (never stats or hero level)', () => {
    // Lv1 centre: an E skill, 3 XP per drill → from (Lv1, xp 2) to (Lv2, xp 2).
    const { state, id } = withCenter(1, [hs('basic_swordsmanship', 1, 2)])
    const before = heroOf(startTraining(state, id, 'basic_swordsmanship', 0), id)
    const after = completeTraining(before, 1)
    expect(after.training).toBeNull()
    expect(after.skills[0]).toEqual(hs('basic_swordsmanship', 2, 2 + drillXp(1) - TUNING.skills.xpToNext[1]!))
    expect(after.baseAttrs).toEqual(before.baseAttrs)
    expect(after.growthGrades).toEqual(before.growthGrades)
    expect(after.xp).toEqual(before.xp)
  })

  it('a learn drill adds the skill at Lv1', () => {
    const { state, id } = withCenter(4, [])
    const after = completeTraining(heroOf(startTraining(state, id, 'composure', 0), id), 4)
    expect(after.skills).toEqual([hs('composure')])
  })

  it('drills finish merges: refining Composure to Lv3 beside Berserk Lv3 yields Exceed', () => {
    const need = TUNING.skills.xpToNext[2]!
    const { state, id } = withCenter(4, [hs('berserk', 3), hs('composure', 2, need - 1)])
    const after = completeTraining(heroOf(startTraining(state, id, 'composure', 0), id), 4)
    expect(after.skills.map((s) => s.id)).toEqual(['exceed'])
  })

  it('is a no-op for a hero with no drill', () => {
    const { state, id } = withCenter(4)
    expect(completeTraining(heroOf(state, id), 4)).toBe(heroOf(state, id))
  })
})

describe('skipTraining', () => {
  it('spends gems and completes the drill now', () => {
    const { state, id } = withCenter(4, [])
    const training = startTraining(state, id, 'composure', 0)
    const skipped = skipTraining(training, id)
    expect(skipped.gems).toBe(training.gems - T.skipGemCost)
    expect(heroOf(skipped, id).training).toBeNull()
    expect(heroOf(skipped, id).skills.map((s) => s.id)).toContain('composure')
  })

  it('throws without a drill or without the gems', () => {
    const { state, id } = withCenter(4, [])
    expect(() => skipTraining(state, id)).toThrow()
    const broke = { ...startTraining(state, id, 'composure', 0), gems: 0 }
    expect(() => skipTraining(broke, id)).toThrow()
  })
})

describe('trainingOptions', () => {
  it('lists refinable owned skills then learnable skills, each with cost and eligibility', () => {
    const { state, id } = withCenter(2, [hs('berserk'), hs('power_strike')])
    const opts = trainingOptions(state, id)
    const byId = Object.fromEntries(opts.map((o) => [o.skillId, o]))
    expect(byId.berserk).toMatchObject({ mode: 'refine', ok: true })
    expect(byId.power_strike).toMatchObject({ mode: 'refine', ok: false }) // C > D ceiling
    expect(byId.composure).toMatchObject({ mode: 'learn', ok: true })
    expect(byId.exceed).toBeUndefined()
    expect(opts.findIndex((o) => o.mode === 'learn')).toBeGreaterThan(opts.findIndex((o) => o.mode === 'refine'))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Integration: facility gate, world-time completion, commands, deployment
// ─────────────────────────────────────────────────────────────────────────────

describe('Training Center — across the engine', () => {
  it('is built through the generic facility path, gated at Master Lv 2', () => {
    const acct = { ...createAccount(1, { now: 0 }), gold: 100_000 }
    expect(canUpgrade(acct, 'trainingCenter')).toBe(false) // ML1
    const ml2 = { ...acct, meta: { ...acct.meta, masterLevel: 2 } }
    expect(unlockMasterLevel('trainingCenter')).toBe(2)
    expect(canUpgrade(ml2, 'trainingCenter')).toBe(true)
  })

  it('a drill completes "offline" in advanceTime and feeds Master XP', () => {
    const { state, id } = withCenter(4, [])
    const training = startTraining(state, id, 'composure', 0)
    const early = advanceTime(training, T.drillDurationMs - 1)
    expect(heroOf(early, id).training).not.toBeNull()
    const done = advanceTime(training, T.drillDurationMs)
    expect(heroOf(done, id).training).toBeNull()
    expect(heroOf(done, id).skills.map((s) => s.id)).toContain('composure')
    expect(done.meta.masterXp).toBeGreaterThan(training.meta.masterXp)
  })

  it('TRAIN_SKILL and SKIP_TIMER(training) go through reduce', () => {
    const { state, id } = withCenter(4, [])
    const started = reduce(state, { type: 'TRAIN_SKILL', heroId: id, skillId: 'composure' }, 0)
    expect(heroOf(started, id).training?.mode).toBe('learn')
    const skipped = reduce(started, { type: 'SKIP_TIMER', kind: 'training', id }, 0)
    expect(heroOf(skipped, id).training).toBeNull()
    expect(skipped.gems).toBe(started.gems - T.skipGemCost)
  })

  it('a hero in training is not deployed to the tower', () => {
    const { state, id } = withCenter(4, [])
    const training = startTraining(state, id, 'composure', 0)
    const party = { slots: [id, null, null, null, null], lines: state.party.lines }
    // Only the training hero is in the party → nobody deploys.
    const { result } = playFloor({ ...training, party })
    expect(result.result.log.unitsInit.filter((u) => u.side === 'hero')).toEqual([])
  })
})

describe('self-practice (no orders needed)', () => {
  const S = T.self

  it('works on the roughest owned skill first, then something new the centre can teach', () => {
    const { state, id } = withCenter(1, [hs('composure', 3), hs('calmness', 1)])
    expect(practiceFocus(heroOf(state, id), 1)).toEqual({ skillId: 'calmness', mode: 'refine' })
    const { state: s2, id: id2 } = withCenter(1, [])
    const f = practiceFocus(heroOf(s2, id2), 1)
    expect(f?.mode).toBe('learn')
    expect(SKILLS[f!.skillId]!.trainable).toBe(true)
    // Without a centre there is nobody to teach a new skill.
    expect(practiceFocus(heroOf(s2, id2), 0)).toBeNull()
  })

  it('banks points and turns them into skill XP; learning takes learnPoints', () => {
    const { state, id } = withCenter(1, [hs('composure', 1)])
    let hero = heroOf(state, id)
    let practice: { skillId: string; points: number } | undefined
    let levels = 0
    for (let i = 0; i < 40; i++) {
      const r = practise(hero, practice, 1)
      hero = r.hero
      practice = r.practice
      if (r.gained?.kind === 'level') levels++
    }
    expect(levels).toBeGreaterThan(0)
    expect(hero.skills.find((s) => s.id === 'composure')!.level).toBeGreaterThan(1)

    const { state: s2, id: id2 } = withCenter(1, [])
    let h2 = heroOf(s2, id2)
    let p2: { skillId: string; points: number } | undefined
    const slots = Math.ceil(S.learnPoints / practiceRate(1))
    for (let i = 0; i < slots; i++) ({ hero: h2, practice: p2 } = practise(h2, p2, 1))
    expect(h2.skills).toHaveLength(1)
    expect(h2.training).toBeNull()
  })

  it('costs nothing and is faster with a better centre and with instructors', () => {
    expect(practiceRate(0)).toBeLessThan(practiceRate(1))
    expect(practiceRate(3)).toBeGreaterThan(practiceRate(1))
    expect(practiceRate(1, 2)).toBeCloseTo(practiceRate(1) * 2)
  })

  it('heroes left alone for a few days pick up and improve skills by themselves', () => {
    let s = reduce({ ...createAccount(11), gold: TUNING.gacha.normalCostGold * 8 }, { type: 'SUMMON' })
    for (let i = 0; i < 7; i++) s = reduce(s, { type: 'SUMMON' })
    s = { ...s, facilities: { ...s.facilities, trainingCenter: { level: 1, build: null } } }
    const gold = s.gold
    const score = (st: GameState) => Object.values(st.heroes).reduce((a, h) => a + h.skills.reduce((b, k) => b + k.level, 0), 0)
    const before = score(s)
    const after = stepLife(s, (s.life.slot + 3 * 48) * TUNING.life.slotMs)
    expect(score(after)).toBeGreaterThan(before)
    expect(after.life.tally.selfTaught ?? 0).toBeGreaterThan(0)
    expect(Object.values(after.heroes).every((h) => h.training === null)).toBe(true)
    expect(after.gold).toBeGreaterThanOrEqual(gold)
  })
})
