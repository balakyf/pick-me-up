/**
 * The event music: the boss theme for an anchor floor, the Wailing Wall, the world's end,
 * and the one-shots — the victory jingle, the defeat, and the death motif that plays over
 * a hero's last moment while the battle music ducks.
 */
import { INST, arpLine, bassLine, padLine, rep } from './compose'
import { once } from './scenes'
import type { Track } from './types'

// ── Boss: an anchor floor's guardian. D minor, 172 bpm, all hands. ──────────────────────
const BOSS_CH = ['Dm', 'Bb', 'C', 'A', 'Dm', 'Bb', 'Gm', 'A', 'Bb', 'C', 'Dm', 'Dm', 'Gm', 'A', 'Dm', 'A']
export const boss: Track = {
  id: 'boss',
  title: 'The Guardian of the Floor',
  bpm: 172,
  stepsPerBeat: 4,
  beatsPerBar: 4,
  loop: true,
  entry: 'beat',
  fadeIn: 0.2,
  channels: [
    {
      inst: INST.lead(0.2),
      rate: 2,
      pattern: [
        'D5 - A5 - D6 - C6 A5 | Bb5 - F5 - D5 - F5 Bb5 | C6 - G5 - E5 - G5 C6 | C#6 - - - A5 - E5 -',
        'D6 - C6 - A5 - F5 - | G5 - F5 - D5 - Bb4 - | G5 - Bb5 - D6 - G6 - | F6 - E6 - C#6 - A5 -',
        'F6 - - - D6 - Bb5 - | E6 - - - C6 - G5 - | A5 - D6 - F6 - A6 - | G6 - F6 - E6 - D6 -',
        'Bb5 - - - D6 - G6 - | E6 - - - C#6 - A5 - | D6 - - - - - A5 - | C#6 - E6 - A6 - - -',
      ].join(' | '),
    },
    { inst: INST.square(0.07, { lp: 2400 }), rate: 2, transpose: -12, pattern: arpLine(BOSS_CH, '0 . 2 . 1 . 2 .', 5) },
    { inst: INST.sawBass(0.13, { lp: 1100 }), pattern: bassLine(BOSS_CH, 'R 8 R 8 R 8 R 8 R 8 R 8 5 8 5 8', 2) },
    { inst: INST.brass(0.1), pattern: padLine(BOSS_CH, 16, 4, 'x - - . . . . . . . x - . . . .') },
    { inst: INST.drums(0.48), pattern: rep('k h s h k k s h k h s h k k s s?', 16) },
    { inst: INST.drums(0.42), pattern: once('c', 16 * 4) },
  ],
}

// ── The Wailing Wall: the Fragment Series' guardians. G minor, 96 bpm, an organ in a
//    cathedral of glass. ────────────────────────────────────────────────────────────────
const WALL_CH = ['Gm', 'Eb', 'Cm', 'D', 'Gm', 'Eb', 'F', 'D', 'Cm', 'Gm', 'Eb', 'D', 'Cm', 'Gm', 'Ab', 'D']
export const wailingWall: Track = {
  id: 'wailing-wall',
  title: 'The Wailing Wall',
  bpm: 96,
  stepsPerBeat: 4,
  beatsPerBar: 4,
  loop: true,
  entry: 'beat',
  fadeIn: 0.4,
  channels: [
    {
      inst: INST.brass(0.15, { wet: 0.4 }),
      rate: 2,
      pattern: [
        'G4 - - - Bb4 - D5 - | Eb5 - - - D5 - Bb4 - | C5 - - - Eb5 - G5 - | F#5 - - - - - - -',
        'G5 - - - F5 - D5 - | Eb5 - - - G5 - Bb5 - | A5 - - - F5 - C5 - | D5 - - - - - - -',
        'Eb5 - - - G5 - C6 - | Bb5 - - - D5 - G5 - | G5 - - - Bb5 - Eb6 - | D6 - - - A5 - F#5 -',
        'G5 - - - C6 - Eb6 - | D6 - - - Bb5 - G5 - | C6 - - - Ab5 - Eb5 - | F#5 - - - A5 - D6 -',
      ].join(' | '),
    },
    { inst: INST.organ(0.08), rate: 16, pattern: padLine(WALL_CH, 1, 3) },
    { inst: INST.choir(0.06), rate: 16, pattern: padLine(WALL_CH, 1, 4) },
    // The bell tolls each bar.
    { inst: INST.bell(0.09, { ratio: 1.41, index: 2.5, d: 1.8, r: 1.2 }), rate: 16, pattern: arpLine(WALL_CH, '0', 3) },
    { inst: INST.bass(0.3), rate: 2, pattern: bassLine(WALL_CH, 'R - - - 5 - R -', 1) },
    { inst: INST.drums(0.5, 'punchy', 0.25), pattern: rep('k . . . . . . . s . . . . . l . | k . . . . . k . s . . . l . t t?', 8) },
    { inst: INST.drums(0.42), pattern: once('c', 16 * 8) },
  ],
}

