/**
 * "Because…" (spec 2026-10-12 S18, WP4): tie a floor's outcome to the choices that
 * shaped it. Pure: built from the FloorResult (and its combat log) plus the orders the
 * Master gave. Every line is translated through `t()`.
 */
import type { BattleOrder, CombatEvent, CombatLog, FloorResult, GameState } from '../../engine/types'
import { TUNING } from '../../engine/tuning'
import { inSentence, t } from '../i18n/i18n'
import { baneName, enemyName, firstName } from '../legacy/legacyText'
import { KIND_ICON } from './kinds'

export type ReasonKind = 'saved' | 'withdraw' | 'protect' | 'focus' | 'retreat' | 'door' | 'rout' | 'wipe' | 'lastStand' | 'nemesis'

export interface Reason {
  kind: ReasonKind
  icon: string
  text: string
}

export interface Mvp {
  id: string
  name: string
  damage: number
  kills: number
}

type Hit = Extract<CombatEvent, { kind: 'hit' }>

function isHit(e: CombatEvent): e is CombatEvent & Hit {
  return e.kind === 'hit'
}

/** Display name of a combat unit (enemies are translated content names). */
function unitName(log: CombatLog, id: string): string {
  const u = log.unitsInit.find((x) => x.id === id)
  if (!u) return id
  return u.side === 'enemy' || u.isNpc ? enemyName(u.name) : u.name.split(/\s+/)[0]!
}

/** Who landed the last hit on each unit that died, by the dead unit's id. */
export function killersOf(log: CombatLog): Record<string, string> {
  const lastHitBy: Record<string, string> = {}
  const killers: Record<string, string> = {}
  for (const e of log.events) {
    if (e.kind === 'hit') lastHitBy[e.targetId] = e.actorId
    else if (e.kind === 'death' && lastHitBy[e.unitId] !== undefined && killers[e.unitId] === undefined) {
      killers[e.unitId] = lastHitBy[e.unitId]!
    }
  }
  return killers
}

/** The hero who carried the fight: most damage dealt (kills break ties). Null when no hero hit anything. */
export function mvpOf(log: CombatLog): Mvp | null {
  const heroes = new Set(log.unitsInit.filter((u) => u.side === 'hero' && !u.isNpc).map((u) => u.id))
  const dmg: Record<string, number> = {}
  for (const e of log.events) if (isHit(e) && heroes.has(e.actorId)) dmg[e.actorId] = (dmg[e.actorId] ?? 0) + e.amount
  const kills: Record<string, number> = {}
  for (const [dead, killer] of Object.entries(killersOf(log))) {
    const victim = log.unitsInit.find((u) => u.id === dead)
    if (victim && victim.side !== 'hero' && heroes.has(killer)) kills[killer] = (kills[killer] ?? 0) + 1
  }
  let best: Mvp | null = null
  for (const u of log.unitsInit) {
    if (!heroes.has(u.id)) continue
    const d = dmg[u.id] ?? 0
    const k = kills[u.id] ?? 0
    if (d === 0 && k === 0) continue
    if (best === null || d > best.damage || (d === best.damage && k > best.kills)) {
      best = { id: u.id, name: unitName(log, u.id), damage: d, kills: k }
    }
  }
  return best
}

function protectReason(log: CombatLog, o: Extract<BattleOrder, { kind: 'protect' }>, fallen: ReadonlySet<string>): Reason {
  const name = unitName(log, o.allyId)
  const hitsAfter = log.events.filter((e) => isHit(e) && e.targetId === o.allyId && e.tick >= o.tick).length
  let text: string
  if (fallen.has(o.allyId)) text = t('Protect: {name} fell anyway, once the line around them broke.', { name })
  else if (hitsAfter === 0) text = t('Protect: no enemy touched {name} after your order.', { name })
  else if (hitsAfter === 1) text = t('Protect: {name} took a single hit after your order and came home.', { name })
  else text = t('Protect: {name} took only {n} hits after your order and came home.', { name, n: hitsAfter })
  return { kind: 'protect', icon: '🛡', text }
}

function focusReason(log: CombatLog, o: Extract<BattleOrder, { kind: 'focus' }>): Reason {
  const name = inSentence(unitName(log, o.enemyId))
  const deathAt = log.events.findIndex((e) => e.kind === 'death' && e.unitId === o.enemyId && e.tick >= o.tick)
  let text: string
  if (deathAt < 0) {
    text = t('Focus: {name} held out against the whole party.', { name })
  } else {
    const after = log.events.slice(0, deathAt).filter((e) => e.tick >= o.tick)
    const acted = after.some((e) => e.kind === 'act' && e.actorId === o.enemyId)
    const cast = after.some((e) => e.kind === 'act' && e.actorId === o.enemyId && e.skillId !== 'basic-attack' && e.skillId !== 'basic')
    text = !acted
      ? t('Focus: {name} fell before it could act again.', { name })
      : !cast
        ? t('Focus: {name} fell before casting a single skill.', { name })
        : t('Focus: the party brought {name} down.', { name })
  }
  return { kind: 'focus', icon: '🎯', text }
}

