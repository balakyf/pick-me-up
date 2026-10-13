// @vitest-environment jsdom
/**
 * WP7 smoke (spec 2026-10-12 S3/S4): the real App against the real engine, in jsdom.
 * The progressive Menu, locked previews, the unlock fanfare, the goal tracker in the
 * lobby and the scene bar, the Backup hook, and a broken save at boot.
 *
 * The FIRST test must stay first: it boots the store singleton on a broken save.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
import { App, continuableSave } from '../App'
import { getStore, BROKEN_SAVE_KEY } from '../useGame'
import { createAccount } from '../../engine/account'
import { toWorldTime } from '../../engine/time'
import { setLocale } from '../i18n/i18n'
import type { GameState } from '../../engine/types'
import { PLACE_LABEL, type PlaceId } from '../world/lobbyMap'
import { t } from '../i18n/i18n'

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

const buttons = () => Array.from(container.querySelectorAll('button'))
function clickButton(label: string) {
  const btn = buttons().find((b) => b.textContent?.includes(label))
  if (!btn) throw new Error(`no button "${label}" in: ${container.textContent}`)
  act(() => {
    btn.click()
  })
}
function mount() {
  act(() => {
    root.render(<App />)
  })
}
/** Write a save and load it (as a returning player's boot would). */
function loadSave(s: GameState) {
  window.localStorage.setItem('pmu.save.v1', JSON.stringify({ schemaVersion: s.schemaVersion, savedAt: 0, state: s }))
  act(() => {
    getStore().load()
  })
}
/** A Master past the welcome, with Isel's letter just read (no window in the way). */
function greeted(seed: number, patch: (s: GameState) => GameState = (s) => s): GameState {
  const s = createAccount(seed, { now: 0 })
  return patch({ ...s, life: { ...s.life, letterReadAt: toWorldTime(Date.now()) + 1e12, guide: { ...s.life.guide, done: ['welcome'] } } })
}

describe('boot', () => {
  it('a save that cannot load leaves a working title screen with no dead Continue', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      window.localStorage.setItem('pmu.save.v1', '{not json')
      mount() // first getStore(): load throws, the raw save is set aside
      expect(window.localStorage.getItem(BROKEN_SAVE_KEY)).toBe('{not json')
      expect(container.textContent).toContain('Pick Me Up')
      // The title says why (a copy was kept) and offers a New Game over the unreadable save.
      expect(container.textContent).toContain('This save could not be read. A copy was kept.')
      expect(buttons().filter((b) => b.textContent?.includes('New Game'))).toHaveLength(1)
      expect(buttons().some((b) => b.textContent?.includes('Continue'))).toBe(false)
      expect(continuableSave()).toBe(false)
    } finally {
      err.mockRestore()
    }
  })

  it('continuableSave: no save, a good save, a save that differs from the broken copy', () => {
    expect(continuableSave()).toBe(false)
    window.localStorage.setItem('pmu.save.v1', 'a')
    expect(continuableSave()).toBe(true)
    window.localStorage.setItem(BROKEN_SAVE_KEY, 'a')
    expect(continuableSave()).toBe(false)
    window.localStorage.setItem('pmu.save.v1', 'b') // a new game since
    expect(continuableSave()).toBe(true)
  })
})

