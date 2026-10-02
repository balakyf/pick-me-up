// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { CombatEvent, CombatLog, CombatUnitInit } from '../../engine/types'
import { ENEMY_TEMPLATES } from '../../engine/content'
import { BattleScene } from './BattleScene'
import { BossBar } from './BossBar'
import { BossIntroCard } from './BossIntro'
import type { BossBarView } from './bossBar'
import { setLocale } from '../i18n/i18n'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * Lane I on the battle screen: the boss bar, the title card (skippable), the finisher's
 * shatter, the Lv999 Creature waking, and the heroes' poses.
 */

const unit = (id: string, side: 'hero' | 'enemy', extra: Partial<CombatUnitInit> = {}): CombatUnitInit => ({
  id,
  name: side === 'hero' ? `Hero ${id}` : 'Goblin',
  side,
  line: 'front',
  unitClass: side === 'hero' ? 'warrior' : null,
  element: side === 'hero' ? 'fire' : 'light',
  level: 40,
  maxHP: 1000,
  maxSP: 100,
  cp: 10,
  spd: 50,
  ...extra,
})
const tpl = (id: string): Partial<CombatUnitInit> => ({ templateId: id, name: ENEMY_TEMPLATES[id]!.name })

/** El Cid steps out, is struck, the creature wakes, and he falls to the last blow. */
function cidLog(): CombatLog {
  const ev: CombatEvent[] = [
    { seq: 0, tick: 0, kind: 'battle-start', heroIds: ['h1', 'h2'], enemyIds: ['cid', 'lv'] },
    { seq: 1, tick: 4, kind: 'act', actorId: 'h1', skillId: 'power_strike', targetId: 'cid' },
    { seq: 2, tick: 4, kind: 'hit', actorId: 'h1', targetId: 'cid', amount: 600, crit: false, hpAfter: 400 },
    { seq: 3, tick: 6, kind: 'mission', note: 'Lv999 Creature wakes…', code: 'wakes', params: { unitId: 'lv' } },
    { seq: 4, tick: 8, kind: 'act', actorId: 'h2', skillId: 'basic', targetId: 'cid' },
    { seq: 5, tick: 8, kind: 'hit', actorId: 'h2', targetId: 'cid', amount: 400, crit: true, hpAfter: 0 },
    { seq: 6, tick: 8, kind: 'death', unitId: 'cid' },
    { seq: 7, tick: 9, kind: 'end', outcome: 'win' },
  ]
  return {
    seed: 3,
    floor: 60,
    encounterContext: 'tower',
    unitsInit: [unit('h1', 'hero'), unit('h2', 'hero', { line: 'back' }), unit('cid', 'enemy', { ...tpl('el_cid'), targetTag: 'el_cid' }), unit('lv', 'enemy', tpl('lv999_creature'))],
    events: ev,
    outcome: 'win',
    rngDraws: 0,
    mission: { type: 'Raid', objectives: [{ kind: 'defeat', targetTag: 'el_cid', unitIds: ['cid'] }], waves: 1 },
  }
}

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  setLocale('en')
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
const $ = (sel: string) => container.querySelector(sel)
const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms))

const view: BossBarView = {
  unitId: 'p',
  name: 'Pryos Al Ragna',
  epithet: 'Commander of the Wall',
  color: '#ff5a5a',
  level: 143,
  hpPct: 61.2,
  dead: false,
  phases: [
    { atHpPct: 66, title: 'The Second Seal', passed: true },
    { atHpPct: 33, title: 'The Last Seal', passed: false },
  ],
  aegis: 3,
  timer: { kind: 'enrage', label: 'Enrage', left: 0.4 },
  enraged: null,
}

