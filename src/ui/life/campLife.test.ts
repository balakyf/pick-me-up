import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAccount } from '../../engine/account'
import { reduce } from '../../engine/store'
import { TUNING } from '../../engine/tuning'
import type { CampIncident, ChronicleEntry, GameState, HeroId, OwnedHero } from '../../engine/types'
import { moraleOf, stepLife } from '../../engine/life'
import { freshTrauma } from '../../engine/estate'
import { FR } from '../i18n/fr'
import { setLocale } from '../i18n/i18n'
import { campSummary, campHasNews, restSwap, towerMark } from './campSummary'
import { bandEffect, factorText, moraleHelp, moraleTitle } from './moraleText'
import { incidentDeadline, incidentPrompt } from './incidentText'
import { chronicleLine, incidentLine, speak } from './speech'
import { sectionLines } from './Gazette'

const DAY = TUNING.life.slotMs * TUNING.life.slotsPerDay
const here = dirname(fileURLToPath(import.meta.url))

function roster(seed: number, n = 10): GameState {
  let st: GameState = { ...createAccount(seed), gold: TUNING.gacha.normalCostGold * n }
  for (let i = 0; i < n; i++) st = reduce(st, { type: 'SUMMON' })
  st = stepLife(st, DAY / 2)
  return { ...st, meta: { ...st.meta, lastSeenAtWorld: DAY / 2 } }
}
const living = (s: GameState) => Object.values(s.heroes).filter((h) => h.alive) as OwnedHero[]

/** The party's first hero worn down: frayed, exhausted, grieving and withdrawn. */
function worn(s: GameState): { s: GameState; id: HeroId } {
  const id = s.party.slots.find(Boolean)!
  const h = s.heroes[id]!
  const life = { ...h.life!, grief: 90, needs: { energy: 10, hunger: 50, social: 50, fun: 50 } }
  const st: GameState = { ...s, heroes: { ...s.heroes, [id]: { ...h, sanity: 8, life } } }
  return { s: { ...st, estate: { ...st.estate, trauma: { [id]: { ...freshTrauma(), withdrawn: { since: 0, cause: null, comfort: 0, lastTalkDay: -1 } } } } }, id }
}

afterEach(() => setLocale('en'))

describe('the camp summary (lane L)', () => {
  it('names the worn-down and offers the one-click answers', () => {
    const { s, id } = worn(roster(81))
    const c = campSummary(s)
    expect(c.tired).toContain(id)
    expect(c.grieving).toContain(id)
    expect(c.troubled).toContain(id)
    expect(c.ready).not.toContain(id)
    expect(campHasNews(c)).toBe(true)
    const kinds = c.actions.map((a) => a.kind)
    expect(kinds).toContain('talk')
    expect(kinds).toContain('gazette')
    expect(c.actions.find((a) => a.kind === 'place')).toEqual({ kind: 'place', place: 'memorial' })
  })

  it('resting the tired swaps them for the strongest ready hero on the bench, lines kept', () => {
    const { s, id } = worn(roster(82, 12))
    const swap = restSwap(s)!
    expect(swap.out).toEqual([id])
    expect(swap.in).toHaveLength(1)
    expect(s.party.slots).not.toContain(swap.in[0])
    expect(swap.slots[s.party.slots.indexOf(id)]).toBe(swap.in[0])
    expect(swap.lines).toEqual(s.party.lines)
    // The swap is a real command.
    const next = reduce(s, { type: 'SET_PARTY', slots: swap.slots, lines: swap.lines })
    expect(next.party.slots).toEqual(swap.slots)
  })

  it('a rested party has nothing to swap, and the tower mark changes with a climb', () => {
    const s = roster(83)
    expect(restSwap(s)).toBeNull()
    expect(towerMark({ ...s, tower: { ...s.tower, attemptIndex: s.tower.attemptIndex + 1 } })).not.toBe(towerMark(s))
  })
})

