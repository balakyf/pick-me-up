// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
import { App } from '../App'
import { getStore } from '../useGame'
import { setPrefs } from '../prefs'
import { revealPlan } from './reveal'
import type { HeroId } from '../../engine/types'

/**
 * Summon Theatre smoke (spec 2026-10-12 S2): the REAL App and engine in jsdom. A fresh
 * Master opens Mobius Summon, takes the free ×10, meets the first heroes one at a time,
 * then skips to the summary grid.
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
  vi.useRealTimers()
})

function buttons(label: string): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('button')).filter((b) => b.textContent?.includes(label))
}

function clickButton(label: string) {
  const btn = buttons(label)[0]
  if (!btn) throw new Error(`no button "${label}" in: ${container.textContent}`)
  act(() => btn.click())
}

function theatre(): HTMLElement | null {
  return container.querySelector('.theatre')
}

function clickTheatre() {
  const el = theatre()
  if (!el) throw new Error('the theatre is not open')
  act(() => el.click())
}

function press(key: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  })
}

function openSummon(seed: number) {
  act(() => root.render(<App />))
  act(() => {
    getStore().dispatch({ type: 'NEW_ACCOUNT', seed, now: 0 })
  })
  clickButton('Menu')
  const item = Array.from(container.querySelectorAll('button.menu-item')).find((b) => b.textContent?.includes('Mobius Summon'))
  if (!item) throw new Error('no Mobius Summon in the menu')
  act(() => (item as HTMLButtonElement).click())
}

describe('Summon Theatre smoke', () => {
  it('the free ×10: meet the heroes one by one, then skip to a summary of ten', () => {
    openSummon(4321)
    const before = Object.keys(getStore().getState()!.heroes).length
    clickButton('Summon ×10')
    expect(Object.keys(getStore().getState()!.heroes).length).toBe(before + 10)

    // The ritual: the circle wakes; nothing is revealed yet and there is no Skip.
    expect(theatre()).not.toBeNull()
    expect(theatre()!.classList.contains('is-ritual')).toBe(true)
    expect(theatre()!.classList.contains('tell-0')).toBe(true)
    expect(buttons('Skip').length).toBe(0)

    // Click: the first card is dealt face down…
    clickTheatre()
    expect(container.querySelector('.card-back')).not.toBeNull()
    expect(container.querySelector('.person-card')).toBeNull()
    expect(container.textContent).toContain('1 / 10')
    // …click: it turns to a person, not a stat line.
    clickTheatre()
    const card = container.querySelector('.person-card')!
    expect(card).not.toBeNull()
    expect(card.textContent).toContain('Before the summon:')
    expect(card.textContent).toContain('Loves ')
    expect(card.textContent).toContain('Hobby:')
    expect(card.querySelector('.person-intro')!.textContent!.length).toBeGreaterThan(10)
    // Skip appears after the first card.
    expect(buttons('Skip ▸▸').length).toBe(1)

    // Space and Enter advance too, and never re-fire the ×10 underneath.
    press(' ')
    expect(container.textContent).toContain('2 / 10')
    press('Enter')
    expect(container.querySelector('.person-card')).not.toBeNull()
    expect(Object.keys(getStore().getState()!.heroes).length).toBe(before + 10)

    // Skip ▸▸ jumps to the summary grid with all ten.
    clickButton('Skip ▸▸')
    expect(theatre()).toBeNull()
    const grid = container.querySelector('.reveal.reveal-many')!
    expect(grid).not.toBeNull()
    expect(grid.querySelectorAll('.card')).toHaveLength(10)
    // The summon screen is still whole: its buttons and texts are back.
    expect(buttons('Summon ×10').length).toBeGreaterThan(0)
  })

  it('walking every card ends on the summary, best first; the best 3★ arrives knowing a skill', () => {
    openSummon(77)
    clickButton('Summon ×10')
    clickTheatre() // end the ritual
    let guard = 0
    let last = ''
    while (theatre() && guard++ < 40) {
      const face = container.querySelector('.person-card')
      if (face) last = face.textContent ?? ''
      clickTheatre()
    }
    expect(theatre()).toBeNull()
    // The last person met was the best: a 3★ with "Arrives knowing" and a skill.
    expect(last).toContain('Arrives knowing')
    const cards = container.querySelectorAll('.reveal.reveal-many .card')
    expect(cards).toHaveLength(10)
    expect(cards[0]!.querySelectorAll('.skill-chip').length).toBeGreaterThanOrEqual(1)
  })

  it('runs on its own: the ritual climbs, each back holds, then waits on the face', () => {
    vi.useFakeTimers()
    openSummon(9)
    const prev = new Set(Object.keys(getStore().getState()!.heroes))
    clickButton('Summon ×10')
    const st = getStore().getState()!
    const plan = revealPlan(
      Object.keys(st.heroes)
        .filter((id) => !prev.has(id))
        .map((id) => st.heroes[id as HeroId]!),
      st.meta.masterLevel,
    )
    expect(theatre()!.classList.contains('is-ritual')).toBe(true)
    // Step the clock in small ticks (so each state change's effects run, as in a browser)
    // and record what the theatre shows.
    const seen: string[] = []
    let backAt = -1
    let faceAt = -1
    for (let ms = 0; ms <= plan.ritualMs + 2000; ms += 50) {
      const th = theatre()!
      const tell = ['tell-0', 'tell-1', 'tell-2', 'tell-3'].find((c) => th.classList.contains(c))!
      if (th.classList.contains('is-ritual') && seen[seen.length - 1] !== tell) seen.push(tell)
      if (backAt < 0 && container.querySelector('.card-back')) backAt = ms
      if (faceAt < 0 && container.querySelector('.person-card')) faceAt = ms
      act(() => {
        vi.advanceTimersByTime(50)
      })
    }
    // The circle opened white and climbed one tier at a time to its peak, never down.
    expect(seen).toEqual(plan.ritualTells.map((k) => `tell-${k}`))
    // The ritual ended on its own and dealt the first card face down…
    expect(backAt).toBeGreaterThanOrEqual(plan.ritualMs)
    expect(backAt).toBeLessThanOrEqual(plan.ritualMs + 100)
    // …which turned after its own hold.
    expect(faceAt - backAt).toBeGreaterThanOrEqual(plan.cards[0]!.holdMs - 50)
    expect(faceAt - backAt).toBeLessThanOrEqual(plan.cards[0]!.holdMs + 100)
    expect(theatre()!.classList.contains('is-cards')).toBe(true)
    // It waits for the player: no amount of time deals the next card.
    act(() => {
      vi.advanceTimersByTime(20_000)
    })
    expect(container.textContent).toContain('1 / 10')
    expect(container.querySelector('.person-card')).not.toBeNull()
    press('Escape')
    expect(theatre()).toBeNull()
  })

  it('honours the game’s own reduced-motion preference', () => {
    setPrefs({ reducedMotion: true })
    try {
      openSummon(12)
      clickButton('Summon ×10')
      expect(theatre()!.classList.contains('reduced')).toBe(true)
      // Turning it off mid-theatre takes effect at once.
      act(() => {
        setPrefs({ reducedMotion: false })
      })
      expect(theatre()!.classList.contains('reduced')).toBe(false)
    } finally {
      window.localStorage.removeItem('pmu.prefs')
    }
  })

  it('a single pull is the short version: one card, no Skip, then the card with stats', () => {
    openSummon(5)
    clickButton('Summon · 3,000 Gold')
    expect(theatre()).not.toBeNull()
    clickTheatre() // ritual → card
    clickTheatre() // turn it
    expect(container.querySelector('.person-card')).not.toBeNull()
    expect(buttons('Skip').length).toBe(0)
    expect(container.querySelector('.theatre-deck')).toBeNull()
    clickTheatre() // done
    expect(theatre()).toBeNull()
    expect(container.querySelectorAll('.reveal .card')).toHaveLength(1)
    expect(container.querySelector('.reveal .statgrid')).not.toBeNull()
  })
})
