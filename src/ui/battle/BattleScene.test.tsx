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

function mount(props: { onDone?: () => void; orders?: BattleOrders; log?: CombatLog; nonLethal?: boolean } = {}) {
  act(() => {
    root.render(
      <BattleScene log={props.log ?? syntheticLog()} state={null} onDone={props.onDone ?? (() => {})} orders={props.orders} nonLethal={props.nonLethal} />,
    )
  })
}

/** A fight where hero h1 falls, then the party wipes. */
function deathLog(): CombatLog {
  const ev: CombatEvent[] = [
    { seq: 0, tick: 0, kind: 'battle-start', heroIds: ['h1', 'h2'], enemyIds: ['e1'] },
    { seq: 1, tick: 1, kind: 'act', actorId: 'e1', skillId: 'basic', targetId: 'h1' },
    { seq: 2, tick: 1, kind: 'hit', actorId: 'e1', targetId: 'h1', amount: 100, crit: true, hpAfter: 0 },
    { seq: 3, tick: 1, kind: 'death', unitId: 'h1' },
    { seq: 4, tick: 2, kind: 'act', actorId: 'e1', skillId: 'basic', targetId: 'h2' },
    { seq: 5, tick: 2, kind: 'hit', actorId: 'e1', targetId: 'h2', amount: 10, crit: false, hpAfter: 90 },
    { seq: 6, tick: 3, kind: 'act', actorId: 'e1', skillId: 'basic', targetId: 'h2' },
    { seq: 7, tick: 3, kind: 'hit', actorId: 'e1', targetId: 'h2', amount: 90, crit: false, hpAfter: 0 },
    { seq: 8, tick: 3, kind: 'death', unitId: 'h2' },
    { seq: 9, tick: 3, kind: 'end', outcome: 'wipe' },
  ]
  return { seed: 1, floor: 3, encounterContext: 'tower', unitsInit: [unit('h1', 'hero'), unit('h2', 'hero'), unit('e1', 'enemy', 50)], events: ev, outcome: 'wipe', rngDraws: 0 }
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
    expect(text()).toContain('press R again')
    expect(give).not.toHaveBeenCalled()
    press('r')
    expect(give).toHaveBeenCalledTimes(1)
    expect((give.mock.calls[0] as unknown as [{ kind: string }])[0].kind).toBe('retreat')
  })

  it('the Retreat button asks first, like the R key: one stray click throws nothing away', () => {
    const give = vi.fn(() => null)
    mount({ orders: { left: 1, give } })
    const retreat = () => Array.from(container.querySelectorAll('button')).find((b) => /Retreat|Sound the retreat/.test(b.textContent ?? ''))!
    act(() => retreat().click())
    expect(give).not.toHaveBeenCalled()
    expect(text()).toContain('Sound the retreat?')
    act(() => retreat().click())
    expect(give).toHaveBeenCalledTimes(1)
  })

  it("the fallen hero's card fades and goes once the replay moves on", () => {
    vi.useFakeTimers()
    try {
      mount({ log: deathLog() })
      let sawCard = false
      for (let i = 0; i < 60; i++) {
        act(() => {
          vi.advanceTimersByTime(250)
        })
        if (container.querySelector('.death-card')) sawCard = true
      }
      expect(sawCard).toBe(true)
      expect(text()).toContain('DEFEAT')
      // h2 fell last: give its card time to linger and fade too.
      act(() => {
        vi.advanceTimersByTime(6000)
      })
      expect(container.querySelector('.death-card')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('a trial ends without DEFEAT, corpses or a death moment', () => {
    mount({ log: deathLog(), nonLethal: true })
    press('s')
    expect(text()).toContain('TRIAL ENDED')
    expect(text()).toContain('Nobody dies here.')
    expect(text()).not.toContain('DEFEAT')
    expect(container.querySelector('.battle.trial')).not.toBeNull()
    expect(container.querySelector('.death-card')).toBeNull()
  })

  it('a wave of more than six keeps an HP bar per foe, each one a Focus target', () => {
    const foes = Array.from({ length: 9 }, (_, i) => unit(`e${i}`, 'enemy', 50))
    const log: CombatLog = {
      seed: 1,
      floor: 60,
      encounterContext: 'tower',
      unitsInit: [unit('h1', 'hero'), ...foes],
      events: [
        { seq: 0, tick: 0, kind: 'battle-start', heroIds: ['h1'], enemyIds: foes.map((f) => f.id) },
        { seq: 1, tick: 1, kind: 'act', actorId: 'h1', skillId: 'basic', targetId: 'e0' },
        { seq: 2, tick: 1, kind: 'hit', actorId: 'h1', targetId: 'e0', amount: 5, crit: false, hpAfter: 45 },
        { seq: 3, tick: 2, kind: 'end', outcome: 'timeout' },
      ],
      outcome: 'timeout',
      rngDraws: 0,
    }
    vi.useFakeTimers()
    try {
      const give = vi.fn(() => null)
      mount({ log, orders: { left: 2, give } })
      // The foes march in on the first beat.
      act(() => {
        vi.advanceTimersByTime(750)
      })
      const rows = container.querySelectorAll('.battle-foes.many .foe-row')
      expect(rows).toHaveLength(9)
      expect(container.querySelectorAll('.battle-foes.many .foe-hp')).toHaveLength(9)
      press('f')
      act(() => (rows[4] as HTMLElement).click())
      expect(give).toHaveBeenCalledTimes(1)
      expect((give.mock.calls[0] as unknown as [{ kind: string; enemyId: string }])[0]).toMatchObject({ kind: 'focus', enemyId: 'e4' })
    } finally {
      vi.useRealTimers()
    }
  })
})
