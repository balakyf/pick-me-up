/**
 * One battle theme per act of the tower (content/acts.ts), each in the act's mood:
 * I the Prairie gallops, II the Ruins march, III the Swamp creeps, IV the Drowned Coast
 * rolls in 6/8, V the Order's War drills, VI the Inflection drives, VII the Fragment Series
 * glitters cold, VIII the Unfinished Floors drift on a broken scale.
 */
import { INST, arpLine, bassLine, padLine, rep } from './compose'
import { once } from './scenes'
import type { Track } from './types'

const BAR16 = 16

// ── Act I · The Prairie: a galloping adventure. G major, 148 bpm. ───────────────────────
const I_CH = ['G', 'D', 'Em', 'C', 'G', 'D', 'C', 'D', 'Em', 'C', 'G', 'D', 'Em', 'C', 'D', 'D']
export const act1: Track = {
  id: 'act-1',
  title: 'Act I · Over the Prairie',
  bpm: 148,
  stepsPerBeat: 4,
  beatsPerBar: 4,
  loop: true,
  channels: [
    {
      inst: INST.lead(0.2),
      rate: 2,
      pattern: [
        'D5 - G5 - B5 - A5 G5 | A5 - - - F#5 - D5 - | E5 - G5 - B5 - C6 B5 | A5 - - - G5 - E5 -',
        'D5 - G5 - B5 - D6 - | C6 - B5 - A5 - F#5 - | G5 - E5 - C5 - E5 G5 | F#5 - - - A5 - - -',
        'B5 - - G5 E5 - G5 B5 | C6 - - - G5 - E5 - | D6 - - B5 G5 - B5 D6 | A5 - - - F#5 - - -',
        'G5 - A5 - B5 - E6 - | E6 - D6 - C6 - B5 - | A5 - B5 - C6 - D6 - | D6! - - - - - . .',
      ].join(' | '),
    },
    { inst: INST.thin(0.07, { s: 0.3 }), pattern: arpLine(I_CH, '0 2 1 2 0 2 1 2 0 2 1 2 0 2 1 2', 4) },
    { inst: INST.bass(0.3), pattern: bassLine(I_CH, 'R . R R R . R R 5 . 5 5 8 . 5 5', 2) },
    { inst: INST.drums(0.45), pattern: rep('k . h h s . h h k . h h s . s? h', 16) },
    { inst: INST.drums(0.4), pattern: once('c', BAR16 * 16) },
  ],
}

// ── Act II · The Ruins: a dusty heroic march. A minor, 128 bpm. ─────────────────────────
const II_CH = ['Am', 'F', 'G', 'Em', 'Am', 'F', 'E', 'E', 'Dm', 'Am', 'F', 'E', 'Dm', 'Am', 'Bb', 'E']
export const act2: Track = {
  id: 'act-2',
  title: 'Act II · Bones of the Old City',
  bpm: 128,
  stepsPerBeat: 4,
  beatsPerBar: 4,
  loop: true,
  channels: [
    {
      inst: INST.lead(0.2, { wave: 'square', vol: 0.15 }),
      rate: 2,
      pattern: [
        'A4 - - E5 - - A5 - | G5 - F5 - E5 - C5 - | D5 - - G5 - - B5 - | A5 - G5 - E5 - - -',
        'A4 - - E5 - - A5 - | C6 - B5 - A5 - F5 - | E5 - G#5 - B5 - D6 - | C6 - B5 - G#5 - - -',
        'F5 - - - A5 - D6 - | C6 - - - E5 - A5 - | A5 - G5 - F5 - C5 - | E5 - - - G#5 - - -',
        'D5 - F5 - A5 - D6 - | E6 - - - C6 - A5 - | D6 - C6 - Bb5 - F5 - | G#5 - - - B5 - E5 -',
      ].join(' | '),
    },
    { inst: INST.brass(0.07), pattern: padLine(II_CH, 16, 4, '. . . . x . . . . . . . x . x .') },
    { inst: INST.bass(0.3), pattern: bassLine(II_CH, 'R . . R R . 5 . R . . R 8 . 5 .', 2) },
    { inst: INST.drums(0.45), pattern: rep('k . h . s . h s? k . k h s . s? s?', 16) },
    { inst: INST.drums(0.38), pattern: once('c', BAR16 * 8) },
  ],
}

