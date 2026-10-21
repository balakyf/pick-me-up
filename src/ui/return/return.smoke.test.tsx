// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
import { App } from '../App'
import { getStore } from '../useGame'
import { createAccount, saveState } from '../../engine/account'
import { toWorldTime } from '../../engine/time'
import { TUNING } from '../../engine/tuning'
import type { GameState, HeroId } from '../../engine/types'
import { BACKUP_EVENT } from './ReturnLayer'
import { BEFORE_IMPORT_KEY, encodeSaveCode } from './saveTransfer'

/**
 * Smoke tests for the reasons to return (spec 2026-10-12 S25-S28): the REAL App on the
 * REAL engine. The welcome-back ledger opens for a Master who has been away, and never
 * for a fresh `now: 0` account.
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

function mount() {
  act(() => {
    root.render(<App />)
  })
}

function clickButton(label: string) {
  const btn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(label))
  if (!btn) throw new Error(`no button "${label}" in: ${container.textContent}`)
  act(() => {
    btn.click()
  })
}

/** A Master who last played `hoursAgo` real hours ago, with a promotion that finished
 *  while they were away. Written as a save and loaded, the way a real boot hydrates. */
function returningSave(hoursAgo: number, seed = 61): GameState {
  const base = createAccount(seed, { now: Date.now() - hoursAgo * HOUR })
  const id = Object.keys(base.heroes)[0] as HeroId
  const s: GameState = {
    ...base,
    heroes: { ...base.heroes, [id]: { ...base.heroes[id]!, promotion: { completesAtWorld: base.meta.lastSeenAtWorld + 1000 } } },
    life: { ...base.life, guide: { ...base.life.guide, done: ['welcome'] } },
  }
  window.localStorage.setItem('pmu.save.v1', saveState(s))
  act(() => {
    getStore().load()
  })
  return s
}

describe('Return smoke — prompts never stack (playtest 2026-10-13)', () => {
  it('the backup nudge waits while the unlock fanfare is up, then shows', () => {
    // Back from a long Sortie: past floor 5, seen just now (no arrival), and a pile of
    // places opened that the Master has not seen yet, so the fanfare plays.
    const base = createAccount(81, { now: Date.now() })
    const s: GameState = {
      ...base,
      tower: { ...base.tower, highestCleared: 7, currentFloor: 8 },
      life: { ...base.life, guide: { ...base.life.guide, done: ['welcome'] }, unlocks: [] },
    }
    window.localStorage.setItem('pmu.save.v1', saveState(s))
    act(() => {
      getStore().load()
    })
    mount()
    expect(container.textContent).toContain('New facility!')
    expect(container.textContent).not.toContain('Browsers sometimes forget')
    clickButton('Later')
    expect(container.textContent).not.toContain('New facility!')
    expect(container.textContent).toContain('Browsers sometimes forget')
  })
})

