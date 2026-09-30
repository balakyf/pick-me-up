import { describe, it, expect } from 'vitest'
import { opaqueCount } from '../pixel/bitmap'
import { drawEnemy } from '../pixel/enemySprite'
import { silhouette } from './codexArt'
import { keywordText, familyLabel } from './codexText'
import { depthSnap, DEPTH_DURATION } from '../battle/synergyCaptions'
import { modifierName, modifierRule } from '../depth/floorModText'
import { FLOOR_MODIFIERS } from '../../engine/depth'
import type { CombatEvent, KeywordTag } from '../../engine/types'

describe('codex art', () => {
  it('a silhouette keeps the shape (plus its rim) in one dark tone', () => {
    const b = drawEnemy('goblin', 'physical')
    const s = silhouette(b)
    expect(s.w).toBe(b.w)
    expect(opaqueCount(s)).toBeGreaterThanOrEqual(opaqueCount(b))
    expect(new Set(Array.from(s.px).filter((c) => c !== 0)).size).toBeLessThanOrEqual(2)
  })
})

describe('codex words', () => {
  it('every keyword kind has a phrase', () => {
    const kws: KeywordTag[] = [
      { kind: 'immune', damageType: 'magic' },
      { kind: 'resist', damageType: 'physical', reduction: 0.5 },
      { kind: 'vulnerable', element: 'fire' },
      { kind: 'phased' },
      { kind: 'enrage', afterTick: 10, multiplier: 2 },
      { kind: 'looming' },
      { kind: 'aegis', charges: 2 },
      { kind: 'frenzy', belowHpPct: 30, multiplier: 2 },
      { kind: 'opener', multiplier: 2 },
      { kind: 'lifesteal', fraction: 0.2 },
      { kind: 'bane', family: 'dragon', multiplier: 2 },
      { kind: 'guard', reduction: 0.2 },
      { kind: 'guard', reduction: 0.2, vs: 'ranged' },
      { kind: 'guard', reduction: 0.2, vs: 'fire' },
    ]
    for (const k of kws) expect(keywordText(k).length).toBeGreaterThan(3)
    expect(familyLabel(undefined)).toBe('Unknown kind')
  })
})

describe('battle captions for combat depth', () => {
  const names = (id: string) => id.toUpperCase()
  const ev = (e: Record<string, unknown>) => ({ seq: 0, tick: 0, ...e }) as CombatEvent

  it('caption cover, follow-up, rivalry and the floor’s conditions', () => {
    expect(depthSnap(ev({ kind: 'cover', unitId: 'b', allyId: 'a', actorId: 'e' }), names)).toMatchObject({ actor: 'b', target: 'a' })
    expect(depthSnap(ev({ kind: 'cover', unitId: 'b', allyId: 'a', actorId: 'e' }), names)!.caption).toContain('B')
    expect(depthSnap(ev({ kind: 'followup', unitId: 'b', allyId: 'a', targetId: 'e' }), names)).toMatchObject({ actor: 'b', target: 'e' })
    expect(depthSnap(ev({ kind: 'rivalry', unitId: 'a', rivalId: 'b', targetId: 'e' }), names)!.caption).toContain('B')
    expect(depthSnap(ev({ kind: 'floor-mods', modifiers: ['fog', 'gale'] }), names)!.caption).toContain('Fog')
    expect(depthSnap(ev({ kind: 'death', unitId: 'a' }), names)).toBeNull()
    for (const k of ['cover', 'followup', 'rivalry', 'floor-mods'] as const) expect(DEPTH_DURATION[k]).toBeGreaterThan(0)
  })

  it('every modifier has a name and a rule', () => {
    for (const m of FLOOR_MODIFIERS) {
      expect(modifierName(m).length).toBeGreaterThan(2)
      expect(modifierRule(m).length).toBeGreaterThan(8)
    }
  })
})
