// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultPrefs, getPrefs, onPrefsChange, PREFS_KEY, setPrefs } from './prefs'

beforeEach(() => window.localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

describe('prefs', () => {
  it('defaults when nothing is stored (jsdom has no matchMedia: reduced motion off)', () => {
    expect(getPrefs()).toEqual({ battleSpeed: 2, autoSweep: true, shake: 1, reducedMotion: false })
    expect(getPrefs()).toEqual(defaultPrefs())
  })

  it('round-trips through localStorage and notifies listeners', () => {
    const seen: number[] = []
    const off = onPrefsChange((p) => seen.push(p.battleSpeed))
    const next = setPrefs({ battleSpeed: 4, autoSweep: false })
    off()
    setPrefs({ shake: 0.5 })
    expect(next).toEqual({ battleSpeed: 4, autoSweep: false, shake: 1, reducedMotion: false })
    expect(getPrefs()).toEqual({ battleSpeed: 4, autoSweep: false, shake: 0.5, reducedMotion: false })
    expect(JSON.parse(window.localStorage.getItem(PREFS_KEY)!)).toEqual({ battleSpeed: 4, autoSweep: false, shake: 0.5 })
    expect(seen).toEqual([4])
  })

  it('follows the OS reduced-motion setting until the player overrides it', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q }))
    expect(getPrefs().reducedMotion).toBe(true)
    setPrefs({ reducedMotion: false })
    expect(getPrefs().reducedMotion).toBe(false)
  })

  it('survives garbage and bad values in storage', () => {
    window.localStorage.setItem(PREFS_KEY, '{not json')
    expect(getPrefs()).toEqual(defaultPrefs())
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ battleSpeed: -1, autoSweep: 'yes', shake: 9 }))
    expect(getPrefs()).toEqual({ ...defaultPrefs(), shake: 1 })
  })

  it('survives storage that throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(getPrefs()).toEqual(defaultPrefs())
    expect(setPrefs({ battleSpeed: 3 }).battleSpeed).toBe(3)
    // The change still holds for this session, so readers agree with the listeners.
    expect(getPrefs().battleSpeed).toBe(3)
    spy.mockRestore()
    set.mockRestore()
    // Once storage works again, the next write persists everything.
    setPrefs({ shake: 0 })
    expect(JSON.parse(window.localStorage.getItem(PREFS_KEY)!)).toEqual({ battleSpeed: 3, shake: 0 })
  })
})