describe('the progressive Menu', () => {
  it('every menu item names its own place and no other (smoke tests find places by text)', () => {
    for (const locale of ['en', 'fr'] as const) {
      for (const cleared of [0, 1, 4, 9, 30]) {
        setLocale(locale)
        loadSave(greeted(520 + cleared, (s) => ({ ...s, tower: { ...s.tower, currentFloor: cleared + 1, highestCleared: cleared } })))
        mount()
        clickButton('Menu') // "Menu" in both languages
        const items = Array.from(container.querySelectorAll('button.menu-item'))
        expect(items.length, `${locale} F${cleared}`).toBe(24)
        const labels = Object.entries(PLACE_LABEL).map(([p, l]) => [p, t(l)] as [PlaceId, string])
        for (const item of items) {
          const own = labels.filter(([, l]) => item.textContent!.includes(l))
          // Its own label is the longest match; any other match must be part of it.
          const longest = own.reduce((a, b) => (b[1].length > a[1].length ? b : a))
          for (const [, l] of own) expect(longest[1].includes(l), `${locale} F${cleared}: "${item.textContent}" also names ${l}`).toBe(true)
        }
        act(() => root.unmount())
        root = createRoot(container)
      }
    }
    setLocale('en')
  })

  it('a fresh account sees 4 "Now" doors, the Kitchen next with its progress, the rest later', () => {
    mount()
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 501, now: 0 })
    })
    clickButton('Menu')
    const now = container.querySelectorAll('.menu-group-now button.menu-item')
    expect(now.length).toBe(4)
    expect(Array.from(now).map((b) => b.textContent)).toEqual([
      expect.stringContaining('Tower Gate'),
      expect.stringContaining('Mobius Summon'),
      expect.stringContaining('Party'),
      expect.stringContaining('Roster'),
    ])
    const next = container.querySelector('.menu-group-next button.menu-item')!
    expect(next.textContent).toContain('Kitchen')
    expect(next.textContent).toContain('Clear Floor 1')
    expect(next.textContent).toContain('0/1')
    expect(container.querySelector('.menu-next-also')?.textContent).toBe('Also: Memorial, Daily Dungeon')
    const later = container.querySelectorAll('.menu-group-later button.menu-item.locked')
    expect(later.length).toBe(19)
    // Nothing is hidden: all 24 places are still menu items.
    expect(container.querySelectorAll('button.menu-item').length).toBe(24)
  })

  it('a locked place still opens, as a preview with what opens it', () => {
    mount()
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 502, now: 0 })
    })
    clickButton('Menu')
    const lib = Array.from(container.querySelectorAll('button.menu-item')).find((b) => b.textContent?.includes('Library'))!
    act(() => {
      ;(lib as HTMLButtonElement).click()
    })
    const ribbon = container.querySelector('.place-preview')
    expect(ribbon?.textContent).toContain('Preview · Clear Floor 10 (0/10)')
    expect(container.textContent).toContain('Shelves of books') // the real panel underneath
  })

  it('an open place has no preview ribbon; the Campus group lists it', () => {
    mount()
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 503, now: 0 })
    })
    loadSave(greeted(503, (s) => ({ ...s, tower: { ...s.tower, currentFloor: 3, highestCleared: 2 }, life: { ...s.life, unlocks: ['daily', 'dormitory', 'kitchen', 'memorial', 'tacticalCenter', 'tavern'] } })))
    clickButton('Menu')
    const campus = Array.from(container.querySelectorAll('.menu-group-campus button.menu-item')).map((b) => b.textContent)
    expect(campus.length).toBe(6)
    expect(container.querySelector('.menu-group-next')?.textContent).toContain('Training Center')
    const kitchen = Array.from(container.querySelectorAll('button.menu-item')).find((b) => b.textContent?.includes('Kitchen'))!
    act(() => {
      ;(kitchen as HTMLButtonElement).click()
    })
    expect(container.textContent).toContain('Banquet')
    expect(container.querySelector('.place-preview')).toBeNull()
  })

  it('"Backup…" closes the Menu and asks the return layer for the save backup', () => {
    mount()
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 504, now: 0 })
    })
    const heard = vi.fn()
    window.addEventListener('pmu:backup', heard)
    try {
      clickButton('Menu')
      clickButton('Backup…')
      expect(heard).toHaveBeenCalledTimes(1)
      expect(container.querySelector('.menu-groups')).toBeNull()
    } finally {
      window.removeEventListener('pmu:backup', heard)
    }
  })

  it('the Menu groups read in French', () => {
    mount()
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 505, now: 0 })
    })
    try {
      act(() => setLocale('fr'))
      clickButton('Menu')
      const titles = Array.from(container.querySelectorAll('.menu-group-title')).map((h) => h.textContent)
      expect(titles).toEqual(['Maintenant', 'Prochaine ouverture', 'Plus tard'])
      expect(container.querySelector('.menu-group-next')?.textContent).toContain('Franchissez l’étage 1')
    } finally {
      act(() => setLocale('en'))
    }
  })
})

