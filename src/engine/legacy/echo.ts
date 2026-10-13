/**
 * Echo and plaque math (spec 2026-10-12 S21, S23): the stat side of the legacy.
 *
 * Kept apart from `legacy.ts` on purpose: `unit.ts` imports this file, and it must stay a
 * leaf (types + TUNING only) so the unit seam never pulls in the gacha or the life engine.
 * PURE; no RNG.
 */
import { TUNING } from '../tuning'
import type { DerivedStats, Echo, EchoStat, FallenRecord, GameState, HeroSkill, OwnedHero } from '../types'

const LG = TUNING.legacy

/** The six stats an Echo can lift, in tie-break order (offence first). */
export const ECHO_STATS: readonly EchoStat[] = ['pAtk', 'mAtk', 'maxHP', 'pDef', 'mDef', 'spd']

/** Round a persisted / summed fraction (keeps saves and stat maps tidy: 0.1 + 0.2 = 0.3). */
export function roundPct(x: number): number {
  return Math.round(x * 10000) / 10000
}

/** A hero's inherited Echoes (always an array; `HeroLife.echoes` is optional). */
export function echoesOf(hero: Pick<OwnedHero, 'life'>): readonly Echo[] {
  return hero.life?.echoes ?? []
}

/**
 * A hero's inherited Echoes as a relative stat map.
 *
 * `buildCombatUnit` already folds this in for every hero. Callers must NOT pass it again
 * through `extraPct`, or the Echo counts twice.
 */
export function echoPct(hero: Pick<OwnedHero, 'life'>): Partial<Record<keyof DerivedStats, number>> {
  const out: Partial<Record<keyof DerivedStats, number>> = {}
  for (const e of echoesOf(hero)) {
    if (!(e.pct > 0)) continue
    out[e.stat] = roundPct((out[e.stat] ?? 0) + e.pct)
  }
  return out
}

/**
 * The skill fragments: every Echo carrying a skill the hero knows adds +1 to that skill's
 * level (the skill module clamps the effect at the grade cap). Returns `skills` itself
 * (same reference) when nothing changes, so a hero without fragments is byte-identical.
 */
export function echoSkills(skills: readonly HeroSkill[], echoes: readonly Echo[]): readonly HeroSkill[] {
  if (echoes.length === 0 || skills.length === 0) return skills
  const bonus = new Map<string, number>()
  for (const e of echoes) if (e.skillId !== undefined) bonus.set(e.skillId, (bonus.get(e.skillId) ?? 0) + 1)
  if (!skills.some((s) => bonus.has(s.id))) return skills
  return skills.map((s) => (bonus.has(s.id) ? { ...s, level: s.level + bonus.get(s.id)! } : s))
}

/** The Memorial's plaque bonus for `plaques` graves: +pctPerPlaque each, capped. */
export function plaquePct(plaques: number): number {
  return roundPct(Math.min(LG.memorial.capPct, Math.max(0, plaques) * LG.memorial.pctPerPlaque))
}

/**
 * Does this grave earn a plaque? Every hero who fell in the climb does; one sacrificed
 * to synthesis only if they had fought a floor (the same rule as `leavesEcho`). Without
 * this, ten 1★ pulls fed to synthesis would buy the whole +5% for gold.
 */
export function earnsPlaque(rec: Pick<FallenRecord, 'cause' | 'bestFloor'>): boolean {
  return rec.cause !== 'synthesis' || (rec.bestFloor ?? 0) >= 1
}

/** How many graves lend the living their strength. */
export function plaqueCount(state: GameState): number {
  let n = 0
  for (const g of state.life.memorial) if (earnsPlaque(g)) n++
  return n
}

/** "The tower remembers": the Memorial's bonus to every stat (fraction, capped at +5%). */
export function legacyPct(state: GameState): number {
  return plaquePct(plaqueCount(state))
}

/**
 * `legacyPct` as the `extraPct` map `buildCombatUnit` takes (every combat stat). This is
 * what the tower passes for each hero; Echoes are NOT included (the unit adds them).
 */
export function legacyExtraPct(state: GameState): Partial<Record<keyof DerivedStats, number>> {
  const p = legacyPct(state)
  if (p === 0) return {}
  const out: Partial<Record<keyof DerivedStats, number>> = {}
  for (const k of ECHO_STATS) out[k] = p
  return out
}
