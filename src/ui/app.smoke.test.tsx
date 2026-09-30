// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
import { App } from './App'
import { getStore } from './useGame'
import { setLocale } from './i18n/i18n'

/**
 * UI smoke test: mount the REAL App against the REAL engine in jsdom and verify
 * the reactive wiring (title → new account → game shell → summon → roster).
 * Rendering correctness beyond this is checked by eye in the dev server; the game
 * LOGIC is covered exhaustively by the engine suites.
 */

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  window.localStorage.clear()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

function clickButton(label: string) {
  const btn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(label))
  if (!btn) throw new Error(`no button "${label}" in: ${container.textContent}`)
  act(() => {
    btn.click()
  })
}

/** Open the game menu and fast-travel to a place (opens its window). */
function openPlace(label: string) {
  clickButton('Menu')
  const item = Array.from(container.querySelectorAll('button.menu-item')).find((b) => b.textContent?.includes(label))
  if (!item) throw new Error(`no menu place "${label}"`)
  act(() => {
    ;(item as HTMLButtonElement).click()
  })
}

function closeWindow() {
  const close = container.querySelector('button.pwin-close') as HTMLButtonElement
  act(() => {
    close.click()
  })
}

function mount() {
  act(() => {
    root.render(<App />)
  })
}

describe('App smoke', () => {
  it('renders the title screen for a fresh visitor', () => {
    mount()
    expect(container.textContent).toContain('Pick Me Up')
    expect(container.textContent).toContain('Begin')
  })

  it('creating an account drops the Master into the walkable lobby', () => {
    mount()
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 12345, now: 0 })
    })
    // The world HUD: Master Level, currencies, menu, controls help.
    expect(container.textContent).toContain('Master Lv 1')
    expect(container.textContent).toContain('15,000') // starting gold
    expect(container.textContent).toContain('1 hero')
    expect(container.textContent).toContain('Menu')
    expect(container.querySelector('canvas.world-canvas')).not.toBeNull()
  })

  it('the Menu lists every place and fast-travels into the Kitchen window', () => {
    mount()
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 777, now: 0 })
    })
    openPlace('Kitchen')
    // Kitchen window + its interactive Banquet action.
    expect(container.textContent).toContain('Kitchen')
    expect(container.textContent).toContain('Banquet')
    // Fresh starter is at full Sanity → Banquet is offered but reads as not-needed.
    expect(container.textContent).toContain('full morale')
    const banquetBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Banquet'),
    )
    expect(banquetBtn).toBeDefined()
    expect((banquetBtn as HTMLButtonElement).disabled).toBe(true)
    // Facility upgrades surface; a fresh ML1 account is gated at the ML ceiling.
    expect(container.textContent).toContain('Raise Master Level to upgrade')
  })

  it('the Promotion Chamber, Tactical Center and Daily Dungeon open from the Menu', () => {
    mount()
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 778, now: 0 })
    })
    openPlace('Promotion Chamber')
    // the fresh 1★ starter is not at cap, so it prompts to climb; the build is ML-gated.
    expect(container.textContent).toContain('star cap')
    expect(container.textContent).toContain(`Unlocks at Master Lv ${3}`)
    closeWindow()

    openPlace('Tactical Center')
    expect(container.textContent).toContain('Focus damage')
    expect(container.textContent).toContain('Overlook slots')
    closeWindow()

    openPlace('Daily Dungeon')
    expect(container.textContent).toContain('to unlock')
  })

  it('the lobby pumps the world clock on an interval (timers advance while watching)', () => {
    vi.useFakeTimers({ now: 1000 })
    try {
      mount()
      act(() => {
        getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 1, now: 0 })
      })
      expect(getStore().getState()!.meta.lastSeenAtWorld).toBe(0)
      act(() => {
        vi.advanceTimersByTime(2500) // a couple of interval ticks
      })
      // A TICK fired → advanceTime ran → the world clock moved forward.
      expect(getStore().getState()!.meta.lastSeenAtWorld).toBeGreaterThan(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('summoning reveals a hero and spends gold', () => {
    mount()
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 999, now: 0 })
    })
    const before = getStore().getState()!.gold
    const heroesBefore = Object.keys(getStore().getState()!.heroes).length
    act(() => {
      getStore().dispatch({ type: 'SUMMON' })
    })
    const after = getStore().getState()!
    expect(after.gold).toBe(before - 3000)
    expect(Object.keys(after.heroes).length).toBe(heroesBefore + 1)
  })

  it('the Synthesis Chamber renders, gated by Master Level', () => {
    mount()
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 2024, now: 0 })
    })
    openPlace('Synthesis Chamber')
    expect(container.textContent).toContain('Synthesis Chamber')
    // …but a fresh ML1 account sees it locked.
    expect(container.textContent).toContain('Unlocks at Master Lv 3')
  })

  it('the Forge (Armory) renders, gated by Master Level', () => {
    mount()
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 4242, now: 0 })
    })
    openPlace('Forge')
    expect(container.textContent).toContain('Armory')
    // …but a fresh ML1 account sees the forge locked (the Smithy opens at ML2).
    expect(container.textContent).toContain('Unlocks at Master Lv 2')
  })

  it("the Roster lists each hero's skills with grade and level", () => {
    mount()
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 31, now: 0 })
    })
    openPlace('Roster')
    // The starter (Islat Han) owns Power Strike, Berserk and Composure at Lv1.
    const chips = Array.from(container.querySelectorAll('.skill-chip')).map((c) => c.textContent)
    expect(chips).toContain('CPower StrikeLv 1')
    expect(chips).toContain('DBerserkLv 1')
    expect(chips).toContain('DComposureLv 1')
  })

  it('the Training Center opens from the Menu, gated at Master Lv 2', () => {
    mount()
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 32, now: 0 })
    })
    openPlace('Training Center')
    expect(container.textContent).toContain('never stats or level')
    expect(container.textContent).toContain('Build the Training Center to start drills')
    expect(container.textContent).toContain('Unlocks at Master Lv 2')
  })
})

