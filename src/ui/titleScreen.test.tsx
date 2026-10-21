// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
import { App } from './App'
import { TitleScreen, saveLooksBroken } from './screens'
import { BROKEN_SAVE_KEY, getStore } from './useGame'
import type { Store } from '../engine/store'

/** The title screen never offers a dead Continue for a save that cannot be read. */

const SAVE_KEY = 'pmu.save.v1'
const MESSAGE = 'This save could not be read. A copy was kept.'

let container: HTMLDivElement
let root: Root

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

describe('TitleScreen and an unreadable save', () => {
  it('saveLooksBroken: only when the kept copy is the save on disk', () => {
    expect(saveLooksBroken()).toBe(false)
    window.localStorage.setItem(SAVE_KEY, 'abc')
    expect(saveLooksBroken()).toBe(false)
    window.localStorage.setItem(BROKEN_SAVE_KEY, 'abc')
    expect(saveLooksBroken()).toBe(true)
    window.localStorage.setItem(SAVE_KEY, 'a newer, good save')
    expect(saveLooksBroken()).toBe(false)
  })

  it('at boot: the save fails to load, the title says so, and New Game still works', () => {
    window.localStorage.setItem(SAVE_KEY, '{not json')
    act(() => root.render(<App />))
    expect(window.localStorage.getItem(BROKEN_SAVE_KEY)).toBe('{not json')
    expect(container.textContent).toContain(MESSAGE)
    expect(buttonsWith('Continue')).toHaveLength(0)
    const fresh = buttonsWith('New Game')
    expect(fresh).toHaveLength(1)
    act(() => fresh[0]!.click())
    expect(getStore().getState()).not.toBeNull()
    expect(container.textContent).not.toContain(MESSAGE)
  })

  it('if Continue fails anyway, it turns into the message instead of doing nothing', () => {
    window.localStorage.setItem(SAVE_KEY, 'unreadable')
    const store = {
      load: () => {
        throw new Error('migrate: bad save')
      },
      dispatch: vi.fn(),
    } as unknown as Store
    act(() => root.render(<TitleScreen store={store} hasSave />))
    const cont = buttonsWith('Continue')
    expect(cont).toHaveLength(1)
    expect(container.textContent).not.toContain(MESSAGE)
    act(() => cont[0]!.click())
    expect(container.textContent).toContain(MESSAGE)
    expect(buttonsWith('Continue')).toHaveLength(0)
    expect(window.localStorage.getItem(BROKEN_SAVE_KEY)).toBe('unreadable')
    // New Game is still there and still dispatches.
    act(() => buttonsWith('New Game')[0]!.click())
    expect(store.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'NEW_ACCOUNT' }))
  })

  it('a readable save keeps its Continue button and no warning', () => {
    window.localStorage.setItem(SAVE_KEY, 'fine')
    const store = { load: vi.fn(), dispatch: vi.fn() } as unknown as Store
    act(() => root.render(<TitleScreen store={store} hasSave />))
    expect(container.textContent).not.toContain(MESSAGE)
    act(() => buttonsWith('Continue')[0]!.click())
    expect(store.load).toHaveBeenCalled()
    expect(container.textContent).not.toContain(MESSAGE)
  })
})

describe('TitleScreen: Canon rules (S25, integration)', () => {
  function fakeStore(): Store & { sent: unknown[] } {
    const sent: unknown[] = []
    return { sent, dispatch: (c: unknown) => sent.push(c), load: () => {} } as unknown as Store & { sent: unknown[] }
  }

  it('a new Master plays without Hardcore unless they tick it', () => {
    const plain = fakeStore()
    act(() => root.render(<TitleScreen store={plain} hasSave={false} />))
    act(() => buttonsWith('Begin')[0]!.click())
    expect(plain.sent[0]).toMatchObject({ type: 'NEW_ACCOUNT' })
    expect((plain.sent[0] as { hardcore?: boolean }).hardcore).toBeUndefined()

    const canon = fakeStore()
    act(() => root.render(<TitleScreen key="canon" store={canon} hasSave={false} />))
    const box = container.querySelector<HTMLInputElement>('.title-hardcore input')!
    expect(box.checked).toBe(false)
    act(() => box.click())
    act(() => buttonsWith('Begin')[0]!.click())
    expect(canon.sent[0]).toMatchObject({ type: 'NEW_ACCOUNT', hardcore: true })
  })

  it('NEW_ACCOUNT with hardcore makes a Hardcore Master', () => {
    const s = getStore()
    act(() => {
      s.dispatch({ type: 'NEW_ACCOUNT', seed: 3, now: 0, hardcore: true })
    })
    expect(s.getState()!.meta.hardcore).toBe(true)
    act(() => {
      s.dispatch({ type: 'NEW_ACCOUNT', seed: 3, now: 0 })
    })
    expect(s.getState()!.meta.hardcore).toBe(false)
  })
})
