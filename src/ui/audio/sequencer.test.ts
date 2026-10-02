import { describe, expect, it } from 'vitest'
import {
  compileChannel,
  compilePattern,
  eventsAt,
  midiToHz,
  nextBarTime,
  nextBeatTime,
  noteToMidi,
  stepSeconds,
  stepTime,
  stepsDue,
  stepsPerBar,
  switchTime,
  trackLength,
  trackSeconds,
  TrackVoice,
  type NoteEvent,
} from './sequencer'
import { TRACKS } from './tracks'
import { chord, bassLine, arpLine, padLine } from './tracks/compose'
import type { Channel, Track } from './tracks/types'

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 9)

describe('sequencer timing', () => {
  it('a step is a beat divided by the grid', () => {
    close(stepSeconds(120, 4), 0.125)
    close(stepSeconds(60, 2), 0.5)
  })

  it('swing delays only the off-steps', () => {
    close(stepTime(0, 120, 2, 0.3), 0)
    close(stepTime(1, 120, 2, 0.3), 0.25 + 0.3 * 0.25)
    close(stepTime(2, 120, 2, 0.3), 0.5)
    close(stepTime(3, 120, 2, 0), 0.75)
  })

  it('a switch waits for the playing track’s next bar line', () => {
    // 120 bpm, 16ths, 16 steps a bar = 2 s bars, started at t=10.
    close(nextBarTime(10, 10, 120, 4, 16), 10)
    close(nextBarTime(10, 10.01, 120, 4, 16), 12)
    close(nextBarTime(10, 13.5, 120, 4, 16), 14)
    close(nextBarTime(10, 14, 120, 4, 16), 14)
    // Before the track starts, its first downbeat.
    close(nextBarTime(10, 3, 120, 4, 16), 10)
  })

  it('a slow track switches on the beat rather than wait out a long bar', () => {
    // 40 bpm, 4 beats: 6 s bars; the next bar is 5.9 s away, the next beat 0.4 s.
    const at = switchTime(0, 0.1, 40, 2, 8, 1.6)
    close(at, nextBeatTime(0, 0.1, 40))
    close(at, 1.5)
    // A near bar line is still preferred.
    close(switchTime(0, 5.5, 40, 2, 8, 1.6), 6)
  })

  it('the look-ahead window never loses or repeats a step across wake-ups', () => {
    const tr = { bpm: 133, stepsPerBeat: 4, swing: 0.2 }
    let next = 0
    const seen: number[] = []
    // Irregular wake-ups (a busy main thread): the windows still tile the timeline.
    for (const until of [0.05, 0.31, 0.32, 0.9, 1.4, 1.41, 2.75]) {
      const r = stepsDue(tr, 0, next, until)
      for (const s of r.steps) {
        expect(s.time).toBeLessThan(until)
        seen.push(s.index)
      }
      next = r.nextStep
    }
    expect(seen).toEqual(Array.from({ length: seen.length }, (_, i) => i))
    // Every step's time is exact, not when the timer happened to wake.
    const again = stepsDue(tr, 5, 0, 5 + 1)
    for (const s of again.steps) close(s.time, 5 + stepTime(s.index, 133, 4, 0.2))
  })

  it('nothing is scheduled at or after the stop time (a switch away)', () => {
    const r = stepsDue({ bpm: 120, stepsPerBeat: 4 }, 0, 0, 10, 1)
    expect(r.steps.every((s) => s.time < 1)).toBe(true)
    expect(r.steps.length).toBe(8)
  })
})

describe('patterns', () => {
  it('note names map to MIDI and Hz', () => {
    expect(noteToMidi('C4')).toBe(60)
    expect(noteToMidi('A4')).toBe(69)
    expect(noteToMidi('F#3')).toBe(54)
    expect(noteToMidi('Bb5')).toBe(82)
    expect(noteToMidi('x')).toBeNull()
    close(midiToHz(69), 440)
  })

  it('holds extend a note, rests end it, chords sound together, accents and ghosts', () => {
    const c = compilePattern('C4 - - . E4+G4 . | D4! G4?', 1)
    expect(c.length).toBe(8)
    const [a, b, d, e] = c.events as [NoteEvent, NoteEvent, NoteEvent, NoteEvent]
    expect(a).toMatchObject({ step: 0, len: 3, notes: [60] })
    expect(b).toMatchObject({ step: 4, len: 1, notes: [64, 67] })
    expect(d).toMatchObject({ step: 6, notes: [62], vel: 1 })
    expect(e).toMatchObject({ step: 7, notes: [67], vel: 0.45 })
    expect(() => compilePattern('C4 !')).toThrow(/bad token/)
  })

  it('a rate spreads each token over several steps', () => {
    const c = compilePattern('C4 - E4 .', 2)
    expect(c.length).toBe(8)
    expect(c.events.map((e) => [e.step, e.len])).toEqual([
      [0, 4],
      [4, 2],
    ])
  })

  it('drum letters, stacked drums', () => {
    const c = compilePattern('k . s+h', 1, true)
    expect(c.events.map((e) => e.drum)).toEqual(['k', 's', 'h'])
    expect(c.events.map((e) => e.step)).toEqual([0, 2, 2])
  })

  it('a bad token is refused', () => {
    expect(() => compilePattern('C4 Q9')).toThrow(/bad token/)
  })

  it('a short channel loops under a longer one', () => {
    const ch: Channel = { inst: { kind: 'drums', vol: 1 }, pattern: 'k . . .' }
    const c = compileChannel(ch)
    expect(eventsAt(c, 0)).toHaveLength(1)
    expect(eventsAt(c, 4)).toHaveLength(1)
    expect(eventsAt(c, 5)).toHaveLength(0)
  })
})