describe('App smoke — Layer 1 completion', () => {
  it('the Transfer Station opens from the Menu, gated at Master Lv 4', () => {
    mount()
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 33, now: 0 })
    })
    openPlace('Transfer Station')
    expect(container.textContent).toContain('A skill can leave one hero')
    expect(container.textContent).toContain('Build the Transfer Station')
    expect(container.textContent).toContain('Unlocks at Master Lv 4')
  })

  it('the Summon screen offers the Advanced pool, disabled without gems', () => {
    mount()
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 34, now: 0 })
    })
    openPlace('Mobius Summon')
    clickButton('Advanced')
    expect(container.textContent).toContain('Advanced pool')
    const ten = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Summon ×10'))
    expect((ten as HTMLButtonElement).disabled).toBe(true)
    expect(container.textContent).toContain('Not enough gems')
  })
})

describe('App smoke — the summon reveal', () => {
  it('the free ten-pull reveals one hero at a time; Skip lands on a sorted lineup', () => {
    vi.useFakeTimers({ now: 1000 })
    try {
      mount()
      act(() => {
        getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 36, now: 0 })
      })
      openPlace('Mobius Summon')
      clickButton('Summon ×10')
      // The pull is already saved; the reveal is cosmetic and starts at hero 1 of 10.
      expect(Object.keys(getStore().getState()!.heroes).length).toBe(11)
      expect(container.querySelector('.sr')).not.toBeNull()
      expect(container.textContent).toContain('1 / 10')
      // The beam resolves into a card on its own…
      act(() => {
        vi.advanceTimersByTime(5000)
      })
      expect(container.querySelector('.sr-card')).not.toBeNull()
      // …and Space moves on to the next hero.
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }))
      })
      expect(container.textContent).toContain('2 / 10')
      clickButton('Skip ▸▸')
      expect(container.textContent).toContain('10 new heroes answer the call')
      const minis = Array.from(container.querySelectorAll('.sr-mini'))
      expect(minis.length).toBe(10)
      const starsOf = (el: Element) => (el.querySelector('.stars')?.textContent ?? '').length
      const stars = minis.map(starsOf)
      expect(stars).toEqual([...stars].sort((a, b) => b - a)) // best first
      expect(container.querySelectorAll('.sr-mini.best').length).toBe(1)
      clickButton('Done')
      expect(container.querySelector('.sr')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('Esc skips straight to the lineup, whose Registry button leaves the summon scene', () => {
    vi.useFakeTimers({ now: 1000 })
    try {
      mount()
      act(() => {
        getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 37, now: 0 })
      })
      openPlace('Mobius Summon')
      clickButton('Summon ·')
      expect(container.textContent).toContain('1 / 1')
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      })
      expect(container.textContent).toContain('A new hero answers the call')
      clickButton('Hero Registry')
      expect(container.querySelector('.sr')).toBeNull()
      expect(container.textContent).toContain('click a card for full stats')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('App smoke — the full climb', () => {
  it('the Tower shows its acts, an open event blocks Enter, and resolving it continues', () => {
    mount()
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 35, now: 0 })
    })
    // Put the account right after F5 with a bonus event open (as a first clear would), via a save.
    const s = getStore().getState()!
    const withEvent = {
      ...s,
      tower: { ...s.tower, currentFloor: 6, highestCleared: 5, event: { kind: 'bonus' as const, floor: 5, options: ['rest', 'treasure', 'merchant', 'gamble'] } },
    }
    window.localStorage.setItem('pmu.save.v1', JSON.stringify({ schemaVersion: withEvent.schemaVersion, savedAt: 0, state: withEvent }))
    act(() => {
      getStore().load()
    })
    openPlace('Tower Gate')
    expect(container.textContent).toContain('Act VIII — The Unfinished Floors')
    expect(container.textContent).toContain('Event Floor')
    expect(container.textContent).toContain('Chronicle')
    const enter = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Enter'))
    expect((enter as HTMLButtonElement).disabled).toBe(true)
    clickButton('Treasure')
    expect(getStore().getState()!.tower.event).toBeNull()
    expect(container.textContent).toContain('Onward')
  })
})

