/**
 * The combat side of combat depth: the rules the ATB sim consults for bonds, formation and
 * floor modifiers. PURE helpers over a minimal view of the sim's live units, so combat.ts
 * only calls in at a few seams. None of them draws RNG — combat draws, and only when one
 * of these says there is something to roll for (a battle with no bonds and no modifiers
 * replays exactly as before).
 */
import type { CombatBond, CombatSide, CombatUnit, Element, FloorModifierId, SkillEffect } from '../types'
import { TUNING } from '../tuning'
import { DEPTH } from './depthTuning'
import { adjacentLines, lineDamageMult } from './formation'
import { modDamageMult, modHealMult, modMiss } from './floorMods'

const B = DEPTH.bonds
const F = DEPTH.formation

/** The slice of the sim's live unit these rules read. */
export interface DepthUnit {
  id: string
  side: CombatSide
  alive: boolean
  currentHP: number
  ref: CombatUnit
}

export interface DepthContext {
  bonds: readonly CombatBond[]
  mods: readonly FloorModifierId[]
}

/** A hero holding a line (monsters and mission NPCs don't take formation). */
function holdsLine(u: DepthUnit): boolean {
  return u.ref.sourceHeroId !== undefined && u.ref.isNpc !== true
}

/** `id`'s living partners of the given bond kinds. */
function partners(ctx: DepthContext, id: string, kinds: readonly CombatBond['kind'][], units: readonly DepthUnit[]): { unit: DepthUnit; bond: CombatBond }[] {
  const out: { unit: DepthUnit; bond: CombatBond }[] = []
  for (const bond of ctx.bonds) {
    if (!kinds.includes(bond.kind)) continue
    const other = bond.a === id ? bond.b : bond.b === id ? bond.a : null
    if (other === null) continue
    const u = units.find((x) => x.id === other && x.alive)
    if (u) out.push({ unit: u, bond })
  }
  return out.sort((x, y) => (x.unit.id < y.unit.id ? -1 : x.unit.id > y.unit.id ? 1 : 0))
}

/** Chance `actor`'s blow misses (fog, a grudge at their side). 0 = no roll. */
export function missChance(ctx: DepthContext, actor: DepthUnit, units: readonly DepthUnit[]): number {
  let p = modMiss(ctx.mods)
  if (ctx.bonds.length > 0 && partners(ctx, actor.id, ['grudge'], units).length > 0) p += B.grudgeMiss
  return p
}

/**
 * Every depth multiplier on one blow: the actor's line (heroes), the target's shelter
 * (back line behind a front, front line with a mid-line support), rivalry, and the floor.
 */
export function depthDamageMult(ctx: DepthContext, actor: DepthUnit, target: DepthUnit, el: Element, units: readonly DepthUnit[]): number {
  let m = 1
  if (holdsLine(actor)) m *= lineDamageMult(actor.ref.unitClass, actor.ref.line)
  if (holdsLine(target)) {
    const mates = units.filter((u) => u.alive && u.side === target.side && u.id !== target.id && holdsLine(u))
    if (target.ref.line === 'back' && mates.some((u) => u.ref.line === 'front')) m *= F.backCover
    else if (target.ref.line === 'front' && mates.some((u) => u.ref.line === 'mid')) m *= F.midSupportTaken
  }
  if (ctx.bonds.length > 0 && partners(ctx, actor.id, ['rival', 'grudge'], units).length > 0) m *= 1 + B.rivalDamage
  if (ctx.mods.length > 0) m *= modDamageMult(ctx.mods, el, actor.side)
  return m
}

/** Healing multiplier for `unit` (a mid-line hero supports; miasma chokes it). */
export function healMult(ctx: DepthContext, unit: DepthUnit): number {
  return (holdsLine(unit) && unit.ref.line === 'mid' ? F.midSupportHeal : 1) * modHealMult(ctx.mods)
}

/** COVER chance for a close friend at this affinity. */
export function coverChance(affinity: number): number {
  const over = Math.max(0, affinity - TUNING.life.relation.closeFriend)
  return Math.min(B.coverMax, B.coverBase + over * B.coverPerAffinity)
}

/** The pair key for once-per-battle bookkeeping. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/**
 * A close friend who could step in front of a blow of `amount` that would kill `target`:
 * alive, on a neighbouring line, able to survive it, and not yet having covered them.
 */
export function coverFor(
  ctx: DepthContext,
  target: DepthUnit,
  amount: number,
  units: readonly DepthUnit[],
  used: ReadonlySet<string>,
): { unit: DepthUnit; chance: number } | null {
  if (ctx.bonds.length === 0 || amount < target.currentHP || !holdsLine(target)) return null
  for (const { unit, bond } of partners(ctx, target.id, ['closeFriend'], units)) {
    if (used.has(pairKey(unit.id, target.id))) continue
    if (!adjacentLines(unit.ref.line, target.ref.line) || unit.currentHP <= amount) continue
    return { unit, chance: coverChance(bond.affinity) }
  }
  return null
}

/** Friends who might press `actor`'s attack, with their chance (in stable order). */
export function followUpCandidates(ctx: DepthContext, actor: DepthUnit, units: readonly DepthUnit[]): { unit: DepthUnit; chance: number }[] {
  if (ctx.bonds.length === 0) return []
  return partners(ctx, actor.id, ['friend', 'closeFriend'], units)
    .filter((p) => p.unit.ref.isNpc !== true)
    .map((p) => ({ unit: p.unit, chance: p.bond.kind === 'closeFriend' ? B.followUpCloseFriend : B.followUpFriend }))
}

/** The follow-up strike: the friend's free single-target attack at reduced power. */
export function followUpSkill(unit: CombatUnit, fallback: SkillEffect): SkillEffect {
  const basic = unit.skills.find((s) => s.spCost === 0 && s.target === 'single' && s.hpCost === undefined) ?? fallback
  return { ...basic, id: 'followup', name: 'Follow-up', skillMult: basic.skillMult * B.followUpMult }
}

/** A living rival (or grudge) of `actor`, for the chance they chase their own kill. */
export function rivalOf(ctx: DepthContext, actor: DepthUnit, units: readonly DepthUnit[]): DepthUnit | null {
  if (ctx.bonds.length === 0) return null
  return partners(ctx, actor.id, ['rival', 'grudge'], units)[0]?.unit ?? null
}
