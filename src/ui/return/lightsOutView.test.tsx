// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createAccount } from '../../engine/account'
import { reduce } from '../../engine/store'
import { TUNING } from '../../engine/tuning'
import type { GameState } from '../../engine/types'
import { setLocale, t } from '../i18n/i18n'
import { LightsOut } from './LightsOut'
import { nextFloorTeaser } from './lightsOut'

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
  setLocale('en')
})

function roster(n = 4): GameState {
  let s: GameState = { ...createAccount(19), gold: TUNING.gacha.normalCostGold * n }
  for (let i = 0; i < n; i++) s = reduce(s, { type: 'SUMMON' })
  return s
}

describe('Lights Out: the "Next time" named threat (review finding #19)', () => {
  for (const locale of ['en', 'fr'] as const) {
    it(`ends the threat's reason with one full stop (${locale})`, () => {
      setLocale(locale)
      const s = roster()
      const teaser = nextFloorTeaser(s)!
      expect(teaser.nemesis).toBeNull()
      expect(teaser.namedThreat).not.toBeNull()
      act(() => root.render(<LightsOut state={s} nowReal={Date.now()} onGo={() => {}} onClose={() => {}} />))
      const hook = Array.from(container.querySelectorAll('.lo-hook')).find((el) => el.textContent?.includes('—'))
      expect(hook).toBeDefined()
      const why = t(teaser.namedThreat!.why)
      expect(hook!.textContent!.trim().endsWith(why)).toBe(true)
      expect(hook!.textContent).not.toMatch(/\.\.$/)
    })
  }
})
