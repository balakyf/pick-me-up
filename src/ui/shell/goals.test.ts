/** WP7 (spec 2026-10-12 S4): the goal stack. */
import { describe, it, expect, afterEach } from 'vitest'
import { createAccount } from '../../engine/account'
import { reduce } from '../../engine/store'
import { TUNING } from '../../engine/tuning'
import { lifeOf, jobFeeling, jobOpen, jobSeats, jobHolders, JOBS } from '../../engine/life'
import { canPromote } from '../../engine/promotion'
import type { FallenRecord, GameState, HeroId, OwnedHero } from '../../engine/types'
import { setLocale } from '../i18n/i18n'
import { GUIDE_STEPS } from '../life/FirstSteps'
import { COLLECTION_SIZE, GRIEF_REQUEST_AT, collectionCount, formatEta, heroRequest, nextGoals, type Goal, type GoalStack } from './goals'

const W = TUNING.time.worldTimeFactor
const COST = TUNING.gacha.normalCostGold

const fresh = (): GameState => createAccount(11, { now: 0 })
/** Onboarding done (the free ten-pull taken), Floor `f` cleared, the starter still in the party. */
function at(f: number, patch: Partial<GameState> = {}): GameState {
  const s = fresh()
  return {
    ...s,
    tower: { ...s.tower, currentFloor: f + 1, highestCleared: f },
    life: { ...s.life, guide: { ...s.life.guide, tutorialPull: true, done: ['dismissed'] } },
    ...patch,
  }
}
const starter = (s: GameState): OwnedHero => Object.values(s.heroes)[0]!
function withStarter(s: GameState, patch: Partial<OwnedHero>): GameState {
  const h = starter(s)
  return { ...s, heroes: { ...s.heroes, [h.id]: { ...h, ...patch } } }
}
function allOpen(s: GameState): GameState {
  return { ...s, tower: { ...s.tower, currentFloor: 21, highestCleared: 20 }, meta: { ...s.meta, masterLevel: 20 } }
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o)
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v)
  }
  return o
}

const lines = (g: GoalStack): Goal[] => [g.short, g.medium, g.long, g.cta, g.request].filter((x): x is Goal => x !== null)

afterEach(() => setLocale('en'))

