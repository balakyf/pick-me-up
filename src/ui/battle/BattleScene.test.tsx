// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { CombatEvent, CombatLog, CombatUnitInit } from '../../engine/types'
import { BattleScene, type BattleOrders } from './BattleScene'
import { setLocale } from '../i18n/i18n'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * The battle overlay in jsdom (no canvas): it mounts, replays, and its keyboard
 * shortcuts drive the replay without leaking keys to the page underneath.
 */

const unit = (id: string, side: 'hero' | 'enemy', maxHP = 100): CombatUnitInit => ({
  id,
  name: side === 'hero' ? `Hero ${id}` : 'Goblin',
  side,
  line: 'front',
  unitClass: side === 'hero' ? 'warrior' : null,
  element: side === 'hero' ? 'fire' : 'earth',
  level: 1,
  maxHP,
  maxSP: 0,
  cp: 10,
})

function syntheticLog(): CombatLog {
  const ev: CombatEvent[] = [
    { seq: 0, tick: 0, kind: 'battle-start', heroIds: ['h1'], enemyIds: ['e1'] },
    { seq: 1, tick: 1, kind: 'act', actorId: 'h1', skillId: 'basic', targetId: 'e1' },
    { seq: 2, tick: 1, kind: 'hit', actorId: 'h1', targetId: 'e1', amount: 30, crit: true, hpAfter: 20 },
    { seq: 3, tick: 2, kind: 'act', actorId: 'e1', skillId: 'basic', targetId: 'h1' },
    { seq: 4, tick: 2, kind: 'hit', actorId: 'e1', targetId: 'h1', amount: 5, crit: false, hpAfter: 95 },
    { seq: 5, tick: 3, kind: 'act', actorId: 'h1', skillId: 'basic', targetId: 'e1' },
    { seq: 6, tick: 3, kind: 'hit', actorId: 'h1', targetId: 'e1', amount: 20, crit: false, hpAfter: 0 },
    { seq: 7, tick: 3, kind: 'death', unitId: 'e1' },
    { seq: 8, tick: 3, kind: 'end', outcome: 'win' },
  ]
  return { seed: 1, floor: 3, encounterContext: 'tower', unitsInit: [unit('h1', 'hero'), unit('e1', 'enemy', 50)], events: ev, outcome: 'win', rngDraws: 0 }
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  setLocale('en')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function mount(props: { onDone?: () => void; orders?: BattleOrders } = {}) {
  act(() => {
    root.render(<BattleScene log={syntheticLog()} state={null} onDone={props.onDone ?? (() => {})} orders={props.orders} />)
  })
}

function press(key: string, target: EventTarget = window) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  })
}

const text = () => container.textContent ?? ''

describe('BattleScene', () => {
  it('mounts without a canvas and shows the stage, the party and the controls', () => {
    mount()
    expect(container.querySelector('.battle-stage')).not.toBeNull()
    expect(text()).toContain('Hero')
    expect(text()).toContain('Pause')
    expect(text()).toContain('Space') // the key legend on the button
  })

  it('Space pauses and resumes; 1/2/3 pick the speed', () => {
    mount()
    press(' ')
    expect(text()).toContain('▶ Play')
    press(' ')
    expect(text()).toContain('❚❚ Pause')
    press('3')
    const on = Array.from(container.querySelectorAll('button.on')).map((b) => b.textContent)
    expect(on.some((s) => s?.startsWith('4×'))).toBe(true)
  })

  it('S skips to the end; Esc then closes (and only then)', () => {
    const onDone = vi.fn()
    mount({ onDone })
    press('Escape')
    expect(onDone).not.toHaveBeenCalled() // mid-battle Esc does not close
    press('s')
    expect(text()).toContain('VICTORY')
    expect(text()).toContain('Continue')
    press('Escape')
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('keeps its keys from the page underneath and ignores typing in inputs', () => {
    const below = vi.fn()
    window.addEventListener('keydown', below)
    mount()
    press('w')
    press(' ')
    expect(below).not.toHaveBeenCalled()
    expect(text()).toContain('▶ Play')
    const input = document.createElement('input')
    document.body.appendChild(input)
    press(' ', input)
    expect(text()).toContain('▶ Play') // not toggled by typing
    input.remove()
    window.removeEventListener('keydown', below)
  })

  it('F aims a Focus order, Esc cancels; R asks first and sounds the retreat on the second press', () => {
    const give = vi.fn(() => null)
    mount({ orders: { left: 1, give } })
    press('f')
    expect(text()).toContain('Click an enemy…')
    press('Escape')
    expect(text()).not.toContain('Click an enemy…')
    press('r')
    expect(text()).toContain('Press R again')
    expect(give).not.toHaveBeenCalled()
    press('r')
    expect(give).toHaveBeenCalledTimes(1)
    expect((give.mock.calls[0] as unknown as [{ kind: string }])[0].kind).toBe('retreat')
  })
})
