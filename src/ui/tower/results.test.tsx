// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { TUNING } from '../../engine/tuning'
import { defaultLegacyState } from '../../engine/life'
import type { FloorResult, GameState, HeroId } from '../../engine/types'
import { ResultsScreen, type ResultsScreenProps } from '../ResultsScreen'
import { levelsOf } from './rewards'
import { atFloor, clearedF1 } from './fixtures'
import { setPrefs } from '../prefs'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root
beforeEach(() => {
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

const text = () => container.textContent ?? ''
const buttons = () => Array.from(container.querySelectorAll('button'))
const button = (label: string) => {
  const b = buttons().find((x) => x.textContent?.includes(label))
  if (!b) throw new Error(`no button "${label}" in: ${text()}`)
  return b
}
function render(props: Partial<ResultsScreenProps> & { result: FloorResult; state: GameState }) {
  act(() => root.render(<ResultsScreen onContinue={() => {}} {...props} />))
}
function settle() {
  act(() => {
    vi.advanceTimersByTime(5000)
  })
}

/** The real F1 clear, dressed with WP3/WP5 fields the climb engine will fill in. */
function setup(over: Partial<FloorResult> = {}, tower: Partial<GameState['tower']> = {}) {
  const { state: post, result } = clearedF1()
  const hero = Object.values(post.heroes)[0]!
  // Pretend the starter was a level lower before the fight, so a level-up row shows.
  const preLevels = { ...levelsOf(post), [hero.id]: hero.xp.level - 1 }
  // Neutral climb fields (no Sortie, no Doors, no bonuses) unless a test sets them, so the
  // fixtures read the same whether or not the climb engine (WP3) fills them in.
  const state = atFloor(post, { currentFloor: 2, highestCleared: 1, sortie: null, doors: null, ...tower })
  const res: FloorResult = {
    ...result,
    goldAwarded: 480,
    materialsAwarded: { promotionStone: 2, rankMaterial: 1 },
    sortieBonus: 0,
    restedBonus: 0,
    routed: false,
    nemesisDefeated: [],
    ...over,
  }
  return { state, result: res, hero, preLevels }
}

describe('ResultsScreen — the reward cascade (S11)', () => {
  it('shows materials won and a level-up row from the pre-fight levels', () => {
    const { state, result, hero, preLevels } = setup()
    render({ state, result, preLevels })
    expect(text()).toContain('Materials won')
    expect(text()).toContain('+2 🪨 Stone')
    expect(text()).toContain('+1 📦 Rank Mat')
    const first = hero.name.split(/\s+/)[0]!
    expect(text()).toContain(`${first} Lv ${hero.xp.level - 1}→${hero.xp.level}`)
    expect(container.querySelector('.lvl-row img')).not.toBeNull()
  })

  it('counts the gold up to the exact amount the attempt paid', () => {
    const { state, result } = setup()
    render({ state, result, goldBefore: state.gold - 1234 })
    expect(text()).toContain('+0')
    settle()
    const gold = container.querySelector('.reward-row .r .n')!.textContent!
    expect(gold.startsWith(`+${(1234).toLocaleString()}`)).toBe(true)
    expect(text()).toContain(`+${result.xpAwarded}`)
  })

  it('shows the final numbers at once when shown again (instant)', () => {
    const { state, result } = setup()
    render({ state, result, instant: true })
    expect(container.querySelector('.reward-row .r .n')!.textContent).toBe('+480')
    expect(container.querySelector('.result-card.cascade')).toBeNull()
  })

  it('separates the Skull door, Pent-up Interference and streak lines, and says why', () => {
    const { state, result } = setup(
      { kind: 'elite', restedBonus: 240, sortieBonus: 48 },
      { sortie: { startFloor: 1, floors: 2, purse: 96, boons: [] } },
    )
    render({ state, result })
    expect(text()).toContain('Elite')
    expect(text()).toContain('Skull door: ×2 gold')
    expect(text()).toContain('Pent-up Interference: +240 gold')
    expect(text()).toContain('Streak bonus: +48 into the purse')
    expect(text()).toContain('◆ 96 at risk')
    expect(text()).toContain('Because…')
    expect(text()).toContain('Skull door: ×2 gold and +2 stones.')
    expect(text()).toMatch(/MVP: \S+ · [\d,]+ damage/)
  })

  it('fills the "Next summon" bar and offers "Summon now!" when affordable', () => {
    const { state, result } = setup()
    const onGo = vi.fn()
    render({ state: { ...state, gold: TUNING.gacha.normalCostGold + 10 }, result, goldBefore: TUNING.gacha.normalCostGold - 470, onGo })
    expect(text()).toContain('Toward the next summon')
    act(() => button('Summon now').click())
    expect(onGo).toHaveBeenCalledWith('summon')
  })

  it('says how much gold is missing when a summon is out of reach', () => {
    const { state, result } = setup()
    render({ state: { ...state, gold: 1000 }, result, goldBefore: 520, onGo: () => {} })
    expect(text()).toContain(`${(TUNING.gacha.normalCostGold - 1000).toLocaleString()} more gold`)
    expect(buttons().some((b) => b.textContent?.includes('Summon now'))).toBe(false)
  })

  it('offers to bank the purse and summon when the purse would cover the rest', () => {
    const cost = TUNING.gacha.normalCostGold
    const { state, result } = setup({}, { sortie: { startFloor: 3, floors: 2, purse: 600, boons: [] } })
    const onGo = vi.fn()
    render({ state: { ...state, gold: cost - 400 }, result, goldBefore: cost - 880, onGo })
    act(() => button('Bank +600 and summon').click())
    expect(onGo).toHaveBeenCalledWith('summon')
  })

  it('with a Sortie running, an affordable summon still says it banks the purse, and how much', () => {
    const cost = TUNING.gacha.normalCostGold
    const { state, result } = setup({}, { sortie: { startFloor: 3, floors: 2, purse: 600, boons: ['warChest'] } })
    const onGo = vi.fn()
    render({ state: { ...state, gold: cost + 10 }, result, goldBefore: cost - 470, onGo })
    expect(buttons().some((b) => b.textContent?.includes('Summon now'))).toBe(false)
    const cta = button('Bank +600 and summon')
    expect(cta.getAttribute('title')).toContain('Boons fade')
    act(() => cta.click())
    expect(onGo).toHaveBeenCalledWith('summon')
  })

  it('an empty Sortie (a first-floor retreat: no purse, no Boons) keeps "Summon now", never "Bank +0"', () => {
    const cost = TUNING.gacha.normalCostGold
    const { state, result } = setup({}, { sortie: { startFloor: 3, floors: 0, purse: 0, boons: [] } })
    const onGo = vi.fn()
    render({ state: { ...state, gold: cost + 10 }, result, goldBefore: cost - 470, onGo })
    expect(buttons().some((b) => b.textContent?.includes('Bank +0'))).toBe(false)
    act(() => button('Summon now').click())
    expect(onGo).toHaveBeenCalledWith('summon')
  })

  it('does not offer the bank-and-summon when even the purse falls short', () => {
    const cost = TUNING.gacha.normalCostGold
    const { state, result } = setup({}, { sortie: { startFloor: 3, floors: 2, purse: 100, boons: [] } })
    render({ state: { ...state, gold: cost - 400 }, result, goldBefore: cost - 880, onGo: () => {} })
    expect(buttons().some((b) => b.textContent?.includes('and summon'))).toBe(false)
    expect(text()).toContain('400 more gold')
  })

  it('prices revenge gold like the engine, by the world grade', () => {
    const { state, result } = setup({ nemesisDefeated: ['nem_1'] })
    const nem = {
      id: 'nem_1',
      name: 'Mira’s Bane',
      heroName: 'Mira',
    } as unknown as GameState['life']['legacy']['nemeses'][number]
    const s: GameState = { ...state, worldGrade: 'B', life: { ...state.life, legacy: { ...defaultLegacyState(), nemeses: [nem] } } }
    render({ state: s, result })
    const n = Math.round(TUNING.legacy.nemesis.rewardGoldPerFloor * result.floor * TUNING.tower.worldMult.B!)
    expect(text()).toContain(`Revenge on Mira’s Bane: +${n.toLocaleString()} gold`)
  })

  it('teases the next floor', () => {
    const { state, result } = setup({}, { currentFloor: 7 })
    render({ state, result })
    expect(text()).toContain('Next: Floor 7')
  })

  it('marks a Sweep and offers the full replay', () => {
    const { state, result } = setup()
    const onReplay = vi.fn()
    render({ state, result, swept: true, onReplay })
    expect(text()).toContain('Swept: an easy floor, nobody lost.')
    act(() => button('Watch full replay').click())
    expect(onReplay).toHaveBeenCalled()
  })

  it('plays the "Avenged!" banner for a defeated Nemesis', () => {
    const { state: base, result } = setup({ nemesisDefeated: ['nem_1'] })
    const state: GameState = {
      ...base,
      life: {
        ...base.life,
        legacy: {
          ...defaultLegacyState(),
          nemeses: [
            {
              id: 'nem_1',
              templateId: 'goblin',
              name: 'Mira’s Bane',
              element: 'fire',
              level: 4,
              heroId: 'h_gone' as HeroId,
              heroName: 'Mira',
              diedFloor: 1,
              revengeFloor: 1,
              status: 'avenged',
            },
          ],
        },
      },
    }
    render({ state, result })
    expect(text()).toContain('AVENGED!')
    expect(text()).toContain('Mira’s Bane has fallen. Mira can rest now.')
    expect(text()).toContain('Revenge on Mira’s Bane')
  })
})

describe('ResultsScreen — small print', () => {
  it('gives two fighters who share a first name their full names', () => {
    const { state, result, hero, preLevels } = setup()
    const twin = { ...hero, id: 'h_twin' as HeroId, name: `${hero.name.split(/\s+/)[0]} Otherkin` }
    const s: GameState = { ...state, heroes: { ...state.heroes, [twin.id]: twin } }
    const r: FloorResult = { ...result, result: { ...result.result, survivorHeroIds: [hero.id, twin.id] } }
    render({ state: s, result: r, preLevels: { ...preLevels, [twin.id]: twin.xp.level - 1 } })
    expect(text()).toContain(`${hero.name} Lv`)
    expect(text()).toContain(`${twin.name} Lv`)
  })

  it('names a waiting Boon once, in the teaser', () => {
    const boon = { kind: 'boon' as const, floor: 1, options: ['volley', 'warChest', 'calmMind'] }
    const { state, result } = setup({ event: boon }, { event: boon })
    render({ state, result })
    expect(text()).toContain('Next: choose a Boon, then Floor 2.')
    expect(text()).not.toContain('The tower offers a Boon before the next climb.')
  })

  it('counts Pent-up Interference charges in the singular too', () => {
    const { state, result } = setup({ restedBonus: 240 })
    render({ state: { ...state, meta: { ...state.meta, rested: { charges: 1, carryWorld: 0 } } }, result })
    expect(text()).toContain('1 charge left')
    expect(text()).not.toContain('1 charges')
  })

  it('honours the in-game reduced-motion preference: no cascade, no coins, final numbers', () => {
    setPrefs({ reducedMotion: true })
    try {
      const { state, result } = setup()
      render({ state, result, goldBefore: state.gold - 480 })
      expect(container.querySelector('.results-overlay.motion-off')).not.toBeNull()
      expect(container.querySelector('.result-card.cascade')).toBeNull()
      expect(container.querySelector('.coin-fx')).toBeNull()
      expect(container.querySelector('.reward-row .r .n')!.textContent!.startsWith('+480')).toBe(true)
    } finally {
      setPrefs({ reducedMotion: false })
    }
  })
})

describe('ResultsScreen — the next decision, one click away', () => {
  it('offers the Doors right on the card, and takes the chosen one', () => {
    const { state, result } = setup({}, { doors: [{ kind: 'path', reward: 'gold' }, { kind: 'elite', reward: 'boon' }] })
    const onChooseDoor = vi.fn()
    const onContinue = vi.fn()
    render({ state, result, onChooseDoor, onContinue })
    expect(text()).toContain('Choose the next door')
    expect(buttons().some((b) => /Enter|Treasure/.test(b.textContent ?? ''))).toBe(false)
    act(() => button('Skull').click())
    expect(onChooseDoor).toHaveBeenCalledWith(1)
    act(() => button('Look around first').click())
    expect(onContinue).toHaveBeenCalled()
  })

  it('brings the Doors into view once the cascade has played, when they sit below the fold', () => {
    const { state, result } = setup({}, { doors: [{ kind: 'path', reward: 'gold' }, { kind: 'elite', reward: 'boon' }] })
    const scrolled: Element[] = []
    const proto = HTMLElement.prototype as unknown as { scrollIntoView?: unknown; getBoundingClientRect: () => DOMRect }
    const hadScroll = 'scrollIntoView' in proto
    const oldScroll = proto.scrollIntoView
    const oldRect = proto.getBoundingClientRect
    proto.scrollIntoView = function (this: Element) {
      scrolled.push(this)
    }
    proto.getBoundingClientRect = function (this: Element) {
      // The decision block ends far below a laptop screen.
      return { top: 900, bottom: 1400, left: 0, right: 400, width: 400, height: 500, x: 0, y: 900, toJSON: () => ({}) } as DOMRect
    }
    try {
      render({ state, result, onChooseDoor: vi.fn(), onReturnToCampus: vi.fn() })
      expect(scrolled).toHaveLength(0)
      settle()
      expect(scrolled.map((e) => e.className)).toEqual(['results-next'])
    } finally {
      if (hadScroll) proto.scrollIntoView = oldScroll
      else delete proto.scrollIntoView
      proto.getBoundingClientRect = oldRect
    }
  })

  it('names the campus places this clear opened, at the moment they are earned', () => {
    const { state, result } = setup()
    // Before the fight nothing scheduled was open; the F1 clear opens the Kitchen & co.
    render({ state, result, preOpen: [] })
    settle()
    expect(text()).toContain('New on campus: ')
    expect(text()).toContain('Kitchen')
    // Shown once: when everything was already open there is no such line.
    act(() => root.unmount())
    root = createRoot(container)
    render({ state, result, preOpen: ['kitchen', 'memorial', 'daily'] })
    settle()
    expect(text()).not.toContain('New on campus')
  })

  it('asks "Press on" or "Return to campus" during a Sortie', () => {
    const { state, result } = setup({}, { sortie: { startFloor: 1, floors: 1, purse: 150, boons: [] } })
    const onContinue = vi.fn()
    const onReturnToCampus = vi.fn()
    render({ state, result, onContinue, onReturnToCampus })
    act(() => button('Press on').click())
    expect(onContinue).toHaveBeenCalled()
    act(() => button('Return to campus (bank +150)').click())
    expect(onReturnToCampus).toHaveBeenCalled()
  })

  it('points at the Boon when one is waiting', () => {
    const { state, result } = setup({}, { event: { kind: 'boon', floor: 1, options: ['volley', 'warChest', 'calmMind'] } })
    render({ state, result })
    expect(button('Choose a Boon').className).toContain('primary')
  })

  it('reports a rout and what the purse kept', () => {
    const { state, result } = setup({ cleared: false, routed: true, fallenHeroIds: [] }, { sortie: null })
    const routed: FloorResult = { ...result, result: { ...result.result, outcome: 'retreat' } }
    render({ state, result: routed, preSortie: { startFloor: 1, floors: 3, purse: 400, boons: [] } })
    expect(text()).toContain('ROUTED')
    expect(text()).toContain('Sortie over: 200 of the ◆ 400 purse was saved.')
    expect(button('Regroup')).toBeTruthy()
  })

  it('keeps a plain card to one button when the host wires nothing else', () => {
    const { state, result } = setup()
    render({ state, result })
    expect(buttons()).toHaveLength(1)
    expect(text()).toContain('A summon is ready')
  })
})
