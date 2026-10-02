import { describe, it, expect, afterEach } from 'vitest'
import type { DeployReason } from '../engine/types'
import { deployReasonFix, deployReasonText } from './deployReason'
import { setLocale } from './i18n/i18n'
import { FR } from './i18n/fr'

const REASONS: (DeployReason | 'empty')[] = ['dead', 'captive', 'expedition', 'promotion', 'training', 'bounty', 'burnout', 'exhausted', 'rebellion', 'empty']

describe('deploy reason words', () => {
  afterEach(() => setLocale('en'))

  it('every reason has a distinct phrase and a fix, in English and French', () => {
    setLocale('en')
    const en = REASONS.map(deployReasonText)
    expect(new Set(en).size).toBe(REASONS.length)
    for (const r of REASONS) {
      expect(deployReasonText(r).length).toBeGreaterThan(0)
      expect(deployReasonFix(r).length).toBeGreaterThan(0)
      expect(FR[deployReasonText(r)]).toBeTruthy()
      expect(FR[deployReasonFix(r)]).toBeTruthy()
    }
    // The cause, not trust, for a burnt-out hero (B13's root: one reason per refusal).
    expect(deployReasonFix('burnout')).not.toMatch(/trust/)
  })

  it('the engine refusals the UI shows have French', () => {
    expect(FR['no one is fit to fight']).toBeTruthy()
    expect(FR['the hall is still being cleaned']).toBeTruthy()
  })
})