// ── World's End: F90 and the summit. A harmonic minor, 138 bpm — grand and frantic. ────
const END_CH = ['Am', 'Bb', 'Am', 'G#dim', 'Am', 'Bb', 'Dm', 'E', 'F', 'E', 'Dm', 'E', 'F', 'G', 'Am', 'E']
export const worldsEnd: Track = {
  id: 'worlds-end',
  title: "The World's End",
  bpm: 138,
  stepsPerBeat: 4,
  beatsPerBar: 4,
  loop: true,
  entry: 'beat',
  fadeIn: 0.3,
  channels: [
    {
      inst: INST.lead(0.2, { wet: 0.3 }),
      rate: 2,
      pattern: [
        'A5 - - - E5 - A5 C6 | D6 - - - Bb5 - F5 - | E6 - - - C6 - A5 - | B5 - - - G#5 - F5 -',
        'A5 - C6 - E6 - A6 - | G6 - F6 - D6 - Bb5 - | A5 - D6 - F6 - E6 D6 | E6 - - - G#5 - B5 -',
        'C6 - - - A5 - F5 - | G#5 - - - B5 - E6 - | F6 - - - D6 - A5 - | G#5 - - - - - E5 -',
        'A5 - C6 - F6 - E6 - | D6 - B5 - G5 - D6 - | C6 - - - E6 - A6 - | G#6 - - - E6 - B5 -',
      ].join(' | '),
    },
    { inst: INST.choir(0.07), rate: 16, pattern: padLine(END_CH, 1, 4) },
    { inst: INST.thin(0.055, { s: 0.4 }), pattern: arpLine(END_CH, '0 1 2 3 2 1 0 1 2 3 2 1 0 1 2 1', 4) },
    { inst: INST.sawBass(0.12), pattern: bassLine(END_CH, 'R . R R . R R . R . R R 8 . 5 .', 2) },
    { inst: INST.drums(0.48), pattern: rep('k . h k s . h . k k h . s . h s?', 16) },
    { inst: INST.drums(0.42), pattern: once('c', 16 * 8) },
  ],
}

// ── One-shots ───────────────────────────────────────────────────────────────────────────

/** The victory jingle: two bars, a fanfare and a held chord. C major, 150 bpm. */
export const victory: Track = {
  id: 'victory',
  title: 'Floor Cleared!',
  bpm: 150,
  stepsPerBeat: 4,
  beatsPerBar: 4,
  loop: false,
  entry: 'beat',
  fadeIn: 0,
  channels: [
    { inst: INST.lead(0.22, { gate: 1 }), pattern: 'G4 C5 E5 G5 - - E5 G5 - - - - A5 - B5 - | C6 - - - - - - - - - - - . . . .' },
    { inst: INST.square(0.12), pattern: 'E4 G4 C5 E5 - - C5 E5 - - - - F5 - G5 - | E5 - - - - - - - - - - - . . . .' },
    { inst: INST.bass(0.3), pattern: 'C3 . . . C3 . . . F3 . . . G3 . . . | C3 - - - - - - - - - - - . . . .' },
    { inst: INST.drums(0.45), pattern: 'k . . . s . . . k . s . s s s s | c . . . . . . . . . . . . . . .' },
  ],
}

/** The defeat: a slow fall to A minor. 70 bpm. */
export const defeat: Track = {
  id: 'defeat',
  title: 'The Party Falls',
  bpm: 84,
  stepsPerBeat: 2,
  beatsPerBar: 4,
  loop: false,
  entry: 'beat',
  fadeIn: 0,
  channels: [
    { inst: INST.softLead(0.2, { wet: 0.5 }), pattern: 'E5 - D5 - C5 - B4 - | A4 - - - G#4 - - - | A4 - - - - - - -' },
    { inst: INST.pad(0.05), rate: 8, pattern: padLine(['Am', 'E', 'Am'], 1, 3) },
    { inst: INST.bass(0.24, { s: 0.5, d: 0.8 }), pattern: 'A2 - - - - - - - | E2 - - - - - - - | A2 - - - - - - -' },
  ],
}

/** The death motif: four notes for the fallen, over the ducked battle. */
export const deathMotif: Track = {
  id: 'death-motif',
  title: 'Last Words',
  bpm: 60,
  stepsPerBeat: 2,
  beatsPerBar: 4,
  loop: false,
  entry: 'now',
  fadeIn: 0,
  channels: [
    { inst: INST.softLead(0.22, { wet: 0.6, vib: { rate: 4, depth: 12, delay: 0.3 } }), pattern: 'E5 - C5 - B4 - - - | A4 - - - - - - -' },
    { inst: INST.bell(0.07, { wet: 0.7 }), pattern: 'E6 . . . . . . . | A5 - - - - - - -' },
    { inst: INST.pad(0.04, { a: 0.6 }), rate: 8, pattern: padLine(['Am', 'Am'], 1, 3) },
  ],
}
