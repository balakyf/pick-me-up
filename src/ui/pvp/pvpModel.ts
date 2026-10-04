/**
 * Lane Q · PvP on stage: the pure half of the screens. Who a rival is on their title card,
 * which invasions the Master has not watched yet, how long a held hero has left, and who
 * did what in the guild raid. Nothing here touches the store or the DOM.
 */
import type { CombatLog, DeployReason, GameState, InvasionRecord, OwnedHero } from '../../engine/types'
import { TUNING } from '../../engine/tuning'
import { fitToDeploy } from '../../engine/tower/deploy'
import { guildById, type GuildmateShare, type RivalMaster } from '../../engine/pvp'
import { battleStats } from '../results/battleStats'

// ─────────────────────────────────────────────────────────────────────────────
// Guild colours and crests
// ─────────────────────────────────────────────────────────────────────────────

export type CrestEmblem = 'whale' | 'crown' | 'star' | 'lantern' | 'flame' | 'tower' | 'skull'

export interface GuildLook {
  /** The banner cloth (dark, mid, light). */
  cloth: [string, string, string]
  /** The emblem's colour. */
  ink: string
  emblem: CrestEmblem
}

/** Every guild's banner. Unknown or no guild: a plain grey banner with a skull (a lone raider). */
export const GUILD_LOOK: Record<string, GuildLook> = {
  unity: { cloth: ['#3a0a14', '#7a1a2a', '#c8384a'], ink: '#ffd27a', emblem: 'whale' },
  kaiser: { cloth: ['#120c18', '#2e2440', '#62527e'], ink: '#ff6a4a', emblem: 'crown' },
  morning_star: { cloth: ['#14244a', '#24447a', '#4a74c0'], ink: '#fff0a0', emblem: 'star' },
  iron_lantern: { cloth: ['#2a2a30', '#4a4a56', '#7a7a8a'], ink: '#ffb050', emblem: 'lantern' },
  last_light: { cloth: ['#3a2a0e', '#6a4a1a', '#a8783a'], ink: '#fff6e0', emblem: 'flame' },
  grey_tower: { cloth: ['#24242a', '#3e3e48', '#6a6a78'], ink: '#c8c8d8', emblem: 'tower' },
}
const LONE: GuildLook = { cloth: ['#1e1a24', '#3a3444', '#5e566e'], ink: '#e8e0f0', emblem: 'skull' }

export function guildLook(guildId: string | null | undefined): GuildLook {
  return (guildId && GUILD_LOOK[guildId]) || LONE
}

// ─────────────────────────────────────────────────────────────────────────────
// The rival's title card
// ─────────────────────────────────────────────────────────────────────────────

export type BannerKind = 'invasion' | 'raid' | 'counter' | 'war' | 'guild'

export interface RivalCard {
  kind: BannerKind
  /** The rival Master's handle (or the enemy guild, the guild boss). */
  name: string
  guildId: string | null
  /** The guild's English name (translate at render). */
  guildName: string | null
  whale: boolean
  floor: number | null
  rating: number | null
  /** The line under the name (English, a `t()` key; `vars` fill it). */
  line: string
  vars?: Record<string, string | number>
}

/** The card for an incoming invasion record (its raider). */
export function invasionCard(rec: InvasionRecord, rival?: RivalMaster): RivalCard {
  const g = guildById(rec.guildId ?? rival?.guildId ?? null)
  return {
    kind: 'invasion',
    name: rec.rival,
    guildId: g?.id ?? null,
    guildName: g?.name ?? null,
    whale: g?.whale ?? rival?.whale ?? false,
    floor: rival?.floor ?? rec.replay?.floor ?? null,
    rating: rival?.rating ?? null,
    line: g?.whale ? 'Whales: strong, and brittle. They panic when it turns.' : 'They came through the crack for your storeroom.',
  }
}

