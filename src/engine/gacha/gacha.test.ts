/**
 * Tests for Layer 1 §1 Mobius Summon (Normal pool).
 *
 * Vitest globals are enabled (describe/it/expect available without import).
 */

import { defaultLifeState } from '../life'
import {
  rollStar,
  rollClass,
  rollAttributes,
  allocateHeroId,
  makeProceduralName,
  buildOwnedHeroFromTemplate,
  rollSummon,
  summon,
  rollAdvancedStar,
  summonMany,
  summonCost,
  mercySummonAvailable,
} from './gacha'
import { PVP_DEFAULTS } from '../account'
import { TUNING, STAR_ENVELOPES } from '../tuning'
import { CAMEO_HEROES, ENGRAVINGS } from '../content'
import { makeSeed, rngFor, createRng } from '../rng/rng'
import type { GameState, Seed, HeroId, Star } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures / helpers
// ─────────────────────────────────────────────────────────────────────────────

/** A minimal but fully-shaped GameState with a configurable seed/gold/pity. */
function makeState(overrides: Partial<GameState> = {}): GameState {
  const base: GameState = {
    schemaVersion: TUNING.account.schemaVersion,
    accountId: TUNING.account.defaultAccountId,
    seed: makeSeed(12345),
    worldGrade: 'C',
    createdAt: 0,
    gold: TUNING.gacha.normalCostGold,
    gems: 0,
    materials: {},
    inventory: [],
    meta: { masterLevel: 1, masterXp: 0, lastSeenAtWorld: 0, pi: 0, login: { lastDay: -1, streak: 0 }, monthly: null, wallet: { spentUsd: 0, purchases: {} }, skill: { blacksmith: 0.4, ballista: 0.4 }, crackOpen: false, revealedHidden: [], peekedFloors: [], nudge: false, piZeroSince: null, deleted: false },
    facilities: {
      kitchen: { level: 1, build: null },
      promotionChamber: { level: 0, build: null },
      tacticalCenter: { level: 1, build: null },
      trainingCenter: { level: 0, build: null },
      transferStation: { level: 0, build: null },
      hallOfMagic: { level: 0, build: null },
      dormitory: { level: 1, build: null },
      tavern: { level: 0, build: null },
      infirmary: { level: 0, build: null },
      garden: { level: 0, build: null },
      memorial: { level: 1, build: null },
      forge: { level: 0, build: null },
      library: { level: 0, build: null },
      watchtower: { level: 0, build: null },
      market: { level: 0, build: null },
    },
    dailies: { attemptsUsed: 0, lastResetWorldDay: 0 },
    heroes: {},
    consumedHeroIds: [],
    usedNames: [],
    consumedTemplateIds: [],
    party: { slots: [null, null, null, null, null], lines: ['front', 'front', 'mid', 'back', 'back'] },
    tower: { currentFloor: 1, highestCleared: 0, attemptIndex: 0, event: null, loop: null, hiddenFound: [], worldEnded: false, worldSaved: false },
    gacha: { pity: 0, pullCount: 0, advPity4: 0, advPity5: 0, advPullCount: 0 },
    rng: { combatCounter: 0 },
    life: defaultLifeState(0),
    pvp: PVP_DEFAULTS(),
  }
  return { ...base, ...overrides }
}

/** Run N summons in sequence, funding gold so the gold check never trips. */
function runSummons(seed: number, n: number): { states: GameState[]; heroes: ReturnType<typeof summon>['hero'][] } {
  let state = makeState({ seed: makeSeed(seed), gold: TUNING.gacha.normalCostGold * (n + 1) })
  const states: GameState[] = []
  const heroes: ReturnType<typeof summon>['hero'][] = []
  for (let i = 0; i < n; i++) {
    const res = summon(state)
    state = res.state
    states.push(state)
    heroes.push(res.hero)
  }
  return { states, heroes }
}

// ─────────────────────────────────────────────────────────────────────────────
// rollStar — rates + Rising Quality Floor
// ─────────────────────────────────────────────────────────────────────────────

