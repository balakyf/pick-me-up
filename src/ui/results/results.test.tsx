// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createAccount } from '../../engine/account'
import { summonMany } from '../../engine/gacha'
import { attemptFloorWithResult } from '../../engine/store'
import { relationKey } from '../../engine/life'
import type { GameState, HeroId } from '../../engine/types'
import { reloadSettingsForTests, updateSettings } from '../qol/settings'
import { setLocale } from '../i18n/i18n'
import { ResultsScreen } from './ResultsScreen'
import { SceneTransition, resetTransitions } from '../transition/SceneTransition'
import type { Scene } from '../transition/transition'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  window.localStorage.clear()
  reloadSettingsForTests()
  resetTransitions()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  updateSettings({ reducedMotion: 'auto' })
  setLocale('en')
  vi.useRealTimers()
})

function party(floor: number, friendly = false): GameState {
  let s = { ...createAccount(4242, { now: 0 }), gold: 1_000_000 }
  s = summonMany(s, 'normal', 10).state
  const ids = Object.keys(s.heroes) as HeroId[]
  const relations = { ...s.life.relations }
  if (friendly) for (const id of ids.slice(0, 5)) relations[relationKey(id, ids[6]!)] = { affinity: 70, shared: 3 }
  return {
    ...s,
    life: { ...s.life, relations },
    party: { slots: ids.slice(0, 5), lines: ['front', 'front', 'mid', 'back', 'back'] },
    tower: { ...s.tower, currentFloor: floor, highestCleared: floor - 1 },
  }
}

const text = () => container.textContent ?? ''
const q = (sel: string) => container.querySelector(sel)
const press = (key: string) =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })

describe('ResultsScreen', () => {
  it('a clean victory: the banner, the rewards, the battle report with an MVP; Onward leaves at once', () => {
    const r = attemptFloorWithResult(party(1))
    expect(r.result.cleared).toBe(true)
    const onContinue = vi.fn()
    act(() => root.render(<ResultsScreen result={r.result} state={r.state} onContinue={onContinue} />))
    expect(text()).toContain('FLOOR CLEARED')
    expect(text()).toContain('FIRST CLEAR')
    expect(text()).toContain('Battle report')
    expect(q('.rc-mvp')).not.toBeNull()
    expect(q('.overlay.results.grey')).toBeNull()
    expect(q('.rc-memorial')).toBeNull()
    // Mid-ceremony the later beats wait, hidden.
    expect(container.querySelectorAll('.rc-step.waiting').length).toBeGreaterThan(0)
    const onward = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Onward'))!
    act(() => onward.click())
    expect(onContinue).toHaveBeenCalledTimes(1)
  })

  it('Space skips the ceremony to its end; Enter then leaves', () => {
    const r = attemptFloorWithResult(party(1))
    const onContinue = vi.fn()
    act(() => root.render(<ResultsScreen result={r.result} state={r.state} onContinue={onContinue} />))
    press(' ')
    expect(container.querySelectorAll('.rc-step.waiting').length).toBe(0)
    expect(q('.rc-skip')).toBeNull()
    expect(text()).toContain(`+${r.result.goldAwarded.toLocaleString('en-US')}`)
    press('Enter')
    expect(onContinue).toHaveBeenCalledTimes(1)
  })

  it('a loss with deaths becomes a memorial: the world greys, a band per hero with last words, mourners and Isel', () => {
    const r = attemptFloorWithResult(party(24, true))
    expect(r.result.fallenHeroIds.length).toBeGreaterThan(0)
    act(() => root.render(<ResultsScreen result={r.result} state={r.state} onContinue={() => {}} />))
    press('Escape')
    expect(q('.overlay.results.grey')).not.toBeNull()
    expect(container.querySelectorAll('.rc-band').length).toBe(r.result.fallenHeroIds.length)
    expect(text()).toContain('Permanently lost')
    expect(text()).toContain('mourned by')
    expect(q('.rc-isel-close')).not.toBeNull()
    for (const id of r.result.fallenHeroIds) expect(text()).toContain(r.state.heroes[id]!.name)
    // The fallen are marked in the report too.
    expect(container.querySelectorAll('.rc-stat.fell').length).toBe(r.result.fallenHeroIds.length)
  })

  it('reduced motion shows everything at once', () => {
    updateSettings({ reducedMotion: 'on' })
    const r = attemptFloorWithResult(party(1))
    act(() => root.render(<ResultsScreen result={r.result} state={r.state} onContinue={() => {}} />))
    expect(container.querySelectorAll('.rc-step.waiting').length).toBe(0)
    expect(q('.rc-skip')).toBeNull()
  })

  it('in French', () => {
    setLocale('fr')
    const r = attemptFloorWithResult(party(1))
    act(() => root.render(<ResultsScreen result={r.result} state={r.state} onContinue={() => {}} />))
    expect(text()).toContain('Rapport de combat')
    expect(text()).toContain('PREMIÈRE VICTOIRE')
  })
})

describe('SceneTransition', () => {
  function Host({ scene }: { scene: Scene }) {
    return <SceneTransition scene={scene} channel="test" />
  }
  it('nothing on the first scene; a curtain when it changes, gone after it has played', () => {
    vi.useFakeTimers()
    act(() => root.render(<Host scene="lobby" />))
    expect(q('.scene-curtain')).toBeNull()
    act(() => root.render(<Host scene="tower" />))
    const curtain = q('.scene-curtain.wipe')!
    expect(curtain).not.toBeNull()
    expect(curtain.querySelectorAll('.cb').length).toBeGreaterThan(50)
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(q('.scene-curtain')).toBeNull()
    act(() => root.render(<Host scene="battle" />))
    expect(q('.scene-curtain.iris')).not.toBeNull()
  })

  it('reduced motion: a fade, not a wipe', () => {
    updateSettings({ reducedMotion: 'on' })
    act(() => root.render(<Host scene="lobby" />))
    act(() => root.render(<Host scene="summon" />))
    expect(q('.scene-curtain.fade')).not.toBeNull()
    expect(q('.scene-curtain .cb')).toBeNull()
  })
})
