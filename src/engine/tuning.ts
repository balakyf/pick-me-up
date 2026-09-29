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
    /** Damage multiplier a `vulnerable` keyword applies to hits of its element. */
    vulnerableMult: 1.5,
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
    /** Advanced (gem) pool (Layer 1 §1.1–1.3). */
    advanced: {
      costGems: 150,
      /** A 10-pull is discounted (canon 1,350). */
      tenPullGems: 1350,
      rates: { 3: 80, 4: 18, 5: 2 } as Record<number, number>,
      /** The Nth consecutive pull without a 4★+ is lifted to 4★+. */
      pityFloor4At: 30,
      /** The Nth consecutive pull without a 5★ is lifted to 5★. */
      pityFloor5At: 90,
      /** Learnable skills a summoned 4★/5★ arrives with (on top of its class skill). */
      extraSkills: { 4: 1, 5: 2 } as Record<number, number>,
      /** Exclusive weapon grade a summoned 4★/5★ arrives with. */
      weaponGrade: { 4: 'B', 5: 'A' } as Record<number, string>,
    },
  },

  /** Engravings / Imprints (Layer 1 §5.4). */
  engravings: {
    /** Grade weights for a summoned engraving (a 5★ is lifted one grade). */
    summonGradeWeights: { C: 50, B: 35, A: 15 } as Record<string, number>,
    /** Chance a hero promoted into 4★+ without an engraving awakens one (at grade C). */
    promotionAwakenChance: 0.3,
    /** CP an engraving adds, by grade. */
    cp: { C: 20, B: 40, A: 70, S: 110 } as Record<string, number>,
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
    /** The top of the tower: F100, the summit (Layer 2 §1.3). */
    sliceTopFloor: 100,
    /** F90: clearing it ends the world (canon). */
    worldEndFloor: 90,
    /** Past F70 (the inflection) mobs gain this many extra levels per floor. */
    inflectionFloor: 70,
    inflectionLevelPerFloor: 0.9,
    /** Past the inflection the budget exponent eases to this (the LEVEL curve steepens
     *  instead), so a maxed party can reach the summit. */
    latePowerBase: 1.04,
    /** A filler wave holds at most this many enemies; past it, enemies grow elite instead. */
    fillerMaxUnits: 8,
    /** Elite stat multiplier step when a capped filler wave (or an anchor) is short of budget. */
    elitePowerStep: 1.08,
    /** Anchors above F20 are raised until their ΣCP reaches budget × this. */
    anchorBudgetMult: 1.1,
    /** The Wailing Wall (F80–89) is built from this seed for every account (canon). */
    wallSeed: 80_808_080,
    /** Swamp/Order/Void filler: chance of a Survival / Escape mission instead of Subjugation. */
    lateSurvivalChance: 0.2,
    lateEscapeChance: 0.15,
    /** Filler Escape: steps to cover; Survival: ticks to outlast. */
    escapeDistance: 40,
    lateSurviveTicks: 800,
    /** Anchor timers and distances. */
    f25EscapeDistance: 55,
    f41ChaseTicks: 420,
    f45DeliveryDistance: 60,
    f65SurviveTicks: 1000,
    f95SurviveTicks: 1200,
    /** The looped mission (canon F36–40, 5 attempts; failing F40 drops the room to F31). */
    loop: { start: 36, gate: 40, fallbackTo: 31, attempts: 5, scarLevels: 4 },
    /** F15 Escort anchor: canon 15-minute assassination window → tick budget. */
    f15SurviveTicks: 900,
    /** Ruins filler (F11–19): chance a floor rolls a Survival mission instead of Subjugation. */
    ruinsSurvivalChance: 0.3,
    /** Ruins Survival filler: ticks to outlast. */
    ruinsSurviveTicks: 700,
    /** F20 Halgiraf: the boss enrages after this tick (the fight is a race). */
    f20EnrageTick: 450,
  },

  /** Event floors, hidden objectives and the tournament (Layer 2 §5). First-pass. */
  events: {
    /** Recovery event opens when one battle permadies at least this many heroes. */
    recoveryDeaths: 3,
    /** Rest: Sanity restored to every living hero. */
    restSanity: 40,
    /** Treasure: gold = treasureGoldPerFloor × floor, plus stones. */
    treasureGoldPerFloor: 60,
    treasureStones: 2,
    /** Merchant: stones bought, and gold paid per stone. */
    merchantStones: 4,
    merchantGoldPerStone: 150,
    /** Gamble: win chance; win = treasure × gambleWinMult; lose = −gambleSanity to the party. */
    gambleChance: 0.5,
    gambleWinMult: 3,
    gambleSanity: 20,
    /** Master Level from which hidden-objective hints are shown (the half-Master's sight). */
    hiddenHintMasterLevel: 10,
    /** Tournament (canon F41/42): three rounds against rivals at these CP ratios. */
    tournament: {
      rivalCpRatios: [0.8, 1.0, 1.2],
      /** Rewards by rounds won (0..3). */
      goldByWins: [300, 800, 1600, 3000],
      gemsByWins: [0, 10, 25, 60],
      stonesByWins: [0, 1, 3, 6],
      /** Party Raid: the boss round's tick budget. */
      raidTicks: 500,
    },
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
    facilityStartLevels: { kitchen: 1, promotionChamber: 0, tacticalCenter: 1, trainingCenter: 0, transferStation: 0 },
    /** Master Level — the lobby progression spine (Layer 3 §3.1). */
    master: {
      /** masterXpToNext(L) = round(coeff × L^exp); levels stop at `cap`. */
      xpCoeff: 60,
      xpExp: 1.8,
      cap: 100,
      /** Master XP granted per source. */
      xpPerFloorClear: 12,
      xpPerFirstClear: 30,
      xpPerPromotion: 40,
      xpPerFacilityUpgrade: 25,
      xpPerTrainingDrill: 5,
    },
    /** Facility upgrades — gold cost × growth^level, world-time timer, gem-skippable. */
    facilities: {
      /** Hard slice cap on any facility level (also bounded by `level ≤ masterLevel`). */
      maxLevel: 10,
      /** Master Level required to BUILD the Promotion Chamber (level 0 → 1). */
      chamberUnlockMasterLevel: 3,
      /** Master Level required for a facility's first build (level 0 → 1). Absent = ML1. */
      unlockMasterLevel: { promotionChamber: 3, trainingCenter: 2, transferStation: 4 } as Record<string, number>,
      /** upgradeCost(level) = round(baseCost × costGrowth^level), in gold. */
      baseCost: {
        kitchen: 800,
        promotionChamber: 1200,
        tacticalCenter: 1000,
        trainingCenter: 900,
        transferStation: 1100,
      } as Record<string, number>,
      costGrowth: 1.5,
      /** Build timer per TARGET level (world-time ms): ~`durationPerLevel × toLevel`. */
      durationPerLevel: 15 * 60_000,
      /** Gems to skip a facility build outright. */
      skipGemCost: 40,
    },
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
      /** Star ceiling. 6★→7★ is paid with a Book of Reverse Heaven, not stones (§3.4). */
      maxStar: 7,
      /** The one item a 6★→7★ promotion consumes. */
      bookId: 'bookOfReverseHeaven',
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
        7: 12 * 3_600_000,
      } as Record<number, number>,
      /** Each Promotion Chamber level cuts the timer by this fraction… */
      chamberSpeedupPerLevel: 0.1,
      /** …down to no less than this fraction of the base (a floor on the speed-up). */
      minDurationFactor: 0.4,
      /** Gems to skip a promotion (or facility) timer outright. */
      skipGemCost: 50,
    },
    /** Synthesis: the second permadeath path (Layer 1 §4). Pure; instant (no timer). */
    synthesis: {
      /** Master Level that unlocks the Synthesis Chamber. */
      unlockMasterLevel: 3,
      /** Transfer efficiency η — the upward-only grade-nudge magnitude (canon ≈10%). */
      transferEfficiency: 0.1,
      /** Transfer efficiency for a 7★ survivor — the canon "absorption" engine (§4.3). */
      transferEfficiency7: 0.25,
      /** Per-sacrifice chance (Transfer) to copy the one missing skill drawn, by its grade. */
      skillCopyChanceByGrade: { F: 0.35, E: 0.35, D: 0.3, C: 0.25, B: 0.18, A: 0.1, S: 0.06, U: 0.03 } as Record<string, number>,
      /** Sanity drained from the survivor per sacrifice (Transfer) or per rescue (Salvage). */
      survivorSanityCost: 15,
      /** Sanity hit to each OTHER living hero — the roster witnesses the loss. */
      witnessSanityCost: 5,
      /** Salvage render payout by sacrificed star: a lossy fraction of reach-cost. */
      salvageYield: {
        1: { promotionStone: 1, attrStone: 0 },
        2: { promotionStone: 1, attrStone: 0 },
        3: { promotionStone: 6, attrStone: 3 },
        4: { promotionStone: 14, attrStone: 7 },
        5: { promotionStone: 30, attrStone: 15 },
        6: { promotionStone: 62, attrStone: 31 },
      } as Record<number, { promotionStone: number; attrStone: number }>,
    },
    /** Equipment (Layer 1 §5). Pure; instant; deterministic forge (success rates → L3). */
    equipment: {
      /** Master Level that unlocks the Smithy (the forge). */
      unlockMasterLevel: 2,
      /** Per-grade magnitude `m` — the canon weapon-ATK ladder (§5.2). */
      gradeMagnitude: { E: 5, D: 12, C: 25, B: 45, A: 75, S: 120, SS: 190, SSS: 300 } as Record<string, number>,
      /** Slot stat blocks derived from `m` (weapon is m for both ATKs). */
      slotMult: {
        armorHpPerM: 4,
        armorPDefPerM: 0.6,
        accessoryCritPerM: 0.15,
        accessorySpdPerM: 0.2,
      },
      /** Best grade unlocked at a Master Level (highest threshold ≤ ml wins). */
      forgeGradeThresholds: { 1: 'E', 3: 'D', 6: 'C', 10: 'B', 15: 'A', 20: 'S' } as Record<number, string>,
      /** Forge cost per grade: gold + Promotion Stones (existing faucet). */
      forgeCost: {
        E: { gold: 400, promotionStone: 1 },
        D: { gold: 900, promotionStone: 2 },
        C: { gold: 1800, promotionStone: 4 },
        B: { gold: 3600, promotionStone: 8 },
        A: { gold: 7200, promotionStone: 16 },
        S: { gold: 14000, promotionStone: 32 },
      } as Record<string, { gold: number; promotionStone: number }>,
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

  /** Skills (Layer 1 §2): grade ladder, auto-learn curve, CP feed. First-pass. */
  skills: {
    /** Level cap per grade. */
    maxLevel: { F: 4, E: 4, D: 4, C: 5, B: 5, A: 5, S: 6, U: 6 } as Record<string, number>,
    /** CP weight per grade (skillScore = Σ gradeValue × level). */
    gradeValue: { F: 1, E: 2, D: 3, C: 4, B: 5, A: 6, S: 8, U: 10 } as Record<string, number>,
    /** Casts needed to go from level N to N+1 (index = N; frozen integer curve). */
    xpToNext: [0, 3, 5, 8, 12, 18] as readonly number[],
    /** CP per point of skillScore. */
    cpPerSkillScore: 2,
    /** Training Center drills (Layer 1 §2.4 lever; Layer 3 facility row). First-pass. */
    training: {
      /** Highest trainable grade at a Training Center level (highest threshold ≤ level wins). */
      maxGradeThresholds: { 1: 'E', 2: 'D', 4: 'C', 6: 'B' } as Record<number, string>,
      /** Use-XP a refine drill grants: base + perLevel × (level − 1). */
      drillXpBase: 3,
      drillXpPerLevel: 1,
      /** World-time length of one drill (1 world-hour ≈ 20 real minutes). */
      drillDurationMs: 60 * 60_000,
      /** Gold per drill by the skill's grade; a learn drill costs ×learnMult. */
      drillGold: { F: 100, E: 150, D: 300, C: 600, B: 1200, A: 2400, S: 4800, U: 9600 } as Record<string, number>,
      learnMult: 2,
      /** Gems to finish a drill immediately. */
      skipGemCost: 15,
    },
    /** Passive skills gain this much use-XP per battle survived (they are never cast). */
    passiveXpPerBattle: 1,
    /** Transfer Station (Layer 1 §2.4 "crafted at the Transfer Station"; bible "skill transfer"). */
    transfer: {
      /** Highest transferable grade at a station level (highest threshold ≤ level wins). */
      maxGradeThresholds: { 1: 'D', 3: 'C', 5: 'B', 7: 'A' } as Record<number, string>,
      /** From this station level a transferred skill keeps its full level (else level − 1). */
      keepLevelAt: 5,
      /** Transfer gold = drillGold[grade] × this. */
      transferMult: 3,
      /** Fuse gold = drillGold[result grade] × this. */
      fuseMult: 2,
      /** A station fuse needs both merge inputs at ≥ recipe.minLevel − this. */
      earlyFuseLevels: 1,
    },
  },

  account: {
    schemaVersion: 7,
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
