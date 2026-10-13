// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
import { App } from './App'
import { TitleScreen } from './screens'
import { BROKEN_SAVE_KEY, getStore } from './useGame'
import type { Store } from '../engine/store'

/**
 * Review #15: the title screen must never claim "A copy was kept" when the copy write
 * failed (storage full), and New Game must not silently overwrite the only copy of an
 * unreadable save.
 */

const SAVE_KEY = 'pmu.save.v1'
const KEPT = 'A copy was kept'
const UNREADABLE = JSON.stringify({ schemaVersion: 99, state: {} })
/** Another unreadable save (not the one that failed at boot in this module's store). */
const UNREADABLE_LATER = JSON.stringify({ schemaVersion: 98, state: {} })

let container: HTMLDivElement
let root: Root

/** Storage that refuses the broken-save copy (as a full quota would). */
function refuseBrokenCopy() {
  const original = Storage.prototype.setItem
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
    if (k === BROKEN_SAVE_KEY) throw new DOMException('full', 'QuotaExceededError')
    return original.call(this, k, v)
  })
}

beforeEach(() => {
  window.localStorage.clear()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})

const buttonsWith = (label: string) => Array.from(container.querySelectorAll('button')).filter((b) => b.textContent?.includes(label))

describe('TitleScreen when the unreadable save could not be copied', () => {
  it('at boot: no dead Continue, no false "copy was kept", and New Game asks before overwriting', () => {
    refuseBrokenCopy()
    window.localStorage.setItem(SAVE_KEY, UNREADABLE)
    act(() => root.render(<App />))
    expect(window.localStorage.getItem(BROKEN_SAVE_KEY)).toBeNull()
    expect(buttonsWith('Continue')).toHaveLength(0)
    expect(container.textContent).not.toContain(KEPT)
    expect(container.textContent).toContain('no copy could be kept')
    expect(buttonsWith('Download the unreadable save')).toHaveLength(1)
    // The first click on New Game only asks; the save is still there.
    act(() => buttonsWith('New Game')[0]!.click())
    expect(window.localStorage.getItem(SAVE_KEY)).toBe(UNREADABLE)
    expect(getStore().getState()).toBeNull()
    expect(container.textContent).toContain('permanently replaces the unreadable save')
    act(() => buttonsWith('Start over anyway')[0]!.click())
    expect(getStore().getState()).not.toBeNull()
  })

  it('a Continue that fails without a copy says so, and New Game still asks first', () => {
    refuseBrokenCopy()
    window.localStorage.setItem(SAVE_KEY, UNREADABLE_LATER)
    const store = {
      load: () => {
        throw new Error('migrate: no migration path from version 99')
      },
      dispatch: vi.fn(),
    } as unknown as Store
    act(() => root.render(<TitleScreen store={store} hasSave />))
    act(() => buttonsWith('Continue')[0]!.click())
    expect(window.localStorage.getItem(BROKEN_SAVE_KEY)).toBeNull()
    expect(container.textContent).not.toContain(KEPT)
    expect(container.textContent).toContain('no copy could be kept')
    act(() => buttonsWith('New Game')[0]!.click())
    expect(store.dispatch).not.toHaveBeenCalled()
    act(() => buttonsWith('Start over anyway')[0]!.click())
    expect(store.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'NEW_ACCOUNT' }))
  })

  it('when the copy is kept, New Game goes straight on (the copy stays under the broken key)', () => {
    window.localStorage.setItem(SAVE_KEY, UNREADABLE_LATER)
    const store = {
      load: () => {
        throw new Error('migrate: no migration path from version 99')
      },
      dispatch: vi.fn(),
    } as unknown as Store
    act(() => root.render(<TitleScreen store={store} hasSave />))
    act(() => buttonsWith('Continue')[0]!.click())
    expect(window.localStorage.getItem(BROKEN_SAVE_KEY)).toBe(UNREADABLE_LATER)
    expect(container.textContent).toContain(KEPT)
    act(() => buttonsWith('New Game')[0]!.click())
    expect(store.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'NEW_ACCOUNT' }))
  })
})
