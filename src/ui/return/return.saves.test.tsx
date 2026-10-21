// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
import { App } from '../App'
import { getStore } from '../useGame'
import { createAccount, DEFAULT_SAVE_KEY, saveState } from '../../engine/account'
import type { GameState } from '../../engine/types'
import { BACKUP_EVENT } from './ReturnLayer'
import { BEFORE_IMPORT_KEY, encodeSaveCode } from './saveTransfer'

/**
 * The backup window on the REAL App (review #14, #16): a save that loads but cannot run is
 * refused before anything is written, and the save an import replaced can be brought back
 * from the window — even after a second import in a row.
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

function clickButton(label: string) {
  const btn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(label))
  if (!btn) throw new Error(`no button "${label}" in: ${container.textContent}`)
  act(() => btn.click())
}

function paste(text: string) {
  const box = container.querySelectorAll('textarea.backup-code')[1] as HTMLTextAreaElement
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(box, text)
    box.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** A Master seen a moment ago (no ledger, no first-visit dialog). */
function bootWith(s: GameState) {
  window.localStorage.setItem(DEFAULT_SAVE_KEY, saveState({ ...s, life: { ...s.life, guide: { ...s.life.guide, done: ['welcome'] } } }))
  act(() => {
    getStore().load()
  })
  act(() => root.render(<App />))
  act(() => {
    window.dispatchEvent(new CustomEvent(BACKUP_EVENT))
  })
}

const code = (seed: number, gold: number) => encodeSaveCode(saveState({ ...createAccount(seed, { now: Date.now() - 60_000 }), gold }))

describe('Backup window — the import is run before it is written', () => {
  it('a save missing its life block is refused at the check, and the save on disk is untouched', () => {
    bootWith({ ...createAccount(91, { now: Date.now() - 60_000 }), gold: 1234 })
    const onDisk = window.localStorage.getItem(DEFAULT_SAVE_KEY)
    const broken = JSON.parse(saveState(createAccount(92, { now: Date.now() - 60_000 }))) as { state: Record<string, unknown> }
    delete broken.state.life
    paste(encodeSaveCode(JSON.stringify(broken)))
    clickButton('Check this save')
    expect(container.textContent).toContain('That save is damaged and cannot be played')
    expect(container.textContent).not.toContain('Replace my save')
    expect(window.localStorage.getItem(DEFAULT_SAVE_KEY)).toBe(onDisk)
    expect(getStore().getState()!.gold).toBe(1234)
  })
})

describe('Backup window — bringing back the save an import replaced', () => {
  it('two imports in a row, then "Bring that save back" restores the Master’s own save', () => {
    bootWith({ ...createAccount(93, { now: Date.now() - 60_000 }), gold: 1111 })
    const ownSeed = getStore().getState()!.seed
    expect(container.textContent).not.toContain('Bring that save back')

    paste(code(94, 2222))
    clickButton('Check this save')
    clickButton('Replace my save')
    expect(getStore().getState()!.gold).toBe(2222)
    // The Master tries a newer code of the same account.
    paste(code(94, 3333))
    clickButton('Check this save')
    clickButton('Replace my save')
    expect(getStore().getState()!.gold).toBe(3333)

    expect(container.textContent).toContain('Kept from before your last import: Master Lv 1')
    clickButton('Bring that save back')
    expect(getStore().getState()!.seed).toBe(ownSeed)
    expect(getStore().getState()!.gold).toBe(1111)
    expect(container.textContent).toContain('Your save from before the import is back')
    // The undone import now waits in its place, so the undo can be undone.
    expect(window.localStorage.getItem(BEFORE_IMPORT_KEY)).toContain('"gold":3333')
  })
})
