import { describe, expect, it } from 'vitest'
import { CEREMONY_MS, ceremonyDone, ceremonyPlan, countUp, cuesBetween, goldCountMs, stepAt, type CeremonyInput } from './ceremony'

const BASE: CeremonyInput = { won: true, anchor: false, firstClear: false, gold: 1200, xp: 300, drops: 0, hidden: 0, skills: [], fallen: 0 }
const FULL = { speed: 1, reduced: false }

describe('ceremonyPlan', () => {
  it('orders the beats: banner, the fallen, gold, XP, first clear, drops, truths, skills, report', () => {
    const p = ceremonyPlan({ ...BASE, firstClear: true, drops: 2, hidden: 1, skills: ['level-up', 'merge'], fallen: 1 }, FULL)
    expect(p.steps.map((s) => s.id)).toEqual(['banner', 'memorial:0', 'gold', 'xp', 'first-clear', 'drop:0', 'drop:1', 'hidden:0', 'skill:0', 'skill:1', 'report'])
    for (let i = 1; i < p.steps.length; i++) expect(p.steps[i]!.at).toBeGreaterThan(p.steps[i - 1]!.at)
    const last = p.steps[p.steps.length - 1]!
    expect(p.total).toBe(last.at + last.dur)
    expect(p.instant).toBe(false)
  })

  it('skips beats with nothing to show (a wipe has no gold, XP or stamp)', () => {
    const p = ceremonyPlan({ ...BASE, won: false, gold: 0, xp: 0, firstClear: true, fallen: 2 }, FULL)
    expect(p.steps.map((s) => s.id)).toEqual(['banner', 'memorial:0', 'memorial:1', 'report'])
    expect(p.cues).toEqual([]) // nothing rattles over the dead
  })

  it('an anchor’s banner holds longer than a filler’s', () => {
    const filler = ceremonyPlan(BASE, FULL)
    const anchor = ceremonyPlan({ ...BASE, anchor: true }, FULL)
    expect(anchor.steps[0]!.dur).toBe(CEREMONY_MS.anchorBanner)
    expect(filler.steps[0]!.dur).toBe(CEREMONY_MS.banner)
    expect(anchor.total).toBeGreaterThan(filler.total)
  })

  it('the battle speed divides every duration', () => {
    const one = ceremonyPlan({ ...BASE, drops: 2, skills: ['unlock'] }, FULL)
    const four = ceremonyPlan({ ...BASE, drops: 2, skills: ['unlock'] }, { speed: 4, reduced: false })
    expect(four.total).toBeLessThan(one.total / 3)
    expect(four.steps.map((s) => s.id)).toEqual(one.steps.map((s) => s.id))
  })

  it('reduced motion shows everything at once, with one coin sound at most', () => {
    const p = ceremonyPlan({ ...BASE, drops: 3, skills: ['merge'] }, { speed: 1, reduced: true })
    expect(p.instant).toBe(true)
    expect(p.total).toBe(0)
    expect(p.steps.every((s) => s.at === 0 && s.dur === 0)).toBe(true)
    expect(p.cues).toEqual([{ at: 0, cue: 'coins', gain: 0.55 }])
    expect(ceremonyPlan({ ...BASE, fallen: 1 }, { speed: 1, reduced: true }).cues).toEqual([])
    expect(ceremonyDone(p, 0)).toBe(true)
  })

  it('coins rattle while the gold counts (capped), a stamp for a first clear, a chime for rare drops, a level-up per skill', () => {
    const p = ceremonyPlan({ ...BASE, gold: 123456, firstClear: true, drops: 2, rareDrops: [1], skills: ['level-up', 'merge'] }, FULL)
    const coins = p.cues.filter((c) => c.cue === 'coins')
    expect(coins.length).toBeGreaterThan(1)
    expect(coins.length).toBeLessThanOrEqual(CEREMONY_MS.coinTicks)
    const gold = p.steps.find((s) => s.id === 'gold')!
    for (const c of coins) {
      expect(c.at).toBeGreaterThanOrEqual(gold.at)
      expect(c.at).toBeLessThan(gold.at + gold.dur)
    }
    expect(p.cues.map((c) => c.cue).filter((c) => c !== 'coins')).toEqual(['confirm', 'flip', 'rare', 'levelup', 'legend'])
    // Sorted by time.
    for (let i = 1; i < p.cues.length; i++) expect(p.cues[i]!.at).toBeGreaterThanOrEqual(p.cues[i - 1]!.at)
  })

  it('a victory with losses is quieter', () => {
    const party = ceremonyPlan({ ...BASE, firstClear: true }, FULL)
    const bitter = ceremonyPlan({ ...BASE, firstClear: true, fallen: 1 }, FULL)
    const gain = (p: typeof party, cue: string) => p.cues.find((c) => c.cue === cue)!.gain!
    expect(gain(bitter, 'coins')).toBeLessThan(gain(party, 'coins'))
    expect(gain(bitter, 'confirm')).toBeLessThan(gain(party, 'confirm'))
  })
})

describe('the clock', () => {
  it('a step waits, runs, then is done', () => {
    const s = { id: 'gold', kind: 'gold' as const, at: 1000, dur: 500 }
    expect(stepAt(s, 999)).toEqual({ phase: 'waiting', progress: 0 })
    expect(stepAt(s, 1250)).toEqual({ phase: 'running', progress: 0.5 })
    expect(stepAt(s, 1500)).toEqual({ phase: 'done', progress: 1 })
    expect(stepAt({ ...s, dur: 0 }, 1000).phase).toBe('done')
  })

  it('counts up easing out, never past the target, landing exactly on it', () => {
    expect(countUp(1000, 0)).toBe(0)
    expect(countUp(1000, 1)).toBe(1000)
    expect(countUp(1000, 0.5)).toBeGreaterThan(500)
    let prev = 0
    for (let p = 0; p <= 1; p += 0.05) {
      const v = countUp(777, p)
      expect(v).toBeGreaterThanOrEqual(prev)
      expect(v).toBeLessThanOrEqual(777)
      prev = v
    }
  })

  it('cues between two readings play once each across any frame split', () => {
    const p = ceremonyPlan({ ...BASE, drops: 3, skills: ['level-up'] }, FULL)
    let last = -1
    const played: number[] = []
    for (let e = 0; e <= p.total + 40; e += 37) {
      played.push(...cuesBetween(p, last, Math.min(e, p.total)).map((c) => c.at))
      last = Math.min(e, p.total)
    }
    expect(played).toEqual(p.cues.map((c) => c.at))
  })

  it('gold counts longer for bigger sums, within bounds', () => {
    expect(goldCountMs(0)).toBe(0)
    expect(goldCountMs(50)).toBeLessThan(goldCountMs(500000))
    expect(goldCountMs(10 ** 12)).toBe(CEREMONY_MS.goldMax)
  })
})
