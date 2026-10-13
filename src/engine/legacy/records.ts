/**
 * Legacy records (spec 2026-10-12 S21-S23): the pure builders `lifeReact` uses when a hero
 * dies (the pending Echo, the killer, the Nemesis, the lesson) and the rules the Memorial
 * and the commands share (who may inherit, which floors a revenant may haunt).
 *
 * Imports only leaves (types, TUNING, content, stats, rng, life/life) so the life engine
 * can use it without an import cycle. PURE: fresh objects, no mutation.
 * Randomness: `rngFor(seed, 'nemesis', heroId)` only (one draw per fallen hero).
 */
import { ACTS, ANCHORS, ENEMY_TEMPLATES } from '../content'
import { relationKey } from '../life/life'
import { nextInt, rngFor } from '../rng'
import { deriveStats, leveledAttrs } from '../stats'
import { ELEMENT_ADVANTAGE, TUNING } from '../tuning'
import type {
  CombatLog,
  CombatUnitInit,
  DeathCause,
  Element,
  EchoStat,
  EnemyTemplate,
  FallenRecord,
  GameState,
  HeroId,
  Nemesis,
  OwnedHero,
  PendingEcho,
  PrimaryAttrs,
  Seed,
} from '../types'
import { ECHO_STATS, echoesOf, roundPct } from './echo'

const LG = TUNING.legacy

// ─────────────────────────────────────────────────────────────────────────────
// The killer
// ─────────────────────────────────────────────────────────────────────────────

/** Who struck a hero down: the enemy template, as the Memorial remembers it. */
export interface FallenKiller {
  /** Enemy template id (`ENEMY_TEMPLATES` key). */
  templateId: string
  name: string
  element: Element
  level: number
  /** The template's enemy family, when it has one (the lesson). */
  family?: string
}

/**
 * A Memorial grave plus who killed them. `killer` is an optional extension written by
 * `lifeReact` for tower deaths (SHARED-FILE REQUEST: fold it into `FallenRecord`). Old
 * graves and non-battle deaths have none.
 */
export type MemorialRecord = FallenRecord & { killer?: FallenKiller }

/** The killer recorded on a grave, if any. */
export function killerOf(rec: FallenRecord): FallenKiller | null {
  return (rec as MemorialRecord).killer ?? null
}

const TEMPLATE_BY_NAME: ReadonlyMap<string, EnemyTemplate> = (() => {
  const m = new Map<string, EnemyTemplate>()
  for (const tpl of Object.values(ENEMY_TEMPLATES) as EnemyTemplate[]) if (!m.has(tpl.name)) m.set(tpl.name, tpl)
  return m
})()

/** Templates that roam the tower's filler floors (an anchor's boss never becomes a Nemesis). */
const ROAMING: ReadonlySet<string> = new Set(ACTS.flatMap((a) => [...a.pool]))

/** An enemy template by its display name (the combat log carries names, not template ids). */
export function templateByName(name: string): EnemyTemplate | null {
  return TEMPLATE_BY_NAME.get(name) ?? null
}

/** Can this template come back as a revenant? Only rank-and-file filler enemies can. */
export function isRoamingTemplate(templateId: string): boolean {
  return ROAMING.has(templateId)
}

/**
 * The unit that dealt the killing blow: the actor of the last `hit` on `heroId` before
 * that hero's `death` event. Null when the hero did not die in this log, or the blow
 * came from something that is not an enemy.
 */
export function killingBlow(log: CombatLog, heroId: string): CombatUnitInit | null {
  let last: string | null = null
  for (const e of log.events) {
    if (e.kind === 'hit' && e.targetId === heroId) last = e.actorId
    else if (e.kind === 'death' && e.unitId === heroId) {
      const u = last === null ? undefined : log.unitsInit.find((x) => x.id === last)
      return u !== undefined && u.side === 'enemy' ? u : null
    }
  }
  return null
}

/**
 * The revenant's display name on its floor: "Mira's Bane" (the fallen's first name).
 * WP3 names the injected unit with this, so a Bane that kills again is still recognised.
 */
export function revenantName(n: Pick<Nemesis, 'heroName'>): string {
  return `${n.heroName.split(/\s+/)[0] ?? n.heroName}'s Bane`
}

