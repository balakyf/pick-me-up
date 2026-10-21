import { describe, it, expect, afterEach } from 'vitest'
import { heroLetter } from './heroLetters'
import { vignettePlace, vignetteText } from './vignettes'
import { createAccount } from '../../engine/account'
import { reduce } from '../../engine/store'
import { advanceTime, toWorldTime } from '../../engine/time'
import { dayOfSlot, lifeOf, slotOf } from '../../engine/life'
import { summarizeAway } from '../../engine/return'
import { TUNING } from '../../engine/tuning'
import type { GameState, HeroId, Memory, OwnedHero } from '../../engine/types'
import { setLocale } from '../i18n/i18n'

afterEach(() => setLocale('en'))

const T0 = Date.UTC(2026, 9, 1, 18)
const HOUR = 3_600_000

function roster(seed = 31, n = 5): GameState {
  let s: GameState = { ...createAccount(seed, { now: T0 }), gold: TUNING.gacha.normalCostGold * n }
  for (let i = 0; i < n; i++) s = reduce(s, { type: 'SUMMON' })
  return s
}
function ids(s: GameState): HeroId[] {
  return (Object.values(s.heroes) as OwnedHero[]).filter((h) => h.alive).map((h) => h.id).sort()
}
function withMemory(s: GameState, id: HeroId, m: Memory): GameState {
  const h = s.heroes[id]!
  const life = lifeOf(h)
  return { ...s, heroes: { ...s.heroes, [id]: { ...h, life: { ...life, memories: [...life.memories, m] } } } }
}
const first = (s: GameState, id: HeroId) => s.heroes[id]!.name.split(/\s+/)[0]!

/** Accusing or guilt-tripping phrasing the letters must never use. */
const GUILT = /where were you|you left us|abandon|forgot(ten)? (us|me)|starv|suffer|lonely without you|why did you/i

