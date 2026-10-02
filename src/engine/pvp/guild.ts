/**
 * Guilds and server wars (Layer 4 §4). Guilds are seeded per server (rivals.ts); the
 * canon whale guilds (단결회 Unity Society, Kaiser) admit only Masters whose simulated
 * spend is large. Membership gives daily aid from the storehouse, a weekly co-op guild
 * raid (a Book of Reverse Heaven source) and a weekly server war. All non-lethal.
 *
 * PURE and DETERMINISTIC.
 */

import type { CombatUnit, GameState } from '../types'
import { TUNING } from '../tuning'
import { ENEMY_TEMPLATES, SKILLS } from '../content'
import { buildCombatUnit, buildEnemyUnit } from '../unit'
import { recordBattle } from '../codex'
import { runBattle } from '../combat'
import { rivalSquad } from '../events'
import { worldDayIndex } from '../daily'
import { rngFor, hash, chance, nextFloat } from '../rng'
import { GUILDS, guildById } from './rivals'
import { pvpReady, worldWeek } from './pvp'

const G = TUNING.guild
const P = TUNING.pvp

function party(state: GameState): CombatUnit[] {
  const out: CombatUnit[] = []
  state.party.slots.forEach((id, i) => {
    const h = id ? state.heroes[id] : undefined
    if (pvpReady(state, h)) out.push(buildCombatUnit(h, state.party.lines[i] ?? 'front', SKILLS, state.inventory))
  })
  return out
}

/** Why joining this guild is refused, or null. */
export function joinRefusal(state: GameState, guildId: string): string | null {
  const g = guildById(guildId)
  if (!g) return 'No such guild.'
  if (state.pvp.guild === guildId) return 'You are already a member.'
  if (g.whale && state.meta.wallet.spentUsd < G.whaleSpendUsd) return `${g.name} only takes Masters who have spent over $${G.whaleSpendUsd}.`
  return null
}

export function joinGuild(state: GameState, guildId: string): GameState {
  const why = joinRefusal(state, guildId)
  if (why !== null) throw new Error(`joinGuild: ${why}`)
  return { ...state, pvp: { ...state.pvp, guild: guildId } }
}

export function leaveGuild(state: GameState): GameState {
  if (state.pvp.guild === null) throw new Error('leaveGuild: you are not in a guild')
  return { ...state, pvp: { ...state.pvp, guild: null } }
}

/** Daily aid from the guild storehouse. */
export function claimGuildAid(state: GameState, nowWorld: number): GameState {
  if (state.pvp.guild === null) throw new Error('claimGuildAid: join a guild first')
  const day = worldDayIndex(nowWorld)
  if (state.pvp.guildAidDay === day) throw new Error('claimGuildAid: already claimed today')
  return {
    ...state,
    materials: { ...state.materials, promotionStone: (state.materials.promotionStone ?? 0) + G.aidStones },
    pvp: { ...state.pvp, guildAidDay: day },
  }
}

export interface GuildRaidOutcome {
  dealt: number
  mates: number
  bossHp: number
  felled: boolean
  book: boolean
  gold: number
  gems: number
}

