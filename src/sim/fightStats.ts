/**
 * What one battle felt like, read back from its CombatLog: how many rounds the party
 * fought, whether the enemies ever swung, how much of the party's damage came from
 * sweeps (all-enemies skills), how much was wasted on overkill or immunity, how long
 * the replay holds the screen at 1×, and (lane F) how the roles played: heals, shields,
 * taunts, statuses on foes, and how much of the damage taken was healed back or soaked. Pure; the combat-feel gate
 * (`src/sim/combatMetrics.ts`) aggregates these over the bots' real floor attempts.
 */
import type { CombatEvent, CombatLog, CombatOutcome } from '../engine/types'
import { SKILLS } from '../engine/content'
import { eventDuration, HERO_DEATH_MS, HITSTOP_MS, replayLength } from '../ui/battle/battleFrames'

export interface FightStats {
  floor: number
  outcome: CombatOutcome
  /** Party heroes in the fight (mission NPCs excluded). */
  heroes: number
  /** Actions the party took / the enemies took ('act' events). */
  heroActs: number
  enemyActs: number
  /** Party actions per hero: a round is every hero acting once. */
  rounds: number
  /** HP the party actually removed (overkill excluded). */
  heroDamage: number
  /** …of which by all-enemies skills. */
  aoeDamage: number
  /** Damage the party rolled past a foe's last HP. */
  overkill: number
  /** Party hits that landed for nothing on an immune foe. */
  immuneHits: number
  /** Party hits, and those on a foe weak to them. */
  heroHits: number
  weakHits: number
  /** Heroes the battle killed. */
  deaths: number
  /** Estimated replay length at 1× (ms): the scene's own beats (battleFrames.replayLength). */
  replayMs: number
  // ── Roles (lane F) ──
  /** Heals the party's skills landed on its own side (regeneration pulses included). */
  heals: number
  /** HP those heals restored. */
  healed: number
  /** Shields the party raised on its own side, and the HP they soaked. */
  shields: number
  absorbed: number
  /** Taunts the party's front line raised. */
  taunts: number
  /** Statuses the party left on foes (debuffs, DoTs, stuns). */
  foeStatuses: number
  /** HP the party lost to blows and DoTs (after shields). */
  damageTaken: number
}

/** Estimated 1× replay length of a log, as BattleScene times it (each frame waits for the
 *  next event's duration; a crit adds its hit-stop; a hero's death is never rushed). */
export function replayMs(log: CombatLog): number {
  const heroIds = new Set(log.unitsInit.filter((u) => u.side === 'hero' && !u.isNpc).map((u) => u.id))
  let ms = 0
  let shown: CombatEvent | undefined
  for (const e of log.events) {
    let d = eventDuration(e)
    if (shown?.kind === 'hit' && shown.crit) d += HITSTOP_MS
    if (shown?.kind === 'death' && heroIds.has(shown.unitId)) d = Math.max(d, HERO_DEATH_MS)
    ms += d
    shown = e
  }
  return ms
}

export function fightStats(log: CombatLog): FightStats {
  const side = new Map(log.unitsInit.map((u) => [u.id, u.side]))
  const heroIds = new Set(log.unitsInit.filter((u) => u.side === 'hero' && !u.isNpc).map((u) => u.id))
  const hp = new Map(log.unitsInit.map((u) => [u.id, u.startHP ?? u.maxHP]))
  let heroActs = 0
  let enemyActs = 0
  let heroDamage = 0
  let aoeDamage = 0
  let overkill = 0
  let immuneHits = 0
  let heroHits = 0
  let weakHits = 0
  let deaths = 0
  let heals = 0
  let healed = 0
  let shields = 0
  let absorbed = 0
  let taunts = 0
  let foeStatuses = 0
  let damageTaken = 0
  // The action in flight: whose it is and whether it sweeps (a follow-up is a basic strike).
  let actor: string | null = null
  let sweeping = false
  for (const e of log.events) {
    switch (e.kind) {
      case 'act':
        actor = e.actorId
        sweeping = SKILLS[e.skillId]?.target === 'all-enemies'
        if (side.get(e.actorId) === 'hero') heroActs++
        else enemyActs++
        break
      case 'followup':
        actor = e.unitId
        sweeping = false
        break
      case 'hit': {
        const before = hp.get(e.targetId) ?? 0
        hp.set(e.targetId, e.hpAfter)
        if (side.get(e.targetId) === 'hero' && side.get(e.actorId) !== 'hero') damageTaken += Math.max(0, Math.min(e.amount, before))
        if (side.get(e.actorId) !== 'hero' || side.get(e.targetId) === 'hero') break
        const dealt = Math.max(0, Math.min(e.amount, before))
        heroHits++
        heroDamage += dealt
        overkill += e.amount - dealt
        if (e.eff === 'immune') immuneHits++
        if (e.eff === 'weak') weakHits++
        if (sweeping && e.actorId === actor) aoeDamage += dealt
        break
      }
      case 'heal':
        hp.set(e.unitId, e.hpAfter)
        if (e.sourceId !== undefined && side.get(e.unitId) === 'hero' && side.get(e.sourceId) === 'hero') {
          heals++
          healed += e.amount
        }
        break
      case 'hp-cost':
        hp.set(e.unitId, e.hpAfter)
        break
      case 'dot': {
        const before = hp.get(e.unitId) ?? 0
        hp.set(e.unitId, e.hpAfter)
        const dealt = Math.max(0, Math.min(e.amount, before))
        if (side.get(e.unitId) === 'hero') {
          if (side.get(e.sourceId) !== 'hero') damageTaken += dealt
        } else if (side.get(e.sourceId) === 'hero') heroDamage += dealt
        break
      }
      case 'status':
        if (side.get(e.sourceId) !== 'hero') break
        if (side.get(e.unitId) === 'hero') {
          if (e.status === 'shield') shields++
          else if (e.status === 'taunt') taunts++
        } else foeStatuses++
        break
      case 'shield':
        if (side.get(e.unitId) === 'hero') absorbed += e.absorbed
        break
      case 'death':
        if (heroIds.has(e.unitId)) deaths++
        break
      default:
        break
    }
  }
  const heroes = Math.max(1, heroIds.size)
  return {
    floor: log.floor,
    outcome: log.outcome,
    heroes: heroIds.size,
    heroActs,
    enemyActs,
    rounds: heroActs / heroes,
    heroDamage,
    aoeDamage,
    overkill,
    immuneHits,
    heroHits,
    weakHits,
    deaths,
    replayMs: replayLength(log),
    heals,
    healed,
    shields,
    absorbed,
    taunts,
    foeStatuses,
    damageTaken,
  }
}

