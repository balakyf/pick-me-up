// @vitest-environment jsdom
/**
 * The lobby goal tracker folds away once onboarding is done (playtest 2026-10-13: at
 * 1280×800 it covered part of the Great Hall), and remembers the player's own choice.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createAccount } from '../../engine/account'
import { reduce } from '../../engine/store'
import type { GameState } from '../../engine/types'
import { COLLAPSE_AFTER_KEY, COLLAPSE_KEY, GoalTracker } from './GoalTracker'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

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

/** The free ten-pull taken: the first steps are still running. */
function onboarding(): GameState {
  return reduce(createAccount(31, { now: 0 }), { type: 'SUMMON', pool: 'normal', count: 10 })
}
function onboarded(s = onboarding()): GameState {
  return { ...s, life: { ...s.life, guide: { ...s.life.guide, done: [...s.life.guide.done, 'dismissed'].sort() } } }
}

const hud = () => container.querySelector('.hud-goals')!
const folded = () => hud().classList.contains('collapsed')
function render(state: GameState) {
  act(() => root.render(<GoalTracker state={state} variant="hud" onGo={() => {}} />))
}
function toggle() {
  act(() => (container.querySelector('.goals-title') as HTMLButtonElement).click())
}

describe('the goal tracker folds after onboarding', () => {
  it('is open during the first steps, and folds to its header and the next goal when they are done', () => {
    // A choice made during onboarding (open) does not keep it open afterwards.
    window.localStorage.setItem(COLLAPSE_KEY, '0')
    const s = onboarding()
    render(s)
    expect(folded()).toBe(false)
    expect(hud().querySelector('.goal-long')).not.toBeNull()
    render(onboarded(s))
    expect(folded()).toBe(true)
    expect(hud().querySelector('.goal-short')).not.toBeNull() // still answers "what next?"
    expect(hud().querySelector('.goal-long')).toBeNull()
    expect(hud().querySelector('.goal-medium')).toBeNull()
  })

  it('a returning Master starts folded', () => {
    render(onboarded())
    expect(folded()).toBe(true)
  })

  it('remembers the player opening it again, across a reload', () => {
    render(onboarded())
    toggle()
    expect(folded()).toBe(false)
    expect(window.localStorage.getItem(COLLAPSE_AFTER_KEY)).toBe('0')
    act(() => root.unmount())
    root = createRoot(container)
    render(onboarded())
    expect(folded()).toBe(false)
    // And folding it again is remembered too.
    toggle()
    expect(window.localStorage.getItem(COLLAPSE_AFTER_KEY)).toBe('1')
    expect(folded()).toBe(true)
  })
})
