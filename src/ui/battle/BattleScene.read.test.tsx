// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { CombatEvent, CombatLog, CombatUnitInit } from '../../engine/types'
import { BattleScene } from './BattleScene'
import { setLocale } from '../i18n/i18n'
import { ELEMENTS_HINT_KEY } from './elementsHint'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * Battle readability in the scene: the mission in plain words, the turn order, a sweep as
 * one beat with a number on every target, the cut-in, and the one-time elements hint.
 */

const unit = (id: string, side: 'hero' | 'enemy', extra: Partial<CombatUnitInit> = {}): CombatUnitInit => ({
  id,
  name: side === 'hero' ? `Hero ${id}` : 'Goblin',
  side,
  line: 'front',
  unitClass: side === 'hero' ? 'mage' : null,
  element: side === 'hero' ? 'fire' : 'wind',
  level: 1,
  maxHP: 100,
  maxSP: 100,
  cp: 10,
  spd: side === 'hero' ? 500 : 250,
  ...extra,
})

function sweepLog(): CombatLog {
  const ev: CombatEvent[] = [
    { seq: 0, tick: 0, kind: 'battle-start', heroIds: ['h1', 'vip'], enemyIds: ['e1', 'e2', 'e3'] },
    { seq: 1, tick: 2, kind: 'act', actorId: 'h1', skillId: 'arcane_burst', targetId: 'e1' },
    { seq: 2, tick: 2, kind: 'hit', actorId: 'h1', targetId: 'e1', amount: 40, crit: false, hpAfter: 60, eff: 'weak' },
    { seq: 3, tick: 2, kind: 'hit', actorId: 'h1', targetId: 'e2', amount: 41, crit: false, hpAfter: 59, eff: 'weak' },
    { seq: 4, tick: 2, kind: 'hit', actorId: 'h1', targetId: 'e3', amount: 42, crit: false, hpAfter: 58, eff: 'weak' },
    { seq: 5, tick: 4, kind: 'act', actorId: 'e1', skillId: 'basic', targetId: 'h1' },
    { seq: 6, tick: 4, kind: 'hit', actorId: 'e1', targetId: 'h1', amount: 5, crit: false, hpAfter: 95 },
    { seq: 7, tick: 9, kind: 'end', outcome: 'win' },
  ]
  return {
    seed: 1,
    floor: 15,
    encounterContext: 'tower',
    unitsInit: [
      unit('h1', 'hero'),
      unit('vip', 'hero', { isNpc: true, name: 'Princess Priasis', targetTag: 'priasis', maxSP: 0 }),
      unit('e1', 'enemy'),
      unit('e2', 'enemy'),
      unit('e3', 'enemy'),
    ],
    events: ev,
    outcome: 'win',
    rngDraws: 0,
    mission: { type: 'Escort', objectives: [{ kind: 'survive', ticks: 100 }, { kind: 'protect', targetTag: 'priasis', unitIds: ['vip'] }], timerTicks: 100, waves: 1 },
  }
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  setLocale('en')
  try {
    localStorage.removeItem(ELEMENTS_HINT_KEY)
  } catch {
    /* jsdom storage may be absent */
  }
  vi.useFakeTimers()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
})

const mount = (log = sweepLog()) =>
  act(() => {
    root.render(<BattleScene log={log} state={null} onDone={() => {}} />)
  })
/** Let the replay run `ms` (in small steps: each frame schedules the next once it renders). */
const advance = (ms: number) => {
  for (let left = ms; left > 0; left -= 20) {
    act(() => {
      vi.advanceTimersByTime(Math.min(20, left))
    })
  }
}
const text = () => container.textContent ?? ''

describe('BattleScene: reading the fight', () => {
  it('shows the mission in plain words, the escort to keep alive and the turn order', () => {
    mount()
    expect(text()).toContain('Survive until the bell')
    expect(text()).toContain('Keep Princess Priasis alive')
    expect(container.querySelector('.obj-escort')).not.toBeNull()
    advance(1100)
    const cells = container.querySelectorAll('.turn-strip .turn-cell')
    expect(cells.length).toBeGreaterThan(2)
    // The escort never acts: it is not in the turn order.
    expect(Array.from(cells).some((c) => c.getAttribute('title') === 'Princess Priasis')).toBe(false)
  })

  it('a sweep lands as one beat: a number over every target, staggered, and WEAK! on each', () => {
    mount()
    // Opening (300) + battle-start (700) + the act with its cut-in (340 + 520).
    advance(300 + 700)
    expect(container.querySelector('.cutin')).not.toBeNull()
    expect(container.querySelector('.skill-banner')?.textContent).toBe('Arcane Burst')
    advance(860)
    const nums = Array.from(container.querySelectorAll('.dmg')).map((d) => d.textContent)
    expect(nums).toEqual(['WEAK!40', 'WEAK!41', 'WEAK!42'])
    const delays = Array.from(container.querySelectorAll<HTMLElement>('.dmg')).map((d) => d.style.animationDelay)
    expect(delays).toEqual(['0ms', '60ms', '120ms'])
    // The caster's name stays up through the blows.
    expect(container.querySelector('.skill-banner')?.textContent).toBe('Arcane Burst')
    expect(container.querySelector('.cutin')).toBeNull()
  })

  it('explains WEAK! once, and remembers it was read', () => {
    mount()
    advance(300 + 700 + 860)
    expect(text()).toContain('That blow struck a weakness')
    const got = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Got it')!
    act(() => got.click())
    expect(text()).not.toContain('That blow struck a weakness')
    expect(localStorage.getItem(ELEMENTS_HINT_KEY)).toBe('1')
    // A later battle does not explain it again.
    act(() => root.unmount())
    root = createRoot(container)
    mount()
    advance(300 + 700 + 860)
    expect(text()).not.toContain('That blow struck a weakness')
  })

  it('no cut-in at 4×', () => {
    mount()
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true }))
    })
    let sawCutIn = false
    for (let i = 0; i < 40; i++) {
      advance(25)
      if (container.querySelector('.cutin')) sawCutIn = true
    }
    expect(sawCutIn).toBe(false)
  })
})
