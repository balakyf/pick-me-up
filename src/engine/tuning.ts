/**
 * THE balance dial. Every first-pass numeric constant in the engine lives here so
 * a balance pass touches exactly one file. Engine modules import these; they never
 * hardcode a magic number. Formula SHAPES live in their modules; the NUMBERS live here.
 *
 * All values are first-pass per the GDD ("structure is the deliverable, numbers
 * are tuning knobs").
 */

import type { Star, StarEnvelope, Element } from './types'

export const TUNING = {
  stats: {
    /** Attribute gain per level per grade-point: attribute(L) = base + grade*(L-1)*G. */
    growthG: 0.6,
    derived: {
      // Coefficients for the Layer 0 §1.3 derived-stat formulas.
      hpPerVit: 12,
      hpFlat: 50,
      pAtkPerStr: 2.2,
      pAtkPerAgi: 0.5,
      mAtkPerInt: 2.4,
      pDefPerVit: 0.8,
      pDefPerStr: 0.4,
      mDefPerWil: 1.0,
      mDefPerInt: 0.6,
      spdFlat: 40,
      spdPerAgi: 0.6,
      critFlat: 5,
      critPerAgi: 0.15,
      evaPerAgi: 0.1,
      accFlat: 90,
      accPerAgi: 0.1,
      statusResPerWil: 0.2,
      // Caps. CRIT cap is canon (§1.3 = 60); EVA/STATUS_RES are "capped" with no
      // canon value, so these are first-pass tuning defaults.
      critCap: 60,
      evaCap: 40,
      statusResCap: 80,
    },
  },

  xp: {
    /** xpToNext(L) = round(base * L^exp). Baked into an integer table at load to
     *  avoid runtime Math.pow (cross-engine determinism). */
    base: 25,
    exp: 2.2,
    /** Highest level the baked table needs to cover (7★ cap). */
    maxLevel: 150,
  },

  combat: {
    /** Defense diminishing-returns midpoint: K = flat + perLevel * attackerLevel. */
    defenseKFlat: 50,
    defenseKPerLevel: 8,
    elementAdvantage: 1.5,
    elementDisadvantage: 0.75,
    critMult: 1.5,
    varianceMin: 0.95,
    varianceMax: 1.05,
    /** Action gauge fills to this, then the unit acts. */
    actionGaugeMax: 1000,
    /** SP pool: maxSP = flat + perWil * WIL. */
    spFlat: 100,
    spPerWil: 2,
    /** Accuracy/evasion miss resolution is OFF for the slice (reliable entry floors). */
    modelAccuracy: false,
    /** Hard tick budget so a stalled battle always terminates. */
    maxTicks: 5000,
  },

  cp: {
    weights: {
      maxHP: 0.1,
      pAtk: 1.0,
      mAtk: 1.0,
      pDef: 0.6,
      mDef: 0.6,
      spd: 1.5,
      /** CP crit term is (CRIT% × critMult) × critWeight. Stored split so the
       *  embedded critMult is never silently dropped (= effective weight 3.0). */
      critMult: 1.5,
      critWeight: 2.0,
    },
  },

  gacha: {
    /** Normal pool only in the slice. */
    normalCostGold: 3000,
    /** Star weights for the Normal pool (1★/2★/3★). */
    normalRates: { 1: 70, 2: 25, 3: 5 } as Record<number, number>,
    /** Rising quality FLOOR: a dry streak raises the minimum star. Normal pool
     *  guarantees a 3★ on the Nth consecutive dry pull. */
    normalPityFloor3At: 50,
    /** Chance a qualifying summon resolves to an authored cameo (vs procedural),
     *  when an eligible un-consumed cameo of the rolled star exists. */
    cameoChance: 0.35,
    /** Mage is gacha-only and rare; chance a 3★+ classed roll becomes a Mage. */
    mageChance: 0.08,
  },

  tower: {
    /** floorPower(f) = base * powerBase^f * (1 + stepBonus*floor(f/5)) * worldMult. */
    base: 60,
    powerBase: 1.06,
    stepBonus: 0.15,
    /** Filler power-budget tolerance: fill enemies until ΣCP within ±this of budget. */
    budgetTolerance: 0.1,
    /** mobLevel(f) = round(f * mobLevelPerFloor * worldMult). */
    mobLevelPerFloor: 1.25,
    worldMult: { C: 1.0, B: 1.8, A: 2.6, S: 3.5 } as Record<string, number>,
    /** F5 Survive anchor: 30 min of canon → tick budget (1 tick ≈ a fast beat). */
    f5SurviveTicks: 1200,
    /** F10 Defend anchor wave count. */
    f10Waves: 3,
  },

  economy: {
    /** floorGold(f) = goldPerFloor * f * worldMult; first clear ×firstClearMult. */
    goldPerFloor: 100,
    firstClearMult: 3,
    /** floorXP(f) tuned so ~3–4 at-tier clears ≈ one level on the Layer 0 curve. */
    xpPerFloor: 90,
    /** Fresh account grant so the loop can start: enough for exactly one Normal pull. */
    startingGold: 3000,
  },

  time: {
    /** Real→world-time dilation (canon: 1 Earth day = 3 world days). */
    worldTimeFactor: 3,
  },

  // ⚠ BALANCE PASS PENDING — every constant in `lobby` below (Sanity pressure/regen,
  // promotion costs & timers, daily reward amounts, tactical bonuses, gem costs) is a
  // FIRST-PASS value chosen for structure, not tuned for pacing. Treat as the primary
  // dials for a dedicated balance pass against a target session length / F2P curve.
  lobby: {
    /** Fresh-account premium currency. */
    startingGems: 0,
    /** Sanity is per-hero, 0..100; heroes summon at full. */
    sanityMax: 100,
    /** Facilities present at account creation. 0 = locked / not yet built. */
    facilityStartLevels: { kitchen: 1, promotionChamber: 0, tacticalCenter: 1 },
    /** Sanity drain on a floor attempt (Layer 3 §3.2). Applied to deployed survivors. */
    sanity: {
      /** Baseline Sanity each deployed hero loses per floor attempt. */
      driftBase: 6,
      /** Extra drain scaled by how outmatched the party is: k × (floorPower / partyCP). */
      driftPerPowerRatio: 6,
      /** Cap on the pre-wipe/witness drain so one brutal floor can't zero a hero. */
      driftMax: 35,
      /** Added when the party WIPES — a defeat is hard on morale. */
      wipePenalty: 12,
      /** Added to every survivor when an ally PERMADIES this battle (canon: bad for morale). */
      witnessPenalty: 20,
    },
    /** Passive Sanity recovery over world-time (in `time.advanceTime`). */
    regen: {
      /** Sanity restored per WORLD-hour at Kitchen level 1. */
      perWorldHour: 2,
      /** Added to the per-world-hour rate for each Kitchen level above 1. */
      perKitchenLevel: 1,
    },
    /** Low-Sanity combat effects (Layer 3 §3.2), read in `unit`/`combat`. */
    combat: {
      /** At/above this, no penalty. Below it (down to `majorThreshold`), the minor penalty. */
      minorThreshold: 60,
      /** Below this, the major penalty AND panic risk apply. */
      majorThreshold: 30,
      /** Stat multiplier in the minor band [majorThreshold, minorThreshold). */
      minorMult: 0.95,
      /** Stat multiplier in the major band [0, majorThreshold). */
      majorMult: 0.85,
      /** Panic chance below majorThreshold = (majorThreshold − sanity)/100, mitigated by statusRes. */
      panicThreshold: 30,
    },
    /** Kitchen Banquet: spend gold → roster-wide Sanity bump. */
    banquet: {
      /** Gold cost of one Banquet. */
      gold: 500,
      /** Sanity restored to every LIVING hero per Banquet (clamped to sanityMax). */
      restore: 40,
    },
    /** Promotion: the "raise, don't roll" engine (Layer 1 §3, lobby §3.3). */
    promotion: {
      /** Slice star ceiling — 6★→7★ needs the out-of-slice Book of Reverse Heaven. */
      maxStar: 6,
      /** Promotion Stones required per TARGET star (canon doubling curve). */
      stoneCost: { 2: 10, 3: 20, 4: 40, 5: 80, 6: 160 } as Record<number, number>,
      /** Element-matched Attribute Stones = stoneCost ÷ this (the canon ½). */
      attrStoneDivisor: 2,
      /** Base world-time duration per TARGET star (ms): ~10 world-min (→2★) … ~6 world-hr (→6★). */
      durationMs: {
        2: 10 * 60_000,
        3: 30 * 60_000,
        4: 60 * 60_000,
        5: 3 * 3_600_000,
        6: 6 * 3_600_000,
      } as Record<number, number>,
      /** Each Promotion Chamber level cuts the timer by this fraction… */
      chamberSpeedupPerLevel: 0.1,
      /** …down to no less than this fraction of the base (a floor on the speed-up). */
      minDurationFactor: 0.4,
      /** Gems to skip a promotion (or facility) timer outright. */
      skipGemCost: 50,
    },
    /** Tower material faucet (thin trickle; Daily Dungeons are the primary source, Phase 5). */
    materialDrops: {
      /** Chance a cleared floor drops a Promotion Stone. */
      promotionStoneChance: 0.25,
      /** Chance a cleared floor drops an element-matched Attribute Stone. */
      attrStoneChance: 0.2,
      /** First-clear bonus: both chances are multiplied by this on a never-cleared floor. */
      firstClearMult: 2,
    },
    /** Tactical Center — amplifies the existing focus/overlook combat levers (Layer 3 §3.4). */
    tactical: {
      /** Concentrate-fire damage bonus on the FOCUSED enemy, per Tactical Center level (~+6%/lvl). */
      focusBonusPerLevel: 0.06,
      /** Overlook slots = base + floor(level/2): how many allies enemies are steered off. */
      overlookBaseSlots: 1,
    },
    /** Daily Dungeons — the primary, targeted material faucet (Layer 3 §3.5). Non-lethal. */
    daily: {
      /** Free attempts per world-day (reset on the world-day boundary in advanceTime). */
      freeAttempts: 3,
      /** Gems charged per attempt beyond the free allotment (the canon refill). */
      extraAttemptGemCost: 30,
      /** Light gate: dailies unlock once the player has cleared this tower floor. */
      unlockHighestCleared: 1,
      /** Win rewards per weekday (dayIndex % 7 → Mon…Sun). First-pass, all tunable. */
      rewards: {
        goldVault: 600, // Mon — Gold Vault
        attrStones: 2, // Tue — Elemental Trial (element rotates by day)
        promotionStones: 2, // Wed — Promotion Grounds
        rankMaterials: 1, // Wed — rank material alongside stones
        heroXp: 120, // Thu — Proving Hall (to deployed survivors)
        gemsBundle: 20, // Fri — Soulforge
        armoryStones: 1, // Sat — Armory (a stone of each kind)
        convergenceGold: 250, // Sun — Convergence (reduced mix)
        convergenceStones: 1, // Sun — small stone trickle
      },
      /** Elements the Tue Elemental Trial rotates through (by day index). */
      elementRotation: ['fire', 'water', 'earth', 'wind', 'light', 'dark'] as const,
    },
  },

  account: {
    schemaVersion: 2,
    /** Canon protagonist account id (display only). */
    defaultAccountId: '46631913',
    partySize: 5,
  },
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Star → stat envelope table (Layer 0 §4.2 + §3.1). One owner; gacha consumes it.
// ─────────────────────────────────────────────────────────────────────────────

export const STAR_ENVELOPES: Readonly<Record<Star, StarEnvelope>> = {
  1: { star: 1, baseAttrRange: [1, 8], gradeCeiling: 3, levelCap: 10 },
  2: { star: 2, baseAttrRange: [5, 15], gradeCeiling: 4, levelCap: 20 },
  3: { star: 3, baseAttrRange: [12, 25], gradeCeiling: 6, levelCap: 40 },
  4: { star: 4, baseAttrRange: [20, 40], gradeCeiling: 8, levelCap: 60 },
  5: { star: 5, baseAttrRange: [35, 60], gradeCeiling: 9, levelCap: 80 },
  6: { star: 6, baseAttrRange: [55, 80], gradeCeiling: 10, levelCap: 99 },
  7: { star: 7, baseAttrRange: [75, 100], gradeCeiling: 10, levelCap: 150 },
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Element wheel (Layer 0 §2.5). advantage[a] = the element `a` is strong against.
// ─────────────────────────────────────────────────────────────────────────────

/** Maps an attacker element to the defender element it is ADVANTAGED against. */
export const ELEMENT_ADVANTAGE: Readonly<Partial<Record<Element, Element>>> = {
  fire: 'wind',
  wind: 'earth',
  earth: 'water',
  water: 'fire',
  light: 'dark',
  dark: 'light',
  // physical is neutral to all (no entry).
} as const
