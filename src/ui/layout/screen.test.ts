import { describe, expect, it } from 'vitest'
import { FOE_COL, foeColumnPx, longestName, screenTier, WIDE_MIN_W } from './screen'
import { foeColumnVars } from './foeColumn'

describe('screen tiers', () => {
  it('reads a phone, a tablet, a laptop and a big monitor', () => {
    expect(screenTier(390, 844)).toBe('phone')
    expect(screenTier(820, 1180)).toBe('tablet')
    expect(screenTier(1280, 800)).toBe('desktop')
    expect(screenTier(1920, 1080)).toBe('wide')
    expect(screenTier(WIDE_MIN_W, 900)).toBe('wide')
    // a wide but short window is still a laptop
    expect(screenTier(1920, 700)).toBe('desktop')
  })
})

describe('the battle foe column', () => {
  it('is no column on a phone or a tablet', () => {
    expect(foeColumnPx(20, 'phone')).toBeNull()
    expect(foeColumnPx(20, 'tablet')).toBeNull()
  })

  it('grows with the longest name, within the tier’s bounds', () => {
    const a = foeColumnPx(10, 'desktop')!
    const b = foeColumnPx(18, 'desktop')!
    expect(b).toBeGreaterThan(a)
    expect(foeColumnPx(1, 'desktop')).toBe(FOE_COL.min.desktop)
    expect(foeColumnPx(200, 'desktop')).toBe(FOE_COL.max.desktop)
    expect(foeColumnPx(200, 'wide')).toBe(FOE_COL.max.wide)
    // "Demon's Marksman Lv99" (16 chars) fits on a laptop without an ellipsis
    expect(foeColumnPx(16, 'desktop')!).toBeGreaterThanOrEqual(16 * FOE_COL.charPx + FOE_COL.levelPx + FOE_COL.barPx)
  })

  it('a big screen and a big wave both widen it', () => {
    expect(foeColumnPx(14, 'wide')!).toBeGreaterThan(foeColumnPx(14, 'desktop')!)
    expect(foeColumnPx(14, 'desktop', true)!).toBeGreaterThan(foeColumnPx(14, 'desktop')!)
  })

  it('measures names in characters and hands CSS a value per tier', () => {
    expect(longestName(['Wolf', 'Order Battlemage', 'Kraken'])).toBe(16)
    expect(longestName([])).toBe(0)
    const v = foeColumnVars(['Order Battlemage'])
    expect(Object.keys(v).sort()).toEqual(['--foe-col', '--foe-col-many', '--foe-col-wide', '--foe-col-wide-many'])
    for (const x of Object.values(v)) expect(x).toMatch(/^\d+px$/)
  })
})
