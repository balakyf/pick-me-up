// @vitest-environment jsdom
/**
 * Integration (WP2 × WP8 × WP5): the battle draws WP8's poses (wind-up, strike, hurt, a
 * drawn KO without the CSS tip-over), gives every unit its own idle rhythm, blinks the
 * idle party, and shows a Bane under its translated name while its art stays the killer's
 * template. The sprite module is stubbed so each frame's pose is readable in jsdom (the
 * real one draws to canvas, which jsdom lacks).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { GameState, HeroId, Nemesis } from '../../engine/types'
import { nemesisUnitId } from '../../engine/tower'
import { PREFS_KEY } from '../prefs'
import { setLocale } from '../i18n/i18n'
import { costlyWin, floorLog, partyDeaths, resolve, atFloor } from './__fixtures__/logs'

vi.mock('../pixel/sprites', async (orig) => {
  const real = await orig<typeof import('../pixel/sprites')>()
  return {
    ...real,
    heroPoseUrl: (h: { id: string }, pose: string) => `hero:${h.id}:${pose}`,
    heroBlinkUrl: (h: { id: string }) => `blink:${h.id}`,
    heroBustUrl: () => 'bust',
    enemyPoseUrl: (name: string, _el: string, pose: string) => `enemy:${name}:${pose}`,
    allyPoseUrl: (name: string, pose: string) => `ally:${name}:${pose}`,
    allyBustUrl: () => 'bust',
    iselBustUrl: () => 'isel',
  }
})

// Imported after the mock is registered.
const { BattleScene } = await import('./BattleScene')

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  localStorage.setItem(PREFS_KEY, JSON.stringify({ battleSpeed: 8 }))
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
  setLocale('en')
})

const q = (sel: string) => container.querySelector(sel)
const button = (label: string) => [...container.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes(label))
function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}
/** Every sprite src seen on screen while the replay runs to its end. */
function playAll(onFrame?: () => void): Set<string> {
  const seen = new Set<string>()
  for (let t = 0; t < 300_000 && !button('Continue ▸'); t += 10) {
    if (q('.decisive-card')) act(() => (button('Let fate decide') as HTMLElement).click())
    for (const img of container.querySelectorAll('.bsprite img')) seen.add(img.getAttribute('src') ?? '')
    onFrame?.()
    advance(10)
  }
  for (const img of container.querySelectorAll('.bsprite img')) seen.add(img.getAttribute('src') ?? '')
  return seen
}

describe('battle poses and idle life (WP8 in the battle)', () => {
  it('heroes wind up then strike, take hurt frames, and fall into the drawn KO pose', () => {
    const { pre, log } = costlyWin()
    expect(partyDeaths(log)).toBeGreaterThan(0)
    act(() => root.render(<BattleScene log={log} state={pre} onDone={() => {}} />))
    let tipped = false
    const seen = playAll(() => {
      if (q('.bunit.ko-tip')) tipped = true
    })
    const heroPoses = new Set([...seen].filter((s) => s.startsWith('hero:')).map((s) => s.split(':')[2]))
    for (const p of ['idle', 'windup', 'attack', 'hurt', 'ko']) expect(heroPoses).toContain(p)
    const foePoses = new Set([...seen].filter((s) => s.startsWith('enemy:')).map((s) => s.split(':')[2]))
    for (const p of ['idle', 'windup', 'hurt']) expect(foePoses).toContain(p)
    // The ko frame is drawn, so the CSS tip-over never applies.
    expect(tipped).toBe(false)
    expect(q('.bunit.hero.ko')).toBeTruthy()
  })

  it('every sprite breathes on its own rhythm, and only idle party heroes blink', () => {
    const log = floorLog(7, 1)
    const pre = atFloor(7, 1)
    act(() => root.render(<BattleScene log={log} state={pre} onDone={() => {}} />))
    const sprites = [...container.querySelectorAll<HTMLElement>('.bsprite')]
    expect(sprites.length).toBeGreaterThan(1)
    const periods = new Set(sprites.map((s) => s.style.getPropertyValue('--idle-period')))
    expect([...periods].every((p) => /^\d+ms$/.test(p))).toBe(true)
    expect(periods.size).toBeGreaterThan(1)
    // Blink overlays sit on idle heroes only, never on foes.
    const blinks = [...container.querySelectorAll('.bsprite img.blink')]
    expect(blinks.length).toBeGreaterThan(0)
    for (const b of blinks) {
      const unit = b.closest('.bunit')!
      expect(unit.classList.contains('hero')).toBe(true)
      expect(unit.querySelector('.bsprite img:not(.blink)')!.getAttribute('src')).toMatch(/:idle$/)
    }
  })
})

describe('a Bane in battle (WP5 names, WP8 art)', () => {
  const bane = (floor: number): Nemesis => ({
    id: 'nem_h_mira',
    templateId: 'goblin',
    name: 'Goblin',
    element: 'fire',
    level: 3,
    heroId: 'h_mira' as HeroId,
    heroName: 'Mira Vey',
    diedFloor: floor - 4,
    revengeFloor: floor,
    status: 'waiting',
  })
  function baneFight(): { pre: GameState; unitId: string } {
    const base = atFloor(7, 6)
    const pre: GameState = { ...base, life: { ...base.life, legacy: { ...base.life.legacy, nemeses: [bane(6)] } } }
    return { pre, unitId: nemesisUnitId(bane(6)) }
  }

  it('wears its template’s art, a skull, and its translated name', () => {
    setLocale('fr')
    const { pre, unitId } = baneFight()
    const log = resolve(pre)!
    const u = log.unitsInit.find((x) => x.id === unitId)!
    expect(u.name).toBe("Mira's Bane")
    expect(u.templateId).toBe('goblin')
    act(() => root.render(<BattleScene log={log} state={pre} onDone={() => {}} nemesisIds={[unitId]} />))
    for (let t = 0; t < 5_000 && !q(`[data-unit="${unitId}"]`); t += 10) advance(10)
    const el = q(`[data-unit="${unitId}"]`)!
    expect(el.classList.contains('nemesis')).toBe(true)
    expect(el.querySelector('.bsprite img')!.getAttribute('src')).toBe('enemy:Goblin:idle')
    expect(el.querySelector('.bsprite img')!.getAttribute('alt')).toBe('Le Fléau de Mira')
    expect(container.querySelector('.battle-foes')!.textContent).toContain('Le Fléau de Mira')
    expect(container.textContent).not.toContain("Mira's Bane")
  })
})