describe('nextGoals: short, medium and long for every stage', () => {
  it('fresh: the first step, the Kitchen one floor away, Act I (the free pull is the only summon on offer)', () => {
    const g = nextGoals(fresh(), 0)
    expect(g.short.id).toBe('guide:pull')
    expect(g.short.text).toBe('Take your first summon')
    expect(g.short.go).toEqual({ kind: 'place', place: 'summon' })
    expect(g.short.progress).toMatchObject({ cur: 0, max: 6 })
    expect(g.onboarding).toEqual({ done: 0, total: 6 })
    expect(g.medium!.id).toBe('unlock:kitchen')
    expect(g.medium!.text).toBe('Kitchen opens at Floor 1')
    expect(g.medium!.detail).toBe('Also: Memorial, Daily Dungeon')
    expect(g.medium!.progress).toMatchObject({ cur: 0, max: 1 })
    expect(g.long.text).toBe('Act I — The Prairie')
    expect(g.long.progress).toMatchObject({ cur: 0, max: 10 })
    expect(g.long.detail).toBe(`Collection 1/${COLLECTION_SIZE}`)
    // 15,000 gold, but the first summon is free: "you can afford 5" would mislead.
    expect(g.cta).toBeNull()
  })

  it('onboarding leads only through the core loop; side steps never hide the next floor', () => {
    let s = reduce(fresh(), { type: 'SUMMON', count: 10 })
    expect(nextGoals(s, 0).short.id).toBe('guide:party')
    const ids = (Object.values(s.heroes) as OwnedHero[]).filter((h) => h.alive).map((h) => h.id).slice(0, 5)
    s = reduce(s, { type: 'SET_PARTY', slots: ids, lines: s.party.lines })
    expect(nextGoals(s, 0).short.id).toBe('guide:floor')
    // Floor 1 cleared, "talk to a hero" still open: the floor is the short goal again,
    // and the side step rides underneath (no bar: the First steps toggle counts).
    const g = nextGoals({ ...s, tower: { ...s.tower, currentFloor: 2, highestCleared: 1 } }, 0)
    expect(g.short.id).toBe('floor')
    expect(g.short.text).toMatch(/^Floor 2 · /)
    expect(g.step).toMatchObject({ id: 'guide:talk', text: 'Talk to one of your heroes' })
    expect(g.step!.progress).toBeUndefined()
    expect(g.onboarding).toEqual({ done: 3, total: 6 })
    // Done or dismissed: no side step.
    expect(nextGoals(at(5), 0).step).toBeNull()
  })

  it('a job request stands in for the "give a hero a job" step', () => {
    let s = reduce(null, { type: 'NEW_ACCOUNT', seed: 21, now: 0 })
    s = reduce(s, { type: 'ADD_GOLD', amount: 60_000 })
    s = reduce(s, { type: 'SUMMON', count: 10 })
    s = reduce(s, { type: 'SUMMON', count: 10 })
    const ids = (Object.values(s.heroes) as OwnedHero[]).filter((h) => h.alive).map((h) => h.id).slice(0, 5)
    s = reduce(s, { type: 'SET_PARTY', slots: ids, lines: s.party.lines })
    s = { ...allOpen(s), life: { ...s.life, guide: { ...s.life.guide, done: [...s.life.guide.done, 'talk'] } } }
    const g = nextGoals(s, 0)
    // Seed 21 has a hero who likes cooking: the request replaces the generic step.
    expect(g.request?.id).toMatch(/^request:job:/)
    expect(g.step).toBeNull()
  })

  it('F6: the next floor with its threat and reward, a facility two floors away, Act I 5/10', () => {
    const g = nextGoals(at(5), 0)
    expect(g.onboarding).toBeNull()
    expect(g.short.id).toBe('floor')
    expect(g.short.text).toMatch(/^Floor 6 · (looks safe|a fair fight|risky|deadly)$/)
    expect(['safe', 'fair', 'risky', 'deadly']).toContain(g.short.tone)
    expect(g.short.detail).toBe('Reward: ◆ gold and Master XP')
    expect(g.short.go).toEqual({ kind: 'place', place: 'tower' })
    expect(g.medium!.text).toBe('Promotion Chamber opens at Floor 7')
    expect(g.medium!.progress).toMatchObject({ cur: 5, max: 7 })
    expect(g.long.progress).toMatchObject({ cur: 5, max: 10 })
  })

  it('F21 (everything open): Act III and the next boss, a known reward on replayed floors', () => {
    const s = allOpen(at(20))
    const g = nextGoals(s, 0)
    expect(g.short.text).toMatch(/^Floor 21 · /)
    expect(g.medium!.id).toBe('boss') // nothing else to work toward: the F25 boss
    expect(g.medium!.text).toBe('Boss in 4 floors')
    expect(g.long.text).toBe('Act III — The Swamp')
    expect(g.long.progress).toMatchObject({ cur: 0, max: 10 })
    // A floor already cleared (after a rollback) pays plain gold.
    const replay = { ...s, tower: { ...s.tower, currentFloor: 18 } }
    expect(nextGoals(replay, 0).short.detail).toBe('Reward: ◆ gold')
  })

  it('a boss floor two away beats the summon bar; on the boss floor the short line wears a skull', () => {
    const s = allOpen(at(7, { gold: 0 }))
    expect(nextGoals({ ...s, tower: { ...s.tower, currentFloor: 8, highestCleared: 20 } }, 0).medium!.text).toBe('Boss in 2 floors')
    const onBoss = nextGoals({ ...s, tower: { ...s.tower, currentFloor: 25, highestCleared: 24 } }, 0)
    expect(onBoss.short.icon).toBe('☠')
    expect(onBoss.short.detail).toBe('Reward: a boss, then a bonus room')
  })

  it('an open event or a pair of doors is the short goal', () => {
    const s = at(5)
    expect(nextGoals({ ...s, tower: { ...s.tower, event: { kind: 'bonus', floor: 5, options: ['rest'] } } }, 0).short.text).toBe(
      'Floor 6: an event awaits',
    )
    const doors = { ...s, tower: { ...s.tower, doors: [{ kind: 'path' as const, reward: 'gold' as const }, { kind: 'elite' as const, reward: 'boon' as const }] } }
    expect(nextGoals(doors, 0).short.text).toBe('Floor 6: choose your door')
    // A chosen Elite door shows its reward.
    expect(nextGoals({ ...s, tower: { ...s.tower, kind: 'elite' } }, 0).short.detail).toBe('Reward: double ◆ gold, stones and a boon')
    // With the Sortie's Boons full the Skull earns none, so the goal promises none (#21).
    const sortie = { startFloor: 3, floors: 2, purse: 0, boons: ['calmMind', 'ironVow', 'volley', 'warChest'] }
    expect(nextGoals({ ...s, tower: { ...s.tower, kind: 'elite', sortie } }, 0).short.detail).toBe('Reward: double ◆ gold and stones (boons full)')
  })

  it('no fighters: set the party; no heroes at all: summon', () => {
    const s = at(3)
    expect(nextGoals({ ...s, party: { ...s.party, slots: s.party.slots.map(() => null) } }, 0).short.id).toBe('no-party')
    expect(nextGoals(withStarter(s, { alive: false }), 0).short.id).toBe('no-heroes')
    const spent = nextGoals(withStarter(s, { sanity: 0 }), 0).short
    expect(spent).toMatchObject({ id: 'party-rest', text: 'Your party needs rest', go: { kind: 'place', place: 'kitchen' } })
    const drilling = withStarter(s, { training: { skillId: 'power_strike', mode: 'refine', completesAtWorld: 9e15 } })
    expect(nextGoals(drilling, 0).short).toMatchObject({ id: 'no-party', detail: 'Everyone in the party is busy right now.' })
  })

  it('stored Interference charges double the reward line', () => {
    const s = at(5)
    const g = nextGoals({ ...s, meta: { ...s.meta, rested: { charges: 3, carryWorld: 0 } } }, 0)
    expect(g.short.detail).toContain('Pent-up Interference: ◆ ×2 (3 left)')
  })
})

