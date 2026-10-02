/**
 * Raids (canon: "3 parties / 15 heroes" for some bosses; F20's ballista phases). Once an
 * anchor with a raid boss is first cleared (F20 Halgiraf, F35 Kthat, F60 El Cid, F80
 * Pryos), the Master can raid it again from the Tower screen:
 *
 * - Up to three parties of five fight the boss ONE AFTER ANOTHER against a SHARED HP pool:
 *   the boss keeps every wound between parties. Each party has `partyTicks` before it
 *   falls back (survivors live); its wave-mates come back fresh for every party.
 * - The raid boss wears its scales (canon F20: immune to sword, arrow and magic — here a
 *   heavy `resist` to both damage types). The Master's ballista (meta.skill.ballista, or the
 *   minigame's performance) and up to three heroes assigned as ballista CREW (they don't
 *   fight) break the scales for a number of ticks at the start of every party's fight; a
 *   light hero or a mage on the crew holds the Goddess' altar and the break lasts longer.
 * - It is the tower: PERMADEATH applies to every fighter. Survivors lose Sanity like a
 *   floor attempt; everyone who came home earns the floor's XP on a clear.
 * - Rewards (the chest pays on the first clear each world-week): gems, Promotion Stones,
 *   rank material, and a chance at a page of the Book of Reverse Heaven (five pages bind
 *   into a Book).
 *
 * PURE and DETERMINISTIC: battle seeds are hash(seed, 'raid', floor, attempt, party).
 */
import type { CombatLog, CombatOutcome, CombatUnit, GameState, HeroId, KeywordTag, MaterialId, OwnedHero, RaidRecord } from '../types'
import { TUNING } from '../tuning'
import { SKILLS } from '../content'
import { buildCombatUnit } from '../unit'
import { runBattle } from '../combat'
import { buildEncounter, floorPower, floorXp, sanityDrain } from '../tower'
import { applyXp } from '../stats'
import { clampSanity } from '../kitchen'
import { releaseGear } from '../equipment'
import { addMasterXp } from '../master'
import { clampPerformance, practice } from '../minigames'
import { worldDayIndex } from '../daily'
import { rngFor, hash, chance } from '../rng/rng'
import { CHALLENGE } from './tuning'
import { bindPages, challengeOf, distinct, fitToFight, lineFor } from './challenge'
import { applyPartyBonuses } from './bonds'
import { withBonds } from '../depth'
import { moraleAdjust, refusesDeploy } from '../estate/deploy'
import { recordBattle } from '../codex'

const RD = CHALLENGE.raids

/** The world-week of a world-time (raids and the weekly trial share it with PvP). */
export function worldWeekOf(nowWorld: number): number {
  return Math.floor(worldDayIndex(nowWorld) / 7)
}

/** Raid anchors in floor order. */
export const RAID_FLOORS: readonly number[] = Object.keys(RD.bosses)
  .map(Number)
  .sort((a, b) => a - b)

/** The raids this account has unlocked (their anchors first cleared). */
export function raidsOpen(state: GameState): number[] {
  return RAID_FLOORS.filter((f) => state.tower.highestCleared >= f)
}

export function raidRecord(state: GameState, floor: number): RaidRecord {
  return challengeOf(state).raids[String(floor)] ?? { clears: 0, attempts: 0, lastClearWeek: -1 }
}

/** Is this week's reward chest still waiting for a clear? */
export function raidChestReady(state: GameState, floor: number, nowWorld: number): boolean {
  return raidRecord(state, floor).lastClearWeek !== worldWeekOf(nowWorld)
}

/** How long the scales stay broken at the start of each party's fight, and whether the
 *  crew holds the Goddess' altar. */
export function ballistaBreak(crew: readonly OwnedHero[], performance: number): { ticks: number; altar: boolean } {
  let ticks = RD.breakPerSkill * clampPerformance(performance)
  for (const h of crew) ticks += RD.breakPerCrew * (h.heroClass === 'archer' ? RD.archerCrewMult : 1)
  const altar = crew.some((h) => h.element === 'light' || h.heroClass === 'mage')
  if (altar) ticks *= RD.altarMult
  return { ticks: Math.round(ticks), altar }
}

