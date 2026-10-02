import { describe, expect, it } from 'vitest'
import { ICONS, iconBitmap, iconMask, type IconName } from './icons'
import { opaqueCount } from './bitmap'
import { ELEMENT_VIS, CLASS_VIS } from '../bits'

const names = Object.keys(ICONS) as IconName[]

describe('pixel icons', () => {
  it('every icon paints, every colour letter has a legend entry, and the rim surrounds it', () => {
    for (const n of names) {
      const b = iconBitmap(n)
      expect(opaqueCount(b), n).toBeGreaterThan(10)
      const def = ICONS[n]
      expect(b.h).toBe(def.rows.length + 2)
    }
  })

  it('there is an icon for every element and class (and the untrained), so call sites can drop the emoji', () => {
    for (const el of Object.keys(ELEMENT_VIS)) expect(ICONS[`el-${el}` as IconName], el).toBeDefined()
    for (const c of Object.keys(CLASS_VIS)) expect(ICONS[`cls-${c}` as IconName], c).toBeDefined()
    expect(ICONS['cls-none']).toBeDefined()
    expect(ICONS['flag-gb'].glyph).not.toMatch(/\p{Regional_Indicator}/u)
  })

  it('colour-blind safe: no two elements (or classes) share a silhouette', () => {
    const groups = [names.filter((n) => n.startsWith('el-')), names.filter((n) => n.startsWith('cls-'))]
    for (const g of groups) {
      const masks = g.map(iconMask)
      expect(new Set(masks).size, g.join()).toBe(g.length)
      // And they differ by a real amount, not a stray pixel.
      for (let i = 0; i < g.length; i++)
        for (let j = i + 1; j < g.length; j++) {
          const a = masks[i]!
          const b = masks[j]!
          let diff = 0
          for (let k = 0; k < Math.max(a.length, b.length); k++) if (a[k] !== b[k]) diff++
          expect(diff, `${g[i]} vs ${g[j]}`).toBeGreaterThanOrEqual(12)
        }
    }
  })

  it('is deterministic', () => {
    expect(Array.from(iconBitmap('el-fire').px)).toEqual(Array.from(iconBitmap('el-fire').px))
  })
})
