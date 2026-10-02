/**
 * The scene themes: the title, the lobby by day, by night and in the rain, and the
 * summoning chamber (whose layers rise with the reveal's tiers).
 */
import { INST, arpLine, bassLine, padLine, rep } from './compose'
import type { Track } from './types'

/** A single hit at the top of an n-step loop (a crash on the downbeat of the phrase). */
export const once = (tokTxt: string, steps: number): string => [tokTxt, ...Array(steps - 1).fill('.')].join(' ')

// ── Title: "Pick Me Up!" — bright, hopeful, a little grand. C major, 112 bpm. ──────────
const TITLE_CH = ['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'G', 'Am', 'Em', 'F', 'C', 'Dm', 'G', 'C', 'G']
export const title: Track = {
  id: 'title',
  title: 'Pick Me Up!',
  bpm: 112,
  stepsPerBeat: 4,
  beatsPerBar: 4,
  loop: true,
  channels: [
    {
      inst: INST.lead(0.2),
      rate: 2,
      pattern: [
        'E5 - G5 - C6 - B5 A5 | G5 - - - D5 - G5 - | A5 - G5 E5 C5 - E5 - | F5 - - - - - . .',
        'E5 - G5 - C6 - D6 E6 | D6 - B5 - G5 - A5 B5 | C6 - A5 - F5 - G5 A5 | G5 - - - - - . .',
        'A5 - B5 - C6 - E6 - | B5 - - - G5 - - - | A5 - G5 - F5 - E5 - | G5 - - - - - E5 G5',
        'F5 - A5 - D6 - C6 - | B5 - - - D6 - - - | C6 - G5 - E5 - G5 - | D6 - - - B5 - G5 -',
      ].join(' | '),
    },
    { inst: INST.arp(0.07, 36), rate: 4, pattern: padLine(TITLE_CH, 4, 4) },
    { inst: INST.bass(0.28), rate: 2, pattern: bassLine(TITLE_CH, 'R - R 5 8 - 5 R', 2) },
    { inst: INST.drums(0.42), pattern: rep('k . h . s . h . k k h . s . h h', 16) },
    { inst: INST.drums(0.4), pattern: once('c', 16 * 16) },
  ],
}

// ── Lobby, day: a cosy village shuffle. F major, 92 bpm, swung eighths. ────────────────
const DAY_CH = ['F', 'Dm', 'Bb', 'C', 'F', 'Am', 'Bb', 'C', 'Bb', 'C', 'Am', 'Dm', 'Gm', 'C', 'F', 'F']
export const lobbyDay: Track = {
  id: 'lobby-day',
  title: 'The Waiting Room',
  gain: 1.3,
  bpm: 92,
  stepsPerBeat: 2,
  beatsPerBar: 4,
  swing: 0.28,
  loop: true,
  channels: [
    {
      inst: INST.softLead(0.2, { wave: 'pulse25', lp: 2600 }),
      pattern: [
        'C5 - A4 - F4 - A4 C5 | D5 - - - F5 - E5 D5 | D5 - Bb4 - F4 - Bb4 D5 | C5 - - - - - . .',
        'C5 - A4 - F4 - A4 C5 | E5 - - - C5 - E5 G5 | F5 - D5 - Bb4 - C5 D5 | C5 - - - G4 - - -',
        'D5 - F5 - Bb5 - A5 G5 | G5 - - - E5 - C5 - | C5 - E5 - A5 - G5 E5 | F5 - - - D5 - - -',
        'Bb4 - D5 - G5 - F5 D5 | E5 - - - G5 - E5 C5 | F5 - - - C5 - A4 - | F4 - - - - - . .',
      ].join(' | '),
    },
    { inst: INST.epiano(0.07), pattern: padLine(DAY_CH, 8, 4, '. x . x . x . x') },
    { inst: INST.pluckBass(0.26), pattern: bassLine(DAY_CH, 'R . 5 . 8 . 5 n', 2) },
    { inst: INST.drums(0.32, 'soft'), pattern: rep('k . h . s . h h?', 16) },
    // A bell answers the tune in its second half.
    { inst: INST.bell(0.06), rate: 2, pattern: rep('. . . .', 8) + ' | ' + arpLine(DAY_CH.slice(8), '2 . 1 .', 5) },
  ],
}

// ── Lobby, night: a music-box lullaby waltz. A♭ major, 3/4, 70 bpm. ─────────────────────
const NIGHT_CH = ['Ab', 'Fm', 'Db', 'Eb', 'Ab', 'Cm', 'Db', 'Eb', 'Fm', 'Db', 'Ab', 'Eb', 'Db', 'Eb', 'Ab', 'Ab']
export const lobbyNight: Track = {
  id: 'lobby-night',
  title: 'Lanterns Out',
  bpm: 70,
  stepsPerBeat: 2,
  beatsPerBar: 3,
  loop: true,
  fadeIn: 1.5,
  channels: [
    {
      inst: INST.softLead(0.17, { lp: 1800, wet: 0.5 }),
      pattern: [
        'C5 - - - Eb5 - | Ab5 - - - G5 F5 | F5 - - - Db5 - | Eb5 - - - - -',
        'C5 - - - Eb5 - | G5 - - - Ab5 Bb5 | Ab5 - F5 - Db5 - | Eb5 - - - - -',
        'C5 - - - F5 - | Ab5 - - - F5 - | Eb5 - - - C5 - | Bb4 - - - - -',
        'Db5 - F5 - Ab5 - | G5 - - - Bb5 - | Ab5 - - - - - | . . . . . .',
      ].join(' | '),
    },
    { inst: INST.bell(0.05, { ratio: 4, index: 1.4 }), pattern: arpLine(NIGHT_CH, '0 1 2 3 2 1', 5) },
    { inst: INST.pad(0.045, { lp: 900 }), rate: 6, pattern: padLine(NIGHT_CH, 1, 3) },
    { inst: INST.bass(0.2, { s: 0.4, d: 0.6 }), pattern: bassLine(NIGHT_CH, 'R - - . 5 .', 2) },
  ],
}

// ── Lobby, rain: a lo-fi window-seat tune. D dorian, 80 bpm, swung. ─────────────────────
const RAIN_CH = ['Dm7', 'G7', 'Cmaj7', 'Am7', 'Dm7', 'G7', 'Bbmaj7', 'A7']
export const lobbyRain: Track = {
  id: 'lobby-rain',
  title: 'Rain on the Roofs',
  bpm: 80,
  stepsPerBeat: 2,
  beatsPerBar: 4,
  swing: 0.3,
  loop: true,
  fadeIn: 1.2,
  channels: [
    {
      inst: INST.softLead(0.17, { lp: 1600, wet: 0.45 }),
      pattern: [
        '. . A4 - C5 - D5 - | F5 - - - E5 D5 B4 - | C5 - - - - - G4 - | A4 - C5 - E5 - - -',
        '. . F5 - E5 - D5 - | D5 - - - B4 - G4 - | A4 - - - Bb4 - D5 - | C#5 - - - - - . .',
      ].join(' | '),
    },
    { inst: INST.epiano(0.075, { wet: 0.45 }), pattern: padLine(RAIN_CH, 8, 4, 'x - - x - - x -') },
    { inst: INST.pluckBass(0.24, { lp: 700 }), pattern: bassLine(RAIN_CH, 'R - - 5 . R 5 .', 2) },
    { inst: INST.drums(0.26, 'soft'), pattern: rep('k . h . s . h k?', 8) },
  ],
}

// ── The summoning chamber: E minor, 100 bpm. Layers rise with the reveal's tier:
//    0 the pad and the glitter, 1 a pulse bass and hats, 2 the tune, 3 the drums,
//    4 (gold) brass, choir and a crash. ─────────────────────────────────────────────────
const SUMMON_CH = ['Em', 'C', 'D', 'B7', 'Em', 'C', 'Am', 'B7']
export const summon: Track = {
  id: 'summon',
  title: 'Mobius Summon',
  bpm: 100,
  stepsPerBeat: 4,
  beatsPerBar: 4,
  loop: true,
  fadeIn: 0.8,
  channels: [
    { inst: INST.pad(0.05), rate: 16, pattern: padLine(SUMMON_CH, 1, 3) },
    { inst: INST.bell(0.045, { ratio: 3, index: 1.2, d: 0.4 }), pattern: arpLine(SUMMON_CH, '0 1 2 3 4 3 2 1 0 1 2 3 4 5 4 3', 5) },
    { inst: INST.thin(0.12, { s: 0.3 }), rate: 2, minLevel: 1, pattern: bassLine(SUMMON_CH, 'R . R . R . 5 .', 2) },
    { inst: INST.drums(0.25, 'nes'), minLevel: 1, pattern: rep('. . h . . . h . . . h . . . h h', 8) },
    {
      inst: INST.lead(0.16, { wet: 0.35 }),
      rate: 2,
      minLevel: 2,
      pattern: [
        'B4 - E5 - G5 - B5 - | C6 - - - G5 - E5 - | F#5 - A5 - D6 - C6 - | B5 - - - D#5 - F#5 -',
        'G5 - B5 - E6 - D6 - | C6 - B5 - G5 - E5 - | A5 - C6 - E6 - C6 - | B5 - - - - - . .',
      ].join(' | '),
    },
    { inst: INST.drums(0.38), minLevel: 3, pattern: rep('k . . . s . . k k . . . s . s? .', 8) },
    { inst: INST.brass(0.1), minLevel: 4, pattern: padLine(SUMMON_CH, 16, 4, 'x - - - - - x - - - x - - - - -') },
    { inst: INST.choir(0.06), rate: 16, minLevel: 4, pattern: padLine(SUMMON_CH, 1, 4) },
    { inst: INST.drums(0.4), minLevel: 4, pattern: once('c', 64) },
  ],
}