describe('first-step targets', () => {
  const build = GUIDE_STEPS.find((g) => g.id === 'build')!
  it('"Build something new" points at an unbuilt building the campus has opened, never a preview when one is', () => {
    // F1: none of them is open yet; the Tavern opens next.
    expect(build.target(at(1))).toEqual({ kind: 'place', place: 'tavern' })
    // F3, the Tavern already built: the Garden (open at F3) is the next real build.
    const s = at(3)
    const built = { ...s, facilities: { ...s.facilities, tavern: { ...s.facilities.tavern, level: 1 } } }
    expect(build.target(built)).toEqual({ kind: 'place', place: 'garden' })
    // F5: the Forge's place is the armory.
    const f5 = at(5)
    const both = { ...f5, facilities: { ...f5.facilities, tavern: { ...f5.facilities.tavern, level: 1 }, garden: { ...f5.facilities.garden, level: 1 } } }
    expect(build.target(both)).toEqual({ kind: 'place', place: 'armory' })
  })
})

describe('"Summon now!"', () => {
  it('appears exactly when a Normal summon is affordable', () => {
    expect(nextGoals(at(5, { gold: COST }), 0).cta).toMatchObject({ text: 'Summon now!', detail: 'You can afford one hero', go: { kind: 'place', place: 'summon' } })
    expect(nextGoals(at(5, { gold: COST * 3 + 5 }), 0).cta!.detail).toBe('You can afford 3 heroes')
    expect(nextGoals(at(5, { gold: COST - 1 }), 0).cta).toBeNull()
  })

  it('waits for the free first summon, then appears with the gold still in hand', () => {
    const s = fresh()
    expect(s.gold).toBeGreaterThanOrEqual(COST)
    expect(nextGoals(s, 0).cta).toBeNull()
    const pulled = reduce(s, { type: 'SUMMON', count: 10 })
    expect(pulled.life.guide.tutorialPull).toBe(true)
    expect(nextGoals(pulled, 0).cta).toMatchObject({ id: 'summon-now', text: 'Summon now!' })
    // A Master who waved the guide away is told the ten-pull is still free.
    const dismissed = { ...s, life: { ...s.life, guide: { ...s.life.guide, done: ['dismissed'] } } }
    expect(nextGoals(dismissed, 0).cta).toMatchObject({ id: 'summon-now', text: 'Free summon!', go: { kind: 'place', place: 'summon' } })
  })

  it('a veteran who never took the free ten-pull is told it is free, not what the gold buys', () => {
    // Six living heroes tick the "first summon" step, but the free pull is still on offer.
    const vet = at(10, { gold: 500, life: { ...at(10).life, guide: { tutorialPull: false, done: ['dismissed'] } } })
    const g = nextGoals(vet, 0)
    expect(g.cta).toMatchObject({ text: 'Free summon!', detail: 'The crystal owes you ten heroes' })
    expect(g.medium?.id).not.toBe('summon-progress') // no "Next summon 500/3,000" beside a free pull
    // Taken: back to the gold rules.
    const taken = { ...vet, life: { ...vet.life, guide: { ...vet.life.guide, tutorialPull: true } } }
    expect(nextGoals(taken, 0).cta).toBeNull()
    expect(nextGoals(taken, 0).medium?.id).toBe('summon-progress')
  })

  it('short of the cost, the medium line is the gold bar toward the next summon', () => {
    const g = nextGoals(at(10, { gold: 2100 }), 0) // the Guild (F15) and the F15 boss are both far off
    expect(g.medium).toMatchObject({ id: 'summon-progress', text: 'Next summon', progress: { cur: 2100, max: COST, label: '2,100/3,000' } })
  })
})

