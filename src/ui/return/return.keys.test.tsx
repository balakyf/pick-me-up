// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
import { App } from '../App'
import { getStore } from '../useGame'
import { createAccount, saveState } from '../../engine/account'
import type { GameState } from '../../engine/types'
import { BACKUP_EVENT } from './ReturnLayer'

/**
 * The return layer's windows (welcome-back ledger, Lights Out, backup) are modal: the
 * lobby underneath must not walk, interact, or open the Menu while one is up. Before the
 * fix the lobby's window keydown listener ignored them: Enter/Space on a focused button
 * were preventDefault-ed (no keyboard activation) and Escape also opened the Game Menu.
 */

const HOUR = 3_600_000
let container: HTMLDivElement
let root: Root

beforeEach(() => {
  window.localStorage.clear()
  document.body.className = ''
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function returningSave(hoursAgo: number, seed: number): void {
  const base = createAccount(seed, { now: Date.now() - hoursAgo * HOUR })
  const s: GameState = { ...base, life: { ...base.life, guide: { ...base.life.guide, done: ['welcome'] } } }
  window.localStorage.setItem('pmu.save.v1', saveState(s))
  act(() => {
    getStore().load()
  })
}

function key(target: EventTarget, k: string): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })
  act(() => {
    target.dispatchEvent(ev)
  })
  return ev
}

function button(label: string): HTMLButtonElement {
  const b = Array.from(container.querySelectorAll('button')).find((x) => x.textContent?.includes(label))
  if (!b) throw new Error(`no button "${label}" in: ${container.textContent}`)
  return b as HTMLButtonElement
}

const dialogs = () => Array.from(container.querySelectorAll('[role=dialog]')).map((d) => d.getAttribute('aria-label'))

describe('Return windows hold the keyboard', () => {
  it('on the welcome-back ledger, Enter/Space reach the focused button and Escape does not open the Menu', () => {
    returningSave(10, 81)
    act(() => root.render(<App />))
    expect(container.textContent).toContain('While you were away')
    const back = button('Back to the waiting room')
    back.focus()
    expect(key(back, 'Enter').defaultPrevented).toBe(false)
    expect(key(back, ' ').defaultPrevented).toBe(false)
    // Movement keys do not walk the Master behind the window.
    expect(key(window, 'ArrowUp').defaultPrevented).toBe(false)
    key(back, 'Escape')
    expect(container.textContent).not.toContain('While you were away')
    expect(dialogs()).not.toContain('Menu')
  })

  it('on the backup window, Enter reaches its buttons and Escape closes it without opening the Menu', () => {
    // A Master back after a short break: no ledger, no first-visit dialog in the way.
    returningSave(0.5, 82)
    act(() => root.render(<App />))
    expect(dialogs()).toEqual([])
    act(() => {
      window.dispatchEvent(new CustomEvent(BACKUP_EVENT))
    })
    expect(dialogs()).toContain('Back up your save')
    const dl = button('Download save file')
    expect(key(dl, 'Enter').defaultPrevented).toBe(false)
    key(window, 'Escape')
    expect(dialogs()).not.toContain('Back up your save')
    expect(dialogs()).not.toContain('Menu')
  })

  it('on the Game Menu, Escape closes it (the lobby does not reopen it underneath)', () => {
    // A Master back after a short break: no ledger, no first-visit dialog in the way.
    returningSave(0.5, 83)
    act(() => root.render(<App />))
    expect(dialogs()).toEqual([])
    act(() => {
      button('Menu').click()
    })
    expect(dialogs()).toContain('Menu')
    key(window, 'Escape')
    expect(dialogs()).not.toContain('Menu')
  })
})