// ── Act III · The Swamp: something moves under the water. E phrygian, 108 bpm, swung. ──
const III_CH = ['Em', 'F', 'Em', 'D', 'Em', 'F', 'G', 'F']
export const act3: Track = {
  id: 'act-3',
  title: 'Act III · Lizard Water',
  gain: 1.3,
  bpm: 108,
  stepsPerBeat: 4,
  beatsPerBar: 4,
  swing: 0.22,
  loop: true,
  channels: [
    {
      inst: INST.thin(0.15, { s: 0.7, vib: { rate: 6, depth: 22, delay: 0.1 }, glide: 0.04, wet: 0.3 }),
      rate: 2,
      pattern: [
        'E5 - . G5 F5 - E5 . | . . A5 - G5 F5 E5 - | B4 - . E5 - - D5 E5 | F5 - - - D5 - - -',
        'E5 - . G5 F5 - E5 . | . . C6 - B5 A5 G5 - | B5 - A5 - G5 - F5 - | E5 - - - - - . .',
      ].join(' | '),
    },
    { inst: INST.fmBass(0.24), pattern: bassLine(III_CH, 'R . . R . . R . 5 . . 5 . 3? R .', 2) },
    { inst: INST.epiano(0.05, { ratio: 2.01, index: 2.4, wet: 0.5 }), pattern: padLine(III_CH, 16, 4, '. . . . . . x . . . . . . . . .') },
    { inst: INST.drums(0.4), pattern: rep('k . . r . . t . k . r . . t t? .', 8) },
    { inst: INST.drums(0.3, 'soft'), pattern: rep('. . h . . h . h? . . h . . h . h?', 8) },
  ],
}

// ── Act IV · The Drowned Coast: a shanty against the tide. D minor, 6/8, 84 bpm. ────────
const IV_CH = ['Dm', 'C', 'Bb', 'A', 'Dm', 'C', 'Bb', 'A', 'F', 'C', 'Dm', 'A', 'Bb', 'F', 'Gm', 'A']
export const act4: Track = {
  id: 'act-4',
  title: 'Act IV · Salt and Undertow',
  bpm: 84,
  stepsPerBeat: 3,
  beatsPerBar: 2,
  loop: true,
  channels: [
    {
      inst: INST.lead(0.19, { vib: { rate: 5, depth: 18, delay: 0.15 } }),
      pattern: [
        'A4 - D5 - - F5 | E5 - C5 - - E5 | D5 - - Bb4 - D5 | C#5 - - A4 - -',
        'A4 - D5 - E5 F5 | G5 - E5 - C5 E5 | F5 - E5 D5 - C#5 | D5 - - - - -',
        'A5 - - F5 - A5 | G5 - - E5 - C5 | F5 - E5 D5 - F5 | E5 - - - - -',
        'D5 - F5 Bb5 - A5 | A5 - G5 F5 - C5 | D5 - G5 - Bb5 - | A5 - - C#5 - E5',
      ].join(' | '),
    },
    { inst: INST.square(0.05, { gate: 0.55, lp: 1800 }), pattern: padLine(IV_CH, 6, 4, '. x x . x x') },
    { inst: INST.bass(0.3), pattern: bassLine(IV_CH, 'R - - 5 - -', 2) },
    { inst: INST.drums(0.4), pattern: rep('k . h s . h?', 16) },
    // The swell: an open hat like a wave breaking every second bar.
    { inst: INST.drums(0.35), pattern: rep('. . . . . . | o . . . . .', 8) },
  ],
}

// ── Act V · The Order's War: a drilled, martial theme. C minor, 140 bpm. ────────────────
const V_CH = ['Cm', 'Ab', 'Bb', 'G', 'Cm', 'Ab', 'Fm', 'G', 'Ab', 'Bb', 'Gm', 'Cm', 'Ab', 'Bb', 'G', 'G']
export const act5: Track = {
  id: 'act-5',
  title: "Act V · The Order's War",
  bpm: 140,
  stepsPerBeat: 4,
  beatsPerBar: 4,
  loop: true,
  channels: [
    {
      inst: INST.brass(0.14),
      rate: 2,
      pattern: [
        'C5 - - - G4 - C5 Eb5 | G5 - - - F5 - Eb5 - | D5 - - - Bb4 - D5 F5 | G5 - - - - - B4 -',
        'C5 - Eb5 - G5 - C6 - | Bb5 - Ab5 - G5 - F5 - | Ab5 - G5 - F5 - Eb5 - | D5 - - - B4 - G4 -',
        'Eb5 - - Ab5 - - C6 - | Bb5 - - - F5 - - - | G5 - - Bb5 - - D6 - | C6 - - - G5 - - -',
        'Ab5 - C6 - Eb6 - D6 C6 | D6 - - - Bb5 - F5 - | G5 - B5 - D6 - F6 - | Eb6 - D6 - B5 - G5 -',
      ].join(' | '),
    },
    { inst: INST.lead(0.08, { wave: 'pulse12', vib: undefined }), rate: 2, transpose: -12, pattern: arpLine(V_CH, '0 . 0 2 . 2 1 .', 5) },
    { inst: INST.bass(0.3), pattern: bassLine(V_CH, 'R R . R R . R R 5 5 . 5 8 . 5 .', 2) },
    { inst: INST.drums(0.46), pattern: rep('k . h s? s . h . k k h s? s . s s?', 16) },
    { inst: INST.drums(0.4), pattern: once('c', BAR16 * 8) },
  ],
}

