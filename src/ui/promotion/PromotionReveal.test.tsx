// @vitest-environment jsdom
/**
 * The promotion ceremony (lane J): the overlay plays a completed promotion beat by beat, the
 * host notices a promotion completing, and the chamber's planner lays out the choices before
 * a stone is paid.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { PromotionCeremonyHost, PromotionReveal } from './PromotionReveal'
import { PromotionPlanner } from './PromotionPlanner'
import { createAccount } from '../../engine/account'
import { summonMany } from '../../engine/gacha'
import { classOffers, completePromotion, promotionPreview, startPromotion, type PromotionChoice } from '../../engine/promotion'
import { SKILLS } from '../../engine/content'
import { updateSettings } from '../qol/settings'
import type { GameState, HeroId, OwnedHero } from '../../engine/types'

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
function rerender(node: JSX.Element): void {
  act(() => root!.render(node))
}
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  vi.useRealTimers()
  updateSettings({ reducedMotion: 'auto' })
})

/** A state with one classless 2★ at its cap (a class-change promotion), rich in stones. */
function scene(): { s: GameState; hero: OwnedHero } {
  let s: GameState = { ...createAccount(91, { now: 0 }), gold: 1_000_000 }
  s = summonMany(s, 'normal', 10).state
  const base = (Object.values(s.heroes) as OwnedHero[]).find((x) => x.heroClass === null)!
  const hero: OwnedHero = { ...base, star: 2, xp: { ...base.xp, atCap: true } }
  s = { ...s, heroes: { ...s.heroes, [hero.id]: hero }, materials: { ...s.materials, promotionStone: 999, [`attrStone_${hero.element}`]: 999 } }
  return { s, hero }
}

const tick = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })

describe('PromotionReveal', () => {
  it('plays the beats: stars, grades ticking up, the new calling and skill — then Continue', () => {
    vi.useFakeTimers({ now: 0 })
    const { s, hero } = scene()
    const before = { ...hero, promotion: { completesAtWorld: 0 } }
    const after = completePromotion(before, s.seed)
    const done = vi.fn()
    const el = render(<PromotionReveal before={before} after={after} onDone={done} />)
    expect(el.querySelector('[role="dialog"].overlay')).not.toBeNull()
    expect(el.textContent).toContain('The Promotion Chamber opens')
    expect(el.querySelector('.pr-new')).toBeNull()
    tick(800)
    expect(el.querySelector('.pr-new')).not.toBeNull()
    expect(el.textContent).toContain('Level cap')
    tick(1200)
    expect(el.querySelectorAll('.pr-grade').length).toBe(5)
    for (let i = 0; i < 8; i++) tick(1400)
    expect(el.textContent).toContain('takes up a calling')
    expect(el.querySelector('.pr-skill')?.textContent).toContain(SKILLS[after.skills.find((x) => !before.skills.some((b) => b.id === x.id))!.id]!.name)
    const btn = Array.from(el.querySelectorAll('button')).find((b) => b.textContent === 'Continue')!
    act(() => btn.click())
    expect(done).toHaveBeenCalledOnce()
  })

  it('a click shows everything at once; reduced motion starts there', () => {
    vi.useFakeTimers({ now: 0 })
    const { s, hero } = scene()
    const before = { ...hero, promotion: { completesAtWorld: 0 } }
    const after = completePromotion(before, s.seed)
    const el = render(<PromotionReveal before={before} after={after} onDone={() => {}} />)
    act(() => (el.querySelector('.overlay') as HTMLElement).click())
    expect(el.querySelector('.pr-new')).not.toBeNull()
    expect(el.querySelector('.pr-skill')).not.toBeNull()
    act(() => root?.unmount())
    root = null
    updateSettings({ reducedMotion: 'on' })
    const calm = render(<PromotionReveal before={before} after={after} onDone={() => {}} />)
    expect(calm.querySelector('.pr.pr-calm')).not.toBeNull()
    expect(calm.textContent).toContain('Continue')
  })
})

describe('PromotionCeremonyHost', () => {
  it('plays a ceremony when a promotion completes, and holds it while told to', () => {
    vi.useFakeTimers({ now: 0 })
    const { s, hero } = scene()
    const started = startPromotion(s, hero.id, 0)
    const done: GameState = { ...started, heroes: { ...started.heroes, [hero.id]: completePromotion(started.heroes[hero.id]!, started.seed) } }
    const el = render(<PromotionCeremonyHost state={started} />)
    expect(el.querySelector('.pr')).toBeNull()
    rerender(<PromotionCeremonyHost state={done} hold />)
    expect(el.querySelector('.pr')).toBeNull()
    rerender(<PromotionCeremonyHost state={done} />)
    expect(el.querySelector('.pr')).not.toBeNull()
    expect(el.textContent).toContain(hero.name)
  })
})

describe('PromotionPlanner', () => {
  it('shows the preview and the choices, and promotes with what the Master picked', () => {
    const { s, hero } = scene()
    const picks: PromotionChoice[] = []
    const el = render(<PromotionPlanner state={s} hero={hero} affordable onPromote={(c) => picks.push(c)} />)
    const offers = classOffers(hero, s.seed)
    expect(offers.length).toBe(2)
    const callings = Array.from(el.querySelectorAll('[role="radiogroup"] .promo-choice'))
    expect(callings.length).toBe(2)
    expect(el.querySelectorAll('.promo-grade').length).toBe(5)
    expect(el.textContent).toContain(`${hero.star}★ → ${hero.star + 1}★`)
    // Pick the calling the chamber would not, then begin.
    const other = offers.find((c) => c !== promotionPreview(hero, s.seed).heroClass)!
    const btn = callings.find((b) => b.textContent?.toLowerCase().includes(other))!
    act(() => (btn as HTMLButtonElement).click())
    expect(btn.classList.contains('sel')).toBe(true)
    const begin = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Begin the promotion'))!
    act(() => begin.click())
    expect(picks).toEqual([{ heroClass: other }])
    // The choice is one the engine accepts.
    expect(() => startPromotion(s, hero.id as HeroId, 0, picks[0])).not.toThrow()
  })

  it('a classed hero chooses one of three skills', () => {
    const { s, hero } = scene()
    const three: OwnedHero = { ...hero, star: 3, heroClass: 'warrior', skills: [{ id: 'power_strike', level: 1, xp: 0 }] }
    const picks: PromotionChoice[] = []
    const el = render(<PromotionPlanner state={s} hero={three} affordable onPromote={(c) => picks.push(c)} />)
    const skills = Array.from(el.querySelectorAll('.promo-choice'))
    expect(skills.length).toBe(3)
    act(() => (skills[2] as HTMLButtonElement).click())
    act(() => Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Begin the promotion'))!.click())
    expect(picks[0]!.skillId).toBe(promotionPreview(three, s.seed).skillOffers[2])
  })
})
