// @vitest-environment jsdom
/**
 * WP5 smoke: the legacy of the fallen in the real UI — the bequest card on the results
 * screen, and the Memorial (Echoes waiting, the bell, the Banes, the plaques) opened from
 * the real App menu against the real engine.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createAccount, MemoryStorage, persist } from '../../engine/account'
import { attemptFloorWithResult, createStore, reduce } from '../../engine/store'
import { TUNING } from '../../engine/tuning'
import type { FloorResult, GameState, HeroId } from '../../engine/types'
import { App } from '../App'
import { ResultsScreen } from '../ResultsScreen'
import { getStore } from '../useGame'
import { setLocale } from '../i18n/i18n'
import { HeroProfile } from '../life/lifeWindows'
import { lifeOf } from '../../engine/life'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  window.localStorage.clear()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  setLocale('en')
})

/** A ten-hero roster sent up to floor 23, where some of the party falls. */
function deadlyAttempt(): { before: GameState; after: GameState; result: FloorResult } {
  for (let seed = 601; seed < 640; seed++) {
    let s: GameState = { ...createAccount(seed), gold: TUNING.gacha.normalCostGold * 9 }
    for (let i = 0; i < 9; i++) s = reduce(s, { type: 'SUMMON' })
    const ids = Object.values(s.heroes).map((h) => h.id).slice(0, 5)
    s = reduce(s, { type: 'SET_PARTY', slots: ids, lines: ['front', 'front', 'mid', 'back', 'back'] })
    s = { ...s, tower: { ...s.tower, currentFloor: 23, highestCleared: 22 } }
    const { state, result } = attemptFloorWithResult(s)
    const p = state.life.legacy.pending[0]
    if (result.fallenHeroIds.length > 0 && p && p.candidates.length > 0 && state.life.legacy.nemeses.length > 0) return { before: s, after: state, result }
  }
  throw new Error('no deadly seed found')
}

function storeWith(state: GameState) {
  const storage = new MemoryStorage()
  persist(storage, state)
  const store = createStore({ storage })
  store.load()
  return store
}

function buttons(text: string): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('button')).filter((b) => b.textContent?.includes(text))
}

describe('results: what they leave behind', () => {
  it('offers each fallen hero’s Echo to an heir, names the Bane, and passes the Echo on', () => {
    const { after, result } = deadlyAttempt()
    const store = storeWith(after)
    const render = () => act(() => root.render(<ResultsScreen result={result} state={store.getState()!} store={store} onContinue={() => {}} />))
    render()
    const text = container.textContent ?? ''
    const p = after.life.legacy.pending[0]!
    const first = p.fallenName.split(' ')[0]!
    expect(text).toContain('What they leave behind')
    expect(text).toContain(`Pass on ${first}’s resolve`)
    expect(text).toContain('Choose an heir:')
    expect(text).toMatch(/is marked now: .*’s Bane\. It waits on floor \d+\./)
    const heirs = container.querySelector('.bequest-card')!.querySelectorAll('.bq-heir')
    expect(heirs.length).toBeGreaterThan(0)
    expect(heirs.length).toBeLessThanOrEqual(TUNING.legacy.heirCandidates)
    // The Onward/Regroup button is still the results card's last button.
    const all = Array.from(container.querySelectorAll('.result-card button'))
    expect(all.at(-1)!.textContent).toMatch(/Onward|Regroup/)

    // Choose the first suggested heir.
    const heirId = p.candidates[0]!
    act(() => (heirs[0] as HTMLButtonElement).click())
    const s = store.getState()!
    expect(s.heroes[heirId]!.life!.echoes).toHaveLength(1)
    expect(s.life.legacy.pending.some((x) => x.fallenId === p.fallenId)).toBe(false)
    render()
    expect(container.textContent).toContain(`now carries the echo of ${first}.`)
    expect(container.textContent).toContain(`I carry ${first} with me.`)
  })

  it('renders nothing for a battle nobody died in', () => {
    const { state, result } = attemptFloorWithResult(createAccount(7))
    act(() => root.render(<ResultsScreen result={result} state={state} store={createStore()} onContinue={() => {}} />))
    expect(container.querySelector('.legacy-slot')).toBeNull()
  })
})