describe('Return smoke — the welcome-back ledger', () => {
  it('a save last seen 10 real hours ago, with a promotion done, opens "While you were away" at mount', () => {
    const before = returningSave(10)
    mount()
    expect(container.textContent).toContain('While you were away')
    expect(container.textContent).toContain('promotion complete')
    expect(container.textContent).toContain('Pent-up Interference')
    // One arrival TICK ran with the real clock: the world caught up, charges built.
    const st = getStore().getState()!
    expect(st.meta.lastSeenAtWorld).toBeGreaterThan(before.meta.lastSeenAtWorld + toWorldTime(9 * HOUR))
    expect(st.meta.rested.charges).toBe(1)
    // Isel's letter waits (no second window), and the login is NOT claimed for the Master.
    expect(container.textContent).not.toContain('A letter from Isel')
    expect(container.querySelectorAll('.pwin').length).toBe(1)
    expect(st.meta.login.lastDay).toBe(before.meta.login.lastDay)
    // The gift is one tap away: it pays +50 gems and stamps the card.
    const gems = st.gems
    clickButton('Today’s gift')
    expect(getStore().getState()!.gems).toBe(gems + TUNING.shop.loginGems)
    expect(getStore().getState()!.meta.stamps.count).toBe(TUNING.return.stamps.endowed + 1)
    // Closing it leaves the waiting room.
    expect(container.textContent).toContain('thank you for coming by')
    clickButton('Back to the waiting room')
    expect(container.textContent).not.toContain('While you were away')
    // The ledger was the letter: it will not pop up again on the next lobby visit.
    expect(getStore().getState()!.life.letterReadAt).toBe(getStore().getState()!.meta.lastSeenAtWorld)
  })

  it('a new game closes a ledger that belonged to the old save', () => {
    returningSave(10, 72)
    mount()
    expect(container.textContent).toContain('While you were away')
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 73, now: 0 })
    })
    expect(container.textContent).not.toContain('While you were away')
  })

  it('a fresh now:0 account does NOT get a welcome-back window', () => {
    mount()
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 62, now: 0 })
    })
    expect(container.textContent).not.toContain('While you were away')
    expect(container.textContent).toContain('Master Lv 1')
  })

  it('a short absence (under 2 real hours) opens nothing', () => {
    returningSave(1, 63)
    mount()
    expect(container.textContent).not.toContain('While you were away')
  })

  it('30+ days away: the lobby opens grey, then the colour floods back with Isel’s line', () => {
    vi.useFakeTimers({ now: Date.now(), toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    try {
      returningSave(24 * 31, 64)
      mount()
      expect(document.body.classList.contains('greyed')).toBe(true)
      expect(container.textContent).toContain('Re-interference')
      act(() => {
        vi.advanceTimersByTime(1300)
      })
      expect(document.body.classList.contains('greyed')).toBe(false)
      expect(container.textContent).toContain('The towers remembered you')
      expect(getStore().getState()!.meta.deleted).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('Return smoke — StrictMode (the dev build)', () => {
  it('the grey ceremony survives StrictMode’s double mount and still opens the ledger', () => {
    vi.useFakeTimers({ now: Date.now(), toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    try {
      returningSave(24 * 31, 74)
      act(() => {
        root.render(
          <StrictMode>
            <App />
          </StrictMode>,
        )
      })
      expect(document.body.classList.contains('greyed')).toBe(true)
      // Grey at once: the slow colour transition only runs on the way back.
      expect(document.body.classList.contains('reinterfering')).toBe(false)
      act(() => {
        vi.advanceTimersByTime(1300)
      })
      expect(document.body.classList.contains('greyed')).toBe(false)
      expect(document.body.classList.contains('reinterfering')).toBe(true)
      expect(container.textContent).toContain('The towers remembered you')
      expect(container.querySelectorAll('.pwin').length).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('Return smoke — a long-hidden tab', () => {
  it('a tab hidden for hours and shown again opens the ledger once, in the lobby', () => {
    const t0 = Date.UTC(2026, 9, 12, 9)
    vi.useFakeTimers({ now: t0 })
    let isHidden = false
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => isHidden })
    try {
      const base = createAccount(70, { now: t0 })
      const id = Object.keys(base.heroes)[0] as HeroId
      const s: GameState = {
        ...base,
        heroes: { ...base.heroes, [id]: { ...base.heroes[id]!, promotion: { completesAtWorld: toWorldTime(t0 + HOUR) } } },
        life: { ...base.life, guide: { ...base.life.guide, done: ['welcome'] } },
      }
      window.localStorage.setItem('pmu.save.v1', saveState(s))
      act(() => {
        getStore().load()
      })
      mount()
      expect(container.textContent).not.toContain('While you were away')
      isHidden = true
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'))
      })
      // The hidden tab's timers are frozen; three real hours pass.
      vi.setSystemTime(t0 + 3 * HOUR)
      isHidden = false
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'))
      })
      expect(container.textContent).toContain('While you were away')
      expect(container.textContent).toContain('promotion complete')
      expect(container.querySelectorAll('.pwin').length).toBe(1)
      clickButton('Back to the waiting room')
      // Showing the tab again a moment later is not a second arrival.
      isHidden = true
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'))
      })
      isHidden = false
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'))
      })
      expect(container.textContent).not.toContain('While you were away')
    } finally {
      delete (document as { hidden?: boolean }).hidden
      vi.useRealTimers()
      // Leave no stale save behind for the next test's mount.
      window.localStorage.clear()
      act(() => {
        getStore().load()
      })
    }
  })
})

describe('Return smoke — Lights Out and the save', () => {
  it('after a climb, "Rest for now" opens the Lights Out card with the next floor', () => {
    mount()
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 65, now: 0 })
    })
    expect(container.textContent).not.toContain('Rest for now')
    // To the tower and back.
    clickButton('Menu')
    const gate = Array.from(container.querySelectorAll('button.menu-item')).find((b) => b.textContent?.includes('Tower Gate')) as HTMLButtonElement
    act(() => gate.click())
    clickButton('Lobby')
    clickButton('Rest for now')
    expect(container.textContent).toContain('A good place to stop')
    expect(container.textContent).toContain('Next time')
    expect(container.textContent).toContain(`Floor ${getStore().getState()!.tower.currentFloor}`)
    expect(container.textContent).toContain('Within reach')
    clickButton('Good night, Isel')
    expect(container.textContent).not.toContain('A good place to stop')
    // The card is also a good moment to keep a copy of the save.
    clickButton('Rest for now')
    clickButton('Back up your save')
    expect(container.textContent).not.toContain('A good place to stop')
    expect(container.querySelector('textarea.backup-code')).not.toBeNull()
  })

  it('a pasted save code restores the save, and the replaced one is kept aside', () => {
    mount()
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 68, now: 0 })
    })
    const original = getStore().getState()!
    const code = encodeSaveCode(saveState({ ...createAccount(69), gold: 4321 }))
    act(() => {
      window.dispatchEvent(new CustomEvent(BACKUP_EVENT))
    })
    const paste = container.querySelectorAll('textarea.backup-code')[1] as HTMLTextAreaElement
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(paste, code)
      paste.dispatchEvent(new Event('input', { bubbles: true }))
    })
    clickButton('Check this save')
    expect(container.textContent).toContain('Found: Master Lv')
    expect(getStore().getState()).toBe(original)
    clickButton('Replace my save')
    expect(getStore().getState()!.gold).toBe(4321)
    expect(getStore().getState()!.seed).not.toEqual(original.seed)
    expect(window.localStorage.getItem(BEFORE_IMPORT_KEY)).not.toBeNull()
    expect(container.textContent).toContain('Save restored')
  })

  it('the backup code is a snapshot: the clock ticking does not rewrite it under the Master', () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 9, 12, 9) })
    try {
      mount()
      act(() => {
        getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 71, now: 0 })
      })
      act(() => {
        window.dispatchEvent(new CustomEvent(BACKUP_EVENT))
      })
      const box = () => container.querySelector('textarea.backup-code') as HTMLTextAreaElement
      const first = box().value
      const seen = getStore().getState()!.meta.lastSeenAtWorld
      act(() => {
        vi.advanceTimersByTime(3_000)
      })
      expect(getStore().getState()!.meta.lastSeenAtWorld).not.toBe(seen)
      expect(box().value).toBe(first)
    } finally {
      vi.useRealTimers()
    }
  })

  it('the pmu:backup event opens the backup window; a bad code changes nothing', () => {
    mount()
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 66, now: 0 })
    })
    const before = getStore().getState()
    act(() => {
      window.dispatchEvent(new CustomEvent(BACKUP_EVENT))
    })
    expect(container.textContent).toContain('Back up your save')
    const code = (container.querySelector('textarea.backup-code') as HTMLTextAreaElement).value
    expect(code.startsWith('PMU1:')).toBe(true)
    const paste = container.querySelectorAll('textarea.backup-code')[1] as HTMLTextAreaElement
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(paste, 'not a save')
      paste.dispatchEvent(new Event('input', { bubbles: true }))
    })
    clickButton('Check this save')
    expect(container.textContent).toMatch(/does not look like a save code|could not be read/)
    expect(getStore().getState()).toBe(before)
  })
})

