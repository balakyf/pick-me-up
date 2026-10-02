// @vitest-environment jsdom
/**
 * Reveal 2.0 (lane J): the ten-orb overview, the person on the card (their past and their
 * greeting), the second beat of stamps, the cameo frame, the pity meter and the floor stamp,
 * bond groups in the lineup, and the reduced-motion variant.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { SummonReveal } from './SummonReveal'
import { createAccount } from '../../engine/account'
import { buildOwnedHeroFromTemplate, summonMany } from '../../engine/gacha'
import { CAMEO_HEROES } from '../../engine/content'
import { traitOf } from '../../engine/content/traits'
import { TUNING } from '../../engine/tuning'
import { updateSettings } from '../qol/settings'
import { greeting } from '../life/speech'
import type { BondGroup, EquipmentId, EquipmentItem, GameState, HeroId, OwnedHero } from '../../engine/types'

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
  vi.useRealTimers()
  updateSettings({ reducedMotion: 'auto' })
})

function ten(): { s: GameState; heroes: OwnedHero[] } {
  let s: GameState = { ...createAccount(77, { now: 0 }), gold: 1_000_000 }
  const r = summonMany(s, 'normal', 10)
  s = r.state
  return { s, heroes: r.heroes }
}

const tick = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })

const press = (key: string) =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key }))
  })

describe('SummonReveal 2.0', () => {
  it('a ten-pull opens on ten orbs, then reveals a person: their past, their voice, then the stamps', () => {
    vi.useFakeTimers({ now: 0 })
    const { s, heroes } = ten()
    const el = render(<SummonReveal heroes={heroes} masterLevel={1} pool="normal" onClose={() => {}} pityBefore={s.gacha} pityAfter={s.gacha} />)
    expect(el.textContent).toContain('10 lights answer the call')
    expect(el.querySelectorAll('.sr-orbs.big .sr-orb').length).toBe(10)
    // The pity meter keeps count from the start.
    expect(el.querySelector('.sr-pity')?.textContent).toContain(`/${TUNING.gacha.normalPityFloor3At}`)
    tick(2100)
    expect(el.textContent).toContain('1 / 10')
    expect(el.querySelectorAll('.sr-orbs.strip .sr-orb').length).toBe(10)
    tick(4000)
    const card = el.querySelector('.sr-card')!
    expect(card).not.toBeNull()
    expect(card.textContent).toContain('Before the summon:')
    expect(el.querySelector('.sr-greet')?.textContent).toContain(greeting(heroes[0]!))
    // The hero steps out as a full-body sprite (when the canvas can draw it) beside the card.
    expect(el.querySelector('.sr-reveal')).not.toBeNull()
    tick(1000)
    const stamps = el.querySelector('.sr-stamps')!
    expect(stamps.querySelector('.trait-chip')?.textContent).toContain(traitOf(heroes[0]!).name)
    expect(stamps.querySelector('.st-grade')).not.toBeNull()
    // Space moves on.
    press(' ')
    expect(el.textContent).toContain('2 / 10')
  })

  it('a click before the stamps land stamps them at once; the next click moves on', () => {
    vi.useFakeTimers({ now: 0 })
    const { heroes } = ten()
    const el = render(<SummonReveal heroes={heroes.slice(0, 2)} masterLevel={1} pool="normal" onClose={() => {}} />)
    press(' ') // past the overview
    press(' ') // the beam flips at once
    expect(el.querySelector('.sr-card')).not.toBeNull()
    expect(el.querySelectorAll('.sr-stamps .sr-stamp-wrap').length).toBe(0)
    press(' ')
    expect(el.querySelectorAll('.sr-stamps .sr-stamp-wrap').length).toBeGreaterThan(1)
    press(' ')
    expect(el.textContent).toContain('2 / 2')
  })

  it('a 4★ stamps its engraving seal, Oath-weapon and skills; the floor stamps the pull it lifted', () => {
    vi.useFakeTimers({ now: 0 })
    const { heroes } = ten()
    const weapon: EquipmentItem = { id: 'eq_000009' as EquipmentId, slot: 'weapon', grade: 'B', name: 'Lyra’s Oath-Blade', statBonus: {} }
    const strong: OwnedHero = {
      ...heroes[0]!,
      star: 4,
      heroClass: 'warrior',
      engraving: { id: 'beast_king_heir', grade: 'B' },
      equipment: { weapon: weapon.id, armor: null, accessory: null },
      skills: [{ id: 'power_strike', level: 1, xp: 0 }],
      growthGrades: { str: 9, agi: 2, vit: 3, int: 1, wil: 2 },
    }
    const before = { ...ten().s.gacha, advPity4: TUNING.gacha.advanced.pityFloor4At - 1 }
    const el = render(<SummonReveal heroes={[strong]} masterLevel={1} pool="advanced" onClose={() => {}} pityBefore={before} items={[weapon]} />)
    tick(5000)
    tick(1500)
    const stamps = el.querySelector('.sr-stamps')!
    expect(stamps.querySelector('.st-seal')?.textContent).toContain('Beast King')
    expect(stamps.querySelector('.st-weapon')?.textContent).toContain('Oath-Blade')
    expect(stamps.querySelector('.st-skill')?.textContent).toContain('Power Strike')
    expect(stamps.querySelector('.st-grade')?.textContent).toBe('S-grade STR!')
    expect(stamps.querySelector('.st-floor')?.textContent).toBe('Quality floor reached!')
  })

  it('a canon cameo gets the gilded frame and its own words', () => {
    vi.useFakeTimers({ now: 0 })
    const han = buildOwnedHeroFromTemplate(CAMEO_HEROES.find((c) => c.name === 'Islat Han')!, 'h_000001' as HeroId)
    const el = render(<SummonReveal heroes={[han]} masterLevel={1} pool="normal" onClose={() => {}} />)
    tick(3000)
    expect(el.querySelector('.sr-card.sr-cameo')).not.toBeNull()
    expect(el.textContent).toContain('A face from the stories!')
    expect(el.querySelector('.sr-greet')?.textContent).toContain('Not the first floor')
  })

  it('the lineup gathers a bond group under its name', () => {
    vi.useFakeTimers({ now: 0 })
    const { heroes } = ten()
    const group: BondGroup = { id: 'bg1', name: 'the Gale Band', members: [heroes[1]!.id, heroes[2]!.id], adj: 'Gale', noun: 'Band' }
    const bonded = heroes.map((h, i) => (i === 1 || i === 2 ? { ...h, bondGroup: 'bg1' } : h))
    const el = render(<SummonReveal heroes={bonded} masterLevel={1} pool="normal" onClose={() => {}} bondGroups={{ bg1: group }} />)
    press('Escape')
    const head = el.querySelector('.sr-group.bonded .sr-group-head')
    expect(head?.textContent).toContain('Gale')
    expect(el.querySelectorAll('.sr-group.bonded .sr-mini').length).toBe(2)
    expect(el.querySelectorAll('.sr-mini').length).toBe(10)
    expect(el.querySelectorAll('.sr-mini .trait-chip').length).toBe(10)
  })

  it('reduced motion: no tease in the orbs, a calm stage, and the stamps arrive quickly', () => {
    vi.useFakeTimers({ now: 0 })
    updateSettings({ reducedMotion: 'on' })
    const { heroes } = ten()
    const el = render(<SummonReveal heroes={heroes} masterLevel={1} pool="normal" onClose={() => {}} />)
    expect(el.querySelector('.sr.sr-calm')).not.toBeNull()
    expect(el.querySelectorAll('.sr-orb.tease').length).toBe(0)
    tick(800)
    tick(500)
    expect(el.querySelector('.sr-card')).not.toBeNull()
    tick(300)
    expect(el.querySelectorAll('.sr-stamps .sr-stamp-wrap').length).toBeGreaterThan(0)
  })
})