describe('the Memorial, from the real App', () => {
  function openMemorial(state: GameState, label = 'Memorial') {
    window.localStorage.setItem('pmu.save.v1', JSON.stringify({ schemaVersion: state.schemaVersion, savedAt: 0, state }))
    act(() => {
      getStore().load()
    })
    act(() => root.render(<App />))
    act(() => buttons('Menu')[0]!.click())
    const item = Array.from(container.querySelectorAll('button.menu-item')).find((b) => b.textContent?.includes(label))
    if (!item) throw new Error('no Memorial in the menu')
    act(() => (item as HTMLButtonElement).click())
  }

  it('shows the plaques, the Banes and the waiting Echoes, and answers the bell', () => {
    const { after } = deadlyAttempt()
    const withBell: GameState = { ...after, life: { ...after.life, legacy: { ...after.life.legacy, recruitTokens: 1 } } }
    openMemorial(withBell)
    const text = container.textContent ?? ''
    expect(text).toContain('The tower remembers: +')
    expect(text).toContain('Echoes waiting for an heir')
    expect(text).toContain('Banes')
    expect(text).toMatch(/’s Bane/)
    expect(text).toContain('How they died')
    expect(text).toContain('struck down by the')
    expect(text).toContain('What it taught')
    expect(text).toContain('A new face answers the bell.')
    expect(container.querySelectorAll('.grave-row').length).toBe(after.life.memorial.length)
    // Already in the Memorial: the cards do not tell the Master to come to the Memorial.
    expect(text).not.toContain('An unclaimed echo waits in the Memorial')

    const heroesBefore = Object.keys(getStore().getState()!.heroes).length
    const goldBefore = getStore().getState()!.gold
    act(() => buttons('Open the door')[0]!.click())
    const s = getStore().getState()!
    expect(Object.keys(s.heroes)).toHaveLength(heroesBefore + 1)
    expect(s.gold).toBe(goldBefore)
    expect(s.life.legacy.recruitTokens).toBe(0)
    expect(container.textContent).toMatch(/answers the bell\./)
    const newcomer = Object.values(s.heroes).find((h) => !(h.id in withBell.heroes))!
    expect(newcomer.star).toBeGreaterThanOrEqual(TUNING.legacy.recruit.minStar)

    // The newcomer is met through the Summon Theatre, one card, not on a plain card.
    const theatre = () => document.body.querySelector<HTMLElement>('.theatre')
    expect(theatre()).not.toBeNull()
    expect(theatre()!.querySelector('.theatre-deck')).toBeNull() // a single card: no deck row
    act(() => theatre()!.click()) // skip the ritual: the card is dealt face down
    expect(theatre()!.querySelector('.card-back')).not.toBeNull()
    act(() => theatre()!.click()) // turn it
    const card = theatre()!.querySelector('.person-card')
    expect(card?.textContent).toContain(newcomer.name)
    expect(card?.querySelector('.person-intro')?.textContent).toContain(newcomer.name)
    act(() => theatre()!.click()) // and move on
    expect(theatre()).toBeNull()
    expect(container.textContent).toContain(`${newcomer.name} answers the bell.`)
    // Focus comes back to the bell, not to nowhere.
    expect(container.querySelector('.recruit-bell')!.contains(document.activeElement)).toBe(true)
  })

  it('passes an Echo on from the Memorial, and lists who carries it', () => {
    const { after } = deadlyAttempt()
    openMemorial(after)
    const p = after.life.legacy.pending[0]!
    const heir = container.querySelector('.bequest-card .bq-heir') as HTMLButtonElement
    act(() => heir.click())
    const s = getStore().getState()!
    const carrier = Object.values(s.heroes).find((h) => (h.life?.echoes ?? []).some((e) => e.fromHeroId === p.fallenId))
    expect(carrier).toBeDefined()
    expect(container.textContent).toContain('Echoes carried')
    expect(container.textContent).toContain(`Echo of ${p.fallenName.split(' ')[0]}`)
    expect(container.textContent).toContain(`carried by`)
    void (carrier!.id as HeroId)
  })

  it('a fresh Master’s Memorial is just the empty lawn', () => {
    openMemorial(createAccount(9, { now: 0 }))
    const text = container.textContent ?? ''
    expect(text).toContain('The lawn is empty. Keep it that way, Master.')
    expect(text).not.toContain('The tower remembers')
    expect(container.querySelector('.bequest-card')).toBeNull()
    expect(container.querySelector('.recruit-bell')).toBeNull()
  })

  it('reads in French', () => {
    const { after } = deadlyAttempt()
    setLocale('fr')
    openMemorial(after, 'Mémorial')
    const text = container.textContent ?? ''
    expect(text).toContain('La tour se souvient')
    expect(text).toContain('Échos en attente d’un héritier')
    // "Le Fléau de Mira", or elided before a vowel: "Le Fléau d’Islat" (never "de Islat").
    expect(text).toMatch(/Le Fléau (de [^AEIOUYÉÈ]|d’)/)
    expect(text).not.toMatch(/Le Fléau de [AEIOUYÉÈ]/)
    expect(text).not.toContain('No one is visiting.')
    expect(text).not.toMatch(/\d\.\d %/) // "+2,5 %", never "+2.5 %"
  })
})

describe('the Echo on the heir’s profile (S21, integration)', () => {
  it('HeroProfile shows the "Echo of Mira" badge, in French too', () => {
    const s = createAccount(7)
    const hero = Object.values(s.heroes)[0]!
    const heir = {
      ...hero,
      life: { ...lifeOf(hero), echoes: [{ fromHeroId: 'h_mira' as HeroId, fromName: 'Mira Vey', stat: 'pAtk' as const, pct: 0.1, at: 0 }] },
    }
    const state: GameState = { ...s, heroes: { ...s.heroes, [hero.id]: heir } }
    const store = storeWith(state)
    act(() => root.render(<HeroProfile state={state} store={store} heroId={hero.id} onClose={() => {}} onFind={() => {}} />))
    expect(container.querySelector('.profile .echo-badge')!.textContent).toContain('Echo of Mira · +10% P.ATK')
    setLocale('fr')
    act(() => root.render(<HeroProfile state={state} store={store} heroId={hero.id} onClose={() => {}} onFind={() => {}} />))
    expect(container.querySelector('.profile .echo-badge')!.textContent).toMatch(/Mira/)
    expect(container.querySelector('.profile .echo-badge')!.textContent).not.toContain('Echo of')
  })
})
