// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { focusables, isTopmost, restoreFocus, trapTab } from './focusTrap'
import { DialogBox, PixelWindow } from './kit'
import { SettingsWindow } from './qol/Settings'
import { getSettings, reloadSettingsForTests, updateSettings } from './qol/settings'
import { uiCueFor } from './audio/uiSfx'
import { getLocale, setLocale } from './i18n/i18n'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  window.localStorage.clear()
  reloadSettingsForTests()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.innerHTML = ''
  setLocale('en')
})

const tab = (shift = false) => {
  const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: shift, bubbles: true, cancelable: true })
  act(() => {
    window.dispatchEvent(e)
  })
  return e
}

describe('focus trap helpers', () => {
  it('lists what Tab can reach, skipping disabled, hidden and tabindex=-1', () => {
    document.body.innerHTML = `<div id="w"><button id="a">a</button><button disabled>x</button><div hidden><button>h</button></div>
      <input id="b"><span tabindex="-1">s</span><a href="#" id="c">c</a></div>`
    expect(focusables(document.getElementById('w')!).map((e) => e.id)).toEqual(['a', 'b', 'c'])
  })

  it('a radio group is one tab stop: its checked radio, or its first', () => {
    document.body.innerHTML = `<div id="w"><button id="a">a</button>
      <input type="radio" name="g" id="r1"><input type="radio" name="g" id="r2" checked><input type="radio" name="g" id="r3">
      <input type="radio" name="h" id="s1"><input type="radio" name="h" id="s2"></div>`
    expect(focusables(document.getElementById('w')!).map((e) => e.id)).toEqual(['a', 'r2', 's1'])
  })

  it('wraps forward and backward, and pulls stray focus back in', () => {
    document.body.innerHTML = `<button id="out">out</button><div id="w" tabindex="-1"><button id="a">a</button><button id="b">b</button></div>`
    const w = document.getElementById('w')!
    const key = (shiftKey: boolean) => ({ key: 'Tab', shiftKey, preventDefault() {} })
    document.getElementById('b')!.focus()
    expect(trapTab(key(false), w)).toBe(true)
    expect(document.activeElement?.id).toBe('a')
    expect(trapTab(key(true), w)).toBe(true)
    expect(document.activeElement?.id).toBe('b')
    // In the middle, the browser's own Tab is left alone.
    document.getElementById('a')!.focus()
    expect(trapTab(key(false), w)).toBe(false)
    document.getElementById('out')!.focus()
    expect(trapTab(key(false), w)).toBe(true)
    expect(document.activeElement?.id).toBe('a')
    expect(trapTab({ key: 'a', shiftKey: false, preventDefault() {} }, w)).toBe(false)
  })

  it('the topmost window and focus restore', () => {
    document.body.innerHTML = `<div class="pwin-backdrop" id="one"></div><div class="pwin-backdrop" id="two"></div><button id="opener">o</button>`
    expect(isTopmost(document.getElementById('two'))).toBe(true)
    expect(isTopmost(document.getElementById('one'))).toBe(false)
    const opener = document.getElementById('opener')!
    restoreFocus(opener)
    expect(document.activeElement).toBe(opener)
    restoreFocus(null)
  })
})

describe('PixelWindow is a real modal', () => {
  function Harness() {
    const [open, setOpen] = useState(false)
    return (
      <>
        <button id="opener" onClick={() => setOpen(true)}>
          open
        </button>
        {open && (
          <PixelWindow title="Test window" onClose={() => setOpen(false)}>
            <button id="first">first</button>
            <button id="last">last</button>
          </PixelWindow>
        )}
      </>
    )
  }

  it('aria-modal, named by its title, takes focus, traps Tab, gives focus back on close', () => {
    act(() => root.render(<Harness />))
    const opener = container.querySelector<HTMLButtonElement>('#opener')!
    opener.focus()
    act(() => opener.click())
    const dlg = container.querySelector('[role="dialog"]')!
    expect(dlg.getAttribute('aria-modal')).toBe('true')
    const labelId = dlg.getAttribute('aria-labelledby')!
    expect(document.getElementById(labelId)?.textContent).toBe('Test window')
    expect(document.activeElement).toBe(dlg)
    // Tab from the window itself goes to its first control (the close button), and wraps.
    let e = tab()
    expect(e.defaultPrevented).toBe(true)
    const all = focusables(dlg as HTMLElement)
    expect(all.map((b) => b.id || b.className)).toEqual(['pwin-close', 'first', 'last'])
    expect(document.activeElement).toBe(all[0])
    all[2]!.focus()
    e = tab()
    expect(document.activeElement).toBe(all[0])
    e = tab(true)
    expect(document.activeElement).toBe(all[2])
    // Escape closes; focus returns to the opener.
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })
})