describe('App smoke — the meta-economy', () => {
  it('the Gem Shop opens from the Menu, says money is simulated, and pays the daily login', () => {
    mount()
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 36, now: 0 })
    })
    openPlace('Gem Shop')
    expect(container.textContent).toContain('money here is simulated')
    expect(container.textContent).toContain('Monthly Package')
    const gems = getStore().getState()!.gems
    clickButton('Claim +50')
    expect(getStore().getState()!.gems).toBe(gems + 50)
  })

  it('the Hall of Magic and the Crack of Time open, gated by PI and Master Level', () => {
    mount()
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 37, now: 0 })
    })
    openPlace('Hall of Magic')
    expect(container.textContent).toContain('Probability Interference')
    closeWindow()
    openPlace('Crack of Time')
    expect(container.textContent).toContain('Opens at Master Lv 20')
  })

  it('the Roster shows a hero’s bond: favor, gifts and (locked) interventions', () => {
    mount()
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 38, now: 0 })
    })
    openPlace('Roster')
    const card = container.querySelector('.card.click') as HTMLElement
    act(() => {
      card.click()
    })
    expect(container.textContent).toContain('Neutral')
    expect(container.textContent).toContain('Honey Cake')
    expect(container.textContent).toContain('Only a Devoted hero')
    clickButton('Honey Cake')
    expect(Object.values(getStore().getState()!.heroes)[0]!.gift.last).toBe('honey_cake')
  })
})

