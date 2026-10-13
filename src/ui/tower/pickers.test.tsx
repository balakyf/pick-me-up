// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createAccount } from '../../engine/account'
import { scoutFloor, type ScoutReport } from '../../engine/scout'
import type { GameState } from '../../engine/types'
import { DoorPicker, DOORS_GUIDE_STEP, previewDoor } from './DoorPicker'
import { BoonPicker } from './BoonPicker'
import { SortieBar } from './SortieBar'
import { ScoutCard } from './ScoutCard'
import { atFloor } from './fixtures'

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
const text = () => container.textContent ?? ''
const button = (label: string) => {
  const b = Array.from(container.querySelectorAll('button')).find((x) => x.textContent?.includes(label))
  if (!b) throw new Error(`no button "${label}" in: ${text()}`)
  return b
}

const base = createAccount(11)
const withDoors = (doors: NonNullable<GameState['tower']['doors']>, done: string[] = []): GameState => {
  const s = atFloor(base, { doors })
  return { ...s, life: { ...s.life, guide: { ...s.life.guide, done } } }
}

describe('DoorPicker (S13)', () => {
  it('shows each door with its kind, reward and a scout preview, and chooses by index', () => {
    const onChoose = vi.fn()
    const s = withDoors([
      { kind: 'path', reward: 'gold' },
      { kind: 'elite', reward: 'boon' },
    ])
    act(() => root.render(<DoorPicker state={s} onChoose={onChoose} />))
    expect(container.querySelectorAll('.door-card')).toHaveLength(2)
    expect(text()).toContain('Path')
    expect(text()).toContain('Skull')
    expect(text()).toContain('✦ Boon')
    expect(text()).toMatch(/Safe|Fair fight|Risky|Deadly/)
    expect(text()).toContain('No choice made? The party takes the Path.')
    act(() => button('Skull').click())
    expect(onChoose).toHaveBeenCalledWith(1)
  })

  it('has Isel explain the Skull door once, until acknowledged', () => {
    const seen = vi.fn()
    const doors = [
      { kind: 'path' as const, reward: 'gold' as const },
      { kind: 'elite' as const, reward: 'boon' as const },
    ]
    act(() => root.render(<DoorPicker state={withDoors(doors)} onChoose={() => {}} onSeenGuide={seen} />))
    expect(text()).toContain('The skull door hits much harder')
    act(() => button('Got it').click())
    expect(seen).toHaveBeenCalled()
    act(() => root.render(<DoorPicker state={withDoors(doors, [DOORS_GUIDE_STEP])} onChoose={() => {}} />))
    expect(text()).not.toContain('The skull door hits much harder')
  })

  it('labels the no-fight doors and never says Enter or Treasure', () => {
    const s = withDoors([
      { kind: 'breather', reward: 'xp' },
      { kind: 'cache', reward: 'gold' },
      { kind: 'rest', reward: 'sanity' },
    ])
    act(() => root.render(<DoorPicker state={s} onChoose={() => {}} />))
    expect(text()).toContain('Cache')
    expect(text()).toContain('No fight on this floor.')
    for (const b of Array.from(container.querySelectorAll('button'))) expect(b.textContent).not.toMatch(/Enter|Treasure/)
  })

  it('previews a door as a pure read of the floor with that kind', () => {
    const s = withDoors([{ kind: 'elite', reward: 'boon' }])
    const frozen = JSON.stringify(s)
    const p = previewDoor(s, { kind: 'elite', reward: 'boon' })
    expect(p?.floor).toBe(6)
    expect(previewDoor(s, { kind: 'rest', reward: 'sanity' })).toBeNull()
    expect(JSON.stringify(s)).toBe(frozen)
  })

  it('renders nothing without doors', () => {
    act(() => root.render(<DoorPicker state={atFloor(base)} onChoose={() => {}} />))
    expect(container.innerHTML).toBe('')
  })
})

describe('BoonPicker (S14)', () => {
  it('offers three Boons and picks one', () => {
    const onPick = vi.fn()
    const s = atFloor(base, {
      event: { kind: 'boon', floor: 5, options: ['ironVow', 'volley', 'warChest'] },
      sortie: { startFloor: 3, floors: 3, purse: 300, boons: ['calmMind'] },
    })
    act(() => root.render(<BoonPicker state={s} onPick={onPick} />))
    expect(container.querySelectorAll('.boon-option')).toHaveLength(3)
    expect(text()).toContain('between F5 and F6')
    expect(text()).toContain('Held this sortie (1/4):')
    act(() => button('Volley').click())
    expect(onPick).toHaveBeenCalledWith('volley')
  })
  it('ignores other events', () => {
    act(() => root.render(<BoonPicker state={atFloor(base, { event: { kind: 'bonus', floor: 5, options: ['rest'] } })} onPick={() => {}} />))
    expect(container.innerHTML).toBe('')
  })
})

describe('SortieBar (S15)', () => {
  it('shows the streak, the purse at risk, held Boons and the way home', () => {
    const onReturn = vi.fn()
    act(() => root.render(<SortieBar sortie={{ startFloor: 3, floors: 2, purse: 1250, boons: ['volley'] }} onReturn={onReturn} />))
    expect(text()).toContain('Sortie')
    expect(text()).toContain('2 floors')
    expect(text()).toContain('1,250')
    expect(text()).toContain('next clear +30% gold')
    expect(container.querySelector('.boon-icon')?.textContent).toBe('🏹')
    act(() => button('Return to campus (bank +1,250)').click())
    expect(onReturn).toHaveBeenCalled()
  })
})

describe('ScoutCard (S12)', () => {
  it('shows the kind, named threats, rout, Last Stand, mercy and a waiting Nemesis', () => {
    const s = atFloor(base)
    const r: ScoutReport = {
      ...scoutFloor(s)!,
      kind: 'elite',
      threats: [
        { name: 'Bone Choir ×3', why: 'heals each other' },
        { name: 'Ogre', why: 'opens with Cleave on your front row (~180)' },
        { name: 'Third', why: 'never shown' },
      ],
      rout: 2,
      lastStandPct: 0.15,
      mercyCapped: true,
      nemesis: 'Mira’s Bane',
    }
    const toggle = vi.fn()
    act(() => root.render(<ScoutCard state={s} report={r} onSuggest={() => {}} autoSweep onToggleSweep={toggle} />))
    expect(text()).toContain('Elite')
    expect(text()).toContain('Bone Choir ×3: heals each other')
    expect(text()).toContain('Ogre: opens with Cleave')
    expect(text()).not.toContain('never shown')
    expect(text()).toContain('The party breaks after 2 fall.')
    expect(text()).toContain('Last Stand +15%')
    expect(text()).toContain('The tower eases off')
    expect(text()).toContain('Mira’s Bane waits here.')
    act(() => button('Sweep easy floors: on').click())
    expect(toggle).toHaveBeenCalled()
  })
})
