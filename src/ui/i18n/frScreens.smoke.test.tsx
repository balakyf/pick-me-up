// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
import { App } from '../App'
import { getStore } from '../useGame'
import { createAccount, saveState } from '../../engine/account'
import { attemptFloorWithResult, reduce } from '../../engine/store'
import { suggestParty } from '../../engine/scout'
import { toWorldTime } from '../../engine/time'
import { setLocale, t } from '../i18n/i18n'
import { FR } from '../i18n/fr'
import type { GameState, HeroId } from '../../engine/types'

/**
 * The new screens in French, through the REAL App on the REAL engine: title, lobby and
 * goal tracker, the progressive Menu, the Summon Theatre, the Memorial (an Echo waiting,
 * a Bane), the Tower (scout with a Bane, Doors, a Boon choice, the Sortie bar and its
 * confirm), the welcome-back ledger and Lights Out. Each screen is checked for English
 * sentences left untranslated (fragments of FR keys' English), raw placeholders and ids.
 */
const HOUR = 3_600_000
let container: HTMLDivElement
let root: Root
beforeEach(() => {
  window.localStorage.clear()
  document.body.className = ''
  setLocale('fr')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  setLocale('en')
})
const mount = () => act(() => root.render(<App />))
const buttons = () => Array.from(container.querySelectorAll('button'))
function clickT(label: string, sel = 'button') {
  const want = t(label)
  const btn = Array.from(container.querySelectorAll(sel)).find((b) => b.textContent?.includes(want)) as HTMLButtonElement | undefined
  if (!btn) throw new Error(`no button "${want}" in: ${container.textContent}`)
  act(() => btn.click())
}
function openPlace(label: string) {
  clickT('Menu')
  clickT(label, 'button.menu-item')
}