/** The raid boss (scaled to a raid's HP pool, wearing its scales) and its wave-mates. */
export function buildRaidBoss(state: GameState, floor: number, breakTicks: number): { boss: CombatUnit; adds: CombatUnit[] } {
  const tag = RD.bosses[floor]
  if (tag === undefined) throw new Error(`raid: F${floor} has no raid boss`)
  // The boss as its anchor fields it (budget-scaled above F20), without any loop scars.
  const enc = buildEncounter({ ...state, tower: { ...state.tower, loop: null } }, floor)
  const wave = enc.waves.find((w) => w.units.some((u) => u.targetTag === tag))
  const base = wave?.units.find((u) => u.targetTag === tag)
  if (!wave || !base) throw new Error(`raid: F${floor}'s boss is missing`)
  const maxHP = Math.round(base.stats.maxHP * RD.hpMult)
  const scales: KeywordTag[] = [
    { kind: 'resist', damageType: 'physical', reduction: RD.scaleReduction, fromTick: breakTicks },
    { kind: 'resist', damageType: 'magic', reduction: RD.scaleReduction, fromTick: breakTicks },
  ]
  const boss: CombatUnit = { ...base, stats: { ...base.stats, maxHP }, currentHP: maxHP, keywords: [...base.keywords, ...scales] }
  // Wave-mates never carry the mission tag (F35's jewel is not the raid's point).
  const adds = wave.units.filter((u) => u !== base).map((u) => ({ ...u, targetTag: `raid_add_${u.id}` }))
  return { boss, adds }
}

/** Why this raid can't be launched with these parties and crew, or null. */
export function raidRefusal(state: GameState, floor: number, parties: readonly HeroId[][], crew: readonly HeroId[]): string | null {
  if (RD.bosses[floor] === undefined) return 'No raid waits on that floor.'
  if (state.tower.highestCleared < floor) return `Clear F${floor} first.`
  const fighting = parties.filter((p) => p.length > 0)
  if (fighting.length === 0) return 'Send at least one party.'
  if (fighting.length > RD.maxParties) return `At most ${RD.maxParties} parties.`
  if (fighting.some((p) => p.length > TUNING.account.partySize)) return `A party holds at most ${TUNING.account.partySize} heroes.`
  if (crew.length > RD.maxCrew) return `The ballista takes at most ${RD.maxCrew} crew.`
  const all = [...fighting.flat(), ...crew]
  if (distinct(all).length !== all.length) return 'A hero can only be in one place.'
  if (all.some((id) => !fitToFight(state.heroes[id], state))) return 'Everyone sent must be fit to fight.'
  return null
}

/** One party's turn at the boss. */
export interface RaidPartyResult {
  heroIds: HeroId[]
  outcome: CombatOutcome
  bossHpBefore: number
  bossHpAfter: number
  fallen: HeroId[]
  log: CombatLog
}

export interface RaidOutcome {
  floor: number
  bossName: string
  bossMaxHp: number
  breakTicks: number
  altar: boolean
  parties: RaidPartyResult[]
  cleared: boolean
  /** The weekly chest paid out on this clear. */
  rewarded: boolean
  gems: number
  materials: Record<MaterialId, number>
  /** Five pages bound into a Book of Reverse Heaven. */
  bookBound: boolean
  xp: number
  fallen: HeroId[]
}

/**
 * Run a raid: parties in order against the shared HP pool until the boss falls or every
 * party has had its turn. Applies permadeath, Sanity, XP, rewards and the raid record.
 * Throws when refused. PURE.
 */
