import { describe, expect, it } from 'vitest'
import type { CombatEvent } from '../../engine/types'
import { CueLimiter, MAX_BLOWS, cueFamily, cuesForBeat, detuneFor, type BeatSfxContext } from './battleSfx'
import { popupDelay } from '../battle/battleFrames'

const ctx: BeatSfxContext = {
  byId: {
    h1: { side: 'hero', element: 'fire' },
    h2: { side: 'hero', element: 'water' },
    npc: { side: 'hero', element: 'light', isNpc: true },
    e1: { side: 'enemy', element: 'earth' },
    e2: { side: 'enemy', element: 'dark' },
  },
  element: 'fire',
}

let seq = 0
const ev = <K extends CombatEvent['kind']>(e: Omit<Extract<CombatEvent, { kind: K }>, 'seq' | 'tick'> & { kind: K }): CombatEvent =>
  ({ seq: seq++, tick: 1, ...e }) as unknown as CombatEvent
const hit = (target = 'e1', extra: Partial<{ crit: boolean; eff: 'weak' | 'resist' | 'immune' }> = {}) =>
  ev({ kind: 'hit', actorId: 'h1', targetId: target, amount: 10, crit: false, hpAfter: 5, ...extra })
const cues = (beat: CombatEvent[], c: BeatSfxContext = ctx) => cuesForBeat(beat, c).map((x) => x.cue)