describe('the unlock fanfare', () => {
  it('never plays for a fresh account', () => {
    mount()
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 506, now: 0 })
    })
    expect(container.querySelector('.unlock-card')).toBeNull()
    expect(getStore().getState()!.life.unlocks).toEqual([])
  })

  it('clearing Floor 1 plays the Kitchen fanfare once (with the Memorial and Daily Dungeon), then never again', () => {
    loadSave(greeted(7))
    mount()
    expect(container.querySelector('.unlock-card')).toBeNull()
    act(() => {
      getStore().dispatch({ type: 'ATTEMPT_FLOOR' })
    })
    expect(getStore().getState()!.tower.highestCleared).toBe(1)
    const card = container.querySelector('.unlock-card')!
    expect(card).not.toBeNull()
    expect(card.textContent).toContain('New facility!')
    expect(container.querySelector('.unlock-name')!.textContent).toContain('Kitchen')
    expect(card.textContent).toContain('Also open:')
    expect(card.textContent).toContain('Memorial')
    expect(card.textContent).toContain('Daily Dungeon')
    // Recorded as seen the moment it plays.
    expect(getStore().getState()!.life.unlocks).toEqual(['daily', 'kitchen', 'memorial'])
    clickButton('Later')
    expect(container.querySelector('.unlock-card')).toBeNull()
    act(() => {
      getStore().dispatch({ type: 'TICK' }, 5_000)
    })
    expect(container.querySelector('.unlock-card')).toBeNull()
  })

  it('the first death opens the Memorial quietly: no "New facility!", no confetti', () => {
    loadSave(greeted(8, (s) => ({ ...s, life: { ...s.life, memorial: [{ ...({} as GameState['life']['memorial'][number]), heroId: s.party.slots[0]!, name: 'Ada Lin' }] } })))
    mount()
    const card = container.querySelector('.unlock-card')!
    expect(card.textContent).toContain('A place to remember')
    expect(card.textContent).not.toContain('New facility!')
    expect(container.querySelector('.unlock-rays')).toBeNull()
    expect(container.querySelector('.unlock-name')!.textContent).toContain('Memorial')
  })

  it('"Show me" closes the card and walks the Master over (the Kitchen opens on arrival)', () => {
    loadSave(greeted(7, (s) => ({ ...s, tower: { ...s.tower, currentFloor: 2, highestCleared: 1 } })))
    mount()
    expect(container.querySelector('.unlock-name')!.textContent).toContain('Kitchen')
    clickButton('Show me')
    expect(container.querySelector('.unlock-card')).toBeNull()
    // No canvas loop in jsdom, so the walk never arrives; nothing else opened either.
    expect(container.querySelector('.pwin')).toBeNull()
  })

  it('waits while a window is open, then plays', () => {
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 507, now: 0 })
    })
    mount() // the lobby meets a fresh Master: Isel's greeting opens
    // The fresh greeting is on screen: a cleared floor must not stack a card on top of it.
    expect(container.querySelector('.dialog')).not.toBeNull()
    const s = getStore().getState()!
    loadSave({ ...s, tower: { ...s.tower, currentFloor: 2, highestCleared: 1 } })
    expect(container.querySelector('.unlock-card')).toBeNull()
    // Close the greeting (click through its lines).
    for (let i = 0; i < 12 && container.querySelector('.dialog'); i++) {
      act(() => {
        ;(container.querySelector('.dialog') as HTMLElement).click()
      })
    }
    expect(container.querySelector('.dialog')).toBeNull()
    expect(container.querySelector('.unlock-name')!.textContent).toContain('Kitchen')
  })
})

describe('the goal tracker', () => {
  it('answers "what next?" in the lobby: the first step, the Kitchen, Act I, then Summon now!', () => {
    mount()
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 508, now: 0 })
    })
    const hud = container.querySelector('.hud-goals')!
    expect(hud).not.toBeNull()
    expect(hud.textContent).toContain('Take your first summon')
    expect(hud.textContent).not.toContain('Summon now!') // the first summon is free
    expect(hud.textContent).toContain('Kitchen opens at Floor 1')
    expect(hud.textContent).toContain('Also: Memorial, Daily Dungeon')
    expect(hud.textContent).toContain('Act I — The Prairie')
    // The first steps fold in.
    clickButton('First steps')
    expect(hud.textContent).toContain('Set a party of five')
    // Once the free pull is taken, the gold still in hand lights the call to action.
    act(() => {
      getStore().dispatch({ type: 'SUMMON', count: 10 })
    })
    expect(container.querySelector('.hud-goals .goal-cta')?.textContent).toContain('Summon now!')
  })

  it('a click on a goal travels there', () => {
    mount()
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 509, now: 0 })
    })
    const short = container.querySelector('.hud-goals button.goal-short') as HTMLButtonElement
    act(() => {
      short.click()
    })
    expect(container.querySelector('.scene-title')?.textContent).toBe('Mobius Summon')
  })

  it('rides in the scene bar after the Menu button, skips the scene it is in, and never says "Enter"', () => {
    mount()
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 510, now: 0 })
    })
    loadSave(greeted(510, (s) => ({ ...s, tower: { ...s.tower, currentFloor: 4, highestCleared: 3 }, life: { ...s.life, guide: { ...s.life.guide, tutorialPull: true, done: ['dismissed', 'welcome'] }, unlocks: ['daily', 'dormitory', 'garden', 'kitchen', 'memorial', 'tacticalCenter', 'tavern', 'trainingCenter'] } })))
    clickButton('Menu')
    clickButton('Tower Gate')
    const bar = container.querySelector('.scene-bar .goals-bar')!
    expect(bar).not.toBeNull()
    const chips = Array.from(bar.querySelectorAll('button')).map((b) => b.textContent ?? '')
    expect(chips[0]).toContain('Summon now!')
    expect(chips.some((c) => c.includes('Floor 4'))).toBe(false) // that is this very scene
    for (const c of chips) expect(c).not.toContain('Enter')
    // DOM order: the scene's Menu button comes first.
    const all = buttons()
    expect(all.findIndex((b) => b.textContent?.includes('Menu'))).toBeLessThan(all.findIndex((b) => b.classList.contains('goal-chip')))
    const s0 = getStore().getState()
    act(() => {
      ;(bar.querySelector('button') as HTMLButtonElement).click()
    })
    expect(container.querySelector('.scene-title')?.textContent).toBe('Mobius Summon')
    expect(getStore().getState()).toBe(s0) // travelling never dispatches
  })
})
