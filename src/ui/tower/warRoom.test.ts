import { afterEach, describe, expect, it } from 'vitest'
import { createAccount } from '../../engine/account'
import { summonMany } from '../../engine/gacha'
import { attemptFloorWithResult } from '../../engine/store'
import { forecastFloor, enterConcerns } from '../../engine/scout'
import { ACTS, ANCHORS, HIDDEN_OBJECTIVES } from '../../engine/content'
import { TUNING } from '../../engine/tuning'
import type { CombatLog, GameState, HeroId, OwnedHero } from '../../engine/types'
import { setLocale } from '../i18n/i18n'
import { FR } from '../i18n/fr'
import { actAhead, actNumeral, floorMission, floorName, floorNameParts, FLOOR_NOUNS, FLOOR_QUALIFIERS, missionIcon, MISSION_ICON } from './floorNames'
import { altDelta, concernLines, deathsLine, heroRiskChip, missionLines, objectiveText, truthStanding } from './warRoomText'
import { resumeCursor } from '../battle/orderResume'
import { sanityPips } from './PartyStrip'
import { pendingMatches, pendingRecord } from './pendingReplay'

afterEach(() => setLocale('en'))

function party(seed = 3, floor = 1): GameState {
  let s = { ...createAccount(seed, { now: 0 }), gold: 1_000_000 }
  s = summonMany(s, 'normal', 10).state
  const ids = (Object.keys(s.heroes) as HeroId[]).slice(0, 5)
  s = { ...s, party: { slots: ids, lines: ['front', 'front', 'mid', 'back', 'back'] } }
  return floor === 1 ? s : { ...s, tower: { ...s.tower, currentFloor: floor, highestCleared: floor - 1 } }
}

describe('seeded floor names', () => {
  it('are deterministic per account, distinct within an act, and never given to anchors', () => {
    for (const act of ACTS) {
      const seen = new Set<string>()
      for (let f = act.from; f <= act.to; f++) {
        const p = floorNameParts(1234, f)
        if (ANCHORS[f]) {
          expect(p).toBeNull()
          continue
        }
        const key = `${p!.noun}|${p!.qualifier}`
        expect(seen.has(key)).toBe(false)
        seen.add(key)
        expect(floorNameParts(1234, f)).toEqual(p)
      }
    }
    // Another Master's tower is named differently (somewhere in the first act at least)…
    const differs = Array.from({ length: 9 }, (_, i) => i + 1).some((f) => JSON.stringify(floorNameParts(1, f)) !== JSON.stringify(floorNameParts(2, f)))
    expect(differs).toBe(true)
    // …but the Wailing Wall is the same for everyone.
    for (let f = 81; f <= 89; f++) if (!ANCHORS[f]) expect(floorNameParts(1, f)).toEqual(floorNameParts(999, f))
  })

  it('every act has enough names for its seeded floors, and every name part has French', () => {
    for (const act of ACTS) {
      const fillers = Array.from({ length: act.to - act.from + 1 }, (_, i) => act.from + i).filter((f) => !ANCHORS[f]).length
      expect((FLOOR_QUALIFIERS[act.id] ?? []).length * FLOOR_NOUNS.length).toBeGreaterThanOrEqual(fillers)
    }
    for (const w of [...FLOOR_NOUNS, ...Object.values(FLOOR_QUALIFIERS).flat()]) expect(FR[w], w).toBeTruthy()
    setLocale('fr')
    expect(floorName(1234, 2)).not.toBe(null)
    expect(floorName(1234, 5)).toBeNull()
  })

  it('mission icons cover every anchor mission and the seeded mix; future acts show only a numeral', () => {
    for (const a of Object.values(ANCHORS)) expect(MISSION_ICON[a.missionType], a.missionType).toBeDefined()
    for (const m of ['Subjugation', 'Survival', 'Escape', 'Seizure', 'Conquest']) expect(missionIcon(m)).toBe(MISSION_ICON[m])
    const s = party(4)
    expect(floorMission(s, 5)).toBe('Survival')
    expect(floorMission(s, 1)).toBe('Subjugation')
    expect(actNumeral('wall')).toBe('VII')
    expect(actAhead(80, 15)).toBe(true)
    expect(actAhead(11, 15)).toBe(false)
  })
})