// ── Act VI · The Inflection: the curve steepens. F♯ minor, 164 bpm, driving. ────────────
const VI_CH = ['F#m', 'D', 'E', 'C#', 'F#m', 'D', 'Bm', 'C#']
export const act6: Track = {
  id: 'act-6',
  title: 'Act VI · The Inflection',
  gain: 1.3,
  bpm: 164,
  stepsPerBeat: 4,
  beatsPerBar: 4,
  loop: true,
  channels: [
    {
      inst: INST.lead(0.19),
      rate: 2,
      pattern: [
        'F#5 - - C#6 - - A5 - | B5 - A5 - F#5 - - - | G#5 - - E5 - - G#5 - | B5 - A5 - G#5 - F5 -',
        'F#5 - A5 - C#6 - F#6 - | E6 - D6 - C#6 - A5 - | B5 - D6 - F#6 - E6 D6 | C#6 - - - G#5 - F5 -',
      ].join(' | '),
    },
    { inst: INST.thin(0.06, { s: 0.4 }), pattern: arpLine(VI_CH, '0 1 2 1 0 1 2 1 0 1 2 1 0 1 2 3', 5) },
    { inst: INST.sawBass(0.12), pattern: bassLine(VI_CH, 'R R 8 R R 8 R R 5 5 8 5 R R 8 R', 2) },
    { inst: INST.drums(0.46), pattern: rep('k . h . s . h k . k h . s . h h', 8) },
    { inst: INST.drums(0.4), pattern: once('c', BAR16 * 4) },
  ],
}

// ── Act VII · The Fragment Series: cold crystal, the same for every Master. B minor. ───
const VII_CH = ['Bm', 'G', 'D', 'A', 'Bm', 'G', 'Em', 'F#']
export const act7: Track = {
  id: 'act-7',
  title: 'Act VII · The Fragment Series',
  gain: 1.6,
  bpm: 120,
  stepsPerBeat: 4,
  beatsPerBar: 4,
  loop: true,
  channels: [
    {
      inst: INST.lead(0.17, { wet: 0.45 }),
      rate: 2,
      pattern: [
        'F#5 - - - D5 - - - | B4 - - - D5 - G5 - | F#5 - - - A5 - - - | E5 - - - C#5 - - -',
        'D5 - - - F#5 - B5 - | A5 - G5 - F#5 - D5 - | E5 - - - G5 - B5 - | A#5 - - - F#5 - - -',
      ].join(' | '),
    },
    { inst: INST.bell(0.05, { ratio: 3.01, index: 1.6, d: 0.35 }), pattern: arpLine(VII_CH, '0 2 4 2 1 3 5 3 0 2 4 2 1 3 5 6', 4) },
    { inst: INST.sawBass(0.11, { lp: 700 }), pattern: bassLine(VII_CH, 'R - - R . . 5 . R - - R . . 8 .', 2) },
    { inst: INST.drums(0.42, 'nes'), pattern: rep('k . . . h . . . s . . . h . k . | k . . . h . . . s . . k h . s? s?', 4) },
  ],
}

// ── Act VIII · The Unfinished Floors: the scale breaks. E♭ minor, 112 bpm. ──────────────
const VIII_CH = ['Ebm', 'B', 'Ebm', 'D', 'Ebm', 'B', 'Abm', 'D']
export const act8: Track = {
  id: 'act-8',
  title: 'Act VIII · The Unfinished Floors',
  bpm: 112,
  stepsPerBeat: 4,
  beatsPerBar: 4,
  loop: true,
  channels: [
    {
      inst: INST.softLead(0.19, { wave: 'square', lp: 2000, glide: 0.06, wet: 0.5 }),
      rate: 2,
      pattern: [
        'Eb5 - - - - - Gb5 - | F#5 - - - D#5 - B4 - | Bb4 - - - Eb5 - F5 - | F#5 - - - A5 - - -',
        'Eb5 - - - Bb5 - - - | A5 - F#5 - D#5 - - - | B4 - - - Eb5 - Ab5 - | A5 - - - F#5 - D5 -',
      ].join(' | '),
    },
    { inst: INST.choir(0.06), rate: 16, pattern: padLine(VIII_CH, 1, 4) },
    { inst: INST.fmBass(0.24, { ratio: 1, index: 1.2 }), pattern: bassLine(VIII_CH, 'R - - - - - - - R . R . 5 . . .', 1) },
    { inst: INST.drums(0.45, 'punchy', 0.2), pattern: rep('l . . . s . . l . . l . s . t t?', 8) },
    { inst: INST.drums(0.25, 'nes'), pattern: rep('. . h? . . . h? . . . h? . . . h? h?', 8) },
  ],
}