/** The weekly co-op guild raid: your damage + your guildmates' against the guild boss. */
export function guildRaid(state: GameState, nowWorld: number): { state: GameState; outcome: GuildRaidOutcome } {
  if (state.pvp.guild === null) throw new Error('guildRaid: join a guild first')
  const week = worldWeek(nowWorld)
  if (state.pvp.guildRaidWeek === week) throw new Error('guildRaid: the guild has already raided this week')
  const units = party(state)
  if (units.length === 0) throw new Error('guildRaid: no one in the party can go')
  const cp = units.reduce((n, u) => n + u.cp, 0)
  const lvl = Math.max(1, Math.round(units.reduce((n, u) => n + u.level, 0) / units.length))
  const base = buildEnemyUnit(ENEMY_TEMPLATES.fragment_colossus!, lvl, 'guild_boss', { targetTag: 'guild_boss' })
  const bossHp = Math.round(cp * G.raidBossHpPerCp)
  const boss: CombatUnit = { ...base, name: 'Guild Colossus', stats: { ...base.stats, maxHP: bossHp }, currentHP: bossHp, keywords: [] }
  const res = runBattle(
    units,
    { floor: 60, mission: { type: 'Guild Raid', objectives: [{ kind: 'defeat', targetTag: 'guild_boss' }], timer: G.raidTicks }, waves: [{ units: [boss] }], encounterContext: 'tower', label: 'guild' },
    hash(state.seed, 'guildraid', week),
  )
  let hp = bossHp
  for (const e of res.log.events) if (e.kind === 'hit' && e.targetId === boss.id) hp = e.hpAfter
  const dealt = bossHp - Math.max(0, hp)
  let r = rngFor(state.seed, 'guildmates', week)
  const share = nextFloat(r)
  r = share.rng
  const [lo, hi] = G.mateDamageShare as [number, number]
  const mates = Math.round(bossHp * (lo + share.value * (hi - lo)))
  const felled = dealt + mates >= bossHp
  const book = felled && chance(r, G.raidBookChance).value
  const gold = felled ? G.raidGold : Math.round((G.raidGold * (dealt + mates)) / bossHp / 2)
  const gems = felled ? G.raidGems : 0
  const materials = { ...state.materials }
  if (book) materials.bookOfReverseHeaven = (materials.bookOfReverseHeaven ?? 0) + 1
  return {
    outcome: { dealt, mates, bossHp, felled, book, gold, gems },
    state: { ...state, gold: state.gold + gold, gems: state.gems + gems, materials, pvp: { ...state.pvp, guildRaidWeek: week }, codex: recordBattle(state.codex, res.log) },
  }
}

/** The weekly server war: three squads from a rival guild; wins pay gems and rating. */
export function serverWar(state: GameState, nowWorld: number): { state: GameState; wins: number; enemyGuild: string } {
  if (state.pvp.guild === null) throw new Error('serverWar: join a guild first')
  const week = worldWeek(nowWorld)
  if (state.pvp.warWeek === week) throw new Error('serverWar: this week’s war is over')
  const units = party(state)
  if (units.length === 0) throw new Error('serverWar: no one in the party can go')
  const cp = units.reduce((n, u) => n + u.cp, 0)
  const foes = GUILDS.filter((g) => g.id !== state.pvp.guild)
  let r = rngFor(state.seed, 'war', week)
  const pickG = Math.floor(nextFloat(r).value * foes.length)
  r = nextFloat(r).rng
  const enemy = foes[pickG]!
  let wins = 0
  for (const [i, ratio] of G.warRatios.entries()) {
    const sq = rivalSquad(r, units.length, cp * ratio * (enemy.whale ? P.whaleCpMult : 1), `war${week}_${i}`)
    r = sq.rng
    const squad = enemy.whale ? sq.units.map((u) => ({ ...u, sanity: P.whaleSanity })) : sq.units
    const res = runBattle(
      units,
      { floor: 60, mission: { type: 'Server War', objectives: [{ kind: 'annihilate' }], timer: null }, waves: [{ units: squad }], encounterContext: 'tower', label: 'war' },
      hash(state.seed, 'war', week, i),
    )
    if (res.outcome === 'win') wins++
  }
  const won = wins >= 2
  return {
    wins,
    enemyGuild: enemy.name,
    state: {
      ...state,
      gems: state.gems + G.warGems[wins]!,
      pvp: {
        ...state.pvp,
        warWeek: week,
        war: { wins: state.pvp.war.wins + (won ? 1 : 0), losses: state.pvp.war.losses + (won ? 0 : 1) },
        rating: state.pvp.rating + (won ? P.ratingWin : -P.ratingLoss),
      },
    },
  }
}
