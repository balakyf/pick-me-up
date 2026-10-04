// @vitest-environment jsdom
/**
 * Lane N: the one hero sheet (tabs, gear, the fallen), the bus that opens it from anywhere,
 * the shared picker's refusals, the advisor's "Promote…" opening the planner, the Party
 * Board's swap, the dev-only cameo reveal and the gear words.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { createAccount } from '../../engine/account'
import { summonMany } from '../../engine/gacha'
import { reduce, type Store } from '../../engine/store'
import { itemName, nextEquipmentId, statBlockFor } from '../../engine/equipment'
import type { Command, EquipmentItem, GameState, HeroId, OwnedHero } from '../../engine/types'
import type { Advice } from '../../engine/advisor'
import { HeroSheet } from './HeroSheet'
import { HeroSheetHost } from './HeroSheetHost'
import { HeroPicker } from './HeroPicker'
import { openHeroSheet, openPromotionPlanner, resetSheetBus, useSheetBus } from './sheetBus'
import { busyRefusal, promoteRefusal, sacrificeRefusal } from './refusals'
import { devCameo } from './DevCameo'
import { AdviceWindow } from '../life/Advisor'
import { PartyScreen } from '../party/PartyScreen'
import { deltaText, itemLabel } from '../facilities/gearText'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let host: HTMLDivElement | null = null
function render(node: JSX.Element): HTMLDivElement {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(node))
  return host
}
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  resetSheetBus()
})

/** A tiny store over the pure reducer (what the UI dispatches is what the engine does). */
function fakeStore(s0: GameState): Store & { sent: Command[] } {
  let cur = s0
  const sent: Command[] = []
  return {
    sent,
    getState: () => cur,
    dispatch: (cmd: Command, now = 0) => {
      sent.push(cmd)
      cur = reduce(cur, cmd, now)
      return cur
    },
    subscribe: () => () => undefined,
  } as unknown as Store & { sent: Command[] }
}

function account(): { s: GameState; ids: HeroId[] } {
  let s: GameState = { ...createAccount(23, { now: 0 }), gold: 1_000_000 }
  s = summonMany(s, 'normal', 10).state
  return { s, ids: (Object.values(s.heroes) as OwnedHero[]).filter((h) => h.alive).map((h) => h.id) }
}
function give(s: GameState, slot: EquipmentItem['slot'], grade: EquipmentItem['grade']): GameState {
  const item: EquipmentItem = { id: nextEquipmentId(s.inventory), slot, grade, name: itemName(slot, grade), statBonus: statBlockFor(slot, grade) }
  return { ...s, inventory: [...s.inventory, item] }
}
const click = (el: Element | null | undefined) => act(() => (el as HTMLElement).click())
const button = (root: HTMLElement, text: string) => Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.includes(text))