describe('hero letters', () => {
  it('are written from a memory made while the Master was away, signed by its hero', () => {
    const before = roster()
    const [a, b] = ids(before)
    const after0 = { ...before, meta: { ...before.meta, lastSeenAtWorld: before.meta.lastSeenAtWorld + toWorldTime(9 * HOUR) } }
    const day = dayOfSlot(slotOf(after0.meta.lastSeenAtWorld))
    const after = withMemory(after0, a!, { kind: 'befriended', day, other: b!, weight: 95 })
    const letter = heroLetter(before, after)!
    expect(letter.heroId).toBe(a)
    expect(letter.lines[0]).toContain(first(after, b!))
    expect(letter.signoff).toBe(`— ${first(after, a!)}`)
    expect(letter.lines.length).toBeGreaterThanOrEqual(2)
    for (const l of letter.lines) expect(l).not.toMatch(GUILT)
  })

  it('an old memory is never written up as news; a keepsake still may be', () => {
    const before = roster()
    const [a, b] = ids(before)
    const strip = (s: GameState): GameState => ({
      ...s,
      heroes: Object.fromEntries(Object.entries(s.heroes).map(([k, h]) => [k, { ...h, life: { ...lifeOf(h), memories: [] } }])) as GameState['heroes'],
    })
    const b4 = strip(before)
    const after0 = { ...b4, meta: { ...b4.meta, lastSeenAtWorld: b4.meta.lastSeenAtWorld + toWorldTime(9 * HOUR) } }
    const longAgo = dayOfSlot(slotOf(b4.meta.lastSeenAtWorld)) - 20
    const stale = withMemory(withMemory(after0, a!, { kind: 'befriended', day: longAgo, other: b!, weight: 95 }), b!, { kind: 'firstDay', day: longAgo, weight: 50 })
    const letter = heroLetter(b4, stale)!
    expect(letter.lines.join(' ')).not.toMatch(/friends now|saved me the last|still learning/)
    const keepsake = withMemory(after0, a!, { kind: 'gift', day: longAgo, detail: 'honey_cake', weight: 60 })
    const kept = heroLetter(b4, keepsake)!
    expect(kept.heroId).toBe(a)
    expect(kept.lines[0]).toContain('Honey Cake')
  })

  it('a remembered gift is named as the hero knows it (and in French)', () => {
    const before = roster()
    const [a] = ids(before)
    const after0 = { ...before, meta: { ...before.meta, lastSeenAtWorld: before.meta.lastSeenAtWorld + toWorldTime(9 * HOUR) } }
    const day = dayOfSlot(slotOf(after0.meta.lastSeenAtWorld))
    const after = withMemory(after0, a!, { kind: 'gift', day, detail: 'honey_cake', weight: 99 })
    expect(heroLetter(before, after)!.lines[0]).toContain('Honey Cake')
    setLocale('fr')
    expect(heroLetter(before, after)!.lines[0]).toContain('Gâteau au miel')
  })

  it('a job that really produced something gets its line, with the real number', () => {
    const before = roster()
    const [a] = ids(before)
    const cook = { ...before, heroes: { ...before.heroes, [a!]: { ...before.heroes[a!]!, life: { ...lifeOf(before.heroes[a!]!), job: 'cook' as const, memories: [] } } } }
    const strip = (s: GameState): GameState => ({
      ...s,
      heroes: Object.fromEntries(Object.entries(s.heroes).map(([k, h]) => [k, k === a ? h : { ...h, life: { ...lifeOf(h), memories: [] } }])) as GameState['heroes'],
    })
    const b4 = strip(cook)
    const after = { ...b4, meta: { ...b4.meta, lastSeenAtWorld: b4.meta.lastSeenAtWorld + 1000 }, life: { ...b4.life, tally: { ...b4.life.tally, meals: b4.life.tally.meals + 7 } } }
    const letter = heroLetter(b4, after)!
    expect(letter.heroId).toBe(a)
    expect(letter.lines.join(' ')).toContain('7 meals')
  })

  it('over a real simulated absence: deterministic, warm, translated', () => {
    const before = roster(41, 7)
    const after = advanceTime(before, toWorldTime(T0 + 20 * HOUR))
    const a = heroLetter(before, after)
    expect(a).toEqual(heroLetter(before, after))
    expect(a).not.toBeNull()
    for (const l of a!.lines) expect(l).not.toMatch(GUILT)
    setLocale('fr')
    const fr = heroLetter(before, after)!
    expect(fr.heroId).toBe(a!.heroId)
    expect(fr.lines.join(' ')).not.toBe(a!.lines.join(' '))
  })

  it('no one to write: null', () => {
    const s = roster()
    const dead: GameState = { ...s, heroes: Object.fromEntries(Object.entries(s.heroes).map(([k, h]) => [k, { ...h, alive: false }])) as GameState['heroes'] }
    expect(heroLetter(dead, dead)).toBeNull()
  })
})

describe('ledger vignettes', () => {
  it('read as chronicle lines and travel to the right place', () => {
    const before = roster()
    const [a, b] = ids(before)
    const t = before.meta.lastSeenAtWorld
    const after: GameState = {
      ...before,
      meta: { ...before.meta, lastSeenAtWorld: t + 5000, masterLevel: before.meta.masterLevel + 1 },
      life: { ...before.life, chronicle: [...before.life.chronicle, { at: t + 10, kind: 'friends', heroIds: [a!, b!] }, { at: t + 20, kind: 'forged', heroIds: [a!], detail: 'Iron Sword' }] },
    }
    const sum = summarizeAway(before, after)
    const friends = sum.vignettes.find((v) => v.kind === 'friends')!
    expect(vignetteText(after, friends)).toBe(`${first(after, a!)} and ${first(after, b!)} have become friends.`)
    expect(vignettePlace(friends)).toBe('tavern')
    const lvl = sum.vignettes.find((v) => v.kind === 'levelUp')!
    expect(vignetteText(after, lvl)).toBe(`You reached Master Lv ${after.meta.masterLevel}.`)
    expect(vignettePlace(sum.vignettes.find((v) => v.kind === 'forged')!)).toBe('armory')
  })
})
