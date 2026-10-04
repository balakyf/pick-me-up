/**
 * The battle report (lane K): per-hero numbers read off a fight's CombatLog — damage dealt
 * and taken, healing, shields, kills, crits, skills cast, big moves broken, orders that
 * named them — and the battle's MVP. PURE: the log is the only input, so the report is
 * the same every time a fight is remembered, and the engine needs nothing new.
 *
 * Conventions:
 * - Damage counts what reached HP (a blow's overkill past zero is not counted; a shield's
 *   soak is credited to whoever cast the shield, as "shielded").
 * - Healing counts HP restored to the party (lifesteal and regeneration included).
 * - A kill goes to whoever landed the last blow or DoT pulse before the foe's death.
 * - A big move is "broken" by the hero whose stun or killing blow cancelled its wind-up;
 *   the party "answers" a big move by breaking it, or by meeting it braced or protected.
 */
import type { BattleOrder, CombatEvent, CombatLog, CombatUnitInit } from '../../engine/types'

/** Skill ids that are not a "skill cast" (the plain attack and the brace). */
const NOT_A_CAST = new Set(['basic', 'basic-attack', 'brace'])

export interface HeroBattleStat {
  id: string
  name: string
  /** Fell in this battle. */
  fell: boolean
  dealt: number
  taken: number
  healed: number
  /** Damage soaked by shields this hero cast. */
  shielded: number
  kills: number
  crits: number
  /** Authored skills cast (basic attacks and braces are not counted). */
  casts: number
  /** Foes' big moves this hero cancelled (a stun or a kill mid wind-up). */
  broke: number
  /** Orders that named this hero (protect, unleash, swap). */
  orders: number
  /** The MVP score (HP the party gained by this hero's hand; see `mvpParts`). */
  score: number
}

export interface TeamBattleStat {
  dealt: number
  taken: number
  healed: number
  shielded: number
  kills: number
  crits: number
  casts: number
  /** Big moves the foes wound up. */
  bigMoves: number
  /** …of which the party answered (broke one, or met it braced / protected). */
  answered: number
  ordersUsed: number
  ordersByKind: Partial<Record<BattleOrder['kind'], number>>
}

export interface BattleStats {
  /** The party's heroes, in the order the log fielded them (escorts are not heroes). */
  heroes: HeroBattleStat[]
  team: TeamBattleStat
  /** The battle's most valuable hero; null when nobody did anything (or no hero fought). */
  mvpId: string | null
}

/** Weights of the MVP score (per HP; a kill and a broken move are worth a share of the fight's damage). */
export const MVP_WEIGHTS = { dealt: 1, healed: 1, shielded: 0.8, taken: 0.35, killShare: 0.03, brokeShare: 0.15 } as const

function isHero(u: CombatUnitInit | undefined): boolean {
  return u !== undefined && u.side === 'hero' && !u.isNpc
}

function blank(u: CombatUnitInit): HeroBattleStat {
  return { id: u.id, name: u.name, fell: false, dealt: 0, taken: 0, healed: 0, shielded: 0, kills: 0, crits: 0, casts: 0, broke: 0, orders: 0, score: 0 }
}

