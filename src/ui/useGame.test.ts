// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

describe('useGame boot', () => {
  it('a save that fails to load is copied aside and the app starts at the title', async () => {
    window.localStorage.clear()
    window.localStorage.setItem('pmu.save.v1', '{"schemaVersion": 999, "state": {}}')
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { getStore, BROKEN_SAVE_KEY } = await import('./useGame')
    const store = getStore()
    expect(store.getState()).toBeNull()
    expect(BROKEN_SAVE_KEY).toBe('pmu.save.v1.broken')
    expect(window.localStorage.getItem(BROKEN_SAVE_KEY)).toBe('{"schemaVersion": 999, "state": {}}')
    expect(window.localStorage.getItem('pmu.save.v1')).toBe('{"schemaVersion": 999, "state": {}}')
    expect(err).toHaveBeenCalledTimes(1)
    err.mockRestore()
  })
})