describe('the war room’s words', () => {
  it('objectives in plain words', () => {
    const names = { priasis: 'Princess Priasis', pryos: 'Pryos Al Ragna' }
    expect(objectiveText({ kind: 'survive', ticks: 900 }, 2, names)).toBe('Hold out for 900 ticks.')
    expect(objectiveText({ kind: 'protect', targetTag: 'priasis' }, 2, names)).toContain('Keep Princess Priasis alive')
    expect(objectiveText({ kind: 'defeat', targetTag: 'pryos' }, 3, names)).toBe('Defeat Pryos Al Ragna.')
    expect(objectiveText({ kind: 'annihilate' }, 3, names)).toContain('all 3 waves')
    expect(missionLines({ mission: { type: 'Escape', objectives: [{ kind: 'reach', distance: 40 }], timer: 600 }, waves: 1 }, {})).toEqual([
      'Fight your way out: 40 steps (each hero’s turn is a step).',
      'All within 600 ticks.',
    ])
  })

  it('a risk chip per hero: stays home (with the fix), may panic, falls in N%, comes home', () => {
    const s = party(5, 2)
    const ids = s.party.slots as HeroId[]
    const name = (id: HeroId) => s.heroes[id]!.name.split(' ')[0]!
    const base = { slot: 0, line: 'front' as const, sanity: 80, panicPct: 0, lowSanity: false }
    expect(heroRiskChip(s, { ...base, heroId: ids[0]!, fights: false, reason: 'burnout', deathPct: 0 })).toMatchObject({ tone: 'bad', hint: 'Let them rest.' })
    expect(heroRiskChip(s, { ...base, heroId: ids[0]!, fights: false, reason: 'burnout', deathPct: 0 }).text).toContain('is burnt out and resting')
    const shaky = heroRiskChip(s, { ...base, heroId: ids[1]!, fights: true, deathPct: 70, sanity: 12, panicPct: 18, lowSanity: true })
    expect(shaky.text).toContain('falls in 70%')
    expect(shaky.text).toContain('may panic: Sanity 12')
    expect(shaky.tone).toBe('bad')
    expect(heroRiskChip(s, { ...base, heroId: ids[2]!, fights: true, deathPct: 0 }).text).toContain('comes home')
    expect(heroRiskChip(s, { ...base, heroId: ids[2]!, fights: true, deathPct: 0 }).text).toContain(name(ids[2]!))
  })

  it('deaths and deltas read naturally', () => {
    expect(deathsLine({ expectedDeaths: 0, fielded: 5 })).toBe('In every run, everyone came home.')
    expect(deathsLine({ expectedDeaths: 5, fielded: 5 })).toBe('In every run, the whole party fell.')
    expect(deathsLine({ expectedDeaths: 1.3, fielded: 5 })).toBe('About 1.3 heroes fall an attempt.')
    const f = forecastFloor(party(6, 3))!
    expect(altDelta(f, { ...f, winPct: Math.min(100, f.winPct), expectedDeaths: f.expectedDeaths - 1 })).toContain('1 fewer death')
    expect(altDelta({ ...f, fielded: 0 }, f)).toContain('to clear')
  })

  it('the Enter sheet names each hero and why, then the odds', () => {
    const s0 = party(7, 2)
    const ids = s0.party.slots as HeroId[]
    const h = s0.heroes
    const s: GameState = {
      ...s0,
      heroes: { ...h, [ids[0]!]: { ...h[ids[0]!]!, sanity: 0 } as OwnedHero, [ids[1]!]: { ...h[ids[1]!]!, sanity: 10 } as OwnedHero },
    }
    const f = forecastFloor(s)!
    const c = enterConcerns(f)!
    const lines = concernLines(s, f, c).map((l) => l.text)
    expect(lines[0]).toBe('Only 4 of 5 will fight.')
    expect(lines.some((l) => l.includes('has broken down (Sanity 0)'))).toBe(true)
    expect(lines.some((l) => l.includes('is at Sanity 10 and may panic'))).toBe(true)
  })

  it('the truth rule: found, ahead, missed — and whether F90 can still be refused', () => {
    const s = party(8, 31)
    const st = truthStanding(s)
    expect(st.total).toBe(HIDDEN_OBJECTIVES.length)
    expect(st.need).toBe(TUNING.lifecycle.subvertTruths)
    expect(st.found).toBe(0)
    expect(st.missed).toBe(HIDDEN_OBJECTIVES.filter((h) => h.floor <= 30).length)
    // Lane O: a truth missed on a floor behind the Master can be relived (Memories of the
    // Tower), so the refusal stays within reach until the fate is sealed.
    expect(st.reachable).toBe(true)
    const late = { ...s, tower: { ...s.tower, currentFloor: 90, highestCleared: 89 } }
    expect(truthStanding(late).reachable).toBe(true)
    const sealed = { ...late, tower: { ...late.tower, worldEnded: true } }
    expect(truthStanding(sealed).reachable).toBe(false)
    const all = { ...late, tower: { ...late.tower, hiddenFound: HIDDEN_OBJECTIVES.map((h) => h.id) } }
    expect(truthStanding(all).qualified).toBe(true)
  })
})

