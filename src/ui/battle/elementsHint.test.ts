import { afterEach, describe, expect, it } from 'vitest'
import { setLocale } from '../i18n/i18n'
import { elementChains, elementMultipliers, elementsHintSeen, ELEMENTS_HINT_KEY, markElementsHintSeen } from './elementsHint'

afterEach(() => setLocale('en'))

describe('the elements hint', () => {
  it("reads the wheel from the engine's own table", () => {
    const chains = elementChains()
    expect(chains).toHaveLength(2)
    expect(chains[0]).toMatch(/Fire › .*Wind › .*Earth › .*Water › .*Fire$/)
    expect(chains[1]).toMatch(/Light ⇄ .*Dark$/)
    expect(elementMultipliers()).toEqual({ weak: '×1.5', resist: '×0.75' })
  })

  it('is remembered once dismissed, and survives storage that refuses', () => {
    const store = new Map<string, string>()
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) }
    expect(elementsHintSeen(storage)).toBe(false)
    markElementsHintSeen(storage)
    expect(store.get(ELEMENTS_HINT_KEY)).toBe('1')
    expect(elementsHintSeen(storage)).toBe(true)
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(elementsHintSeen(broken)).toBe(false)
    expect(() => markElementsHintSeen(broken)).not.toThrow()
    expect(elementsHintSeen(null)).toBe(false)
  })

  it('names the elements in French', () => {
    setLocale('fr')
    expect(elementChains()[0]).toContain('Feu')
  })
})