/**
 * The Memorial's view of a killing blow (null when the template is unknown). A revenant
 * (a Bane that kills again) is recognised by its name among `nemeses`.
 */
export function fallenKiller(unit: CombatUnitInit, nemeses: readonly Nemesis[] = []): FallenKiller | null {
  const bane = nemeses.find((n) => revenantName(n) === unit.name)
  const tpl = bane ? ((ENEMY_TEMPLATES as Record<string, EnemyTemplate>)[bane.templateId] ?? null) : templateByName(unit.name)
  if (tpl === null) return null
  return {
    templateId: tpl.id,
    name: tpl.name,
    element: unit.element,
    level: unit.level,
    ...(tpl.family !== undefined ? { family: tpl.family } : {}),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Nemesis
// ─────────────────────────────────────────────────────────────────────────────

/** A floor a revenant may wait on: a plain climb floor (never an anchor, the F36-40 loop
 *  or the world's end). */
export function isRevengeFloor(floor: number): boolean {
  const loop = TUNING.tower.loop
  if (!Number.isInteger(floor) || floor < 3) return false
  if (floor % 5 === 0 || ANCHORS[floor] !== undefined) return false
  if (floor >= loop.start && floor <= loop.gate) return false
  return floor < TUNING.tower.worldEndFloor
}

/**
 * Where a Nemesis returns: `diedFloor + [revengeAfter]`, drawn on the hero's own `nemesis`
 * stream. A drawn floor that is not a revenge floor slides to the next one inside the
 * window (wrapping); if the whole window is barred (the loop), the first plain floor past
 * it. Null when no floor is left before the world's end.
 */
export function revengeFloorFor(seed: Seed, heroId: HeroId, diedFloor: number): number | null {
  const [lo, hi] = LG.nemesis.revengeAfter as readonly [number, number]
  const span = hi - lo + 1
  const offset = nextInt(rngFor(seed, 'nemesis', heroId), lo, hi).value
  for (let k = 0; k < span; k++) {
    const f = diedFloor + lo + ((offset - lo + k) % span)
    if (isRevengeFloor(f)) return f
  }
  for (let f = diedFloor + hi + 1; f < TUNING.tower.worldEndFloor; f++) if (isRevengeFloor(f)) return f
  return null
}

/** Nemeses still waiting for their rematch. */
export function waitingNemeses(state: GameState): Nemesis[] {
  return state.life.legacy.nemeses.filter((n) => n.status === 'waiting')
}

/** Build the Nemesis a killing blow leaves behind (null when it cannot return). */
export function nemesisFor(seed: Seed, fallen: Pick<OwnedHero, 'id' | 'name'>, killer: FallenKiller, diedFloor: number): Nemesis | null {
  if (!isRoamingTemplate(killer.templateId)) return null
  const revengeFloor = revengeFloorFor(seed, fallen.id, diedFloor)
  if (revengeFloor === null) return null
  return {
    id: `nem_${fallen.id}`,
    templateId: killer.templateId,
    name: killer.name,
    element: killer.element,
    level: killer.level,
    heroId: fallen.id,
    heroName: fallen.name,
    diedFloor,
    revengeFloor,
    status: 'waiting',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Echoes
// ─────────────────────────────────────────────────────────────────────────────

/** Only a hero who climbed leaves an Echo: one who died in battle, or fought a floor before. */
export function leavesEcho(hero: Pick<OwnedHero, 'life'>, cause: DeathCause): boolean {
  return cause === 'battle' || (hero.life?.bestFloor ?? 0) >= 1
}

const ZERO: PrimaryAttrs = { str: 0, agi: 0, vit: 0, int: 0, wil: 0 }

/**
 * A hero's best stat relative to a balanced hero of the same total attributes: the stat
 * their build leans into most (a mage → M.ATK, a tank → HP or P.DEF). Flat terms are taken
 * out first so HP and SPD compete fairly. Ties go to ECHO_STATS order.
 */
export function bestEchoStat(hero: Pick<OwnedHero, 'baseAttrs' | 'growthGrades' | 'xp'>): EchoStat {
  const a = leveledAttrs(hero.baseAttrs, hero.growthGrades, hero.xp.level)
  const mean = (a.str + a.agi + a.vit + a.int + a.wil) / 5
  const own = deriveStats(a)
  const flat = deriveStats({ str: mean, agi: mean, vit: mean, int: mean, wil: mean })
  const zero = deriveStats(ZERO)
  let best: EchoStat = ECHO_STATS[0]!
  let bestRatio = -1
  for (const k of ECHO_STATS) {
    const base = flat[k] - zero[k]
    const ratio = base > 0 ? (own[k] - zero[k]) / base : 0
    if (ratio > bestRatio + 1e-9) {
      bestRatio = ratio
      best = k
    }
  }
  return best
}

/** The fallen's highest-level skill (array order breaks ties); none for skill-less heroes. */
export function signatureSkillId(hero: Pick<OwnedHero, 'skills'>): string | undefined {
  let best: string | undefined
  let lvl = 0
  for (const s of hero.skills) {
    if (s.level > lvl) {
      lvl = s.level
      best = s.id
    }
  }
  return best
}

const affinity = (state: GameState, a: string, b: string): number => state.life.relations[relationKey(a, b)]?.affinity ?? 0

/** May this hero take another Echo? Alive, free, and under the per-heir cap. */
export function canInherit(hero: OwnedHero | undefined): hero is OwnedHero {
  return !!hero && hero.alive && !hero.captiveOf && echoesOf(hero).length < LG.echoMaxPerHeir
}

/** Every hero who could inherit from `fallenId`, closest first (affinity, then level, then id). */
export function rankHeirs(state: GameState, fallenId: HeroId): HeroId[] {
  return (Object.values(state.heroes) as OwnedHero[])
    .filter((h) => h.id !== fallenId && canInherit(h))
    .sort((x, y) => affinity(state, fallenId, y.id) - affinity(state, fallenId, x.id) || y.xp.level - x.xp.level || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
    .map((h) => h.id)
}

/** The Echo a fallen hero leaves, with its suggested heirs (closest friends first). */
export function pendingEchoFor(state: GameState, fallen: OwnedHero, floor: number): PendingEcho {
  const skillId = LG.skillEcho ? signatureSkillId(fallen) : undefined
  return {
    fallenId: fallen.id,
    fallenName: fallen.name,
    floor,
    stat: bestEchoStat(fallen),
    pct: roundPct(LG.echoPct),
    ...(skillId !== undefined ? { skillId } : {}),
    candidates: rankHeirs(state, fallen.id).slice(0, LG.heirCandidates),
  }
}

/**
 * Who may take this Echo now: the suggested heirs still able to, then (when some have
 * fallen, been captured or filled up) the next closest living heroes, up to
 * `heirCandidates`. So an Echo never strands: a newcomer can carry it.
 */
export function heirOptions(state: GameState, pending: PendingEcho): HeroId[] {
  const out = pending.candidates.filter((id) => id !== pending.fallenId && canInherit(state.heroes[id]))
  if (out.length >= LG.heirCandidates) return out.slice(0, LG.heirCandidates)
  for (const id of rankHeirs(state, pending.fallenId)) {
    if (out.length >= LG.heirCandidates) break
    if (!out.includes(id)) out.push(id)
  }
  return out
}

/** Does this hero know the Echo's skill (so the fragment takes)? */
export function fragmentTakes(hero: Pick<OwnedHero, 'skills'>, skillId: string | undefined): boolean {
  return skillId !== undefined && hero.skills.some((s) => s.id === skillId)
}

// ─────────────────────────────────────────────────────────────────────────────
// Lessons
// ─────────────────────────────────────────────────────────────────────────────

/** The element that strikes `el` hard (fire beats wind, so wind's counter is fire). Null for
 *  physical, which nothing beats. */
export function counterElement(el: Element): Element | null {
  for (const [atk, def] of Object.entries(ELEMENT_ADVANTAGE) as [Element, Element][]) if (def === el) return atk
  return null
}

/** Has a death taught the Master about this enemy family? */
export function familyLearned(state: GameState, family: string | undefined): boolean {
  return family !== undefined && state.life.legacy.lessons.includes(family)
}

/** Living, free heroes. */
export function livingCount(state: GameState): number {
  let n = 0
  for (const h of Object.values(state.heroes) as OwnedHero[]) if (h.alive && !h.captiveOf) n++
  return n
}