describe('B16 — an order resumes where the replay stands', () => {
  const log = (ticks: number[], extra: CombatLog['events'] = []): CombatLog => ({
    seed: 1,
    floor: 1,
    encounterContext: 'tower',
    unitsInit: [],
    outcome: 'win',
    rngDraws: 0,
    events: [...ticks.map((tick, seq) => ({ seq, tick, kind: 'miss' as const, actorId: 'a', targetId: `t${seq}` })), ...extra],
  })
  it('keeps the frame on screen: the rest of the tick still plays', () => {
    const prev = log([1, 2, 2, 2, 3])
    const next = log([1, 2, 2, 2], [{ seq: 4, tick: 3, kind: 'order', order: { tick: 3, kind: 'retreat' } }])
    // Mid-tick 2 (two of its three events shown): resume right there, not at tick 3.
    expect(resumeCursor(prev, next, 3)).toBe(3)
  })
  it('never resumes past the point where the logs part', () => {
    const prev = log([1, 2, 2])
    const next = log([1, 2])
    next.events.push({ seq: 2, tick: 2, kind: 'miss', actorId: 'b', targetId: 'x' })
    expect(resumeCursor(prev, next, 3)).toBe(2)
  })
  it('with the real engine: the re-resolved log repeats the old one through the order’s tick', () => {
    const s = party(9, 2)
    const plain = attemptFloorWithResult(s).result.result.log
    const mid = plain.events[Math.floor(plain.events.length / 2)]!
    const ordered = attemptFloorWithResult(s, undefined, undefined, undefined, [{ tick: mid.tick + 1, kind: 'retreat' }]).result.result.log
    const cursor = plain.events.findIndex((e) => e.seq === mid.seq) + 1
    expect(resumeCursor(plain, ordered, cursor)).toBe(cursor)
  })
})

describe('the party strip and the pending replay', () => {
  it('Sanity pips: five, any Sanity lights one, none at 0', () => {
    expect(sanityPips(0)).toBe(0)
    expect(sanityPips(1)).toBe(1)
    expect(sanityPips(55)).toBe(3)
    expect(sanityPips(100)).toBe(5)
  })

  it('a pending replay matches only its own account at the position its attempt left', () => {
    const s = party(10, 2)
    const r = attemptFloorWithResult(s)
    const rec = pendingRecord(r.state, r.result, 123)
    expect(rec.result.result).not.toHaveProperty('log')
    expect(rec.log).toBe(r.result.result.log)
    expect(pendingMatches(rec, r.state)).toBe(true)
    expect(pendingMatches(rec, s)).toBe(false) // the attempt never reached the save
    expect(pendingMatches(rec, { ...r.state, accountId: 'someone-else' })).toBe(false)
    expect(pendingMatches(rec, null)).toBe(false)
  })
})
