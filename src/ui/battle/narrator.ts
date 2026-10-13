/**
 * Isel on commentary (spec 2026-10-12, S17; WP2). One-line barks at the moments that
 * carry meaning — a first crit, a near-wipe, a hero's death, a "Saved!", a flawless
 * clear — at most one every 10 s, like Darkest Dungeon's narrator. Lines are English
 * source strings for t() (French in frBattle.ts); variants are picked by hash, never
 * Math.random, so a replay says the same thing twice. Pure.
 */
import type { CombatLog } from '../../engine/types'
import { hashString } from '../pixel/rand'

export type BarkKind = 'firstCrit' | 'nearWipe' | 'heroDeath' | 'saved' | 'flawless' | 'tutorial'

export interface Bark {
  kind: BarkKind
  /** Frame cursor the bark belongs to. */
  cursor: number
  /** English source line (pass through t() with `vars`). */
  line: string
  vars: Record<string, string | number>
}

/** Isel's lines, by moment. Every string here has a French entry in frBattle.ts. */
export const BARK_LINES: Record<BarkKind, readonly string[]> = {
  firstCrit: ['A clean critical! They remember the drills.', 'Oh, that one landed. Well struck!', 'There — right where it hurts.'],
  nearWipe: ['Master… one left standing. Choose carefully.', 'The line is breaking. Pull them out, or trust them?', 'Careful. I would rather not carve another name.'],
  heroDeath: ['{name}… I will light a lamp at the Memorial.', 'We lost {name}. The waiting room will feel it.', 'Rest now, {name}. You were brave.'],
  saved: ['Saved! Your orders changed fate.', 'You pulled {name} back from the edge.', '{name} lives — because you chose.'],
  flawless: ['Flawless. Everyone comes home tonight.', 'Not a single scratch worth mourning. Well led.', 'All of them, safe. That is how it should be.'],
  tutorial: ['Your orders change fate. Try Protect.'],
}

/** Normal barks wait this long after the last one (replay time). */
export const BARK_COOLDOWN_MS = 10_000
/** A death, a "Saved!" or the coaching line may cut in this soon after another bark. */
export const BARK_PRIORITY_GAP_MS = 3_000
/** How long a bark stays on screen (real ms). */
export const BARK_SHOW_MS = 3_200

const PRIORITY: ReadonlySet<BarkKind> = new Set(['heroDeath', 'saved', 'tutorial'])

export function isPriorityBark(kind: BarkKind): boolean {
  return PRIORITY.has(kind)
}

/** May a bark of `kind` play at replay time `nowMs`, the last one having played at `lastMs` (null = none yet)? */
export function canBark(kind: BarkKind, nowMs: number, lastMs: number | null): boolean {
  if (lastMs === null) return true
  return nowMs - lastMs >= (isPriorityBark(kind) ? BARK_PRIORITY_GAP_MS : BARK_COOLDOWN_MS)
}

/** A deterministic variant of a bark line for this fight (from `lines`, a subset of the kind's). */
export function barkLine(kind: BarkKind, salt: string, lines: readonly string[] = BARK_LINES[kind]): string {
  return lines[hashString(`${kind}|${salt}`) % lines.length]!
}

/** The near-wipe line that says "one left standing" is only true when one is. */
const ONE_LEFT = 'Master… one left standing. Choose carefully.'

/**
 * Every bark the log itself calls for, in order: the party's first crit, the first
 * near-wipe (one hero left of three or more, or the party under a quarter of its life),
 * each hero's death, and a flawless win. ("Saved!" and the coaching line come from the
 * Decisive Moment at run time.)
 */
export function planBarks(log: CombatLog): Bark[] {
  const unit = new Map(log.unitsInit.map((u) => [u.id, u]))
  const party = log.unitsInit.filter((u) => u.side === 'hero' && !u.isNpc)
  const hp = new Map(party.map((u) => [u.id, u.maxHP]))
  const maxTotal = party.reduce((s, u) => s + u.maxHP, 0)
  const alive = new Set(party.map((u) => u.id))
  const out: Bark[] = []
  let crit = false
  let nearWipe = false
  let deaths = 0
  log.events.forEach((e, i) => {
    const cursor = i + 1
    const salt = `${log.seed}|${log.floor}|${i}`
    if (e.kind === 'hit') {
      if (hp.has(e.targetId)) hp.set(e.targetId, Math.max(0, e.hpAfter))
      if (!crit && e.crit && unit.get(e.actorId)?.side === 'hero') {
        crit = true
        out.push({ kind: 'firstCrit', cursor, line: barkLine('firstCrit', salt), vars: {} })
      }
    } else if (e.kind === 'heal' || e.kind === 'hp-cost') {
      if (hp.has(e.unitId)) hp.set(e.unitId, Math.max(0, e.hpAfter))
    } else if (e.kind === 'death' && alive.has(e.unitId)) {
      alive.delete(e.unitId)
      hp.set(e.unitId, 0)
      deaths++
      out.push({ kind: 'heroDeath', cursor, line: barkLine('heroDeath', salt), vars: { name: firstName(unit.get(e.unitId)!.name) } })
    } else if (e.kind === 'end' && e.outcome === 'win' && deaths === 0 && party.length > 0) {
      out.push({ kind: 'flawless', cursor, line: barkLine('flawless', salt), vars: {} })
    }
    if (!nearWipe && alive.size > 0 && e.kind !== 'end') {
      const total = [...alive].reduce((s, id) => s + (hp.get(id) ?? 0), 0)
      if ((party.length >= 3 && alive.size === 1) || (maxTotal > 0 && total < maxTotal * 0.25)) {
        nearWipe = true
        const lines = alive.size === 1 ? BARK_LINES.nearWipe : BARK_LINES.nearWipe.filter((l) => l !== ONE_LEFT)
        out.push({ kind: 'nearWipe', cursor, line: barkLine('nearWipe', salt, lines), vars: {} })
      }
    }
  })
  return out
}

/** "Mira Coldwater" → "Mira" (barks speak like friends). */
export function firstName(name: string): string {
  return name.split(/\s+/)[0] || name
}