describe('the words (lane L)', () => {
  it('every morale factor and help line reads as words, and the tooltip carries the score', () => {
    const { s, id } = worn(roster(84))
    const m = moraleOf(s, id)
    for (const f of m.factors) expect(factorText(s, f).length).toBeGreaterThan(2)
    expect(moraleHelp(m).length).toBeGreaterThan(0)
    expect(moraleTitle(s, m)).toContain(String(m.score))
    expect(bandEffect('broken')).toMatch(/deploy/)
  })

  it('a waiting incident offers two answers and a deadline', () => {
    const s = roster(85)
    const [a, b] = living(s)
    const inc: CampIncident = { id: 'i1', kind: 'brawl', heroIds: [a!.id, b!.id], at: 0, untilSlot: s.life.slot + 6, detail: 'yard' }
    const p = incidentPrompt(s, inc)
    expect(p.text).toContain(a!.name.split(/\s+/)[0]!)
    expect(p.intervene).not.toBe(p.let)
    expect(incidentDeadline(s, inc)).toMatch(/3 h/)
  })

  it('the chronicle tells every incident, guilt, comfort and remembrance', () => {
    const s = roster(86)
    const [a, b] = living(s).map((h) => h.id)
    const lines: ChronicleEntry[] = [
      { at: 1, kind: 'incident', heroIds: [a!, b!], detail: 'brawl:separated:yard' },
      { at: 1, kind: 'incident', heroIds: [a!, b!], detail: 'brawl:cleared:tavern' },
      { at: 1, kind: 'incident', heroIds: [a!, b!], detail: 'brawl:worse:hall' },
      { at: 1, kind: 'incident', heroIds: [a!, b!], detail: 'sworn' },
      { at: 1, kind: 'incident', heroIds: [a!], detail: 'night:bed' },
      { at: 1, kind: 'incident', heroIds: [a!], detail: 'night:trained' },
      { at: 1, kind: 'incident', heroIds: [a!], detail: 'fire' },
      { at: 1, kind: 'incident', heroIds: [a!], detail: 'homesick:comforted' },
      { at: 1, kind: 'incident', heroIds: [a!], detail: 'homesick:alone' },
      { at: 1, kind: 'incident', heroIds: [a!], detail: 'trait:lucky' },
      { at: 1, kind: 'incident', heroIds: [a!, b!], detail: 'trait:healers_hands' },
      { at: 1, kind: 'guilt', heroIds: [a!, b!] },
      { at: 1, kind: 'consoled', heroIds: [a!, b!] },
      { at: 1, kind: 'anniversary', heroIds: [b!, a!], detail: '2' },
      { at: 1, kind: 'jobTier', heroIds: [a!], detail: 'cook:2' },
    ]
    const out = lines.map((e) => chronicleLine(s, e))
    expect(new Set(out).size).toBe(out.length)
    for (const l of out) expect(l).not.toMatch(/\{|\}|undefined/)
    expect(incidentLine(s, lines[0]!)).toBe(out[0])
    expect(out[out.length - 1]).toMatch(/Master learned/)
    // Repeats fold into one counted line in the Gazette.
    expect(sectionLines(s, [lines[6]!, lines[6]!])).toEqual([`${out[6]} (×2)`])
  })

  it('traits speak: a party member talks about the floor in their own trait’s words, sometimes', () => {
    const s = roster(87, 14)
    const said = new Set<string>()
    for (const h of living(s)) for (let k = 0; k < 6; k++) said.add(speak(s, h, true, `k${k}`))
    expect(said.size).toBeGreaterThan(10)
  })

  it('lane L’s words all have French', () => {
    const files = ['moraleText.ts', 'MoralePips.tsx', 'Gazette.tsx', 'Incidents.tsx', 'incidentText.ts', 'CampSummary.tsx']
    const missing: string[] = []
    for (const f of files) {
      const src = readFileSync(join(here, f), 'utf8')
      for (const m of src.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)) if (!(m[1]! in FR)) missing.push(m[1]!)
    }
    expect(missing).toEqual([])
    setLocale('fr')
    const { s, id } = worn(roster(88))
    expect(moraleTitle(s, moraleOf(s, id))).toMatch(/Moral/)
  })
})

