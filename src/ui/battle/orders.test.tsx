// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { BattleOrder, CombatEvent, CombatLog, CombatUnitInit } from '../../engine/types'
import { BattleScene, type BattleOrders } from './BattleScene'
import { setLocale } from '../i18n/i18n'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * The Master's orders in the battle overlay (lane C): Protect reaches the escort (B3), the
 * aim prompt never outlives a resumed replay, and an order resumes the replay where it
 * stands instead of skipping the rest of the tick (B16). Focus says what the Tactical
 * Center adds (B18).
 */

const unit = (id: string, side: 'hero' | 'enemy', extra: Partial<CombatUnitInit> = {}): CombatUnitInit => ({
  id,
  name: side === 'hero' ? `Hero ${id}` : 'Goblin',
  side,
  line: 'front',
  unitClass: side === 'hero' ? 'warrior' : null,
  element: side === 'hero' ? 'fire' : 'earth',
  level: 1,
  maxHP: 100,
  maxSP: 0,
  cp: 10,
  ...extra,
})

/** An escort fight: two heroes, the princess (an NPC) and two goblins; tick 2 holds three events. */
function escortLog(extra: CombatEvent[] = []): CombatLog {
  const ev: CombatEvent[] = [
    { seq: 0, tick: 0, kind: 'battle-start', heroIds: ['h1', 'h2', 'npc'], enemyIds: ['e1', 'e2'] },
    { seq: 1, tick: 1, kind: 'act', actorId: 'h1', skillId: 'basic', targetId: 'e1' },
    { seq: 2, tick: 1, kind: 'hit', actorId: 'h1', targetId: 'e1', amount: 10, crit: false, hpAfter: 90 },
    { seq: 3, tick: 2, kind: 'act', actorId: 'e1', skillId: 'basic', targetId: 'npc' },
    { seq: 4, tick: 2, kind: 'hit', actorId: 'e1', targetId: 'npc', amount: 20, crit: false, hpAfter: 80 },
    { seq: 5, tick: 2, kind: 'act', actorId: 'e2', skillId: 'basic', targetId: 'h2' },
    { seq: 6, tick: 2, kind: 'hit', actorId: 'e2', targetId: 'h2', amount: 20, crit: false, hpAfter: 80 },
    ...extra,
  ]
  const last = ev.at(-1)!
  ev.push({ seq: last.seq + 1, tick: last.tick + 1, kind: 'end', outcome: 'win' })
  return {
    seed: 1,
    floor: 15,
    encounterContext: 'tower',
    unitsInit: [unit('h1', 'hero'), unit('h2', 'hero'), unit('npc', 'hero', { name: 'Princess Priasis', isNpc: true }), unit('e1', 'enemy'), unit('e2', 'enemy')],
    events: ev,
    outcome: 'win',
    rngDraws: 0,
  }
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

function mount(log: CombatLog, orders?: BattleOrders) {
  act(() => {
    root.render(<BattleScene log={log} state={null} onDone={() => {}} orders={orders} />)
  })
}
function press(key: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  })
}
const text = () => container.textContent ?? ''
const partyRow = (name: string) => Array.from(container.querySelectorAll('.party-row')).find((r) => r.textContent?.includes(name)) as HTMLElement

describe('orders', () => {
  it('B3: Protect can be aimed at the escort, and says so', () => {
    const give = vi.fn((_o: BattleOrder) => null)
    mount(escortLog(), { left: 1, give })
    press('p')
    expect(text()).toContain('Click a hero or the escort…')
    const row = partyRow('Priasis')
    expect(row.classList.contains('aimable')).toBe(true)
    act(() => row.click())
    expect(give).toHaveBeenCalledTimes(1)
    expect(give.mock.calls[0]![0]).toMatchObject({ kind: 'protect', allyId: 'npc' })
  })

  it('resuming play puts the aim prompt away', () => {
    mount(escortLog(), { left: 1, give: () => null })
    press('f')
    expect(text()).toContain('Click an enemy…')
    expect(text()).toContain('▶ Play') // aiming pauses the replay
    press(' ')
    expect(text()).not.toContain('Click an enemy…')
    expect(text()).toContain('❚❚ Pause')
    // The Play button does the same.
    press('p')
    expect(text()).toContain('Click a hero or the escort…')
    const play = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Play'))!
    act(() => play.click())
    expect(text()).not.toContain('Click a hero')
  })

  it('B16: an order resumes from the frame on screen — the rest of the tick still plays', () => {
    vi.useFakeTimers()
    try {
      const first = escortLog([{ seq: 7, tick: 3, kind: 'act', actorId: 'h1', skillId: 'basic', targetId: 'e1' }])
      // The re-resolved fight: identical through tick 2, then the order at tick 3.
      const revised = escortLog([
        { seq: 7, tick: 3, kind: 'order', order: { tick: 3, kind: 'protect', allyId: 'npc' } },
        { seq: 8, tick: 3, kind: 'act', actorId: 'h1', skillId: 'basic', targetId: 'e1' },
      ])
      const give = vi.fn(() => revised)
      mount(first, { left: 1, give })
      const hp = (name: string) => partyRow(name).querySelector('.party-hpnum')?.textContent ?? ''
      const caption = () => container.querySelector('.battle-caption')?.textContent ?? ''
      // Play into tick 2 until e1's blow lands on the princess — e2 has not struck yet.
      for (let i = 0; i < 200 && !hp('Priasis').startsWith('80/'); i++) {
        act(() => {
          vi.advanceTimersByTime(20)
        })
      }
      expect(hp('Priasis')).toBe('80/100')
      expect(hp('Hero h2')).toBe('100/100')
      press('p')
      act(() => partyRow('Priasis').click())
      expect(give).toHaveBeenCalledTimes(1)
      expect((give.mock.calls[0] as unknown as [BattleOrder])[0].tick).toBe(3)
      // No jump: the replay did not skip ahead to tick 3 (the old code landed past e2's blow).
      expect(hp('Hero h2')).toBe('100/100')
      // The rest of tick 2 still plays (e2 strikes h2) before the order is called.
      let h2HitFirst = false
      let sawOrder = false
      for (let i = 0; i < 300 && !sawOrder; i++) {
        act(() => {
          vi.advanceTimersByTime(20)
        })
        if (caption().includes('Cover')) {
          sawOrder = true
          h2HitFirst = hp('Hero h2') === '80/100'
        }
      }
      expect(sawOrder).toBe(true)
      expect(h2HitFirst).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('B18: the Focus button names the Tactical Center’s bonus', () => {
    mount(escortLog(), { left: 2, give: () => null, focusBonus: 0.06 })
    const focus = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Focus'))!
    expect(focus.getAttribute('title')).toContain('+6% damage')
  })
})
