// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installMotionMirror, onReducedMotionChange, osPrefersReducedMotion, reducedMotion, resolveReducedMotion } from './motion'
import { reloadSettingsForTests, updateSettings } from './qol/settings'

/** A fake OS preference (jsdom has no matchMedia). */
function fakeOs(reduce: boolean) {
  const listeners = new Set<() => void>()
  const mq = {
    matches: reduce,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  }
  window.matchMedia = vi.fn(() => mq as unknown as MediaQueryList)
  return {
    set(v: boolean) {
      mq.matches = v
      for (const fn of listeners) fn()
    },
  }
}

beforeEach(() => {
  window.localStorage.clear()
  reloadSettingsForTests()
})
afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia
  window.localStorage.clear()
  reloadSettingsForTests()
})

describe('reduced motion', () => {
  it('the setting decides; auto follows the OS', () => {
    expect(resolveReducedMotion('on', false)).toBe(true)
    expect(resolveReducedMotion('off', true)).toBe(false)
    expect(resolveReducedMotion('auto', true)).toBe(true)
    expect(resolveReducedMotion('auto', false)).toBe(false)
  })

  it('without matchMedia (old browsers, tests) the OS answer is no', () => {
    expect(osPrefersReducedMotion()).toBe(false)
    expect(reducedMotion()).toBe(false)
  })

  it('reads the OS preference live, and the Master can override it either way', () => {
    const os = fakeOs(true)
    expect(reducedMotion()).toBe(true)
    updateSettings({ reducedMotion: 'off' })
    expect(reducedMotion()).toBe(false)
    updateSettings({ reducedMotion: 'auto' })
    os.set(false)
    expect(reducedMotion()).toBe(false)
    updateSettings({ reducedMotion: 'on' })
    expect(reducedMotion()).toBe(true)
  })

  it('notifies on a change of setting and mirrors data-motion on <html>', () => {
    const off = installMotionMirror()
    let calls = 0
    const stop = onReducedMotionChange(() => calls++)
    updateSettings({ reducedMotion: 'on' })
    expect(document.documentElement.dataset.motion).toBe('reduce')
    updateSettings({ reducedMotion: 'off' })
    expect(document.documentElement.dataset.motion).toBe('full')
    expect(calls).toBeGreaterThanOrEqual(2)
    stop()
    off()
  })
})