describe('the hero sheet', () => {
  it('has five tabs, each with its panel', () => {
    const { s, ids } = account()
    const el = render(<HeroSheet state={s} store={fakeStore(s)} heroId={ids[0]!} onClose={() => undefined} />)
    const tabs = Array.from(el.querySelectorAll('[role=tab]')).map((b) => b.textContent)
    expect(tabs).toEqual(['Overview', 'Stats', 'Skills', 'Gear', 'Story'])
    expect(el.querySelector('[role=tab][aria-selected=true]')!.textContent).toBe('Overview')
    expect(el.textContent).toContain('Morale')
    click(button(el, 'Stats'))
    expect(el.textContent).toContain('True CP')
    expect(el.textContent).toContain('Growth grades')
    click(button(el, 'Skills'))
    expect(el.textContent).toContain('Merges')
    click(button(el, 'Story'))
    expect(el.textContent).toContain('Before the summon')
    expect(el.textContent).toContain('Memories')
    click(button(el, 'Gear'))
    expect(el.textContent).toContain('Equip best')
  })

  it('the arrow keys move between tabs', () => {
    const { s, ids } = account()
    const el = render(<HeroSheet state={s} store={fakeStore(s)} heroId={ids[0]!} onClose={() => undefined} />)
    act(() => el.querySelector('[role=tablist]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })))
    expect(el.querySelector('[role=tab][aria-selected=true]')!.textContent).toBe('Story')
  })

  it('the Gear tab equips the best free gear in one click (EQUIP_BEST)', () => {
    let { s, ids } = account()
    s = give(give(s, 'armor', 'C'), 'weapon', 'D')
    const store = fakeStore(s)
    const el = render(<HeroSheet state={s} store={store} heroId={ids[0]!} tab="gear" onClose={() => undefined} />)
    click(button(el, 'Equip best'))
    expect(store.sent).toEqual([{ type: 'EQUIP_BEST', heroId: ids[0] }])
    const h = store.getState()!.heroes[ids[0]!]!
    expect(h.equipment.armor).not.toBeNull()
    expect(h.equipment.weapon).not.toBeNull()
  })

  it('compare lists the slot’s other items with their deltas', () => {
    let { s, ids } = account()
    s = give(s, 'weapon', 'B')
    const el = render(<HeroSheet state={s} store={fakeStore(s)} heroId={ids[0]!} tab="gear" onClose={() => undefined} />)
    click(Array.from(el.querySelectorAll('.gear-slot-actions button')).find((b) => b.textContent?.includes('Compare')))
    const row = el.querySelector('.gear-cmp-row')!
    expect(row.textContent).toContain('B Blade')
    expect(row.querySelector('.gear-deltas .up')!.textContent).toMatch(/^\+\d+ P\.ATK$/)
  })

  it('a fallen hero’s sheet opens on their grave and last words', () => {
    const { s: s0, ids } = account()
    const h = s0.heroes[ids[0]!]!
    const s: GameState = {
      ...s0,
      heroes: { ...s0.heroes, [h.id]: { ...h, alive: false } },
      life: {
        ...s0.life,
        memorial: [
          { heroId: h.id, name: h.name, star: h.star, level: 5, heroClass: h.heroClass, element: h.element, portraitToken: h.portraitToken, cause: 'battle', floor: 12, day: 1, daysServed: 1, bestFloor: 12, mourners: [] },
        ],
      },
    }
    const el = render(<HeroSheet state={s} store={fakeStore(s)} heroId={h.id} tab="story" onClose={() => undefined} />)
    expect(el.textContent).toContain('Fell on floor 12')
    expect(el.querySelector('.last-words')).not.toBeNull()
    click(button(el, 'Gear'))
    expect(el.textContent).toContain('The fallen carry nothing')
  })
})

describe('opening a hero from anywhere', () => {
  it('openHeroSheet shows the sheet over any scene, on the asked tab; the planner too', () => {
    const { s, ids } = account()
    const el = render(<HeroSheetHost state={s} store={fakeStore(s)} />)
    expect(el.querySelector('.hs')).toBeNull()
    act(() => openHeroSheet(ids[1]!, 'stats'))
    expect(el.querySelector('[role=tab][aria-selected=true]')!.textContent).toBe('Stats')
    act(() => openPromotionPlanner(ids[1]!))
    expect(el.textContent).toContain(`Promote ${s.heroes[ids[1]!]!.name}`)
  })

  it('the advisor’s "Promote…" opens the planner instead of promoting blind', () => {
    const { s, ids } = account()
    const store = fakeStore(s)
    const tip: Advice = { id: `promote:${ids[0]}`, kind: 'promote', heroId: ids[0]!, priority: 80, actions: [{ type: 'PROMOTE_HERO', heroId: ids[0]! }] }
    let planner: string | null = null
    function Probe() {
      planner = useSheetBus().planner
      return null
    }
    const el = render(
      <>
        <AdviceWindow state={s} store={store} tips={[tip]} onDismiss={() => undefined} onPlace={() => undefined} onProfile={() => undefined} onClose={() => undefined} />
        <Probe />
      </>,
    )
    click(button(el, 'Promote…'))
    expect(store.sent).toEqual([])
    expect(planner).toBe(ids[0])
  })
})

describe('the shared picker', () => {
  it('greys out who the place refuses, with the reason, and picks the rest', () => {
    const { s, ids } = account()
    const onPick = vi.fn()
    const el = render(<HeroPicker state={s} label="test" onPick={onPick} refusal={(h) => (h.id === ids[0] ? 'In the middle of a drill.' : null)} />)
    const rows = Array.from(el.querySelectorAll('.hp-row'))
    expect(rows.length).toBe(ids.length)
    const off = rows.find((r) => r.classList.contains('off'))!
    expect(off.textContent).toContain('In the middle of a drill.')
    expect((off.querySelector('.hp-pick') as HTMLButtonElement).disabled).toBe(true)
    click(rows.find((r) => !r.classList.contains('off'))!.querySelector('.hp-pick'))
    expect(onPick).toHaveBeenCalledTimes(1)
    // "Available only" hides the refused.
    act(() => (el.querySelector('.hp-check input') as HTMLInputElement).click())
    expect(el.querySelectorAll('.hp-row').length).toBe(ids.length - 1)
  })

  it('the ⓘ button opens the hero sheet', () => {
    const { s, ids } = account()
    let sheet: string | null = null
    function Probe() {
      sheet = useSheetBus().sheet?.heroId ?? null
      return null
    }
    const el = render(
      <>
        <HeroPicker state={s} label="test" heroes={[s.heroes[ids[2]!]!]} />
        <Probe />
      </>,
    )
    click(el.querySelector('.hp-info'))
    expect(sheet).toBe(ids[2])
  })
})

describe('the Party Board swap', () => {
  it('choosing a hero for a slot places them there (the shared picker)', () => {
    const { s: s0, ids } = account()
    const s: GameState = { ...s0, party: { ...s0.party, slots: [ids[0]!, null, null, null, null] } }
    const store = fakeStore(s)
    const el = render(<PartyScreen state={s} store={store} />)
    click(el.querySelector('.pb-slot-swap'))
    expect(document.body.textContent).toContain('Who stands in slot 1?')
    const pick = Array.from(document.body.querySelectorAll('.pwin .hp-row:not(.off) .hp-pick')).find((b) => !b.closest('.hp-row')!.classList.contains('sel'))!
    click(pick)
    const slots = store.getState()!.party.slots
    expect(slots[0]).not.toBe(ids[0])
    expect(slots[0]).not.toBeNull()
  })
})

describe('refusal words', () => {
  it('say why a place cannot take a hero', () => {
    const { s, ids } = account()
    const h = s.heroes[ids[0]!]!
    expect(busyRefusal(s, { ...h, training: { skillId: 'x', mode: 'learn', completesAtWorld: 9 } } as unknown as OwnedHero)).toBe('In the middle of a drill.')
    expect(promoteRefusal(s, { ...h, xp: { ...h.xp, atCap: false } })).toBe('Not at their level cap yet.')
    expect(promoteRefusal(s, { ...h, xp: { ...h.xp, atCap: true } }, false)).toBeNull()
    expect(sacrificeRefusal(s, h, h.id)).toBe('The survivor cannot be a sacrifice.')
    expect(busyRefusal(s, { ...h, alive: false })).toBe('Has fallen.')
  })
})

describe('the dev cameo and the gear words', () => {
  it('the dev hook builds a real cameo (never saved), cycling through them', () => {
    const a = devCameo(0)
    expect(a.origin).toBe('cameo')
    expect(devCameo(1).name).not.toBe(undefined)
    expect(devCameo(-1).origin).toBe('cameo')
  })

  it('names forged, Oath and masterwork items, and signs the deltas', () => {
    expect(itemLabel('B Plate')).toBe('B Plate')
    expect(itemLabel("Aria's Oath-Blade")).toBe("Aria's Oath-Blade")
    expect(itemLabel("Bram's A Charm")).toBe("Bram's A Charm")
    expect(deltaText('pAtk', 12)).toBe('+12 P.ATK')
    expect(deltaText('critPct', -3)).toBe('−3% CRIT')
  })
})
