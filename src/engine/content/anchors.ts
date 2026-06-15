/**
 * Authored set-piece anchor floors. tower builds an Encounter from an AnchorDef:
 * each AnchorWaveSpec group becomes round(attrMult * (mobLevel + levelBonus))
 * enemies, chained as waves (clearing one spawns the next).
 *
 * In the slice we author F5 (Survival) and F10 (Defense). Every templateId here
 * MUST exist in ENEMY_TEMPLATES (asserted in tests).
 */

import type { AnchorDef } from '../types'
import { TUNING } from '../tuning'

export const ANCHORS: Record<number, AnchorDef> = {
  // ── F5: Survival ───────────────────────────────────────────────────────────
  // Canon: "Survive the invading goblins for 30 minutes." The waves keep
  // attacking; success is OUTLASTING them for f5SurviveTicks (the timer), not
  // annihilation. Two moderate Prairie waves.
  5: {
    floor: 5,
    missionType: 'Survival',
    objectives: [{ kind: 'survive', ticks: TUNING.tower.f5SurviveTicks }],
    timer: TUNING.tower.f5SurviveTicks,
    waves: [
      [
        { templateId: 'goblin', count: 4 },
        { templateId: 'wolf', count: 2 },
      ],
      [
        { templateId: 'goblin', count: 3 },
        { templateId: 'harpy', count: 2 },
        { templateId: 'wolf', count: 1 },
      ],
    ],
  },

  // ── F10: Defense ─────────────────────────────────────────────────────────
  // FUSES the two canon F10 logs per bible Open-Q2 (the Townia & Taoni floor logs
  // are reconciled as one account's floor): Townia's "Stop the fall of the city —
  // 3 waves, last = Lv999 creature" + Taoni's "Defense, special: exterminate the
  // Black Priest". So F10 = Defend 3 waves AND Defeat(black_priest).
  //
  // PUZZLE, not stat-check: wave 3 contains the Lv999 creature (Enrage) which is
  // NOT meant to be killed. Success = clear the 3 waves + defeat the (phased)
  // Black Priest. The Black Priest is phased: untargetable until the rest of its
  // wave (incl. the Lv999 creature is intended to be outlasted/escaped) is down.
  10: {
    floor: 10,
    missionType: 'Defense',
    objectives: [
      { kind: 'defend', waves: TUNING.tower.f10Waves },
      { kind: 'defeat', targetTag: 'black_priest' },
    ],
    timer: null,
    waves: [
      // Wave 1 — the city's outer line: goblin raiders + undead vanguard.
      [
        { templateId: 'goblin', count: 5 },
        { templateId: 'skeleton', count: 2 },
      ],
      // Wave 2 — heavier push: brute + dark casters.
      [
        { templateId: 'ogre_brute', count: 1 },
        { templateId: 'dark_mage', count: 2 },
        { templateId: 'skeleton', count: 2 },
      ],
      // Wave 3 — the finale: the unkillable Lv999 creature (Enrage puzzle) AND the
      // phased Black Priest (the Defeat target). Slay the Priest; do NOT chase the
      // Lv999.
      [
        {
          templateId: 'lv999_creature',
          count: 1,
          levelBonus: 50,
          keywords: [{ kind: 'enrage', afterTick: 300, multiplier: 5 }],
        },
        {
          templateId: 'black_priest',
          count: 1,
          levelBonus: 10,
          targetTag: 'black_priest',
          keywords: [{ kind: 'phased' }],
        },
      ],
    ],
  },
}
