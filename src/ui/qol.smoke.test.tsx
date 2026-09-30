// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
import { App } from './App'
import { getStore } from './useGame'
import { createAccount, encodeSaveCode, exportSave } from '../engine/account'

/**
 * Smoke tests for the quality-of-life slice, against the REAL App and engine: the scene
 * hotkeys, the Party Board list (filter, click, suggest, clear, keyboard placement), and
 * save import's error and success paths. Each test unmounts, so window key listeners
 * never leak between tests.
 */

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  window.localStorage.clear()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function mount() {
  act(() => {
    root.render(<App />)
  })
}

/** A fresh account past the free ten-pull (so Isel's welcome dialogue isn't up). */
function newAccount(seed: number) {
  act(() => {
    getStore().dispatch({ type: 'NEW_ACCOUNT', seed, now: 0 })
    getStore().dispatch({ type: 'SUMMON', pool: 'normal', count: 10 })
  })
}

function press(key: string, target: EventTarget = window) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  })
}

function button(label: string): HTMLButtonElement {
  const b = Array.from(container.querySelectorAll('button')).find((x) => x.textContent?.includes(label))
  if (!b) throw new Error(`no button "${label}" in: ${container.textContent}`)
  return b as HTMLButtonElement
}
function click(el: HTMLElement) {
  act(() => {
    el.click()
  })
}

/** Set a React-controlled input/textarea's value the way a user would. */
function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  act(() => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const rows = () => Array.from(container.querySelectorAll('.pb-row[data-hero]')) as HTMLElement[]
const party = () => getStore().getState()!.party.slots

describe('QoL smoke — hotkeys', () => {
  it('T / P / R / U travel between scenes and L comes home; ? lists the keys', () => {
    mount()
    newAccount(501)
    expect(container.querySelector('canvas.world-canvas')).not.toBeNull()
    press('p')
    expect(container.querySelector('.party-board')).not.toBeNull()
    press('r')
    expect(container.textContent).toContain('Hero Registry')
    press('t')
    expect(container.textContent).toContain('The Tower')
    press('u')
    expect(container.textContent).toContain('Mobius Summon')
    press('l')
    expect(container.querySelector('canvas.world-canvas')).not.toBeNull()
    press('?')
    expect(container.textContent).toContain('Keyboard shortcuts')
    expect(container.textContent).toContain('ZQSD')
    // A window is open: scene keys stand aside.
    press('t')
    expect(container.querySelector('canvas.world-canvas')).not.toBeNull()
  })

  it('ignores keys typed into a text field', () => {
    mount()
    newAccount(502)
    press('p')
    const search = container.querySelector('input.pb-search') as HTMLInputElement
    press('t', search)
    expect(container.querySelector('.party-board')).not.toBeNull()
  })
})

describe('QoL smoke — Party Board', () => {
  it('lists every living hero compactly, filters by name, and adds / removes by click', () => {
    mount()
    newAccount(503)
    press('p')
    const n = Object.keys(getStore().getState()!.heroes).length
    expect(rows().length).toBe(n)
    expect(container.textContent).toContain(`${n} living heroes`)
    // No full hero cards in the list view.
    expect(container.querySelector('.pb-list .card')).toBeNull()

    // Search by (part of) a name.
    const target = rows()[3]!
    const name = target.querySelector('.pb-name')!.textContent!
    type(container.querySelector('input.pb-search') as HTMLInputElement, name.slice(0, 5))
    expect(rows().some((r) => r.dataset.hero === target.dataset.hero)).toBe(true)
    expect(rows().length).toBeLessThan(n)
    click(button('Reset filters'))
    expect(rows().length).toBe(n)

    click(button('Clear'))
    expect(party().filter(Boolean)).toEqual([])
    click(rows()[0]!)
    expect(party()[0]).toBe(rows()[0]!.dataset.hero)
    click(rows()[0]!)
    expect(party().filter(Boolean)).toEqual([])
  })

  it('keyboard: a focused hero goes to the slot of the digit pressed', () => {
    mount()
    newAccount(504)
    press('p')
    click(button('Clear'))
    const row = rows()[2]!
    press('4', row)
    expect(party()[3]).toBe(row.dataset.hero)
    // Moving them to slot 1 swaps (slot 4 empties).
    press('1', rows().find((r) => r.dataset.hero === row.dataset.hero)!)
    expect(party()[0]).toBe(row.dataset.hero)
    expect(party()[3]).toBeNull()
  })

  it('suggests a full party and switches to the card grid (remembered)', () => {
    mount()
    newAccount(505)
    press('p')
    click(button('Clear'))
    click(button('Suggest a party'))
    expect(party().filter(Boolean).length).toBe(5)
    expect(container.textContent).toContain('5/5 deployed')
    click(button('Cards'))
    expect(container.querySelectorAll('.pb-cardwrap .card').length).toBe(Object.keys(getStore().getState()!.heroes).length)
    expect(window.localStorage.getItem('pmu.partyBoard')).toContain('cards')
  })
})

describe('QoL smoke — save export / import', () => {
  function openSaveWindow() {
    click(button('Menu'))
    expect(container.textContent).toContain('Last exported: never')
    click(button('Export / import save'))
    expect(container.textContent).toContain('Download save (.json)')
  }

  it('shows a clear error for a bad save and leaves the current one alone', () => {
    mount()
    newAccount(506)
    const before = getStore().getState()
    openSaveWindow()
    const paste = container.querySelector('textarea[aria-label="Paste a save code"]') as HTMLTextAreaElement
    type(paste, 'definitely not a save')
    click(button('Check save'))
    expect(container.querySelector('.qol-err')?.textContent).toContain('isn’t a Pick Me Up! save file or save code')
    type(paste, '{"schemaVersion": 10, "state": ')
    click(button('Check save'))
    expect(container.querySelector('.qol-err')?.textContent).toContain('isn’t valid JSON')
    expect(container.textContent).not.toContain('Replace my save')
    expect(getStore().getState()).toBe(before)
  })

  it('imports a valid save code after an in-page confirmation', () => {
    mount()
    newAccount(507)
    const other = createAccount(99, { accountId: 'friend' })
    openSaveWindow()
    const paste = container.querySelector('textarea[aria-label="Paste a save code"]') as HTMLTextAreaElement
    type(paste, encodeSaveCode(exportSave(other)))
    click(button('Check save'))
    expect(container.textContent).toContain('Found a valid save')
    // Nothing is replaced until the Master confirms.
    expect(getStore().getState()!.accountId).not.toBe('friend')
    click(button('Replace my save'))
    expect(getStore().getState()!.accountId).toBe('friend')
    expect(Object.keys(getStore().getState()!.heroes).length).toBe(1)
    expect(window.localStorage.getItem('pmu.save.v1')).toContain('"friend"')
    expect(container.textContent).toContain('Save imported')
  })
})