/** The card for an outgoing raid or a counter-raid on `rival`. */
export function raidCard(rival: RivalMaster, kind: 'raid' | 'counter', heldName?: string): RivalCard {
  const g = guildById(rival.guildId || null)
  return {
    kind,
    name: rival.name,
    guildId: g?.id ?? null,
    guildName: g?.name ?? null,
    whale: rival.whale,
    floor: rival.floor,
    rating: rival.rating,
    line: kind === 'counter' ? 'They hold {name}. Bring them home.' : 'Their storeroom is guarded. Nobody dies in a raid.',
    vars: heldName ? { name: heldName } : undefined,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Invasions the Master has not watched
// ─────────────────────────────────────────────────────────────────────────────

/** A stable key for an invasion record (its day and raider). */
export function invasionKey(rec: InvasionRecord): string {
  return `${rec.worldDay}|${rec.rivalId ?? rec.rival}`
}

/** Incoming invasions with a battle to watch that the Master has not seen yet, newest first. */
export function unseenInvasions(log: readonly InvasionRecord[], seen: ReadonlySet<string>): InvasionRecord[] {
  return log.filter((r) => r.direction === 'in' && r.replay !== undefined && !seen.has(invasionKey(r)))
}

// ─────────────────────────────────────────────────────────────────────────────
// Held heroes
// ─────────────────────────────────────────────────────────────────────────────

export interface Deadline {
  /** World-ms left (never negative). */
  left: number
  /** How much of the hold has run out, 0..1. */
  spent: number
  /** Under a day left. */
  urgent: boolean
}

/** How long a held hero has before the captor synthesizes them. */
export function deadlineOf(deadlineWorld: number, nowWorld: number, windowMs = TUNING.pvp.captiveMs): Deadline {
  const left = Math.max(0, deadlineWorld - nowWorld)
  const spent = windowMs <= 0 ? 1 : Math.max(0, Math.min(1, 1 - left / windowMs))
  return { left, spent, urgent: left < 24 * 3_600_000 }
}

/** World time left, in words: "2 world-days", "5 world-h", "any moment". */
export function worldTimeWords(ms: number): { key: string; n?: number } {
  if (ms <= 0) return { key: 'any moment' }
  const h = Math.ceil(ms / 3_600_000)
  if (h < 24) return { key: '{n} world-h', n: h }
  const d = Math.floor(h / 24)
  return d === 1 ? { key: '1 world-day' } : { key: '{n} world-days', n: d }
}

export interface HeldRow {
  hero: OwnedHero
  master: string
  rivalId: string
  ransomGold: number
  ransomGems: number
  canPay: boolean
  deadline: Deadline
}

/** The Master's heroes held by raiders, the soonest lost first. */
export function heldHeroes(state: GameState, nowWorld: number): HeldRow[] {
  return (Object.values(state.heroes) as OwnedHero[])
    .filter((h) => h.alive && h.captiveOf)
    .map((h) => {
      const c = h.captiveOf!
      return {
        hero: h,
        master: c.master,
        rivalId: c.rivalId,
        ransomGold: c.ransomGold,
        ransomGems: c.ransomGems,
        canPay: state.gold >= c.ransomGold && state.gems >= c.ransomGems,
        deadline: deadlineOf(c.deadlineWorld, nowWorld),
      }
    })
    .sort((a, b) => a.deadline.left - b.deadline.left || a.hero.id.localeCompare(b.hero.id))
}

// ─────────────────────────────────────────────────────────────────────────────
// The guild raid's contribution board
// ─────────────────────────────────────────────────────────────────────────────

export interface ContributionRow {
  kind: 'hero' | 'mate'
  id: string
  name: string
  dealt: number
  /** Share of the boss's HP, 0..1. */
  share: number
}

/**
 * Who hurt the guild boss: each of the Master's heroes (from the battle itself) and each
 * guildmate (the simulated rivals' shares), largest first. The heroes' damage adds up to
 * what the party dealt.
 */
export function contributionRows(log: CombatLog, roster: readonly GuildmateShare[], bossHp: number): ContributionRow[] {
  const stats = battleStats(log)
  const hp = Math.max(1, bossHp)
  const rows: ContributionRow[] = [
    ...stats.heroes.map((h) => ({ kind: 'hero' as const, id: h.id, name: h.name, dealt: h.dealt, share: h.dealt / hp })),
    ...roster.map((m) => ({ kind: 'mate' as const, id: m.id, name: m.name, dealt: m.dealt, share: m.dealt / hp })),
  ]
  return rows.sort((a, b) => b.dealt - a.dealt || (a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind === 'hero' ? -1 : 1))
}

/** The party's and the guild's totals against the boss, as shares of its HP (0..1, capped). */
export function raidTotals(dealt: number, mates: number, bossHp: number): { party: number; mates: number; left: number } {
  const hp = Math.max(1, bossHp)
  const party = Math.min(1, dealt / hp)
  const m = Math.min(1 - party, mates / hp)
  return { party, mates: m, left: Math.max(0, 1 - party - m) }
}

// ─────────────────────────────────────────────────────────────────────────────
// Who can fight (the shared HeroPicker's refusal)
// ─────────────────────────────────────────────────────────────────────────────

const UNFIT: Record<DeployReason, string> = {
  dead: 'Has fallen.',
  captive: 'Held by a rival Master.',
  expedition: 'Away in the Ruins.',
  promotion: 'In the Promotion Chamber.',
  training: 'In the middle of a drill.',
  bounty: 'Out on a bounty.',
  burnout: 'Burnt out and resting.',
  exhausted: 'Broken down (Sanity 0).',
  rebellion: 'Refuses your order.',
  disheartened: 'Disheartened (morale broken).',
}

/** Why a hero cannot fight in PvP right now (the deploy rails), or null. */
export function pvpRefusal(state: GameState, h: OwnedHero): string | null {
  const c = fitToDeploy(state, h, { rebellion: false })
  return c.ok ? null : UNFIT[c.reason]
}

/** The words for every refusal (for the French coverage test). */
export const PVP_UNFIT_WORDS: readonly string[] = Object.values(UNFIT)

/** The strongest fit heroes, best first (the team a raid sheet starts with). */
export function autoTeam(state: GameState, size: number, cp: (h: OwnedHero) => number): OwnedHero['id'][] {
  const party = state.party.slots.filter((id): id is OwnedHero['id'] => id !== null && !!state.heroes[id] && pvpRefusal(state, state.heroes[id]!) === null)
  if (party.length > 0) return party.slice(0, size)
  return (Object.values(state.heroes) as OwnedHero[])
    .filter((h) => pvpRefusal(state, h) === null)
    .sort((a, b) => cp(b) - cp(a) || a.id.localeCompare(b.id))
    .slice(0, size)
    .map((h) => h.id)
}

/** Toggle a hero in a team of at most `max` (order kept; a full team takes no more). */
export function toggleTeam(team: readonly OwnedHero['id'][], id: OwnedHero['id'], max: number): OwnedHero['id'][] {
  if (team.includes(id)) return team.filter((x) => x !== id)
  return team.length >= max ? [...team] : [...team, id]
}