describe('composing helpers', () => {
  it('chord symbols', () => {
    expect(chord('Am')).toEqual({ root: 9, tones: [0, 3, 7] })
    expect(chord('F#m7').root).toBe(6)
    expect(chord('Bb').root).toBe(10)
    expect(() => chord('Hm')).toThrow()
  })

  it('bass lines, arpeggios and pads fill one bar per chord', () => {
    expect(bassLine(['C', 'G'], 'R 5 8 n', 2)).toBe('C2 G2 C3 F#2 | G2 D3 G3 B1')
    expect(arpLine(['Am'], '0 1 2 3', 4)).toBe('A4 C5 E5 A5')
    expect(padLine(['C'], 3, 4)).toBe('C4+E4+G4 - -')
    expect(padLine(['C'], 0, 4, '. x')).toBe('. C4+E4+G4')
  })
})

describe('the soundtrack', () => {
  const tracks = Object.values(TRACKS)

  it('every track compiles, and every channel is whole bars that tile the track', () => {
    for (const tr of tracks) {
      const len = trackLength(tr)
      const bar = stepsPerBar(tr)
      expect(len % bar, `${tr.id} length`).toBe(0)
      for (const ch of tr.channels) {
        const c = compileChannel(ch)
        expect(c.length % bar, `${tr.id} channel ${ch.pattern.slice(0, 30)}`).toBe(0)
        expect(len % c.length, `${tr.id} channel loops evenly`).toBe(0)
        expect(c.events.length).toBeGreaterThan(0)
      }
    }
  })

  it('there is a theme per act, a boss, the Wall, the world’s end and the scenes', () => {
    for (const id of ['title', 'lobby-day', 'lobby-night', 'lobby-rain', 'summon', 'boss', 'wailing-wall', 'worlds-end', 'victory', 'defeat', 'death-motif'])
      expect(TRACKS[id as keyof typeof TRACKS]).toBeDefined()
    for (let a = 1; a <= 8; a++) expect(TRACKS[`act-${a}` as keyof typeof TRACKS].loop).toBe(true)
    // Each act sounds different: no two share a tempo and key signature of melody.
    const firstNotes = new Set(tracks.map((t) => `${t.bpm}|${t.channels[0]!.pattern.slice(0, 12)}`))
    expect(firstNotes.size).toBe(tracks.length)
  })

  it('the jingles are one-shots of a few seconds; the loops last long enough not to nag', () => {
    expect(trackSeconds(TRACKS.victory)).toBeLessThan(4)
    expect(trackSeconds(TRACKS.defeat)).toBeLessThan(9)
    expect(TRACKS['death-motif'].loop).toBe(false)
    for (const tr of tracks.filter((t) => t.loop)) expect(trackSeconds(tr), tr.id).toBeGreaterThanOrEqual(10)
  })

  it('melodies stay in a playable range', () => {
    for (const tr of tracks)
      for (const ch of tr.channels) {
        if (ch.inst.kind === 'drums') continue
        for (const e of compileChannel(ch).events)
          for (const n of e.notes) {
            const m = n + (ch.transpose ?? 0)
            expect(m, tr.id).toBeGreaterThanOrEqual(24)
            expect(m, tr.id).toBeLessThanOrEqual(100)
          }
      }
  })
})

describe('a track voice', () => {
  const fakeGain = {} as GainNode
  const track: Track = {
    id: 'summon',
    title: 'test',
    bpm: 120,
    stepsPerBeat: 4,
    beatsPerBar: 4,
    loop: false,
    channels: [
      { inst: { kind: 'drums', vol: 1 }, pattern: 'k . . . . . . . . . . . . . . .' },
      { inst: { kind: 'drums', vol: 1 }, minLevel: 2, pattern: 'c . . . . . . . . . . . . . . .' },
    ],
  }

  it('plays its steps once, gates layers by intensity, and ends a one-shot', () => {
    const played: string[] = []
    const v = new TrackVoice(track, 1, fakeGain, 0)
    v.pump(1.5, (_ch, ev) => played.push(ev.drum!))
    expect(played).toEqual(['k'])
    v.intensity = 2
    v.pump(3.5, (_ch, ev) => played.push(ev.drum!))
    // The one-shot is a single bar (2 s): nothing after it.
    expect(played).toEqual(['k'])
    expect(v.ended).toBe(true)
    const w = new TrackVoice(track, 0, fakeGain, 2)
    const p2: string[] = []
    w.pump(0.1, (_ch, ev) => p2.push(ev.drum!))
    expect(p2.sort()).toEqual(['c', 'k'])
  })
})
