// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createAccount, DEFAULT_SAVE_KEY, MemoryStorage, saveState } from '../../engine/account'
import { attemptFloorWithResult, createStore, reduce, type Store } from '../../engine/store'
import { suggestParty } from '../../engine/scout'
import type { GameState } from '../../engine/types'
import { PREFS_KEY } from '../prefs'
import { decisiveTutorialDue, DECISIVE_TUTORIAL_STEP } from '../battle/decisive'
import { setLocale } from '../i18n/i18n'
import { FR } from '../i18n/fr'

const fragments: string[] = []
for (const [en, fr] of Object.entries(FR)) {
  if (fr === en) continue
  for (const part of en.split(/\{\w+\}/)) {
    const p = part.trim()
    if (p.length >= 12 && /\s/.test(p) && /[a-z]{3}/.test(p) && !fr.includes(p)) fragments.push(p)
  }
}
function audit(text: string): string[] {
  const hits = new Set<string>()
  for (const f of fragments) if (text.includes(f)) hits.add(f)
  for (const m of text.match(/\{[a-zA-Z]\w*\}|undefined|NaN|\[object|\bnem_\w+|\bh_\d{6}\b/g) ?? []) hits.add(`RAW:${m}`)
  for (const m of text.match(/\b(the|your|waits|while|you|and|with|from|Your|The|falls|Saved)\b [a-zA-Z]+/g) ?? []) hits.add(`EN?:${m}`)
  return [...hits]
}

/**
 * TowerScreen and BattleScene together (towerScreen.test.tsx stands BattleScene in): a real
 * deadly tower fight pauses for the scripted Decisive Moment with Isel's coaching, the party
 * strikes in pose sprites, Protect re-resolves the fight through `store.revise`, and the
 * tutorial is marked seen once the battle closes — in English and in French. Sprites are
 * stubbed so each frame's pose is readable in jsdom (no canvas).
 */
vi.mock('../pixel/sprites', async (orig) => {
  const real = await orig<typeof import('../pixel/sprites')>()
  return {
    ...real,
    heroPoseUrl: (h: { id: string }, pose: string) => `hero:${h.id}:${pose}`,
    heroBlinkUrl: (h: { id: string }) => `blink:${h.id}`,
    enemyPoseUrl: (name: string, _el: string, pose: string) => `enemy:${name}:${pose}`,
    allyPoseUrl: (name: string, pose: string) => `ally:${name}:${pose}`,
  }
})
const { TowerScreen } = await import('../TowerScreen')

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  localStorage.setItem(PREFS_KEY, JSON.stringify({ battleSpeed: 4 }))
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  act(() => {
    vi.runOnlyPendingTimers()
  })
  container.remove()
  vi.useRealTimers()
})

function Harness({ store }: { store: Store }) {
  const [, bump] = useState(0)
  useEffect(() => store.subscribe(() => bump((n) => n + 1)), [store])
  return <TowerScreen state={store.getState()!} store={store} />
}
const buttons = () => Array.from(container.querySelectorAll('button'))
const button = (label: string) => buttons().find((x) => x.textContent?.includes(label))

function deadly(): GameState {
  for (let seed = 1; seed < 80; seed++) {
    let s = createAccount(seed)
    s = reduce(s, { type: 'SUMMON', count: 10 })
    const p = suggestParty(s)
    s = reduce(s, { type: 'SET_PARTY', slots: p.slots, lines: p.lines })
    for (const f of [6, 7, 8, 9, 11, 12]) {
      const at: GameState = { ...s, tower: { ...s.tower, currentFloor: f, highestCleared: f - 1, kind: 'path', doors: null, event: null } }
      const { result } = attemptFloorWithResult(at)
      if (result.fallenHeroIds.length > 0 && decisiveTutorialDue(at, result.result.log)) return at
    }
  }
  throw new Error('no deadly fight')
}

describe('the real TowerScreen with the real BattleScene', () => {
  it('a deadly tower fight shows the Decisive Moment with Isel coaching, pose sprites change', () => {
    const st = deadly()
    const storage = new MemoryStorage()
    storage.write(DEFAULT_SAVE_KEY, saveState(st))
    const store = createStore({ storage })
    store.load()
    act(() => root.render(<Harness store={store} />))
    const enter = button('Enter')
    expect(enter, container.textContent ?? '').toBeTruthy()
    act(() => enter!.click())
    const seen = new Set<string>()
    let decisive = false
    let coach = ''
    for (let t = 0; t < 200_000 && !decisive; t += 10) {
      for (const img of container.querySelectorAll('.bsprite img')) seen.add(img.getAttribute('src') ?? '')
      if (container.querySelector('.decisive-card')) {
        decisive = true
        coach = container.querySelector('.decisive-coach')?.textContent ?? ''
      }
      act(() => {
        vi.advanceTimersByTime(10)
      })
    }
    expect(decisive).toBe(true)
    expect(coach).toMatch(/Protect/)
    const heroPoses = new Set([...seen].filter((s) => s.startsWith('hero:')).map((s) => s.split(':')[2]))
    expect(heroPoses.has('idle')).toBe(true)
    expect([...heroPoses].some((p) => p !== 'idle' && p !== 'blink')).toBe(true)
    // Protect, then play out
    const protect = container.querySelector('.decisive-choice.protect') as HTMLButtonElement
    act(() => protect.click())
    for (let t = 0; t < 400_000 && !button('Continue') && !container.querySelector('.results, .results-card'); t += 20) {
      if (container.querySelector('.decisive-card')) act(() => (button('Let fate decide') as HTMLElement).click())
      act(() => {
        vi.advanceTimersByTime(20)
      })
    }
    // the tutorial is marked after the battle closes
    const cont = button('Continue')
    if (cont) act(() => cont.click())
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    // close results
    const close = buttons().find((x) => /Onward|Press on|Regroup/.test(x.textContent ?? ''))
    if (close) act(() => close.click())
    expect(store.getState()!.life.guide.done).toContain(DECISIVE_TUTORIAL_STEP)
  })
})

describe('the battle in French', () => {
  it('Decisive Moment, battle captions and results read in French', () => {
    setLocale('fr')
    try {
      const st = deadly()
      const storage = new MemoryStorage()
      storage.write(DEFAULT_SAVE_KEY, saveState(st))
      const store = createStore({ storage })
      store.load()
      act(() => root.render(<Harness store={store} />))
      const enter = buttons().find((b) => b.textContent?.includes('Entrer'))!
      act(() => enter.click())
      const hits = new Set<string>()
      let sawDecisive = false
      for (let t = 0; t < 400_000; t += 20) {
        const text = container.textContent ?? ''
        for (const h of audit(text)) hits.add(h)
        const card = container.querySelector('.decisive-card')
        if (card) {
          sawDecisive = true
          const ch = (container.querySelector('.decisive-choice.protect') ?? [...container.querySelectorAll('.decisive-choice')].pop()) as HTMLButtonElement
          act(() => ch.click())
        }
        if (buttons().some((b) => /Continuer|En avant|Poursuivre|Se regrouper/.test(b.textContent ?? '')) && t > 5000) break
        act(() => {
          vi.advanceTimersByTime(20)
        })
      }
      act(() => {
        vi.advanceTimersByTime(5000)
      })
      for (const h of audit(container.textContent ?? '')) hits.add(h)
      expect(sawDecisive).toBe(true)
      expect([...hits]).toEqual([])
    } finally {
      setLocale('en')
    }
  })
})
