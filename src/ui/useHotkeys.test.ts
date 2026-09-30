// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { hotkeyFor, hotkeysBlocked } from './useHotkeys'

afterEach(() => {
  document.body.innerHTML = ''
})

function key(k: string, init: KeyboardEventInit = {}, target?: HTMLElement): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })
  if (target) Object.defineProperty(e, 'target', { value: target })
  return e
}

describe('hotkeyFor', () => {
  it('maps the scene letters from anywhere, case-insensitively', () => {
    expect(hotkeyFor('t', 'lobby')).toEqual({ kind: 'go', view: 'tower' })
    expect(hotkeyFor('P', 'tower')).toEqual({ kind: 'go', view: 'party' })
    expect(hotkeyFor('r', 'summon')).toEqual({ kind: 'go', view: 'roster' })
    expect(hotkeyFor('u', 'lobby')).toEqual({ kind: 'go', view: 'summon' })
    expect(hotkeyFor('g', 'party')).toEqual({ kind: 'go', view: 'summon' })
    expect(hotkeyFor('?', 'lobby')).toEqual({ kind: 'help' })
  })

  it('does nothing for the scene already open', () => {
    expect(hotkeyFor('t', 'tower')).toBeNull()
  })

  it('back and menu only in scenes — the lobby keeps its own M / Esc', () => {
    expect(hotkeyFor('l', 'party')).toEqual({ kind: 'back' })
    expect(hotkeyFor('Backspace', 'tower')).toEqual({ kind: 'back' })
    expect(hotkeyFor('m', 'roster')).toEqual({ kind: 'menu' })
    expect(hotkeyFor('Escape', 'summon')).toEqual({ kind: 'menu' })
    expect(hotkeyFor('l', 'lobby')).toBeNull()
    expect(hotkeyFor('m', 'lobby')).toBeNull()
    expect(hotkeyFor('Escape', 'lobby')).toBeNull()
  })

  it('never claims the lobby’s movement / interact / tracker / map keys', () => {
    for (const k of ['w', 'a', 's', 'd', 'z', 'q', 'e', 'h', 'n', ' ', 'Enter', 'ArrowUp', 'ArrowLeft', '1', '5']) {
      expect(hotkeyFor(k, 'lobby')).toBeNull()
    }
  })
})

describe('hotkeysBlocked', () => {
  it('lets a plain key through when nothing owns the keyboard', () => {
    expect(hotkeysBlocked(key('t'))).toBe(false)
  })

  it('stands aside for typing, modifiers, repeats and handled events', () => {
    const input = document.createElement('input')
    expect(hotkeysBlocked(key('t', {}, input))).toBe(true)
    expect(hotkeysBlocked(key('t', {}, document.createElement('textarea')))).toBe(true)
    expect(hotkeysBlocked(key('t', { ctrlKey: true }))).toBe(true)
    expect(hotkeysBlocked(key('t', { repeat: true }))).toBe(true)
    const handled = key('Backspace')
    handled.preventDefault()
    expect(hotkeysBlocked(handled)).toBe(true)
  })

  it('stands aside while a window, dialogue, battle or overlay is up', () => {
    for (const cls of ['pwin-backdrop', 'dialog', 'battle', 'overlay', 'ritual']) {
      const el = document.createElement('div')
      el.className = cls
      document.body.appendChild(el)
      expect(hotkeysBlocked(key('t'))).toBe(true)
      el.remove()
    }
    expect(hotkeysBlocked(key('t'))).toBe(false)
  })
})
