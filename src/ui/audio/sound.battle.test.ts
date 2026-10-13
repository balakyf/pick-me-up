import { afterEach, describe, expect, it, vi } from 'vitest'

/** A fake Web Audio context that records what each cue builds. */
function fakeAudio() {
  const log: { kind: string; type?: string; freq?: number; detail?: number }[] = []
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() })
  class Ctx {
    currentTime = 0
    sampleRate = 8000
    state = 'running'
    destination = {}
    createGain() {
      return { gain: param(), connect: (n: unknown) => n }
    }
    createOscillator() {
      const o = {
        type: 'sine',
        frequency: {
          value: 0,
          setValueAtTime: (f: number) => log.push({ kind: 'osc', type: o.type, freq: f }),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: (n: unknown) => n,
        start: vi.fn(),
        stop: vi.fn(),
      }
      return o
    }
    createBuffer(_c: number, len: number) {
      return { getChannelData: () => new Float32Array(len) }
    }
    createBufferSource() {
      log.push({ kind: 'noise' })
      return { buffer: null, connect: (n: unknown) => n, start: vi.fn() }
    }
    createBiquadFilter() {
      const f = { type: 'lowpass', frequency: { value: 0 }, connect: (n: unknown) => n }
      log.push({ kind: 'filter' })
      return f
    }
    resume() {
      return Promise.resolve()
    }
  }
  return { log, Ctx }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

async function withAudio() {
  const { log, Ctx } = fakeAudio()
  const storage = new Map<string, string>()
  vi.stubGlobal('window', {
    AudioContext: Ctx,
    localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) },
  })
  const mod = await import('./sound')
  return { log, ...mod }
}

describe('battle sound (WP2)', () => {
  it('hit variants rotate (never the same twice in a row) and detune within ±80 cents', async () => {
    const { hitVariant, hitDetune, HIT_VARIANTS, HIT_DETUNE_CENTS } = await import('./sound')
    expect(HIT_VARIANTS).toBeGreaterThanOrEqual(3)
    expect(HIT_VARIANTS).toBeLessThanOrEqual(4)
    const seen = new Set<number>()
    for (let n = 0; n < 200; n++) {
      expect(hitVariant(n + 1)).not.toBe(hitVariant(n))
      const c = hitDetune(n)
      expect(Math.abs(c)).toBeLessThanOrEqual(HIT_DETUNE_CENTS)
      expect(hitDetune(n)).toBe(c)
      seen.add(c)
    }
    expect(seen.size).toBeGreaterThan(50) // spread, not a constant
  })

  it('a hit is layered: a high-passed transient plus a pitched body; a crit adds a 55 Hz sub', async () => {
    const { log, sfx } = await withAudio()
    sfx('hit')
    expect(log.filter((l) => l.kind === 'noise')).toHaveLength(1)
    expect(log.filter((l) => l.kind === 'filter')).toHaveLength(1)
    expect(log.filter((l) => l.kind === 'osc')).toHaveLength(1)
    log.length = 0
    sfx('crit', { semis: 12 })
    expect(log.some((l) => l.kind === 'osc' && l.type === 'sine' && l.freq === 55)).toBe(true) // the sub is never transposed
    expect(log.filter((l) => l.kind === 'osc').length).toBeGreaterThanOrEqual(3)
  })

  it('a rising combo transposes the hit', async () => {
    const { log, sfx } = await withAudio()
    sfx('hit', { semis: 0 })
    const low = log.find((l) => l.kind === 'osc')!.freq!
    log.length = 0
    sfx('hit', { semis: 12 })
    const high = log.find((l) => l.kind === 'osc')!.freq!
    // An octave up, give or take the two hits' detunes (±80 cents each) and variant offsets.
    expect(high / low).toBeGreaterThan(1.5)
  })

  it('a hero’s fall and the Decisive Moment have their own cues, distinct from an enemy death', async () => {
    const { log, sfx } = await withAudio()
    sfx('death')
    const death = log.map((l) => `${l.kind}:${l.freq ?? ''}`).join()
    log.length = 0
    sfx('heroFall')
    const fall = log.map((l) => `${l.kind}:${l.freq ?? ''}`).join()
    log.length = 0
    sfx('decisive')
    expect(log.filter((l) => l.kind === 'osc').length).toBeGreaterThanOrEqual(4)
    expect(fall).not.toBe(death)
    expect(fall.split(',').length).toBeGreaterThan(death.split(',').length)
  })

  it('the reveal sting grows with the star (1★ and 3★ never sound alike)', async () => {
    const { log, sfx } = await withAudio()
    const oscs = (star: number) => {
      log.length = 0
      sfx('reveal', { star })
      return log.filter((l) => l.kind === 'osc')
    }
    const counts = [1, 2, 3, 4, 5].map((s) => oscs(s).length)
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThan(counts[i - 1]!)
    expect(oscs(1).map((o) => o.type)).not.toEqual(oscs(3).slice(0, 2).map((o) => o.type))
  })

  it('every cue is a silent no-op without an AudioContext', async () => {
    const { sfx } = await import('./sound')
    for (const name of ['hit', 'crit', 'heroFall', 'decisive', 'saved'] as const) expect(() => sfx(name, { semis: 5 })).not.toThrow()
  })
})
