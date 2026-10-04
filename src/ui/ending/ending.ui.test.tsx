// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createAccount } from '../../engine/account'
import { playFloor } from '../../engine/tower'
import { createStore, type Store } from '../../engine/store'
import { EPILOGUE, POST_WALL_STORY } from '../../engine/content/story'
import type { FallenRecord, GameState, HeroId, OwnedHero } from '../../engine/types'
import { setLocale } from '../i18n/i18n'
import { Ending, STILL_MS } from './Ending'
import { EndingHost } from './EndingHost'
import { EndgameBriefing } from './EndgameBriefing'
import { Memories } from './Memories'
import { openEnding } from './endingBus'
import { epilogueKey } from './endingText'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const god: Partial<OwnedHero> = {
  star: 7,
  heroClass: 'mage',
  element: 'light',
  baseAttrs: { str: 999, agi: 999, vit: 999, int: 999, wil: 999 },
  growthGrades: { str: 10, agi: 10, vit: 10, int: 10, wil: 10 },
  xp: { level: 150, xpIntoLevel: 0, heldXp: 0, atCap: false },
  skills: [{ id: 'arcane_burst', level: 6, xp: 0 }],
}
function gods(floor: number): GameState {
  const acct = createAccount(23, { now: 0 })
  const id = Object.keys(acct.heroes)[0] as HeroId
  const heroes: Record<string, OwnedHero> = { [id]: { ...acct.heroes[id]!, ...god } }
  const slots: (HeroId | null)[] = [id, null, null, null, null]
  for (let i = 0; i < 4; i++) {
    const pid = `h_p${i}` as HeroId
    heroes[pid] = { ...acct.heroes[id]!, id: pid, name: `Mira${i} Holt`, ...god, heroClass: i % 2 ? 'warrior' : 'mage', element: i % 2 ? 'physical' : 'light' }
    slots[i + 1] = pid
  }
  return { ...acct, heroes, party: { slots, lines: ['front', 'front', 'mid', 'back', 'back'] }, tower: { ...acct.tower, currentFloor: floor, highestCleared: floor - 1 } }
}
/** A world whose fate is sealed (ended), with one of the fallen in the Memorial. */
function endedWorld(): GameState {
  const s = playFloor(gods(90)).state
  const h = s.heroes['h_p2' as HeroId]!
  const g: FallenRecord = {
    heroId: h.id,
    name: h.name,
    star: h.star,
    level: 150,
    heroClass: h.heroClass,
    element: h.element,
    portraitToken: h.portraitToken,
    cause: 'battle',
    floor: 42,
    day: 6,
    daysServed: 6,
    bestFloor: 42,
    mourners: [],
  }
  return { ...s, heroes: { ...s.heroes, [h.id]: { ...h, alive: false } }, life: { ...s.life, memorial: [g] } }
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
  vi.useRealTimers()
})
const click = (el: Element | null | undefined) => act(() => (el as HTMLElement).click())
const button = (label: string | RegExp) =>
  [...container.querySelectorAll('button')].find((b) => (typeof label === 'string' ? b.textContent?.includes(label) : label.test(b.textContent ?? '')))

