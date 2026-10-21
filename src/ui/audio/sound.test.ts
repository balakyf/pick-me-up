import { describe, expect, it } from 'vitest'
import { sfx, type Sfx } from './sound'

const ALL: Sfx[] = [
  'click', 'hit', 'crit', 'miss', 'guard', 'heal', 'death', 'panic', 'victory', 'defeat', 'summon', 'rare', 'legend', 'levelup', 'fail',
  'reveal', 'coin', 'heroFall', 'unlock', 'boon', 'door', 'stamp', 'saved',
]

describe('sfx', () => {
  it('every cue, with and without options, is a silent no-op where there is no AudioContext', () => {
    for (const name of ALL) {
      expect(() => sfx(name)).not.toThrow()
      expect(() => sfx(name, { semis: 3, star: 5 })).not.toThrow()
      expect(() => sfx(name, { semis: -12, star: 0 })).not.toThrow()
    }
  })
})
