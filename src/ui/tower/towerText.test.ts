import { describe, expect, it } from 'vitest'
import { enterBlock, enterBlockText, eventWhere } from './towerText'
import type { GameState } from '../../engine/types'

const tower = (event: GameState['tower']['event']): Pick<GameState, 'tower'> =>
  ({ tower: { currentFloor: 12, highestCleared: 11, attemptIndex: 0, event, loop: null, hiddenFound: [], worldEnded: false, worldSaved: false } }) as Pick<GameState, 'tower'>

describe('tower wording', () => {
  it('a bonus after a clear sits between floors; a recovery after a loss sits before the retry', () => {
    expect(eventWhere({ floor: 10 }, 11)).toBe('between F10 and F11')
    expect(eventWhere({ floor: 15 }, 15)).toBe('before you try F15 again')
  })

  it('a disabled Enter always says why', () => {
    expect(enterBlock(tower({ kind: 'bonus', floor: 10, options: ['rest'] }), true)).toBe('event')
    expect(enterBlock(tower(null), false)).toBe('party')
    expect(enterBlock(tower(null), true)).toBeNull()
    expect(enterBlockText('event')).toMatch(/event floor/)
    expect(enterBlockText('party')).toMatch(/can fight/)
    expect(enterBlockText(null)).toBe('')
  })
})