describe('legacy and timers on the medium line', () => {
  it('a New Arrival token or a waiting echo comes first', () => {
    const s = at(5)
    const legacy = s.life.legacy
    const token = { ...s, life: { ...s.life, legacy: { ...legacy, recruitTokens: 1 } } }
    expect(nextGoals(token, 0).medium).toMatchObject({ id: 'recruit', go: { kind: 'place', place: 'memorial' } })
    const echo = {
      ...s,
      life: { ...s.life, legacy: { ...legacy, pending: [{ fallenId: 'h_9' as HeroId, fallenName: 'Mira Vey', floor: 4, stat: 'pAtk' as const, pct: 0.1, candidates: [] }] } },
    }
    expect(nextGoals(echo, 0).medium!.text).toBe('Mira’s echo waits for an heir')
  })

  it('a Bane a floor or two up takes the medium line, translated; one further off does not', () => {
    const s = at(5) // currentFloor 6
    const nem = (revengeFloor: number) => ({
      id: 'nem_h_9',
      templateId: 'goblin',
      name: 'Goblin',
      element: 'fire' as const,
      level: 3,
      heroId: 'h_9' as HeroId,
      heroName: 'Mira Vey',
      diedFloor: 4,
      revengeFloor,
      status: 'waiting' as const,
    })
    const near = { ...s, life: { ...s.life, legacy: { ...s.life.legacy, nemeses: [nem(8)] } } }
    expect(nextGoals(near, 0).medium).toMatchObject({ id: 'bane:nem_h_9', text: 'Mira’s Bane waits on floor 8', go: { kind: 'place', place: 'tower' } })
    setLocale('fr')
    expect(nextGoals(near, 0).medium!.text).toBe('Le Fléau de Mira attend à l’étage 8')
    setLocale('en')
    const far = { ...s, life: { ...s.life, legacy: { ...s.life.legacy, nemeses: [nem(12)] } } }
    expect(nextGoals(far, 0).medium!.id).not.toMatch(/^bane:/)
  })

  it('with nothing else to chase, the soonest timer shows its real-time ETA', () => {
    const now = 1_000_000
    const s = withStarter(allOpen(at(20)), {
      training: { skillId: 'power_strike', mode: 'refine', completesAtWorld: now + 90 * 60_000 * W },
    })
    const s2 = { ...s, tower: { ...s.tower, currentFloor: 22 } } // the F25 boss is 3 floors off
    const g = nextGoals(s2, now)
    expect(g.medium!.text).toBe(`${starter(s).name.split(' ')[0]}’s drill ends in 1h30`)
    expect(g.medium!.go).toEqual({ kind: 'place', place: 'trainingCenter' })
  })

  it('formatEta is short and language-neutral', () => {
    expect(formatEta(0)).toBe('1 min')
    expect(formatEta(59 * 60_000)).toBe('59 min')
    expect(formatEta(60 * 60_000)).toBe('1h00')
    expect(formatEta(125 * 60_000 + 1)).toBe('2h06')
  })
})