/**
 * The reasons behind a floor's outcome, most decisive first: the heroes an order pulled
 * back from death (`saved`, reported by the battle's "Saved!"), the Sanity a Pull back
 * cost (`withdraw`, from `result.shaken`), the Master's other orders, the
 * Door taken, a rout or wipe, Last Stand, revenge. Empty when nothing notable happened.
 */
export function explainFloor(
  result: FloorResult,
  orders: readonly BattleOrder[] = [],
  state?: GameState,
  saved: readonly string[] = [],
): Reason[] {
  const log = result.result.log
  const fallen = new Set<string>(result.fallenHeroIds)
  const out: Reason[] = []
  for (const id of new Set(saved)) {
    if (fallen.has(id)) continue
    out.push({ kind: 'saved', icon: '✚', text: t('Saved: your order pulled {name} back from the edge.', { name: unitName(log, id) }) })
  }
  // Pull back's lasting cost (the engine's post-battle Sanity step reports it): the hero
  // was saved (the line above), and came home shaken.
  for (const x of result.shaken ?? []) {
    out.push({
      kind: 'withdraw',
      icon: '↩',
      text: t('Pulled back: {name} came home shaken (−{n} Sanity).', { name: unitName(log, x.heroId), n: Math.round(x.sanity) }),
    })
  }
  const seen = new Set<string>()
  for (const o of orders) {
    // A hero pulled back is told by the "Saved" and "Pulled back" lines above.
    if (o.kind === 'withdraw') continue
    const key = o.kind === 'focus' ? `f|${o.enemyId}` : o.kind === 'protect' ? `p|${o.allyId}` : 'r'
    if (seen.has(key)) continue
    seen.add(key)
    if (o.kind === 'protect') out.push(protectReason(log, o, fallen))
    else if (o.kind === 'focus') out.push(focusReason(log, o))
    else {
      const home = result.result.survivorHeroIds.length
      out.push({
        kind: 'retreat',
        icon: '🏳',
        text:
          home === 1
            ? t('Retreat: you called it, and 1 hero came home.')
            : t('Retreat: you called it, and {n} heroes came home.', { n: home }),
      })
    }
  }

  const stones = result.materialsAwarded.promotionStone ?? 0
  if (result.kind === 'elite') {
    out.push({
      kind: 'door',
      icon: KIND_ICON.elite,
      text: result.cleared
        ? stones === 1
          ? t('Skull door: ×{m} gold and +1 stone.', { m: TUNING.climb.reward.eliteGoldMult })
          : stones > 1
          ? t('Skull door: ×{m} gold and +{n} stones.', { m: TUNING.climb.reward.eliteGoldMult, n: stones })
          : t('Skull door: ×{m} gold.', { m: TUNING.climb.reward.eliteGoldMult })
        : t('Skull door: you chose the harder fight.'),
    })
  } else if (result.kind === 'breather' && result.cleared) {
    out.push({ kind: 'door', icon: KIND_ICON.breather, text: t('Breather: an easier floor after the boss.') })
  }

  if (result.routed) {
    const n = result.fallenHeroIds.length
    out.push({
      kind: 'rout',
      icon: '⚑',
      text:
        n === 0
          ? t('Rout: the line broke, and the party fled.')
          : n === 1
            ? t('Rout: the party fled after 1 fell.')
            : t('Rout: the party fled after {n} fell.', { n }),
    })
  } else if (result.result.outcome === 'wipe') {
    out.push({ kind: 'wipe', icon: '☠', text: t('Wiped out: no one broke ranks, and no one came home.') })
  }

  if ((result.lastStandPct ?? 0) > 0) {
    out.push({
      kind: 'lastStand',
      icon: '✊',
      text: t('Last Stand: +{p}% to every stat, because the roster is thin.', { p: Math.round((result.lastStandPct ?? 0) * 100) }),
    })
  }

  for (const id of result.nemesisDefeated ?? []) {
    const n = state?.life.legacy.nemeses.find((x) => x.id === id)
    out.push({
      kind: 'nemesis',
      icon: '⚔',
      text: n ? t('Revenge: {bane} fell, and {hero} is avenged.', { bane: inSentence(baneName(n)), hero: firstName(n.heroName) }) : t('Revenge: a Bane fell today.'),
    })
  }
  return out
}