describe('DialogBox', () => {
  it('a screen reader hears the whole line at once; the typewriter is hidden from it', () => {
    act(() => root.render(<DialogBox script={{ speaker: 'Isel', lines: ['Welcome back, Master.'] }} onDone={() => {}} />))
    const live = container.querySelector('[aria-live="polite"]')!
    expect(live.textContent).toBe('Welcome back, Master.')
    expect(container.querySelector('.dialog-text')!.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelector('.dialog')!.getAttribute('aria-label')).toBe('Isel')
  })

  it('instant text speed shows the whole line at once', () => {
    updateSettings({ textSpeed: 'instant' })
    act(() => root.render(<DialogBox script={{ speaker: 'Isel', lines: ['All of it, now.'] }} onDone={() => {}} />))
    expect(container.querySelector('.dialog-text')!.textContent).toBe('All of it, now.')
  })
})

describe('the Settings window', () => {
  it('shows every setting and applies changes at once', () => {
    act(() => root.render(<SettingsWindow onClose={() => {}} />))
    const text = container.textContent ?? ''
    for (const s of ['Master volume', 'Music', 'Sound effects', 'Reduced motion', 'Screen shake', 'Flashes', 'Interface size', 'Battle speed', 'Text speed', 'Language'])
      expect(text).toContain(s)
    const sliders = container.querySelectorAll<HTMLInputElement>('input[type="range"]')
    expect(sliders).toHaveLength(3)
    // React listens for 'input' on range sliders.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      setter.call(sliders[1], '25')
      sliders[1]!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(getSettings().musicVolume).toBe(25)
    expect(sliders[1]!.getAttribute('aria-valuetext')).toBe('25%')

    const shake = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="switch"]')).find((b) => b.getAttribute('aria-labelledby') && document.getElementById(b.getAttribute('aria-labelledby')!)?.textContent === 'Screen shake')!
    expect(shake.getAttribute('aria-checked')).toBe('true')
    act(() => shake.click())
    expect(getSettings().screenShake).toBe(false)

    const radio = (label: string) => Array.from(container.querySelectorAll<HTMLLabelElement>('.set-opt')).find((l) => l.textContent?.endsWith(label))!.querySelector('input')!
    act(() => radio('4×').click())
    expect(getSettings().battleSpeed).toBe(4)
    act(() => radio('Instant').click())
    expect(getSettings().textSpeed).toBe('instant')
    act(() => radio('130%').click())
    expect(getSettings().uiScale).toBe(1.3)
    act(() => radio('Français').click())
    expect(getLocale()).toBe('fr')
    expect(document.documentElement.lang).toBe('fr')
    // The window is in French now.
    expect(container.textContent).toContain('Paramètres')
    act(() => radio('English').click())
    expect(document.documentElement.lang).toBe('en')

    const reset = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Reset to defaults')!
    act(() => reset.click())
    expect(getSettings().battleSpeed).toBe(1)
    expect(getSettings().screenShake).toBe(true)
  })
})

describe('interface sounds', () => {
  it('a primary action confirms, a close cancels, a switch toggles, a disabled button is silent', () => {
    document.body.innerHTML = `
      <button id="p" class="btn primary"><span id="inner">Go</span></button>
      <button id="x" class="pwin-close">✕</button>
      <button id="s" role="switch">s</button>
      <button id="d" disabled>d</button>
      <button id="n" class="pbtn">n</button>
      <button id="o" class="pbtn" data-sfx="coins">o</button>
      <div id="plain">text</div>`
    const cue = (id: string) => uiCueFor(document.getElementById(id))
    expect(cue('inner')).toBe('confirm')
    expect(cue('x')).toBe('cancel')
    expect(cue('s')).toBe('toggle')
    expect(cue('d')).toBeNull()
    expect(cue('n')).toBe('click')
    expect(cue('o')).toBe('coins')
    expect(cue('plain')).toBeNull()
  })
})