export function runRaid(
  state: GameState,
  floor: number,
  parties: readonly HeroId[][],
  crew: readonly HeroId[],
  ballista: number | undefined,
  nowWorld: number,
): { state: GameState; outcome: RaidOutcome } {
  const refusal = raidRefusal(state, floor, parties, crew)
  if (refusal !== null) throw new Error(`raid: ${refusal}`)
  const record = raidRecord(state, floor)
  const week = worldWeekOf(nowWorld)
  const crewHeroes = crew.map((id) => state.heroes[id]!)
  const perf = ballista ?? state.meta.skill.ballista
  const brk = ballistaBreak(crewHeroes, perf)
  const { boss, adds } = buildRaidBoss(state, floor, brk.ticks)
  const tag = RD.bosses[floor]!
  const worldMult = TUNING.tower.worldMult[state.worldGrade]

  let hp = boss.stats.maxHP
  const results: RaidPartyResult[] = []
  let cleared = false
  for (const [i, party] of parties.filter((p) => p.length > 0).entries()) {
    const units = applyPartyBonuses(
      party.map((id) => moraleAdjust(state, buildCombatUnit(state.heroes[id]!, lineFor(state.heroes[id]!), SKILLS, state.inventory))),
      state,
      { blessing: false },
    )
    const res = runBattle(
      units,
      // Friends and rivals fight as such here too (combat depth).
      withBonds(
        {
          floor,
          mission: { type: 'Raid', objectives: [{ kind: 'defeat', targetTag: tag }], timer: RD.partyTicks },
          waves: [{ units: [{ ...boss, currentHP: hp }, ...adds] }],
          encounterContext: 'tower',
          label: 'raid',
        },
        state,
        party,
      ),
      hash(state.seed, 'raid', floor, record.attempts, i),
    )
    let after = hp
    for (const e of res.log.events) {
      if (e.kind === 'hit' && e.targetId === boss.id) after = Math.max(0, e.hpAfter)
      if (e.kind === 'death' && e.unitId === boss.id) after = 0
    }
    results.push({ heroIds: [...party], outcome: res.outcome, bossHpBefore: hp, bossHpAfter: after, fallen: [...res.fallenHeroIds], log: res.log })
    hp = after
    if (res.outcome === 'win' || hp <= 0) {
      cleared = true
      break
    }
  }

  // ── Heroes: permadeath, Sanity, XP.
  const fallen = new Set<HeroId>(results.flatMap((r) => r.fallen))
  const xp = cleared ? floorXp(floor) : 0
  const heroes = { ...state.heroes }
  for (const r of results) {
    const partyCp = r.heroIds.reduce((n, id) => n + buildCombatUnit(state.heroes[id]!, 'front', SKILLS, state.inventory).cp, 0)
    const drain = sanityDrain(floorPower(floor, worldMult), partyCp, cleared, r.fallen.length > 0)
    for (const id of r.heroIds) {
      const h = heroes[id]!
      if (fallen.has(id)) heroes[id] = releaseGear({ ...h, alive: false, blessed: false })
      else heroes[id] = { ...h, sanity: clampSanity(h.sanity - drain), xp: xp > 0 ? applyXp(h.xp, xp, h.star) : h.xp }
    }
  }
  for (const h of crewHeroes) {
    heroes[h.id] = { ...h, sanity: clampSanity(h.sanity - RD.crewSanity), xp: xp > 0 ? applyXp(h.xp, xp, h.star) : h.xp }
  }

  // ── The weekly chest.
  const materials: Record<MaterialId, number> = {}
  let gems = 0
  let bookBound = false
  const rewarded = cleared && record.lastClearWeek !== week
  let nextMaterials = { ...state.materials }
  if (rewarded) {
    const W = RD.reward
    gems = Math.round(W.gemsBase + W.gemsPerFloor * floor)
    materials.promotionStone = W.stonesBase + Math.floor(floor / 10) * W.stonesPerTen
    materials.rankMaterial = W.rankMaterial
    if (chance(rngFor(state.seed, 'raid-loot', floor, week), W.pageBase + W.pagePerFloor * floor).value) materials.reverseHeavenPage = 1
    for (const [k, n] of Object.entries(materials)) nextMaterials[k] = (nextMaterials[k] ?? 0) + n
    const bound = bindPages(nextMaterials, RD.pagesPerBook)
    nextMaterials = bound.materials
    bookBound = bound.bound
  }

  const ch = challengeOf(state)
  const nextRecord: RaidRecord = {
    clears: record.clears + (cleared ? 1 : 0),
    attempts: record.attempts + 1,
    lastClearWeek: cleared ? week : record.lastClearWeek,
  }
  const practised = ballista !== undefined ? practice(state.meta, 'ballista') : state.meta
  // A raid boss felled teaches the Master (B21).
  const meta = cleared ? addMasterXp(practised, TUNING.lobby.master.xpPerRaidClear) : practised
  return {
    state: {
      ...state,
      heroes,
      gems: state.gems + gems,
      materials: nextMaterials,
      meta,
      codex: results.reduce((cx, r) => recordBattle(cx, r.log), state.codex),
      challenge: { ...ch, raids: { ...ch.raids, [String(floor)]: nextRecord } },
    },
    outcome: {
      floor,
      bossName: boss.name,
      bossMaxHp: boss.stats.maxHP,
      breakTicks: brk.ticks,
      altar: brk.altar,
      parties: results,
      cleared,
      rewarded,
      gems,
      materials,
      bookBound,
      xp,
      fallen: [...fallen],
    },
  }
}