describe('the ending on screen (lane O)', () => {
  it('plays the stills on their own, then Isel, then the credits that name the fallen; skippable', () => {
    vi.useFakeTimers()
    const s = endedWorld()
    const onClose = vi.fn()
    act(() => root.render(<Ending state={s} fate="ended" calm={false} onClose={onClose} onNewCycle={() => {}} />))
    const dlg = container.querySelector('[role=dialog]')!
    expect(dlg).not.toBeNull()
    expect(container.textContent).toContain(EPILOGUE.ended.stills[0]!.line)
    act(() => vi.advanceTimersByTime(STILL_MS))
    expect(container.textContent).toContain(EPILOGUE.ended.stills[1]!.line)
    click(button('Skip to the credits'))
    expect(container.textContent).toContain('In memory of the fallen')
    expect(container.textContent).toContain('Mira2 Holt')
    expect(container.textContent).toContain('fell on F42')
    expect(container.textContent).toContain('Those who came home')
    click(button('Skip the credits'))
    expect(button('Begin a New Cycle')).toBeDefined()
    click(button('✕'))
    expect(onClose).toHaveBeenCalled()
  })

  it('reduced motion turns the roll into a list to read, with a Next button', () => {
    const s = endedWorld()
    act(() => root.render(<Ending state={s} fate="ended" start="credits" calm onClose={() => {}} onNewCycle={() => {}} />))
    expect(container.querySelector('.ending-roll.calm')).not.toBeNull()
    expect((container.querySelector('.ending-roll-inner') as HTMLElement).style.getPropertyValue('--roll-s')).toBe('')
    click([...container.querySelectorAll('.ending-roll button')].pop())
    expect(button('Begin a New Cycle')).toBeDefined()
  })

  it('a New Cycle asks first, saying what it keeps, then begins', () => {
    const s = endedWorld()
    const onNew = vi.fn()
    act(() => root.render(<Ending state={s} fate="ended" start="credits" calm onClose={() => {}} onNewCycle={onNew} />))
    click(button('Skip the credits'))
    click(button('Begin a New Cycle'))
    expect(container.textContent).toContain('You keep')
    expect(container.textContent).toContain('Enemy Codex')
    click(button('Begin Cycle II'))
    expect(onNew).toHaveBeenCalledTimes(1)
  })

  it('the host opens on the bus, latches the epilogue, and begins the New Cycle through the store', () => {
    const s = endedWorld()
    const dispatch = vi.fn(() => s)
    const store = { dispatch, getState: () => s } as unknown as Store
    const onNew = vi.fn()
    act(() => root.render(<EndingHost state={s} store={store} hold onNewCycle={onNew} />))
    // Held (a battle, a window): nothing plays by itself.
    expect(container.querySelector('.ending')).toBeNull()
    act(() => openEnding({ start: 'credits' }))
    expect(container.querySelector('.ending')).not.toBeNull()
    expect(dispatch).toHaveBeenCalledWith({ type: 'GUIDE_STEP', step: `story:${epilogueKey('ended')}` })
    click(button('Skip the credits'))
    click(button('Begin a New Cycle'))
    click(button('Begin Cycle II'))
    expect(dispatch).toHaveBeenCalledWith({ type: 'NEW_CYCLE' }, expect.any(Number))
    expect(onNew).toHaveBeenCalledTimes(1)
    // The new world opens on its card.
    expect(container.textContent).toContain('A new world')
  })

  it('the host plays a never-seen epilogue by itself once nothing holds the screen', () => {
    const s = endedWorld()
    const store = { dispatch: vi.fn(() => s), getState: () => s } as unknown as Store
    act(() => root.render(<EndingHost state={s} store={store} hold={false} onNewCycle={() => {}} />))
    expect(container.querySelector('.ending')).not.toBeNull()
  })

  it('briefs a floor behind the Wall and frames the ninetieth floor’s stakes', () => {
    act(() => root.render(<EndgameBriefing state={gods(83)} />))
    expect(container.textContent).toContain(POST_WALL_STORY[83]!.title)
    act(() => root.render(<EndgameBriefing state={gods(90)} />))
    expect(container.textContent).toContain('What each way leaves behind')
    act(() => root.render(<EndgameBriefing state={endedWorld()} />))
    expect(container.textContent).toContain('The world has ended')
    expect(button('Epilogue')).toBeDefined()
  })

  it('Memories of the Tower lists the cleared floors and their missed truths, and refuses nothing it should allow', () => {
    const store = createStore()
    const s = { ...gods(31), tower: { ...gods(31).tower, highestCleared: 30 } }
    act(() => root.render(<Memories state={s} store={store} onClose={() => {}} />))
    expect(container.textContent).toContain('Memories of the Tower')
    expect(container.textContent).toContain('A truth was missed here')
    expect(container.querySelectorAll('.memory-row').length).toBeGreaterThan(3)
    expect(button('Relive it')?.disabled).toBe(false)
  })
})
