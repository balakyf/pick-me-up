// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { BattleOrder, CombatEvent, CombatLog, CombatUnitInit } from '../../engine/types'
import { BattleScene, type BattleOrders } from './BattleScene'
import { setLocale } from '../i18n/i18n'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * Lane G on the battle screen: a telegraph puts a '!' and a countdown ring over its caster,
 * a reticle under whom it threatens, and Guard calls for attention; the phase cinematic plays
 * on its beat; summoned foes appear; every new order (Unleash, Guard, Hold, Swap) is given
 * from the bar and the keyboard, aimed where it needs a target.
 */

const unit = (id: string, side: 'hero' | 'enemy', extra: Partial<CombatUnitInit> = {}): CombatUnitInit => ({
  id,
  name: side === 'hero' ? `Hero ${id}` : 'Halgiraf',
  side,
  line: 'front',
  unitClass: side === 'hero' ? 'warrior' : null,
  element: side === 'hero' ? 'fire' : 'dark',
  level: 20,
  maxHP: 1000,
  maxSP: 100,
  cp: 10,
  spd: 50,
  ...extra,
})

/** Halgiraf winds up his breath, it fires, he takes flight and calls a guard. */
function dragonLog(): CombatLog {
  const ev: CombatEvent[] = [
    { seq: 0, tick: 0, kind: 'battle-start', heroIds: ['h1', 'h2', 'npc'], enemyIds: ['boss'] },
    { seq: 1, tick: 3, kind: 'telegraph', unitId: 'boss', skillId: 'e_dragon_breath', firesAtTick: 13, targets: ['h1', 'h2'] },
    { seq: 2, tick: 5, kind: 'act', actorId: 'h1', skillId: 'basic', targetId: 'boss' },
    { seq: 3, tick: 5, kind: 'hit', actorId: 'h1', targetId: 'boss', amount: 500, crit: false, hpAfter: 500 },
    { seq: 4, tick: 5, kind: 'phase', unitId: 'boss', phase: 1, phases: 1, title: 'Takes flight', line: 'Halgiraf beats his black wings and takes to the sky!', spd: 57 },
    { seq: 5, tick: 5, kind: 'summon', unitId: 'boss', enemyIds: ['m1'], wave: 0 },
    { seq: 6, tick: 13, kind: 'act', actorId: 'boss', skillId: 'e_dragon_breath', targetId: 'h1', charged: true },
    { seq: 7, tick: 13, kind: 'hit', actorId: 'boss', targetId: 'h1', amount: 100, crit: false, hpAfter: 900 },
    { seq: 8, tick: 13, kind: 'hit', actorId: 'boss', targetId: 'h2', amount: 100, crit: false, hpAfter: 900 },
    { seq: 9, tick: 20, kind: 'end', outcome: 'win' },
  ]
  return {
    seed: 1,
    floor: 20,
    encounterContext: 'tower',
    unitsInit: [unit('h1', 'hero'), unit('h2', 'hero', { line: 'back' }), unit('npc', 'hero', { name: 'Princess Priasis', isNpc: true }), unit('boss', 'enemy'), unit('m1', 'enemy', { name: 'Dark Disciple' })],
    events: ev,
    outcome: 'win',
    rngDraws: 0,
    mission: { type: 'Subjugation', objectives: [{ kind: 'annihilate' }], waves: 1 },
  }
}

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  setLocale('en')
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
/** Play until `cond` holds (or give up). */
function playUntil(cond: () => boolean, steps = 400) {
  for (let i = 0; i < steps && !cond(); i++) {
    act(() => {
      vi.advanceTimersByTime(25)
    })
  }
}
const text = () => container.textContent ?? ''
const caption = () => container.querySelector('.battle-caption')?.textContent ?? ''
const button = (label: string) => Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(label)) as HTMLButtonElement
const partyRow = (name: string) => Array.from(container.querySelectorAll('.party-row')).find((r) => r.textContent?.includes(name)) as HTMLElement