describe('hero requests come from state', () => {
  it('a hero at the level cap asks to be promoted', () => {
    const s = withStarter(at(5), { xp: { ...starter(at(5)).xp, atCap: true } })
    expect(canPromote(starter(s))).toBe(true)
    const r = heroRequest(s)!
    expect(r.text).toMatch(/: “Promote me!”$/)
    expect(r.go).toEqual({ kind: 'place', place: 'promotionChamber' })
    expect(nextGoals(s, 0).request!.id).toBe(r.id)
  })

  it('a grieving hero asks for the Memorial', () => {
    const s = at(5)
    const h = starter(s)
    const g = withStarter(s, { life: { ...lifeOf(h), grief: GRIEF_REQUEST_AT } })
    expect(heroRequest(g)!.text).toMatch(/is grieving: visit the Memorial$/)
    expect(heroRequest(withStarter(s, { life: { ...lifeOf(h), grief: GRIEF_REQUEST_AT - 1 } }))?.id ?? '').not.toMatch(/grief/)
  })

  it('an idle hero who likes an open job with a free seat asks for it (and opens their profile)', () => {
    let s = reduce(null, { type: 'NEW_ACCOUNT', seed: 21, now: 0 })
    s = reduce(s, { type: 'ADD_GOLD', amount: 60_000 })
    s = reduce(s, { type: 'SUMMON', count: 10 })
    s = reduce(s, { type: 'SUMMON', count: 10 })
    s = allOpen(s) // every workplace on campus open
    const heroes = (Object.values(s.heroes) as OwnedHero[]).filter((h) => h.alive).sort((a, b) => (a.id < b.id ? -1 : 1))
    const wants = heroes.find(
      (h) => !canPromote(h) && h.life && !h.life.job && JOBS.some((j) => jobFeeling(h, j) === 'likes' && jobOpen(s, j) && jobHolders(s, j).length < jobSeats(s, j)),
    )
    const r = heroRequest(s)
    // Seed 21 is chosen so the case is real: someone wants a job, and no one outranks it.
    expect(wants).toBeDefined()
    expect(heroes.some((h) => canPromote(h) || (h.life?.grief ?? 0) >= GRIEF_REQUEST_AT)).toBe(false)
    expect(r!.id).toMatch(/^request:job:/)
    expect(r!.text).toMatch(/^Assign .+ to the /)
    expect(r!.go).toEqual({ kind: 'hero', heroId: wants!.id, action: 'profile' })
  })

  it('never asks for a job at a place the campus has not opened yet', () => {
    let s = reduce(null, { type: 'NEW_ACCOUNT', seed: 21, now: 0 })
    s = reduce(s, { type: 'ADD_GOLD', amount: 60_000 })
    s = reduce(s, { type: 'SUMMON', count: 10 })
    s = reduce(s, { type: 'SUMMON', count: 10 })
    expect(s.tower.highestCleared).toBe(0) // nothing open: the Kitchen waits for Floor 1
    // The engine would seat a cook already (so it is the campus gate that holds the request back).
    const heroes = (Object.values(s.heroes) as OwnedHero[]).filter((h) => h.alive)
    expect(heroes.some((h) => h.life && !h.life.job && jobFeeling(h, 'cook') === 'likes' && jobOpen(s, 'cook'))).toBe(true)
    expect(heroRequest(s)?.id ?? 'none').not.toMatch(/^request:job:/)
    // One floor later the Kitchen opens, and the request appears.
    expect(heroRequest({ ...s, tower: { ...s.tower, currentFloor: 2, highestCleared: 1 } })?.id).toMatch(/^request:job:.+:cook$/)
  })

  it('no one asks for anything on a fresh account', () => {
    expect(heroRequest(fresh())).toBeNull()
  })
})