describe('App smoke — PvP & social', () => {
  it('the Guild Hall lists guilds; the whale guilds turn away a Master who has not spent', () => {
    mount()
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 39, now: 0 })
    })
    openPlace('Guild Hall')
    expect(container.textContent).toContain('Unity Society')
    expect(container.textContent).toContain('Morning Star')
    const rows = Array.from(container.querySelectorAll('.guild-panel .drill-row'))
    const whaleJoin = rows.find((r) => r.textContent?.includes('Unity Society'))!.querySelector('button') as HTMLButtonElement
    expect(whaleJoin.disabled).toBe(true)
    const join = rows.find((r) => r.textContent?.includes('Morning Star'))!.querySelector('button') as HTMLButtonElement
    act(() => {
      join.click()
    })
    expect(getStore().getState()!.pvp.guild).toBe('morning_star')
  })

  it('with the crack open, the rift window shows raid targets, the defense and captives', () => {
    mount()
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 40, now: 0 })
    })
    const s = getStore().getState()!
    const open = { ...s, meta: { ...s.meta, crackOpen: true, pi: 300 } }
    window.localStorage.setItem('pmu.save.v1', JSON.stringify({ schemaVersion: open.schemaVersion, savedAt: 0, state: open }))
    act(() => {
      getStore().load()
    })
    openPlace('Crack of Time')
    expect(container.textContent).toContain('Other Masters')
    expect(container.textContent).toContain('Sector 1')
    expect(container.querySelectorAll('.pvp-panel .drill-row').length).toBeGreaterThan(0)
    clickButton('Captives')
    expect(container.textContent).toContain('No one has been taken')
  })

  it('a deleted (greyed) account offers only a new Master', () => {
    mount()
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 41, now: 0 })
    })
    const s = getStore().getState()!
    const gone = { ...s, meta: { ...s.meta, deleted: true } }
    window.localStorage.setItem('pmu.save.v1', JSON.stringify({ schemaVersion: gone.schemaVersion, savedAt: 0, state: gone }))
    act(() => {
      getStore().load()
    })
    expect(container.textContent).toContain('The waiting room has greyed')
  })
})

describe('App smoke — French', () => {
  it('the Menu switches the whole game to French and back', () => {
    mount()
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 99, now: 0 })
    })
    try {
      clickButton('Menu')
      clickButton('Français')
      // The menu itself re-renders in French…
      expect(container.textContent).toContain('Cuisine')
      expect(container.textContent).toContain('Salle de magie')
      expect(container.textContent).toContain('English')
      const kitchen = Array.from(container.querySelectorAll('button.menu-item')).find((b) => b.textContent?.includes('Cuisine'))
      act(() => {
        ;(kitchen as HTMLButtonElement).click()
      })
      // …and so does a facility window.
      expect(container.textContent).toContain('Banquet')
      expect(container.textContent).toContain('moral au maximum')
      closeWindow()
      expect(container.textContent).toContain('Maître Niv. 1')
      clickButton('Menu')
      clickButton('English')
      expect(container.textContent).toContain('Kitchen')
    } finally {
      act(() => setLocale('en'))
    }
  })
})

describe('App smoke — New game from the Menu', () => {
  it('Erase really erases: back to the title, and the lobby clock cannot re-save the old game', () => {
    vi.useFakeTimers({ now: 1000 })
    try {
      mount()
      act(() => {
        getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 4242, now: 0 })
      })
      expect(window.localStorage.getItem('pmu.save.v1')).not.toBeNull()
      clickButton('Menu')
      clickButton('New game')
      clickButton('Erase')
      act(() => {
        vi.advanceTimersByTime(5000) // any leftover lobby ticks
      })
      expect(getStore().getState()).toBeNull()
      expect(window.localStorage.getItem('pmu.save.v1')).toBeNull()
      expect(container.textContent).toContain('Begin')
      // And a fresh Master starts from nothing.
      clickButton('Begin')
      expect(getStore().getState()!.tower.highestCleared).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('App smoke — Isel’s advice', () => {
  it('suggests who suits which job, and Assign puts them to work', () => {
    mount()
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 77, now: 0 })
      getStore().dispatch({ type: 'ADD_GOLD', amount: 30_000 })
      for (let i = 0; i < 9; i++) getStore().dispatch({ type: 'SUMMON' })
    })
    clickButton('Advice')
    expect(container.textContent).toContain('Isel’s advice')
    expect(container.textContent).toMatch(/would make a good \w+ in the/)
    const row = Array.from(container.querySelectorAll('li.advice-job'))[0] as HTMLElement
    const assign = Array.from(row.querySelectorAll('button')).find((b) => b.textContent === 'Assign') as HTMLButtonElement
    act(() => {
      assign.click()
    })
    const employed = Object.values(getStore().getState()!.heroes).filter((h) => h.life?.job)
    expect(employed.length).toBeGreaterThan(0)
  })
})
