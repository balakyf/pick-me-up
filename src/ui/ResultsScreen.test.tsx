// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createAccount } from '../engine/account'
import { attemptFloorWithResult, createStore } from '../engine/store'
import { ResultsScreen } from './ResultsScreen'
import { ResultsScreen as FromScreens, skillProgressLine } from './screens'
import { skillProgressLine as direct } from './ResultsScreen'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('ResultsScreen (moved out of screens.tsx)', () => {
  it('is still re-exported from screens.tsx', () => {
    expect(FromScreens).toBe(ResultsScreen)
    expect(skillProgressLine).toBe(direct)
  })

  it('renders a cleared floor, with or without a store (the Legacy slot renders nothing yet)', () => {
    const before = createAccount(7) // the lone starter reliably clears F1
    const { state, result } = attemptFloorWithResult(before)
    expect(result.cleared).toBe(true)
    act(() => root.render(<ResultsScreen result={result} state={state} onContinue={() => {}} />))
    const text = container.textContent ?? ''
    expect(text).toContain('FLOOR CLEARED')
    expect(text).toContain('Floor 1')
    expect(container.querySelectorAll('button')).toHaveLength(1)
    const withoutStore = container.innerHTML
    act(() => root.render(<ResultsScreen result={result} state={state} store={createStore()} onContinue={() => {}} />))
    expect(container.innerHTML).toBe(withoutStore)
  })
})