describe('the boss bar and the title card (lane I)', () => {
  it('draws the name, the HP with its ghost, the phases, the aegis and the clock', () => {
    act(() => root.render(<BossBar view={view} />))
    expect($('.bb-name')!.textContent).toBe('Pryos Al Ragna')
    expect($('.bb-epithet')!.textContent).toBe('Commander of the Wall')
    expect($('.bb-pct')!.textContent).toBe('62%')
    expect(($('.hp-fill') as HTMLElement).style.width).toBe('61.2%')
    expect($('.hp-ghost')).not.toBeNull()
    expect(container.querySelectorAll('.bb-pip')).toHaveLength(3)
    expect(container.querySelectorAll('.bb-phase')).toHaveLength(2)
    expect(container.querySelectorAll('.bb-phase.passed')).toHaveLength(1)
    expect(($('.bb-timer-bar > span') as HTMLElement).style.width).toBe('40%')
    expect($('.boss-bar')!.getAttribute('aria-label')).toBe('Pryos Al Ragna: 62% HP')
    act(() => root.render(<BossBar view={{ ...view, enraged: 2, timer: null }} docked />))
    expect($('.bb-enraged')!.textContent).toBe('Enraged ×2')
    expect($('.boss-bar.docked.enraged')).not.toBeNull()
    expect($('.bb-epithet')).toBeNull() // a phone keeps it to the name
  })

  it('the title card names the boss, its wave and its company, and one click skips it', () => {
    const onSkip = vi.fn()
    const units = [unit('v', 'enemy', tpl('valention')), unit('r', 'enemy', tpl('rodvick'))]
    act(() => root.render(<BossIntroCard units={units} tier="boss" calm={false} durMs={2000} onSkip={onSkip} wave={{ n: 2, total: 2 }} />))
    expect($('.bi-name')!.textContent).toBe('Valention')
    expect($('.bi-epithet')!.textContent).toBe('Of Iron Blood')
    expect($('.bi-kicker')!.textContent).toBe('Boss · Wave 2/2')
    expect($('.bi-sub')!.textContent).toContain('Phase 1 of 2')
    expect($('.bi-with')!.textContent).toBe("with Rodvick · Valention's Hammer")
    act(() => ($('.bi-skip') as HTMLElement).click())
    expect(onSkip).toHaveBeenCalledTimes(1)
    act(() => root.render(<BossIntroCard units={units} tier="boss" calm durMs={2000} onSkip={onSkip} />))
    expect($('.boss-intro.calm')).not.toBeNull()
  })

  it('in French', () => {
    setLocale('fr')
    act(() => root.render(<BossIntroCard units={[unit('c', 'enemy', tpl('el_cid'))]} tier="boss" calm={false} durMs={2000} onSkip={() => {}} />))
    expect($('.bi-epithet')!.textContent).toBe('Le Classé déchu')
    expect($('.bi-sub')!.textContent).toContain('Niv.')
    setLocale('en')
  })
})

describe('boss shows in the replay (lane I)', () => {
  it('a boss steps out to its card and its bar; Esc skips the card', () => {
    act(() => root.render(<BattleScene log={cidLog()} state={null} onDone={() => {}} />))
    tick(320)
    expect($('.boss-intro')).not.toBeNull()
    expect($('.bi-name')!.textContent).toBe('El Cid')
    expect($('.bi-with')!.textContent).toContain('Lv999 Creature')
    expect($('.bi-dim')).not.toBeNull()
    expect($('.boss-bar .bb-name')!.textContent).toBe('El Cid')
    // the card holds the beat well past an ordinary battle start…
    tick(900)
    expect($('.boss-intro')).not.toBeNull()
    // …until the Master skips it
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect($('.boss-intro')).toBeNull()
  })

  it('the creature wakes to a red card, and the boss falls to a shatter in slow motion', () => {
    act(() => root.render(<BattleScene log={cidLog()} state={null} onDone={() => {}} />))
    let wakes = false
    let shatter = false
    let slow = false
    for (let i = 0; i < 80 && !(wakes && shatter); i++) {
      tick(250)
      wakes ||= $('.boss-intro.wakes') !== null
      if ($('.boss-shatter')) {
        shatter = true
        slow = $('.battle-stage.slowmo') !== null
        expect(container.querySelectorAll('.bs-shard').length).toBeGreaterThan(20)
        expect($('.bunit.enemy.shattered')).not.toBeNull()
      }
    }
    expect(wakes).toBe(true)
    expect(shatter).toBe(true)
    expect(slow).toBe(true)
    // once the finisher has played the boss stays broken (its KO dissolve does not replay)
    for (let i = 0; i < 40 && $('.boss-shatter'); i++) tick(250)
    expect($('.boss-shatter')).toBeNull()
    expect($('.bunit.enemy.ko.shattered')).not.toBeNull()
    expect($('.bunit.enemy.ko:not(.shattered)')).toBeNull()
  })

  it('heroes are posed: they strike, and the winners cheer', () => {
    act(() => root.render(<BattleScene log={cidLog()} state={null} onDone={() => {}} />))
    expect(container.querySelectorAll('.bunit.hero.posed').length).toBe(2)
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 's' })))
    expect(container.querySelectorAll('.bunit.hero.cheer.posed').length).toBe(2)
  })
})
