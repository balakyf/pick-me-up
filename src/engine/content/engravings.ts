/**
 * Engravings / Imprints (각인) — the 4★+ identity layer (Layer 1 §5.4).
 *
 * Every engraving is pure data: per grade, the keyword tags (Layer 0 §2.6) it lends
 * its bearer plus optional % bonuses to derived stats. `weight` is the relative roll
 * weight among engravings — True Black Dragon's Blood is the canon 2%.
 */

import type { EngravingDef, EngravingGrade } from '../types'

export const ENGRAVING_GRADES: readonly EngravingGrade[] = ['C', 'B', 'A', 'S']

export const ENGRAVINGS: Record<string, EngravingDef> = {
  // Anasis's bloodline. A: ~1s invincibility; S: +20% defenses and more invincibility.
  black_dragon_blood: {
    id: 'black_dragon_blood',
    name: "True Black Dragon's Blood",
    weight: 2,
    blurb: 'Dragon scales surface at the moment of impact.',
    byGrade: {
      C: { keywords: [{ kind: 'aegis', charges: 1 }] },
      B: { keywords: [{ kind: 'aegis', charges: 1 }], statPct: { pDef: 0.08, mDef: 0.08 } },
      A: { keywords: [{ kind: 'aegis', charges: 2 }], statPct: { pDef: 0.12, mDef: 0.12 } },
      S: { keywords: [{ kind: 'aegis', charges: 3 }], statPct: { pDef: 0.2, mDef: 0.2 } },
    },
  },
  // Kishasha's heritage: the beast comes out when the bearer is cornered.
  beast_king_heir: {
    id: 'beast_king_heir',
    name: "Beast King's Heir",
    weight: 24.5,
    blurb: 'Below half health, the beast takes over.',
    byGrade: {
      C: { keywords: [{ kind: 'frenzy', belowHpPct: 50, multiplier: 1.2 }] },
      B: { keywords: [{ kind: 'frenzy', belowHpPct: 50, multiplier: 1.3 }] },
      A: { keywords: [{ kind: 'frenzy', belowHpPct: 50, multiplier: 1.45 }] },
      S: { keywords: [{ kind: 'frenzy', belowHpPct: 50, multiplier: 1.6 }] },
    },
  },
  sword_saint_mark: {
    id: 'sword_saint_mark',
    name: "Sword Saint's Mark",
    weight: 24.5,
    blurb: 'The first blow of every battle lands with everything behind it.',
    byGrade: {
      C: { keywords: [{ kind: 'opener', multiplier: 1.5 }] },
      B: { keywords: [{ kind: 'opener', multiplier: 1.8 }] },
      A: { keywords: [{ kind: 'opener', multiplier: 2.2 }] },
      S: { keywords: [{ kind: 'opener', multiplier: 2.6 }] },
    },
  },
  blood_pact: {
    id: 'blood_pact',
    name: 'Blood Pact',
    weight: 24.5,
    blurb: 'Wounds dealt close the bearer’s own.',
    byGrade: {
      C: { keywords: [{ kind: 'lifesteal', fraction: 0.08 }] },
      B: { keywords: [{ kind: 'lifesteal', fraction: 0.12 }] },
      A: { keywords: [{ kind: 'lifesteal', fraction: 0.18 }] },
      S: { keywords: [{ kind: 'lifesteal', fraction: 0.25 }] },
    },
  },
  iron_oath: {
    id: 'iron_oath',
    name: 'Iron Oath',
    weight: 24.5,
    blurb: 'A vow that turns aside a share of every blow.',
    byGrade: {
      C: { keywords: [{ kind: 'guard', reduction: 0.08 }] },
      B: { keywords: [{ kind: 'guard', reduction: 0.12 }] },
      A: { keywords: [{ kind: 'guard', reduction: 0.16 }] },
      S: { keywords: [{ kind: 'guard', reduction: 0.22 }] },
    },
  },
}
