// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createAccount } from '../../engine/account'
import { ACTS, ENEMY_TEMPLATES } from '../../engine/content'
import { ACT_STORY, ANCHOR_STORY, BOSS_LINES, HERALD } from '../../engine/content/story'
import type { CombatUnitInit, FloorResult, GameState } from '../../engine/types'
import { setLocale } from '../i18n/i18n'
import { AnchorBriefing } from './AnchorBriefing'
import { ACT_CARD_MS, ActCard } from './ActCard'
import { StoryBox } from './StoryBox'
import { aftermathLine, PriasisLetter } from './StoryNotes'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function at(floor: number, patch: Partial<GameState['tower']> = {}): GameState {
  const s = createAccount(31, { now: 0 })
  return { ...s, tower: { ...s.tower, currentFloor: floor, highestCleared: floor - 1, ...patch } }
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

describe('the story on screen (lane M)', () => {
  it('briefs an anchor floor and stays out of the way on a filler floor', () => {
    act(() => root.render(<AnchorBriefing state={at(20)} />))
    const text = container.textContent ?? ''
    expect(text).toContain(ANCHOR_STORY[20]!.title)
    expect(text).toContain(ANCHOR_STORY[20]!.who)
    expect(text).toContain(ANCHOR_STORY[20]!.isel)
    expect(container.querySelector('[aria-label="Briefing"]')).not.toBeNull()
    act(() => root.render(<AnchorBriefing state={at(21)} />))
    expect(container.textContent).toBe('')
  })

  it('frames the ninetieth floor’s choice, until the world’s fate is sealed', () => {
    act(() => root.render(<AnchorBriefing state={at(90)} />))
    expect(container.textContent).toContain(HERALD.herald)
    expect(container.textContent).toContain(HERALD.clear)
    act(() => root.render(<AnchorBriefing state={at(90, { worldEnded: true })} />))
    expect(container.textContent).not.toContain(HERALD.clear)
  })

  it('an act card titles the act and lifts on its own', () => {
    vi.useFakeTimers()
    const act2 = ACTS[1]!
    let closed = 0
    act(() => root.render(<ActCard act={act2} story={ACT_STORY[act2.id]!} calm onClose={() => closed++} />))
    expect(container.textContent).toContain('Act II')
    expect(container.textContent).toContain(ACT_STORY.ruins!.epigraph)
    // Not a dialog: the hotkeys keep working under a chapter title.
    expect(container.querySelector('[role=dialog], .overlay')).toBeNull()
    act(() => vi.advanceTimersByTime(ACT_CARD_MS + 10))
    expect(closed).toBe(1)
  })

  it('a boss speaks under its name; a beast is narrated', () => {
    const hal: CombatUnitInit = { id: 'hal', name: ENEMY_TEMPLATES.halgiraf!.name, templateId: 'halgiraf', side: 'enemy', line: 'front', unitClass: null, element: 'dark', level: 30, maxHP: 1, maxSP: 1, cp: 1 }
    act(() => root.render(<StoryBox line={{ kind: 'phase', text: BOSS_LINES.halgiraf!.phases![1]!, speaker: 'boss', unitId: 'hal', narrated: false }} byId={{ hal }} calm />))
    expect(container.querySelector('.story-name')?.textContent).toBe('Halgiraf')
    expect(container.querySelector('.story-text')?.textContent).toContain('The sky is mine')
    act(() => root.render(<StoryBox line={{ kind: 'entrance', text: BOSS_LINES.the_egg!.entrance, speaker: 'narrator', narrated: true }} byId={{}} calm />))
    expect(container.querySelector('.story-name')).toBeNull()
    expect(container.querySelector('.story-box.narrated')).not.toBeNull()
  })

  it('folds Priasis’s letter into Isel’s, and the results say what the anchor cost', () => {
    act(() => root.render(<PriasisLetter state={at(16)} />))
    expect(container.textContent).toContain('Al Ragna')
    act(() => root.render(<PriasisLetter state={at(10)} />))
    expect(container.textContent).toBe('')
    const r = (floor: number, extra: Partial<FloorResult> = {}) => ({ floor, cleared: true, worldEnded: false, worldSaved: false, ...extra })
    expect(aftermathLine(r(20))).toBe(ANCHOR_STORY[20]!.aftermath)
    expect(aftermathLine(r(90, { worldSaved: true }))).toBe(HERALD.saved)
    expect(aftermathLine(r(90, { worldEnded: true }))).toBe(HERALD.ended)
    expect(aftermathLine(r(20, { cleared: false }))).toBeNull()
    expect(aftermathLine(r(21))).toBeNull()
  })
})
