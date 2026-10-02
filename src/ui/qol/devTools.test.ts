import { describe, expect, it } from 'vitest'
import { devToolsEnabled } from './devTools'

describe('devToolsEnabled', () => {
  it('is off in a player build unless ?dev=1 asks for it', () => {
    expect(devToolsEnabled('', false)).toBe(false)
    expect(devToolsEnabled('?seed=4', false)).toBe(false)
    expect(devToolsEnabled('?dev=0', false)).toBe(false)
    expect(devToolsEnabled('?dev=1', false)).toBe(true)
    expect(devToolsEnabled('?view=tower&dev=1', false)).toBe(true)
  })

  it('is on in a dev build', () => {
    expect(devToolsEnabled('', true)).toBe(true)
  })
})