describe('telegraphs and phases on the stage', () => {
  it('a wind-up shows its line, the ring over its caster and the reticles; Guard calls for attention', () => {
    mount(dragonLog(), { left: 1, give: () => null })
    playUntil(() => caption().includes('deep breath'))
    expect(caption()).toBe('Halgiraf draws a deep breath…')
    const mark = container.querySelector('.tg-mark')!
    expect(mark).not.toBeNull()
    expect(mark.textContent).toContain('!')
    expect(mark.textContent).toContain('Dragon Breath')
    expect(container.querySelector('.tg-ring')).not.toBeNull()
    expect(container.querySelectorAll('.tg-reticle').length).toBe(2)
    expect(button('Guard').classList.contains('urgent')).toBe(true)
  })

  it('the phase cinematic plays on its beat; the summoned foe appears; the fire takes the mark down', () => {
    mount(dragonLog())
    playUntil(() => container.querySelector('.phase-cine') !== null)
    const cine = container.querySelector('.phase-cine')!
    expect(cine.textContent).toContain('Halgiraf')
    expect(cine.textContent).toContain('Phase 2 of 2')
    expect(cine.textContent).toContain('Takes flight')
    expect(cine.textContent).toContain('takes to the sky')
    playUntil(() => caption().includes('calls'))
    expect(caption()).toBe('Halgiraf calls Dark Disciple to its side!')
    playUntil(() => caption().includes('unleashes'))
    expect(caption()).toBe('Halgiraf unleashes Dragon Breath!')
    expect(container.querySelector('.tg-mark')).toBeNull()
  })

  it('under reduced motion the cinematic is calm (no flash)', () => {
    const mq = window.matchMedia
    window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia
    try {
      mount(dragonLog())
      playUntil(() => container.querySelector('.phase-cine') !== null)
      expect(container.querySelector('.phase-cine')!.classList.contains('calm')).toBe(true)
      expect(container.querySelector('.phase-flash')).toBeNull()
    } finally {
      window.matchMedia = mq
    }
  })
})

describe('orders 2.0 from the bar and the keyboard', () => {
  it('G braces at once; H holds; both name their tick', () => {
    const give = vi.fn((_o: BattleOrder) => null)
    mount(dragonLog(), { left: 3, give })
    playUntil(() => caption().includes('deep breath'))
    press('g')
    expect(give).toHaveBeenCalledTimes(1)
    expect(give.mock.calls[0]![0]).toMatchObject({ kind: 'guard', tick: 4 })
    act(() => button('Hold').click())
    expect(give.mock.calls[1]![0]).toMatchObject({ kind: 'hold' })
  })

  it('U aims at a hero (never the escort); the click unleashes them', () => {
    const give = vi.fn((_o: BattleOrder) => null)
    mount(dragonLog(), { left: 1, give })
    press('u')
    expect(text()).toContain('Click the hero to unleash…')
    expect(partyRow('Priasis').classList.contains('aimable')).toBe(false)
    act(() => partyRow('Hero h2').click())
    expect(give.mock.calls[0]![0]).toMatchObject({ kind: 'unleash', allyId: 'h2' })
  })

  it('X swaps two heroes: the first click picks, the second orders', () => {
    const give = vi.fn((_o: BattleOrder) => null)
    mount(dragonLog(), { left: 1, give })
    press('x')
    expect(text()).toContain('Click the first hero to swap…')
    act(() => partyRow('Hero h1').click())
    expect(give).not.toHaveBeenCalled()
    expect(partyRow('Hero h1').classList.contains('picked')).toBe(true)
    expect(text()).toContain('Click the hero to trade places with…')
    act(() => partyRow('Hero h2').click())
    expect(give.mock.calls[0]![0]).toMatchObject({ kind: 'swap', a: 'h1', b: 'h2' })
  })

  it('with no order left, every order but Retreat is out of reach', () => {
    mount(dragonLog(), { left: 0, give: () => null })
    for (const label of ['Focus', 'Protect', 'Unleash', 'Guard', 'Hold', 'Swap']) expect(button(label).disabled, label).toBe(true)
    expect(button('Retreat').disabled).toBe(false)
  })
})