/** The battle report of one fight. */
export function battleStats(log: CombatLog): BattleStats {
  const byId = new Map(log.unitsInit.map((u) => [u.id, u]))
  const heroes = log.unitsInit.filter(isHero).map(blank)
  const stat = new Map(heroes.map((h) => [h.id, h]))
  const hp = new Map(log.unitsInit.map((u) => [u.id, u.startHP ?? u.maxHP]))
  /** Who landed the last blow (or DoT pulse) on a unit. */
  const lastBlow = new Map<string, string>()
  /** Who put the shield on a unit (the latest). */
  const shieldFrom = new Map<string, string>()
  /** Who last stunned a unit. */
  const stunFrom = new Map<string, string>()
  /** Foes winding up a big move right now (unit → skill). */
  const winding = new Map<string, string>()
  const team: TeamBattleStat = {
    dealt: 0,
    taken: 0,
    healed: 0,
    shielded: 0,
    kills: 0,
    crits: 0,
    casts: 0,
    bigMoves: 0,
    answered: 0,
    ordersUsed: 0,
    ordersByKind: {},
  }
  const enemy = (id: string) => byId.get(id)?.side === 'enemy'
  /** HP that actually came off (no overkill past zero). */
  const lost = (id: string, amount: number, hpAfter: number) => {
    const before = hp.get(id) ?? hpAfter + amount
    hp.set(id, hpAfter)
    return Math.max(0, Math.min(amount, before))
  }

  for (const e of log.events as CombatEvent[]) {
    switch (e.kind) {
      case 'hit': {
        const real = lost(e.targetId, e.amount, e.hpAfter)
        lastBlow.set(e.targetId, e.actorId)
        const by = stat.get(e.actorId)
        if (by && enemy(e.targetId)) {
          by.dealt += real
          if (e.crit) by.crits++
        }
        const to = stat.get(e.targetId)
        if (to) to.taken += real
        break
      }
      case 'dot': {
        const real = lost(e.unitId, e.amount, e.hpAfter)
        lastBlow.set(e.unitId, e.sourceId)
        const by = stat.get(e.sourceId)
        if (by && enemy(e.unitId)) by.dealt += real
        const to = stat.get(e.unitId)
        if (to) to.taken += real
        break
      }
      case 'hp-cost':
        hp.set(e.unitId, e.hpAfter)
        break
      case 'heal': {
        const before = hp.get(e.unitId) ?? e.hpAfter - e.amount
        hp.set(e.unitId, e.hpAfter)
        const real = Math.max(0, Math.min(e.amount, e.hpAfter - before))
        // Lifesteal has no source: the striker healed themself.
        const by = stat.get(e.sourceId ?? e.unitId)
        if (by && byId.get(e.unitId)?.side === 'hero') by.healed += real
        break
      }
      case 'status':
        if (e.status === 'shield') shieldFrom.set(e.unitId, e.sourceId)
        if (e.status === 'stun') stunFrom.set(e.unitId, e.sourceId)
        break
      case 'shield': {
        const from = shieldFrom.get(e.unitId)
        const by = from !== undefined ? stat.get(from) : undefined
        if (by && byId.get(e.unitId)?.side === 'hero') by.shielded += e.absorbed
        break
      }
      case 'act': {
        const by = stat.get(e.actorId)
        if (by && !e.charged && !NOT_A_CAST.has(e.skillId)) by.casts++
        if (e.charged) {
          winding.delete(e.actorId)
          if (e.answered !== undefined && enemy(e.actorId)) team.answered++
        }
        break
      }
      case 'telegraph':
        if (enemy(e.unitId)) {
          team.bigMoves++
          winding.set(e.unitId, e.skillId)
        }
        break
      case 'telegraph-end': {
        winding.delete(e.unitId)
        if (!enemy(e.unitId)) break
        team.answered++
        const who = e.reason === 'stunned' ? stunFrom.get(e.unitId) : lastBlow.get(e.unitId)
        const by = who !== undefined ? stat.get(who) : undefined
        if (by) by.broke++
        break
      }
      case 'death': {
        const fallen = stat.get(e.unitId)
        if (fallen) fallen.fell = true
        if (enemy(e.unitId)) {
          const killer = lastBlow.get(e.unitId)
          const by = killer !== undefined ? stat.get(killer) : undefined
          if (by) by.kills++
        }
        break
      }
      case 'order': {
        const o = e.order
        team.ordersUsed++
        team.ordersByKind[o.kind] = (team.ordersByKind[o.kind] ?? 0) + 1
        const named = o.kind === 'protect' || o.kind === 'unleash' ? [o.allyId] : o.kind === 'swap' ? [o.a, o.b] : []
        for (const id of named) {
          const h = stat.get(id)
          if (h) h.orders++
        }
        break
      }
      default:
        break
    }
  }

  for (const h of heroes) {
    team.dealt += h.dealt
    team.taken += h.taken
    team.healed += h.healed
    team.shielded += h.shielded
    team.kills += h.kills
    team.crits += h.crits
    team.casts += h.casts
  }
  let mvp: HeroBattleStat | null = null
  for (const h of heroes) {
    h.score = mvpParts(h, team).reduce((n, [, v]) => n + v, 0)
    // Ties go to the hero fielded first (stable, deterministic).
    if (h.score > 0 && (mvp === null || h.score > mvp.score)) mvp = h
  }
  return { heroes, team, mvpId: mvp?.id ?? null }
}

type MvpPart = 'dealt' | 'healed' | 'shielded' | 'taken' | 'broke'

/**
 * A hero's MVP score, part by part, in HP the party gained: damage and healing count as
 * they are, a shield's soak a little less, blows taken a third (a tank's work), and a kill
 * or a broken big move a share of the whole fight's damage (so they matter on every floor).
 */
function mvpParts(h: HeroBattleStat, team: TeamBattleStat): [MvpPart, number][] {
  const W = MVP_WEIGHTS
  return [
    ['dealt', h.dealt * W.dealt + h.kills * W.killShare * team.dealt],
    ['healed', h.healed * W.healed],
    ['shielded', h.shielded * W.shielded],
    ['taken', h.taken * W.taken],
    ['broke', h.broke * W.brokeShare * team.dealt],
  ]
}

/** What made the MVP the MVP, as one key the UI can caption ('dealt', 'healed'…). */
export function mvpReason(stats: BattleStats): MvpPart | null {
  const h = stats.heroes.find((x) => x.id === stats.mvpId)
  if (!h) return null
  const parts = mvpParts(h, stats.team)
  let best = parts[0]!
  for (const p of parts) if (p[1] > best[1]) best = p
  return best[1] > 0 ? best[0] : null
}