describe('battle sounds: event → cue', () => {
  it('a blow sounds in the beat’s element, panned toward the side struck, with a little detune', () => {
    const [c] = cuesForBeat([hit('e1')], ctx)
    expect(c).toMatchObject({ cue: 'hit', delayMs: 0, opts: { element: 'fire' } })
    expect(c!.opts.pan).toBeLessThan(0)
    expect(Math.abs(c!.opts.detune!)).toBeLessThanOrEqual(30)
    const [h] = cuesForBeat([ev({ kind: 'hit', actorId: 'e1', targetId: 'h1', amount: 3, crit: false, hpAfter: 1 })], { ...ctx, element: 'earth' })
    expect(h!.opts).toMatchObject({ element: 'earth' })
    expect(h!.opts.pan).toBeGreaterThan(0)
  })

  it('a crit; WEAK / RESIST accents; IMMUNE replaces the blow', () => {
    expect(cues([hit('e1', { crit: true })])).toEqual(['crit'])
    expect(cues([hit('e1', { eff: 'weak' })])).toEqual(['hit', 'weak'])
    expect(cues([hit('e1', { eff: 'resist' })])).toEqual(['hit', 'resist'])
    expect(cues([hit('e1', { eff: 'immune' })])).toEqual(['immune'])
  })

  it('a sweep: blows land one after another, only a few sound, they taper, one crit at most', () => {
    const beat = [hit('e1', { crit: true }), hit('e2', { crit: true }), hit('e1'), hit('e2'), hit('e1'), hit('e2'), hit('e1')]
    const out = cuesForBeat(beat, ctx)
    expect(out.map((c) => c.cue)).toEqual(['crit', 'hit', 'hit', 'hit'])
    expect(out.length).toBe(MAX_BLOWS)
    expect(out.map((c) => c.delayMs)).toEqual([0, 1, 2, 3].map(popupDelay))
    const gains = out.map((c) => c.opts.gain!)
    for (let i = 1; i < gains.length; i++) expect(gains[i]).toBeLessThan(gains[i - 1]!)
  })

  it('a skill’s cast charges up in its element; a basic attack does not', () => {
    expect(cues([ev({ kind: 'act', actorId: 'h1', skillId: 'basic', targetId: 'e1' })])).toEqual([])
    expect(cues([ev({ kind: 'act', actorId: 'e1', skillId: 'e_spell', targetId: 'h1' })])).toEqual([])
    const [c] = cuesForBeat([ev({ kind: 'act', actorId: 'h2', skillId: 'no_such_skill', targetId: 'e1' })], ctx)
    expect(c).toMatchObject({ cue: 'cast', opts: { element: 'water' } })
  })

  it('misses, guards, heals (once a beat), regeneration', () => {
    expect(cues([ev({ kind: 'miss', actorId: 'h1', targetId: 'e1' })])).toEqual(['miss'])
    expect(cues([ev({ kind: 'guard', actorId: 'h1', targetId: 'e1' })])).toEqual(['guard'])
    const heal = (status?: 'regen') => ev({ kind: 'heal', unitId: 'h1', amount: 5, hpAfter: 9, sourceId: 'h2', ...(status ? { status } : {}) })
    expect(cues([heal(), heal(), heal()])).toEqual(['heal'])
    expect(cues([heal('regen')])).toEqual(['regen'])
  })

  it('statuses: their own voices, a war cry over the party sounds once, a broken shield shatters', () => {
    const st = (status: string, nth?: number) => ev({ kind: 'status', unitId: 'e1', status: status as 'poison', sourceId: 'h1', ticks: 3, ...(nth ? { nth } : {}) })
    expect(cuesForBeat([st('poison')], ctx)[0]).toMatchObject({ cue: 'status', opts: { status: 'poison' } })
    for (const s of ['bleed', 'burn', 'stun', 'taunt', 'atk-up', 'def-down']) expect(cuesForBeat([st(s)], ctx)[0]!.opts.status).toBe(s)
    expect(cues([st('shield')])).toEqual(['shield'])
    expect(cues([st('atk-up'), st('atk-up', 1), st('atk-up', 2)])).toEqual(['status'])
    expect(cues([ev({ kind: 'status-end', unitId: 'h1', status: 'shield', reason: 'broken' })])).toEqual(['shield-break'])
    expect(cues([ev({ kind: 'status-end', unitId: 'h1', status: 'poison', reason: 'expired' })])).toEqual([])
    expect(cues([ev({ kind: 'dot', unitId: 'e1', status: 'burn', amount: 3, hpAfter: 2, sourceId: 'h1' }), ev({ kind: 'dot', unitId: 'e2', status: 'burn', amount: 3, hpAfter: 2, sourceId: 'h1' })])).toEqual(['dot'])
  })

  it('deaths: a foe falls; a hero (or the escort) falls harder; a hero out of a trial only drops', () => {
    expect(cues([ev({ kind: 'death', unitId: 'e1' })])).toEqual(['death'])
    expect(cues([ev({ kind: 'death', unitId: 'h1' })])).toEqual(['hero-death'])
    expect(cues([ev({ kind: 'death', unitId: 'npc' })])).toEqual(['hero-death'])
    expect(cues([ev({ kind: 'death', unitId: 'h1' })], { ...ctx, nonLethal: true })).toEqual(['death'])
  })

  it('a wave wiped by one sweep falls as a short roll, not a pile-up; a ward sweep rings once', () => {
    const wipe = cuesForBeat(
      Array.from({ length: 6 }, (_, i) => ev({ kind: 'death', unitId: i % 2 ? 'e1' : 'e2' })),
      ctx,
    )
    expect(wipe.map((c) => c.cue)).toEqual(['death', 'death', 'death'])
    expect(wipe.map((c) => c.delayMs)).toEqual([80, 80 + popupDelay(1), 80 + popupDelay(2)])
    // A hero's fall always sounds, whatever else fell with them.
    const both = cues([...Array.from({ length: 4 }, () => ev({ kind: 'death', unitId: 'e1' })), ev({ kind: 'death', unitId: 'h1' })])
    expect(both.filter((c) => c === 'hero-death')).toHaveLength(1)
    const wards = Array.from({ length: 4 }, () => ev({ kind: 'shield', unitId: 'e1', actorId: 'h1', absorbed: 5, left: 1 }))
    expect(cues(wards)).toEqual(['shield'])
  })

  it('stingers and the field: cover, follow-up, rivalry, orders, waves, missions, floor mods', () => {
    expect(cues([ev({ kind: 'cover', unitId: 'h1', allyId: 'h2', actorId: 'e1' })])).toEqual(['cover'])
    expect(cues([ev({ kind: 'followup', unitId: 'h2', allyId: 'h1', targetId: 'e1' })])).toEqual(['followup'])
    expect(cues([ev({ kind: 'rivalry', unitId: 'h2', rivalId: 'h1', targetId: 'e1' })])).toEqual(['rivalry'])
    expect(cues([ev({ kind: 'order', order: { tick: 2, kind: 'retreat' } })])).toEqual(['order'])
    expect(cues([ev({ kind: 'battle-start', heroIds: [], enemyIds: [] })])).toEqual(['battle-start'])
    expect(cues([ev({ kind: 'wave-spawn', wave: 1, enemyIds: [] })])).toEqual(['wave-start'])
    expect(cues([ev({ kind: 'mission', note: '', code: 'wave-cleared' })])).toEqual(['wave-clear'])
    expect(cues([ev({ kind: 'mission', note: '', code: 'escort-low' })])).toEqual(['mission-bad'])
    expect(cues([ev({ kind: 'mission', note: '', code: 'defeated' })])).toEqual(['mission-good'])
    expect(cues([ev({ kind: 'mission', note: 'old replay' })])).toEqual([])
    expect(cues([ev({ kind: 'floor-mods', modifiers: ['fog'] })])).toEqual(['floor-mods'])
    expect(cues([ev({ kind: 'panic', unitId: 'h1' })])).toEqual(['panic'])
    expect(cues([ev({ kind: 'hp-cost', unitId: 'h1', amount: 3, hpAfter: 5 })])).toEqual(['hp-cost'])
  })

  it('the end is the music’s; SP ticks are silent; a later lane’s telegraph and phase already sound', () => {
    expect(cues([ev({ kind: 'end', outcome: 'win' })])).toEqual([])
    expect(cues([ev({ kind: 'sp', unitId: 'h1', amount: 1, spAfter: 2, sourceId: 'h1' })])).toEqual([])
    expect(cues([{ seq: 1, tick: 1, kind: 'telegraph' } as unknown as CombatEvent])).toEqual(['telegraph'])
    expect(cues([{ seq: 1, tick: 1, kind: 'phase' } as unknown as CombatEvent])).toEqual(['phase'])
    expect(cues([{ seq: 1, tick: 1, kind: 'something-new' } as unknown as CombatEvent])).toEqual([])
  })

  it('detune is stable per event and within ±30 cents', () => {
    const all = Array.from({ length: 500 }, (_, i) => detuneFor(i))
    expect(Math.max(...all)).toBeLessThanOrEqual(30)
    expect(Math.min(...all)).toBeGreaterThanOrEqual(-30)
    expect(new Set(all).size).toBeGreaterThan(30)
    expect(detuneFor(42)).toBe(detuneFor(42))
  })
})

