/**
 * Tower challenges — tuning (bond groups, side rooms, raids, the weekly trial). Kept in
 * the module rather than the shared TUNING so the numbers live next to their rules; see
 * docs/superpowers/specs/2026-09-30-tower-challenges.md.
 */
import type { BonusRoomKind, Element } from '../types'

export const CHALLENGE = {
  bonds: {
    /** Chance a ten-pull brings a bond group, by pool (the Advanced crystal binds more). */
    chance: { normal: 0.2, advanced: 0.35 },
    /** Group-size weights: pairs are by far the likeliest, a full band of five is rare. */
    sizeWeights: [
      { item: 2, weight: 60 },
      { item: 3, weight: 22 },
      { item: 4, weight: 10 },
      { item: 5, weight: 8 },
    ],
    /** Mutual affinity bond members start with (≥ the close-friend line). */
    startAffinity: 65,
    /** Set bonus: +perExtra stats per member fighting beyond the first… */
    perExtra: 0.03,
    /** …and +fullSet more when every member of the group fights together. */
    fullSet: 0.05,
    /** A bond member's death hits the others this much harder (grief and Sanity). */
    griefMult: 1.5,
  },

  rooms: {
    /** Chance an anchor's first clear reveals a side room. */
    chance: 0.6,
    weights: [
      { item: 'vault', weight: 22 },
      { item: 'shrine', weight: 14 },
      { item: 'lostHero', weight: 12 },
      { item: 'merchant', weight: 22 },
      { item: 'training', weight: 16 },
      { item: 'mimic', weight: 14 },
    ] as { item: BonusRoomKind; weight: number }[],
    /** Treasure Vault: gold per floor, plus Promotion Stones. */
    vaultGoldPerFloor: 45,
    vaultStones: 2,
    /** Cursed Shrine: Sanity every deployable party hero pays, for +buff stats next floor. */
    shrineSanity: 18,
    shrineBuff: 0.12,
    /** Training Grounds: XP to the party, as a multiple of the floor's clear XP. */
    trainingXpMult: 1.5,
    /** Mimic: its level as a share of the floor's enemy level; its loot. */
    mimicLevelShare: 1.25,
    mimicGoldPerFloor: 70,
    mimicStones: 3,
    /** Wandering Merchant: prices = base + perFloor × floor (a gold sink that keeps pace). */
    merchant: {
      stones: { qty: 3, base: 360, perFloor: 12 },
      attr: { qty: 2, base: 240, perFloor: 8 },
      rank: { qty: 1, base: 300, perFloor: 10 },
      gear: { qty: 1, base: 500, perFloor: 30 },
    },
  },

  raids: {
    /** Anchors that open as replayable raids once first cleared, and their boss. */
    bosses: { 20: 'halgiraf', 35: 'kthat', 60: 'el_cid', 80: 'pryos' } as Record<number, string>,
    maxParties: 3,
    maxCrew: 3,
    /** The raid boss's HP pool is its anchor self × this (three parties' worth). */
    hpMult: 4,
    /** Each party fights for at most this many ticks before it falls back. */
    partyTicks: 250,
    /** The scales: damage of both types ×(1 − reduction) while they hold. */
    scaleReduction: 0.75,
    /** Ticks the scales stay broken at the start of each party's fight: the Master's ballista
     *  (× performance 0..1) plus each crew member (archers aim truer). */
    breakPerSkill: 60,
    breakPerCrew: 25,
    archerCrewMult: 1.5,
    /** A light hero or a mage on the crew holds the Goddess' altar: the break lasts longer. */
    altarMult: 1.25,
    /** Sanity the crew lose (they only man the ballista). */
    crewSanity: 5,
    /** The weekly reward chest (first clear each world-week). */
    reward: {
      gemsBase: 20,
      gemsPerFloor: 0.5,
      stonesBase: 4,
      stonesPerTen: 1,
      rankMaterial: 2,
      /** Chance of a page of the Book of Reverse Heaven: base + perFloor × floor. */
      pageBase: 0.15,
      pagePerFloor: 0.004,
    },
    /** Pages that bind into one Book of Reverse Heaven. */
    pagesPerBook: 5,
  },

  weekly: {
    attempts: 3,
    /** Waves in the gauntlet; wave w is drawn from floor 1 + floorStep × w. */
    waves: 30,
    floorStep: 3,
    /** The trial opens once this floor is cleared. */
    unlockFloor: 10,
    /** First-time rewards each week, by waves cleared. */
    thresholds: [
      { waves: 3, gems: 15, materials: { promotionStone: 1 } },
      { waves: 6, gems: 25, materials: { promotionStone: 2 } },
      { waves: 10, gems: 40, materials: { promotionStone: 3, rankMaterial: 1 } },
      { waves: 15, gems: 60, materials: { rankMaterial: 2 } },
      { waves: 20, gems: 100, materials: { reverseHeavenPage: 1 } },
    ] as { waves: number; gems: number; materials: Record<string, number> }[],
    /** "Enemies ×1.5 HP" weeks. */
    toughHpMult: 1.5,
    elements: ['fire', 'water', 'wind', 'earth', 'light', 'dark'] as Element[],
  },
} as const