describe('collection', () => {
  it('counts class × element pairs among every hero met, the fallen included (endowed by the first pull)', () => {
    let s = reduce(null, { type: 'NEW_ACCOUNT', seed: 5, now: 0 })
    expect(collectionCount(s)).toBe(1)
    s = reduce(s, { type: 'SUMMON', count: 10 })
    const n = collectionCount(s)
    expect(n).toBeGreaterThan(1)
    expect(n).toBeLessThanOrEqual(COLLECTION_SIZE)
    // A fallen hero still counts: bury one of a pair nobody alive has.
    const have = new Set((Object.values(s.heroes) as OwnedHero[]).map((x) => `${x.heroClass ?? '-'}|${x.element}`))
    const pair = (['warrior', 'spearman', 'thief', 'archer', 'mage'] as const)
      .flatMap((c) => (['fire', 'dark', 'light'] as const).map((e) => [c, e] as const))
      .find(([c, e]) => !have.has(`${c}|${e}`))!
    const grave = { ...({} as FallenRecord), heroId: 'h_gone' as HeroId, heroClass: pair[0], element: pair[1] }
    expect(collectionCount({ ...s, life: { ...s.life, memorial: [...s.life.memorial, grave] } })).toBe(n + 1)
  })
})

describe('purity, determinism and smoke-test hygiene', () => {
  const FIXTURES = (): GameState[] => [fresh(), at(1), at(5), at(5, { gold: 10 }), allOpen(at(20)), withStarter(at(5), { alive: false })]

  it('is pure (deep-frozen input) and deterministic', () => {
    for (const s of FIXTURES()) {
      const frozen = deepFreeze(s)
      const a = nextGoals(frozen, 123)
      expect(nextGoals(frozen, 123)).toEqual(a)
    }
  })

  it('no goal text could be mistaken by the smoke tests for a real button (EN and FR)', () => {
    const FORBIDDEN = ['Menu', 'Enter', 'Advanced', 'Treasure', 'Claim +50', 'Honey Cake', 'Captives', 'Français', 'English', 'Banquet', 'Summon ×10']
    for (const locale of ['en', 'fr'] as const) {
      setLocale(locale)
      for (const s of FIXTURES()) {
        for (const g of lines(nextGoals(s, 0))) {
          for (const bad of FORBIDDEN) expect(`${g.text} ${g.progress?.label ?? ''}`, `${locale}: ${g.id}`).not.toContain(bad)
        }
      }
    }
  })

  it('French: every line is translated', () => {
    setLocale('fr')
    const g = nextGoals(at(5), 0)
    expect(g.short.text).toMatch(/^Étage 6 · /)
    expect(g.short.detail).toBe('Récompense : ◆ or et XP de Maître')
    expect(g.medium!.text).toBe('Chambre de promotion ouvre à l’étage 7')
    expect(g.cta!.text).toBe('Invoquez !')
    expect(g.long.text).toBe('Acte I — La Prairie')
  })
})
