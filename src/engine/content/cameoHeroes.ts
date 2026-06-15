/**
 * Authored canon cameos. The gacha turns a HeroTemplate into a Hero/OwnedHero.
 *
 * CANON / SLICE RULES (enforced by tests):
 *  - 1★ AND 2★ heroes are CLASSLESS (heroClass === null). Canon: a hero only
 *    gains a class at 3★+ (Islat Han is "Novice/classless" as a 1★ tutorial hero).
 *  - Only star >= 3 cameos may carry a HeroClass ∈ warrior/spearman/thief/archer/mage.
 *  - Every baseAttrs value must fall in STAR_ENVELOPES[star].baseAttrRange and every
 *    growthGrade in [0, gradeCeiling].
 *  - Sirris is DELIBERATELY EXCLUDED — he is a whale-bait 4★ inflation hero (true
 *    worth ~1-3★) and is out of this slice.
 *
 * Niflheim "Top 5" members are canonically 6★ raised heroes; here they are authored
 * at slice-legal 3★ entry statlines (the rank they could plausibly be summoned at),
 * keeping their canon class/element/role flavor.
 *
 * portraitToken is a deterministic hex color seed — no art assets exist.
 */

import type { HeroTemplate } from '../types'

export const CAMEO_HEROES: HeroTemplate[] = [
  // ── Protagonist starter ──────────────────────────────────────────────────
  // Islat Han / Han Seojin / Loki. Reincarnated 1★ Lv1 tutorial hero, classless.
  // Canon Lv29 snapshot: high Str/Agi, very low Int. Rolled at the TOP of the 1★
  // band (base 1-8, grade<=3) so the protagonist is a viable starter.
  {
    templateId: 'islat_han',
    name: 'Islat Han',
    star: 1,
    heroClass: null,
    element: 'physical',
    baseAttrs: { str: 8, agi: 7, vit: 7, int: 2, wil: 4 },
    growthGrades: { str: 3, agi: 3, vit: 3, int: 1, wil: 2 },
    skillIds: ['power_strike'],
    portraitToken: '#d4af37', // golden bloodline
  },

  // ── ch.1 1★ classless co-starters (Townia timeline) ──────────────────────
  // Jenna/Zena Cirai (Shirai) — agile scout-type, classless at 1★.
  {
    templateId: 'jenna_cirai',
    name: 'Jenna Cirai',
    star: 1,
    heroClass: null,
    element: 'wind',
    baseAttrs: { str: 5, agi: 8, vit: 4, int: 4, wil: 5 },
    growthGrades: { str: 2, agi: 3, vit: 2, int: 2, wil: 2 },
    skillIds: [],
    portraitToken: '#6fb1d6',
  },
  // Aaron/Aron Delcut — sturdy front-liner, classless at 1★.
  {
    templateId: 'aaron_delcut',
    name: 'Aaron Delcut',
    star: 1,
    heroClass: null,
    element: 'earth',
    baseAttrs: { str: 7, agi: 4, vit: 8, int: 2, wil: 5 },
    growthGrades: { str: 3, agi: 1, vit: 3, int: 1, wil: 2 },
    skillIds: [],
    portraitToken: '#8a6d3b',
  },

  // ── 2★ classless (still no class per canon) ──────────────────────────────
  // Dika — ch.7 1★ → 2★ by ~ch.70; authored here at her 2★ entry, still classless.
  {
    templateId: 'dika',
    name: 'Dika',
    star: 2,
    heroClass: null,
    element: 'fire',
    baseAttrs: { str: 11, agi: 9, vit: 8, int: 7, wil: 9 },
    growthGrades: { str: 3, agi: 4, vit: 2, int: 2, wil: 3 },
    skillIds: [],
    portraitToken: '#c0392b',
  },

  // ── 3★+ classed cameos (Niflheim Top 5 flavor, slice-legal statlines) ────
  // Lidigyon (Ridigeon) — King's Sword, sword-demon → warrior.
  {
    templateId: 'ridigeon',
    name: 'Ridigeon',
    star: 3,
    heroClass: 'warrior',
    element: 'physical',
    baseAttrs: { str: 25, agi: 22, vit: 20, int: 13, wil: 18 },
    growthGrades: { str: 6, agi: 5, vit: 5, int: 3, wil: 4 },
    skillIds: ['power_strike'],
    portraitToken: '#9b59b6',
  },
  // Muden Nighdelk — King's Spear → spearman.
  {
    templateId: 'muden_nighdelk',
    name: 'Muden Nighdelk',
    star: 3,
    heroClass: 'spearman',
    element: 'earth',
    baseAttrs: { str: 23, agi: 18, vit: 22, int: 14, wil: 19 },
    growthGrades: { str: 5, agi: 4, vit: 6, int: 3, wil: 5 },
    skillIds: ['piercing_thrust'],
    portraitToken: '#2c3e50',
  },
  // Nihaku Gastfeel — Thunderbringer, bow/lightning → archer.
  {
    templateId: 'nihaku_gastfeel',
    name: 'Nihaku Gastfeel',
    star: 3,
    heroClass: 'archer',
    element: 'wind',
    baseAttrs: { str: 18, agi: 25, vit: 14, int: 16, wil: 17 },
    growthGrades: { str: 4, agi: 6, vit: 3, int: 4, wil: 4 },
    skillIds: ['thunder_volley'],
    portraitToken: '#f1c40f',
  },
]