// English sentence fragments that must not appear on a French screen.
const fragments: { key: string; frag: string }[] = []
for (const [en, fr] of Object.entries(FR)) {
  if (fr === en) continue
  for (const part of en.split(/\{\w+\}/)) {
    const p = part.trim()
    if (p.length >= 14 && /\s/.test(p) && /[a-z]{3}/.test(p) && !fr.includes(p)) fragments.push({ key: en, frag: p })
  }
}
const found: Record<string, Set<string>> = {}
function audit(screen: string) {
  const text = container.textContent ?? ''
  const hits = new Set<string>()
  for (const f of fragments) if (text.includes(f.frag)) hits.add(f.frag)
  for (const m of text.match(/\{[a-zA-Z]\w*\}|undefined|NaN|\[object|\bnem_\w+|\bh_\d{6}\b/g) ?? []) hits.add(`RAW:${m}`)
  for (const m of text.match(/\bF\d{1,3}\b/g) ?? []) hits.add(`EN floor tag:${m}`)
  // English-looking residue: words common in English UI copy, not French.
  for (const m of text.match(/\b(the|your|waits|floor|while|you|and|with|from|Floor|Your|The)\b [a-z]+/g) ?? []) hits.add(`EN?:${m}`)
  found[screen] = hits
}
function veteran(seed: number): GameState {
  let s = createAccount(seed, { now: 0 })
  s = reduce(s, { type: 'SUMMON', count: 10 })
  s = reduce(s, { type: 'ADD_GOLD', amount: 100_000 })
  const p = suggestParty(s)
  s = reduce(s, { type: 'SET_PARTY', slots: p.slots, lines: p.lines })
  for (let i = 0; i < 3; i++) s = attemptFloorWithResult(s).state
  // a death: pending echo, nemesis, recruit
  for (const f of [11, 12, 13, 14, 16]) {
    const at: GameState = { ...s, tower: { ...s.tower, currentFloor: f, highestCleared: f - 1, kind: 'path', doors: null, event: null } }
    const r = attemptFloorWithResult(at)
    if (r.result.fallenHeroIds.length > 0 && r.state.life.legacy.nemeses.length > 0) {
      s = r.state
      break
    }
  }
  s = { ...s, life: { ...s.life, letterReadAt: toWorldTime(Date.now()) + 1e12, guide: { ...s.life.guide, done: ['welcome', 'decisive-tutorial'] } } }
  return s
}
function load(s: GameState) {
  window.localStorage.setItem('pmu.save.v1', saveState(s))
  act(() => {
    getStore().load()
  })
}

describe('French screens of the fun-and-return work', () => {
  it('renders the main new screens in French without English residue', () => {
    mount()
    audit('title')
    act(() => {
      getStore().dispatch({ type: 'NEW_ACCOUNT', seed: 4242, now: 0 })
    })
    audit('lobby-fresh')
    clickT('Menu')
    audit('menu-fresh')
    clickT('Mobius Summon', 'button.menu-item')
    clickT('Summon ×10 · free (your first summon)')
    const th = () => container.querySelector('.theatre') as HTMLElement | null
    const faces: string[] = []
    for (let g = 0; th() && g < 40; g++) {
      faces.push(container.textContent ?? '')
      act(() => th()!.click())
    }
    found['summon-theatre'] = new Set()
    for (const f of faces) {
      for (const fr of fragments) if (f.includes(fr.frag)) found['summon-theatre'].add(fr.frag)
      for (const m of f.match(/\{[a-zA-Z]\w*\}|undefined|NaN|\[object/g) ?? []) found['summon-theatre'].add('RAW:' + m)
      for (const m of f.match(/\b(the|your|Loves|Hobby|Before|and|with|from|The)\b [a-zA-Z]+/g) ?? []) found['summon-theatre'].add('EN?:' + m)
    }
    expect(faces.length).toBeGreaterThan(5)
    audit('summon-summary')
    act(() => root.unmount())
    root = createRoot(container)

    const v = veteran(77)
    expect(v.life.legacy.pending.length).toBeGreaterThan(0)
    load(v)
    mount()
    audit('lobby-veteran')
    openPlace('Memorial')
    audit('memorial')
    act(() => root.unmount())
    root = createRoot(container)
    // Tower with doors + nemesis + sortie
    const nem = v.life.legacy.nemeses[0]!
    const climbing: GameState = { ...v, tower: { ...v.tower, currentFloor: nem.revengeFloor, highestCleared: nem.revengeFloor - 1, kind: 'path', event: null, sortie: { startFloor: 3, floors: 2, purse: 400, boons: ['iron_vow'] } } }
    load(climbing)
    mount()
    openPlace('Tower Gate')
    audit('tower-scout')
    act(() => root.unmount())
    root = createRoot(container)
    const withDoors = reduce(climbing, { type: 'TICK' })
    const ds = { ...withDoors, tower: { ...withDoors.tower, currentFloor: 7, highestCleared: 6, doors: [{ kind: 'path' as const, reward: 'gold' as const }, { kind: 'elite' as const, reward: 'boon' as const }] } }
    load(ds)
    mount()
    openPlace('Tower Gate')
    audit('tower-doors')
    act(() => root.unmount())
    root = createRoot(container)
    const boon = { ...ds, tower: { ...ds.tower, doors: null, event: { kind: 'boon' as const, floor: 6, options: ['iron_vow', 'war_chest', 'calm_mind'] } } }
    load(boon)
    mount()
    openPlace('Tower Gate')
    audit('tower-boon')
    act(() => root.unmount())
    root = createRoot(container)
    // Welcome back
    const away = createAccount(91, { now: Date.now() - 10 * HOUR })
    const id = Object.keys(away.heroes)[0] as HeroId
    load({ ...away, heroes: { ...away.heroes, [id]: { ...away.heroes[id]!, promotion: { completesAtWorld: away.meta.lastSeenAtWorld + 1000 } } }, life: { ...away.life, guide: { ...away.life.guide, done: ['welcome'] } } })
    mount()
    expect(container.textContent).toContain(t('While you were away'))
    audit('welcome-back')
    act(() => root.unmount())
    root = createRoot(container)
    // Lights out
    load({ ...v, life: { ...v.life } })
    mount()
    openPlace('Tower Gate')
    clickT('Lobby')
    audit('sortie-confirm')
    const bank = buttons().find((b) => b.textContent?.includes('Encaisser'))
    if (bank) act(() => bank.click())
    clickT('Rest for now')
    audit('lights-out')
    const residue = Object.entries(found).filter(([, v]) => v.size > 0).map(([k, v]) => `${k}: ${[...v].join(' | ')}`)
    expect(residue).toEqual([])
  })
})