describe('the rate limit across beats', () => {
  it('caps a family inside its window and lets it through again after', () => {
    const lim = new CueLimiter({ blow: { max: 3, windowMs: 100 } })
    expect([0, 10, 20, 30].map((t) => lim.allow('hit', t))).toEqual([true, true, true, false])
    // A crit counts as a blow too.
    expect(lim.allow('crit', 40)).toBe(false)
    expect(lim.allow('hit', 105)).toBe(true)
    // Other families are counted apart.
    expect(lim.allow('heal', 41)).toBe(true)
  })

  it('families', () => {
    expect(cueFamily('crit')).toBe('blow')
    expect(cueFamily('immune')).toBe('blow')
    expect(cueFamily('weak')).toBe('accent')
    expect(cueFamily('shield-break')).toBe('status')
    expect(cueFamily('order')).toBe('order')
  })

  it('a 4× AoE floor never machine-guns: at most the cap per window', () => {
    const lim = new CueLimiter()
    let played = 0
    // 40 beats of 8-target sweeps, 120 ms apart (a 4× replay).
    for (let b = 0; b < 40; b++) {
      const beat = Array.from({ length: 8 }, (_, i) => hit(i % 2 ? 'e1' : 'e2'))
      for (const c of cuesForBeat(beat, ctx)) if (lim.allow(c.cue, b * 120 + c.delayMs / 4)) played++
    }
    // 4.8 s of play; 6 blows per 320 ms at most.
    expect(played).toBeLessThanOrEqual(Math.ceil((40 * 120) / 320) * 6)
    expect(played).toBeGreaterThan(40)
  })
})