describe('Return smoke — the honest tab title', () => {
  it('while hidden, the title says a chosen timer is done — only once it really is', () => {
    const t0 = Date.UTC(2026, 9, 12, 20)
    vi.useFakeTimers({ now: t0 })
    let isHidden = false
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => isHidden })
    try {
      const base = createAccount(67, { now: t0 })
      const id = Object.keys(base.heroes)[0] as HeroId
      const s: GameState = {
        ...base,
        heroes: { ...base.heroes, [id]: { ...base.heroes[id]!, training: { skillId: 'power_strike', mode: 'refine', completesAtWorld: toWorldTime(t0 + 40_000) } } },
        life: { ...base.life, guide: { ...base.life.guide, done: ['welcome'] } },
      }
      window.localStorage.setItem('pmu.save.v1', saveState(s))
      act(() => {
        getStore().load()
      })
      document.title = 'Pick Me Up! — Infinite Gacha'
      mount()
      isHidden = true
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'))
      })
      act(() => {
        vi.advanceTimersByTime(20_000)
      })
      expect(document.title).toBe('Pick Me Up! — Infinite Gacha')
      act(() => {
        vi.advanceTimersByTime(30_000)
      })
      expect(document.title).toBe('Pick Me Up! · ✓ Training done')
      isHidden = false
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'))
      })
      expect(document.title).toBe('Pick Me Up! — Infinite Gacha')
    } finally {
      // Drop the own-property override; the prototype's getter shows through again.
      delete (document as { hidden?: boolean }).hidden
      vi.useRealTimers()
    }
  })
})
