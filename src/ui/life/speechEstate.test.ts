import { describe, it, expect } from 'vitest'
import { createAccount } from '../../engine/account'
import { reduce } from '../../engine/store'
import { TUNING } from '../../engine/tuning'
import type { GameState, OwnedHero } from '../../engine/types'
import { estateOf } from '../../engine/estate'
import { FR } from '../i18n/fr'
import { speak, pairLines } from './speech'
import {
  BOND_LINES,
  BOUNTY_MEMORY,
  BURNOUT,
  COMFORTED,
  DECOR_LINES,
  DUEL_LINES,
  FAVOURED,
  JEALOUS,
  MEANING_LINES,
  PAIR_BOND,
  PAIR_DUEL,
  PAIR_JEALOUS,
  PAIR_WEATHER,
  SEASON_LINES,
  STATUE_OF,
  VETERAN,
  WEATHER_LINES,
  WITHDRAWN,
  WITHDRAWN_LOSS,
  estateTopics,
} from './speechEstate'

type Bank = Partial<Record<string, string[]>>
const VOICES = ['formal', 'rough', 'cheerful', 'quiet', 'grim'] as const

function lines(bank: Bank): string[] {
  return Object.values(bank).flatMap((x) => x ?? [])
}

function roster(seed: number, n = 6): GameState {
  let st: GameState = { ...createAccount(seed), gold: TUNING.gacha.normalCostGold * n }
  for (let i = 0; i < n; i++) st = reduce(st, { type: 'SUMMON' })
  return st
}

describe('estate dialogue banks', () => {
  const banks: Bank[] = [
    ...Object.values(WEATHER_LINES),
    WITHDRAWN,
    WITHDRAWN_LOSS,
    COMFORTED,
    BURNOUT,
    JEALOUS,
    FAVOURED,
    STATUE_OF,
    BOND_LINES,
    SEASON_LINES,
    DECOR_LINES,
    BOUNTY_MEMORY,
    { v: VETERAN, m: MEANING_LINES },
    ...Object.values(DUEL_LINES),
  ]

  it('no bank is empty, and every voiced bank offers every voice some choice', () => {
    for (const b of banks) {
      expect(lines(b).length).toBeGreaterThan(0)
      for (const v of Object.values(b)) if (v) expect(v.length).toBeGreaterThan(0)
    }
    for (const b of [...Object.values(WEATHER_LINES), WITHDRAWN, BURNOUT, JEALOUS]) {
      for (const voice of VOICES) expect([...(b[voice] ?? []), ...(b.any ?? [])].length).toBeGreaterThanOrEqual(2)
    }
  })

  it('every line — and every pair — has a French translation with the same placeholders', () => {
    const pairs = [...Object.values(PAIR_WEATHER).flat(), ...Object.values(PAIR_DUEL).flat(), ...PAIR_JEALOUS, ...PAIR_BOND].flat()
    const all = [...banks.flatMap(lines), ...pairs]
    const missing = all.filter((l) => /\p{L}/u.test(l) && !(l in FR))
    expect(missing).toEqual([])
  })
})

describe('estate topics in conversation', () => {
  it('a withdrawn hero only answers tersely', () => {
    const s0 = roster(31)
    const h = Object.values(s0.heroes).find((x) => x.alive)!
    const e = estateOf(s0)
    const s: GameState = { ...s0, estate: { ...e, trauma: { [h.id]: { fatigue: 0, foughtAt: 0, burnoutUntil: null, veteran: false, withdrawn: { since: 0, cause: null, comfort: 0, lastTalkDay: -1 }, lowSince: null } } } }
    const terse = new Set(lines(WITHDRAWN))
    for (let i = 0; i < 20; i++) {
      const line = speak({ ...s, life: { ...s.life, slot: s.life.slot + i } }, h, false, String(i))
      expect(terse.has(line)).toBe(true)
    }
  })

  it('the weather is always something to talk about', () => {
    const s = roster(32)
    const h = Object.values(s.heroes).find((x) => x.alive)!
    const topics = estateTopics(s, h as OwnedHero, { voice: 'cheerful' } as never, () => 'X', () => 'Y')
    expect(topics.length).toBeGreaterThanOrEqual(2)
    for (const tp of topics) expect(tp.say('seed').length).toBeGreaterThan(0)
  })

  it('a hero says many different things over a couple of days (and the same thing twice in one moment)', () => {
    const s = roster(33, 8)
    const heroes = Object.values(s.heroes).filter((x) => x.alive)
    for (const h of heroes.slice(0, 4)) {
      const seen = new Set<string>()
      // Ten days in (the first day's memory has faded), over two more days.
      for (let i = 0; i < 96; i++) seen.add(speak({ ...s, life: { ...s.life, slot: s.life.slot + 480 + i } }, h, false))
      expect(seen.size).toBeGreaterThanOrEqual(8)
      expect(speak(s, h, false, 'x')).toBe(speak(s, h, false, 'x'))
    }
    const [a, b] = heroes
    expect(pairLines(s, a!, b!, 3)).toEqual(pairLines(s, a!, b!, 3))
  })
})