export function median(xs: readonly number[]): number {
  if (xs.length === 0) return NaN
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

/** The p-th percentile (0..100), nearest rank. */
export function percentile(xs: readonly number[], p: number): number {
  if (xs.length === 0) return NaN
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))]!
}

export interface FightSummary {
  fights: number
  /** Share of the party's (effective) damage dealt by all-enemies skills, 0..1. */
  aoeShare: number
  medianRounds: number
  /** Share of fights in which at least one enemy acted, 0..1. */
  enemiesActShare: number
  deathsPerAttempt: number
  medianReplayS: number
  p10ReplayS: number
  p90ReplayS: number
  winShare: number
  /** Overkill as a share of everything the party rolled, 0..1. */
  overkillShare: number
  /** Party hits wasted on immunity, per fight. */
  immunePerFight: number
  /** Share of the party's hits that struck a weakness, 0..1. */
  weakShare: number
  // ── Roles (lane F) ──
  healsPerFight: number
  shieldsPerFight: number
  tauntsPerFight: number
  foeStatusesPerFight: number
  /** Of everything the foes threw at the party, the share healed back or soaked, 0..1. */
  healingShare: number
  /** Share of fights in which the party healed, shielded or taunted at least once, 0..1. */
  roleFightShare: number
}

export function summarizeFights(fs: readonly FightStats[], deathsOf: (f: FightStats) => number = (f) => f.deaths): FightSummary {
  const sum = (g: (f: FightStats) => number) => fs.reduce((a, f) => a + g(f), 0)
  const dmg = sum((f) => f.heroDamage)
  const n = Math.max(1, fs.length)
  return {
    fights: fs.length,
    aoeShare: dmg > 0 ? sum((f) => f.aoeDamage) / dmg : 0,
    medianRounds: median(fs.map((f) => f.rounds)),
    enemiesActShare: fs.filter((f) => f.enemyActs > 0).length / n,
    deathsPerAttempt: sum(deathsOf) / n,
    medianReplayS: median(fs.map((f) => f.replayMs)) / 1000,
    p10ReplayS: percentile(fs.map((f) => f.replayMs), 10) / 1000,
    p90ReplayS: percentile(fs.map((f) => f.replayMs), 90) / 1000,
    winShare: fs.filter((f) => f.outcome === 'win').length / n,
    overkillShare: dmg + sum((f) => f.overkill) > 0 ? sum((f) => f.overkill) / (dmg + sum((f) => f.overkill)) : 0,
    immunePerFight: sum((f) => f.immuneHits) / n,
    weakShare: sum((f) => f.heroHits) > 0 ? sum((f) => f.weakHits) / sum((f) => f.heroHits) : 0,
    healsPerFight: sum((f) => f.heals ?? 0) / n,
    shieldsPerFight: sum((f) => f.shields ?? 0) / n,
    tauntsPerFight: sum((f) => f.taunts ?? 0) / n,
    foeStatusesPerFight: sum((f) => f.foeStatuses ?? 0) / n,
    healingShare: (() => {
      const thrown = sum((f) => (f.damageTaken ?? 0) + (f.absorbed ?? 0))
      return thrown > 0 ? sum((f) => (f.healed ?? 0) + (f.absorbed ?? 0)) / thrown : 0
    })(),
    roleFightShare: fs.filter((f) => (f.heals ?? 0) + (f.shields ?? 0) + (f.taunts ?? 0) > 0).length / n,
  }
}