describe('rollStar', () => {
  it('only ever yields 1/2/3 in the Normal pool', () => {
    const seed = makeSeed(999) as Seed
    let rng = rngFor(seed, 'gacha', 0)
    for (let i = 0; i < 5000; i++) {
      const d = rollStar(rng, 0)
      expect([1, 2, 3]).toContain(d.value)
      rng = d.rng
    }
  })

  it('approximates 70/25/5 base rates within ~3% (no pity)', () => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0 }
    const N = 60000
    // Use distinct sub-streams so draws are well separated.
    for (let i = 0; i < N; i++) {
      const rng = rngFor(makeSeed(7) as Seed, 'gacha', i)
      const { value } = rollStar(rng, 0)
      counts[value]++
    }
    expect(counts[1] / N).toBeCloseTo(0.7, 1)
    expect(counts[2] / N).toBeCloseTo(0.25, 1)
    expect(counts[3] / N).toBeCloseTo(0.05, 1)
    // Tighter ~3% bands.
    expect(Math.abs(counts[1] / N - 0.7)).toBeLessThan(0.03)
    expect(Math.abs(counts[2] / N - 0.25)).toBeLessThan(0.03)
    expect(Math.abs(counts[3] / N - 0.05)).toBeLessThan(0.03)
  })

  it('applies the floor as a MINIMUM not a forced star (raises <3 to 3)', () => {
    // At the threshold pull, any roll resolves to >= 3.
    const pity = TUNING.gacha.normalPityFloor3At - 1 // (pity+1) == threshold
    for (let i = 0; i < 1000; i++) {
      const rng = rngFor(makeSeed(42) as Seed, 'gacha', i)
      const { value } = rollStar(rng, pity)
      expect(value).toBeGreaterThanOrEqual(3)
    }
  })

  it('the 50th consecutive dry pull is guaranteed 3 (pity 49)', () => {
    // pity counts the 49 prior dry pulls; this is the 50th pull.
    for (let i = 0; i < 200; i++) {
      const rng = rngFor(makeSeed(i + 1) as Seed, 'gacha', i)
      const { value } = rollStar(rng, 49)
      expect(value).toBe(3)
    }
  })

  it('does NOT force a floor below the threshold (the 49th pull can still be 1/2)', () => {
    let sawSub3 = false
    for (let i = 0; i < 1000; i++) {
      const rng = rngFor(makeSeed(i + 1) as Seed, 'gacha', i)
      const { value } = rollStar(rng, 48) // (pity+1) == 49 < 50
      if (value < 3) sawSub3 = true
    }
    expect(sawSub3).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Rising Floor over a real dry simulation — max run length is exactly 50
// ─────────────────────────────────────────────────────────────────────────────

describe('Rising Quality Floor — simulated dry streaks', () => {
  it('the longest run of consecutive non-3 pulls is exactly 49 (the 50th is forced)', () => {
    // The brief floor formula `(pity+1) >= normalPityFloor3At` forces a 3 on the
    // 50th pull (pity 49). Hence the longest possible run of consecutive non-3
    // pulls is 49 — the 50th pull always pays out and ends the run. (See `issues`:
    // the brief's prose "max run == 50" is an off-by-one against its own formula.)
    let pity = 0
    let currentRun = 0
    let maxRun = 0
    let saw49 = false
    const N = 400000
    for (let i = 0; i < N; i++) {
      const rng = rngFor(makeSeed(2024) as Seed, 'gacha', i)
      const { value } = rollStar(rng, pity)
      if (value >= 3) {
        if (currentRun === 49) saw49 = true
        if (currentRun > maxRun) maxRun = currentRun
        currentRun = 0
        pity = 0
      } else {
        currentRun++
        pity++
      }
    }
    // Account for a trailing run.
    if (currentRun > maxRun) maxRun = currentRun
    expect(maxRun).toBe(49)
    // The run never reaches 50/51 (the floor always intervenes on the 50th pull).
    expect(maxRun).toBeLessThan(50)
    // And a full 49-length dry streak actually occurs in this long simulation.
    expect(saw49).toBe(true)
  })

  it('after 49 consecutive dry pulls the 50th pull is always a guaranteed 3', () => {
    // Pinned worked-example: pity 49 → floor forces 3 (Layer 1 §1.3, Normal pool).
    for (let i = 0; i < 500; i++) {
      const rng = rngFor(makeSeed(i + 1) as Seed, 'gacha', i)
      expect(rollStar(rng, 49).value).toBe(3)
    }
  })

  it('forcing 49 dry pulls then pulling guarantees a 3 on the 50th (state-level)', () => {
    // Build a state already at pity 49 and assert the very next summon is 3.
    let state = makeState({ gold: TUNING.gacha.normalCostGold })
    state = { ...state, gacha: { ...state.gacha, pity: 49 } }
    const { hero, state: next } = summon(state)
    expect(hero.star).toBe(3)
    // Payout resets pity to 0.
    expect(next.gacha.pity).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// rollClass
// ─────────────────────────────────────────────────────────────────────────────

describe('rollClass', () => {
  it('always null for star < 3', () => {
    for (const star of [1, 2] as Star[]) {
      for (let i = 0; i < 200; i++) {
        const rng = rngFor(makeSeed(5) as Seed, 'gacha', i)
        expect(rollClass(rng, star).value).toBeNull()
      }
    }
  })

  it('star >= 3 always yields a real class', () => {
    const valid = new Set(['warrior', 'spearman', 'thief', 'archer', 'mage'])
    for (let i = 0; i < 500; i++) {
      const rng = rngFor(makeSeed(6) as Seed, 'gacha', i)
      const c = rollClass(rng, 3).value
      expect(c).not.toBeNull()
      expect(valid.has(c as string)).toBe(true)
    }
  })

  it('mage is rare but appears, and the four common classes all appear', () => {
    const counts: Record<string, number> = {}
    const N = 20000
    for (let i = 0; i < N; i++) {
      const rng = rngFor(makeSeed(8) as Seed, 'gacha', i)
      const c = rollClass(rng, 3).value as string
      counts[c] = (counts[c] ?? 0) + 1
    }
    for (const cls of ['warrior', 'spearman', 'thief', 'archer', 'mage']) {
      expect(counts[cls] ?? 0).toBeGreaterThan(0)
    }
    // Mage chance is ~mageChance; it should be the rarest by a wide margin.
    expect(counts.mage / N).toBeLessThan(TUNING.gacha.mageChance * 1.5)
    expect(counts.mage).toBeLessThan(counts.warrior)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// rollAttributes
// ─────────────────────────────────────────────────────────────────────────────

describe('rollAttributes', () => {
  it('keeps every base in range and every grade in [0, ceiling]', () => {
    for (const star of [1, 3, 5, 7] as Star[]) {
      const env = STAR_ENVELOPES[star]
      const [min, max] = env.baseAttrRange
      for (let i = 0; i < 300; i++) {
        const rng = rngFor(makeSeed(11) as Seed, 'gacha', star * 1000 + i)
        const { baseAttrs, grades } = rollAttributes(rng, env)
        for (const k of ['str', 'agi', 'vit', 'int', 'wil'] as const) {
          expect(baseAttrs[k]).toBeGreaterThanOrEqual(min)
          expect(baseAttrs[k]).toBeLessThanOrEqual(max)
          expect(grades[k]).toBeGreaterThanOrEqual(0)
          expect(grades[k]).toBeLessThanOrEqual(env.gradeCeiling)
        }
      }
    }
  })

  it('is deterministic for the same rng', () => {
    const env = STAR_ENVELOPES[3]
    const rng = rngFor(makeSeed(11) as Seed, 'gacha', 1)
    const a = rollAttributes(rng, env)
    const b = rollAttributes(rng, env)
    expect(a.baseAttrs).toEqual(b.baseAttrs)
    expect(a.grades).toEqual(b.grades)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// allocateHeroId / makeProceduralName
// ─────────────────────────────────────────────────────────────────────────────

describe('allocateHeroId', () => {
  it('produces a zero-padded prefixed id of the form h_NNNNNN', () => {
    const rng = createRng(makeSeed(123))
    const { value } = allocateHeroId([], rng)
    expect(value).toMatch(/^h_\d{6}$/)
  })

  it('never returns an id already in the consumed set', () => {
    let rng = createRng(makeSeed(77))
    const consumed: string[] = []
    for (let i = 0; i < 500; i++) {
      const { value, rng: r } = allocateHeroId(consumed, rng)
      rng = r
      expect(consumed).not.toContain(value)
      consumed.push(value)
    }
    // All unique.
    expect(new Set(consumed).size).toBe(consumed.length)
  })
})

describe('makeProceduralName', () => {
  it('combines first + last and avoids used names', () => {
    let rng = createRng(makeSeed(314))
    const used: string[] = []
    for (let i = 0; i < 300; i++) {
      const { value, rng: r } = makeProceduralName(rng, used)
      rng = r
      expect(value).toContain(' ')
      expect(used).not.toContain(value)
      used.push(value)
    }
    expect(new Set(used).size).toBe(used.length)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildOwnedHeroFromTemplate
// ─────────────────────────────────────────────────────────────────────────────

describe('buildOwnedHeroFromTemplate', () => {
  it('builds a fresh Lv1, alive, cameo-origin hero from a template', () => {
    const tmpl = CAMEO_HEROES.find((t) => t.templateId === 'islat_han')!
    const hero = buildOwnedHeroFromTemplate(tmpl, 'h_000001' as HeroId)
    expect(hero.id).toBe('h_000001')
    expect(hero.name).toBe('Islat Han')
    expect(hero.star).toBe(1)
    expect(hero.heroClass).toBeNull()
    expect(hero.origin).toBe('cameo')
    expect(hero.alive).toBe(true)
    expect(hero.xp).toEqual({ level: 1, xpIntoLevel: 0, heldXp: 0, atCap: false })
    expect(hero.baseAttrs).toEqual(tmpl.baseAttrs)
    expect(hero.growthGrades).toEqual(tmpl.growthGrades)
  })

  it('does not alias the template attribute objects', () => {
    const tmpl = CAMEO_HEROES.find((t) => t.templateId === 'islat_han')!
    const hero = buildOwnedHeroFromTemplate(tmpl, 'h_000002' as HeroId)
    expect(hero.baseAttrs).not.toBe(tmpl.baseAttrs)
    expect(hero.growthGrades).not.toBe(tmpl.growthGrades)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// summon — integration / invariants
// ─────────────────────────────────────────────────────────────────────────────

describe('summon', () => {
  it('throws on insufficient gold and never mutates state', () => {
    const state = makeState({ gold: TUNING.gacha.normalCostGold - 1 })
    const snapshot = JSON.parse(JSON.stringify(state))
    expect(() => summon(state)).toThrow()
    expect(JSON.parse(JSON.stringify(state))).toEqual(snapshot)
  })

  it('deducts exactly normalCostGold (3000)', () => {
    const state = makeState({ gold: 10000 })
    const { state: next } = summon(state)
    expect(state.gold - next.gold).toBe(TUNING.gacha.normalCostGold)
    expect(next.gold).toBe(10000 - 3000)
  })

  it('does not mutate the input state', () => {
    const state = makeState({ gold: 10000 })
    const snapshot = JSON.parse(JSON.stringify(state))
    summon(state)
    expect(JSON.parse(JSON.stringify(state))).toEqual(snapshot)
  })

  it('is deterministic: same state in → identical hero & state out', () => {
    const state = makeState({ seed: makeSeed(424242), gold: 10000 })
    const a = summon(state)
    const b = summon(state)
    expect(a.hero).toEqual(b.hero)
    expect(a.state).toEqual(b.state)
  })

  it('advances pullCount by 1 and grows consumedHeroIds by exactly 1 each pull', () => {
    const { states } = runSummons(31337, 60)
    for (let i = 0; i < states.length; i++) {
      expect(states[i].gacha.pullCount).toBe(i + 1)
      expect(states[i].consumedHeroIds.length).toBe(i + 1)
    }
  })

  it('issues NO duplicate HeroIds over a long run', () => {
    const { heroes, states } = runSummons(31337, 200)
    const ids = heroes.map((h) => h.id)
    expect(new Set(ids).size).toBe(ids.length)
    // consumedHeroIds matches the issued ids and is kept SORTED.
    const last = states[states.length - 1]
    expect([...last.consumedHeroIds].sort()).toEqual(last.consumedHeroIds)
    expect(new Set(last.consumedHeroIds)).toEqual(new Set(ids))
  })

  it('records the new hero under its id in heroes', () => {
    const { states, heroes } = runSummons(31337, 5)
    for (let i = 0; i < heroes.length; i++) {
      const h = heroes[i]
      expect(states[i].heroes[h.id]).toEqual(h)
    }
  })

  it('procedural heroes with star < 3 are classless (null)', () => {
    const { heroes } = runSummons(98765, 300)
    let sawSub3 = false
    for (const h of heroes) {
      if (h.origin === 'procedural' && h.star < 3) {
        sawSub3 = true
        expect(h.heroClass).toBeNull()
      }
    }
    expect(sawSub3).toBe(true)
  })

  it('procedural heroes carry origin procedural and an empty authored skill list', () => {
    const { heroes } = runSummons(98765, 100)
    const proc = heroes.filter((h) => h.origin === 'procedural')
    expect(proc.length).toBeGreaterThan(0)
    for (const h of proc) {
      expect(h.skills).toEqual([])
      expect(h.portraitToken).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('star proportions across many real summons ≈ 70/25/5 (within ~3%)', () => {
    // Many independent fresh accounts (pity 0 each pull) to measure base rates.
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0 }
    const N = 8000
    for (let s = 0; s < N; s++) {
      const state = makeState({ seed: makeSeed(100000 + s), gold: TUNING.gacha.normalCostGold })
      const { hero } = summon(state)
      counts[hero.star]++
    }
    expect(Math.abs(counts[1] / N - 0.7)).toBeLessThan(0.03)
    expect(Math.abs(counts[2] / N - 0.25)).toBeLessThan(0.03)
    expect(Math.abs(counts[3] / N - 0.05)).toBeLessThan(0.03)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Cameo summoning — consume once, no-dupe
// ─────────────────────────────────────────────────────────────────────────────

describe('summon — cameos', () => {
  /** Search seeds until a summon produces a cameo (consumedTemplateId set). */
  function findCameoState(): { state: GameState; templateId: string } {
    for (let s = 0; s < 5000; s++) {
      const state = makeState({ seed: makeSeed(500000 + s), gold: TUNING.gacha.normalCostGold * 5 })
      const { state: next, hero } = summon(state)
      if (next.consumedTemplateIds.length > 0) {
        return { state, templateId: next.consumedTemplateIds[0] }
      }
      // hero referenced to keep type usage explicit
      void hero
    }
    throw new Error('no cameo found in search space')
  }

  it('a cameo can be summoned and its templateId lands in consumedTemplateIds', () => {
    const { state } = findCameoState()
    const { state: next, hero } = summon(state)
    expect(next.consumedTemplateIds.length).toBe(1)
    expect(hero.origin).toBe('cameo')
    // The hero's identity matches an authored cameo of the rolled star.
    const tmpl = CAMEO_HEROES.find((t) => t.templateId === next.consumedTemplateIds[0])!
    expect(hero.name).toBe(tmpl.name)
    expect(hero.star).toBe(tmpl.star)
    expect(hero.heroClass).toBe(tmpl.heroClass)
    expect(hero.element).toBe(tmpl.element)
  })

  it('a consumed cameo is never re-issued (rollSummon excludes it)', () => {
    // Mark every cameo of every star consumed → no cameo is ever eligible.
    const allTemplateIds = CAMEO_HEROES.map((t) => t.templateId).sort()
    let rng = createRng(makeSeed(31))
    for (let i = 0; i < 300; i++) {
      rng = rngFor(makeSeed(31) as Seed, 'gacha', i)
      const { value } = rollSummon(rng, 0, [], allTemplateIds, [])
      expect(value.consumedTemplateId).toBeUndefined()
      expect(value.hero.origin).toBe('procedural')
    }
  })

  it('consumedTemplateIds stays sorted and unique across a long run', () => {
    const { states } = runSummons(777, 400)
    const last = states[states.length - 1]
    expect([...last.consumedTemplateIds].sort()).toEqual(last.consumedTemplateIds)
    expect(new Set(last.consumedTemplateIds).size).toBe(last.consumedTemplateIds.length)
    // Cameo count can never exceed the authored roster.
    expect(last.consumedTemplateIds.length).toBeLessThanOrEqual(CAMEO_HEROES.length)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// usedNames bookkeeping
// ─────────────────────────────────────────────────────────────────────────────

describe('summon — usedNames', () => {
  it('records procedural names sorted+unique; cameos do not add names', () => {
    const { states, heroes } = runSummons(123123, 80)
    const last = states[states.length - 1]
    expect([...last.usedNames].sort()).toEqual(last.usedNames)
    expect(new Set(last.usedNames).size).toBe(last.usedNames.length)
    const procNames = heroes.filter((h) => h.origin === 'procedural').map((h) => h.name)
    for (const n of procNames) {
      expect(last.usedNames).toContain(n)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Advanced (gem) pool — Layer 1 §1.1–1.3, the 4★+ kit (§4.2) and engravings (§5.4)
// ─────────────────────────────────────────────────────────────────────────────

describe('Advanced pool', () => {
  const ADV = TUNING.gacha.advanced

  it('rolls only 3★–5★', () => {
    for (let i = 0; i < 300; i++) {
      const s = rollAdvancedStar(rngFor(makeSeed(9), 'adv-test', i), 0, 0).value
      expect([3, 4, 5]).toContain(s)
    }
  })

  it('lifts the 30th dry pull to 4★+ and the 90th to 5★', () => {
    for (let i = 0; i < 50; i++) {
      const r = rngFor(makeSeed(3), 'adv-pity', i)
      expect(rollAdvancedStar(r, ADV.pityFloor4At - 1, 0).value).toBeGreaterThanOrEqual(4)
      expect(rollAdvancedStar(r, 0, ADV.pityFloor5At - 1).value).toBe(5)
    }
  })

  it('costs gems; the 10-pull is discounted', () => {
    expect(summonCost('advanced', 1)).toEqual({ gold: 0, gems: ADV.costGems })
    expect(summonCost('advanced', 10)).toEqual({ gold: 0, gems: ADV.tenPullGems })
    expect(() => summonMany(makeState({ gems: ADV.costGems - 1 }), 'advanced', 1)).toThrow(/gems/)
  })

  it('a 10-pull pays once, adds ten unique heroes and advances only the Advanced counters', () => {
    const s0 = makeState({ gems: ADV.tenPullGems })
    const { state, heroes } = summonMany(s0, 'advanced', 10)
    expect(state.gems).toBe(0)
    expect(heroes).toHaveLength(10)
    expect(new Set(heroes.map((h) => h.id)).size).toBe(10)
    expect(state.gacha.advPullCount).toBe(10)
    expect(state.gacha.pullCount).toBe(0)
    expect(state.gacha.pity).toBe(0)
  })

  it('every 4★+ arrives with its class skill, an engraving and a bound exclusive weapon', () => {
    // Force the floor so every pull is 4★+.
    let state = makeState({ gems: 1_000_000, gacha: { pity: 0, pullCount: 0, advPity4: ADV.pityFloor4At, advPity5: 0, advPullCount: 0 } })
    let seen = 0
    for (let i = 0; i < 12; i++) {
      state = { ...state, gacha: { ...state.gacha, advPity4: ADV.pityFloor4At } }
      const { state: next, heroes } = summonMany(state, 'advanced', 1)
      state = next
      const h = heroes[0]!
      expect(h.star).toBeGreaterThanOrEqual(4)
      expect(h.engraving).not.toBeNull()
      expect(ENGRAVINGS[h.engraving!.id]).toBeDefined()
      const weapon = state.inventory.find((i) => i.id === h.equipment.weapon)!
      expect(weapon.exclusiveTo).toBe(h.id)
      expect(weapon.grade).toBe(ADV.weaponGrade[h.star])
      if (h.origin === 'procedural' && h.heroClass !== null) {
        expect(h.skills.length).toBe(1 + ADV.extraSkills[h.star]!)
        seen++
      }
    }
    expect(seen).toBeGreaterThan(0)
  })

  it('never disturbs the Normal stream', () => {
    const plain = summon(makeState()).hero
    const afterAdv = summonMany(makeState({ gems: ADV.costGems }), 'advanced', 1).state
    const again = summon({ ...afterAdv, gold: TUNING.gacha.normalCostGold }).hero
    expect(again.name).toBe(plain.name)
    expect(again.star).toBe(plain.star)
    expect(again.baseAttrs).toEqual(plain.baseAttrs)
  })

  it('normal pulls never carry an engraving', () => {
    const { heroes } = runSummons(77, 60)
    for (const h of heroes) expect(h.engraving).toBeNull()
  })
})

describe('the mercy pull (no softlock)', () => {
  it('a Master with no living hero and too little gold gets one free Normal pull', () => {
    const broke = makeState({ gold: 100 })
    expect(mercySummonAvailable(broke)).toBe(true)
    const { state, heroes } = summonMany(broke, 'normal', 1)
    expect(heroes).toHaveLength(1)
    expect(state.gold).toBe(100) // nothing charged
    expect(mercySummonAvailable(state)).toBe(false) // one living hero now
  })

  it('is not offered while any hero lives, or when a pull is affordable', () => {
    expect(mercySummonAvailable(makeState({ gold: TUNING.gacha.normalCostGold }))).toBe(false)
    const one = summon(makeState()).state
    expect(mercySummonAvailable({ ...one, gold: 0 })).toBe(false)
    expect(() => summonMany({ ...one, gold: 0 }, 'normal', 1)).toThrow(/insufficient gold/)
  })
})
