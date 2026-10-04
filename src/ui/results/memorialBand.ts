/**
 * The memorial band (lane K): when heroes fall, the results screen becomes a memorial.
 * This module turns a floor result into what the band shows: one row per fallen hero
 * (their look, name, floors climbed, days served, last words, who mourns them) and what
 * Isel says for them. PURE presentation over existing data:
 *
 * - the grave is the Memorial's own FallenRecord (life/react.ts raises it with the
 *   mourners, the best floor and the days served) — nothing is recomputed;
 * - the last words come from `lastWordsTogether` over the same deaths the battle's death
 *   moment used, so the band, the battle and the Memorial always agree.
 *
 * The grief itself (who mourns, for how long) is lane L's simulation; this only reads it.
 */
import type { CombatLog, FallenRecord, FloorResult, GameState, HeroId } from '../../engine/types'
import type { LookSource } from '../pixel/look'
import { hashString } from '../pixel/rand'
import { lastWordsTogether, shortName } from '../life/speech'
import { t } from '../i18n/i18n'

/** How the results should feel. */
export type ResultMood = 'triumph' | 'cleared' | 'bittersweet' | 'mourning' | 'defeat' | 'retreat' | 'failed'

export function resultMood(result: Pick<FloorResult, 'cleared' | 'fallenHeroIds' | 'result'>, anchor = false): ResultMood {
  const fell = result.fallenHeroIds.length > 0
  if (result.cleared) return fell ? 'bittersweet' : anchor ? 'triumph' : 'cleared'
  if (fell) return 'mourning'
  const o = result.result.outcome
  return o === 'retreat' ? 'retreat' : o === 'failed' ? 'failed' : 'defeat'
}

export interface MemorialBand {
  heroId: string
  name: string
  look: LookSource
  star: number
  level: number
  /** The highest floor they ever stood on. */
  floorsClimbed: number
  daysServed: number
  lastWords: string
  /** Friends left behind (short names), as the grave records them. */
  mourners: string[]
  /** Isel's words for them. */
  isel: string
}

/** The fallen of a battle in the order they fell (heroes only; escorts are not graves). */
export function fallenInOrder(log: CombatLog, fallenIds: readonly string[]): { heroId: HeroId; name: string }[] {
  const byId = new Map(log.unitsInit.map((u) => [u.id, u]))
  const want = new Set(fallenIds)
  const out: { heroId: HeroId; name: string }[] = []
  const seen = new Set<string>()
  for (const e of log.events) {
    if (e.kind !== 'death' || !want.has(e.unitId) || seen.has(e.unitId)) continue
    const u = byId.get(e.unitId)
    if (!u || u.side !== 'hero' || u.isNpc) continue
    seen.add(e.unitId)
    out.push({ heroId: e.unitId as HeroId, name: u.name })
  }
  // A fallen hero the log never shows dying (an older save) still gets a band.
  for (const id of fallenIds) if (!seen.has(id)) out.push({ heroId: id as HeroId, name: byId.get(id)?.name ?? id })
  return out
}

/** The grave of this hero (the latest, should a save ever hold two). */
export function graveOf(state: GameState, heroId: string): FallenRecord | undefined {
  for (let i = state.life.memorial.length - 1; i >= 0; i--) if (state.life.memorial[i]!.heroId === heroId) return state.life.memorial[i]
  return undefined
}

/** Isel's words for one of the fallen, by what the grave says (English source lines). */
export const ISEL_FOR = {
  mourned: [
    '{name} reached floor {floor}. {mourners} will keep a lamp lit by the obelisk tonight.',
    'I wrote {name} into the ledger on the first day. Tonight {mourners} asked to write the last line.',
    '{mourners} will not eat tonight, Master. {name} always kept them a seat.',
    'The obelisk has a new name, Master: {name}, floor {floor}. {mourners} have already brought flowers.',
    '{mourners} keep asking me when {name} comes home. I have not found the words yet.',
  ],
  alone: [
    '{name} climbed to floor {floor}. If no one else lights a lamp, I will.',
    'No one in the lobby knew {name} well yet. That is not the same as no one caring.',
    '{name} stood on floor {floor}, further than most ever will. I will cut the name deep.',
  ],
  brief: ['{name} was with us less than a day. Long enough to be counted among us.'],
} as const

/** Isel's last word over the whole band. */
export const ISEL_CLOSE = {
  bittersweet: ['The floor is ours, Master. It was paid for.', 'We climb on. We do not climb on lightly.'],
  mourning: ['Come home, Master. The waiting room will set the table with fewer places.', 'Bring the others back. We will name the fallen by the fire.'],
} as const

/** A line from `pool` by `key`; with `taken`, the pick moves on past lines already used
 *  (one result never repeats a line while the pool lasts). */
function pickLine(pool: readonly string[], key: string, taken?: Set<string>): string {
  const start = hashString(key) % pool.length
  for (let k = 0; k < pool.length; k++) {
    const line = pool[(start + k) % pool.length]!
    if (!taken || !taken.has(line)) {
      taken?.add(line)
      return line
    }
  }
  return pool[start]!
}

/** A list of names: "Ana", "Ana and Bo", "Ana, Bo and Cy". */
export function nameList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return t('{a} and {b}', { a: names.slice(0, -1).join(', '), b: names[names.length - 1]! })
}

/** What Isel says for one fallen hero. */
export function iselFor(
  name: string,
  grave: Pick<FallenRecord, 'heroId' | 'bestFloor' | 'floor' | 'daysServed'> | undefined,
  mourners: readonly string[],
  taken?: Set<string>,
): string {
  const floor = grave ? Math.max(grave.bestFloor, grave.floor) : 0
  const key = `isel|${grave?.heroId ?? name}`
  if (mourners.length > 0) return t(pickLine(ISEL_FOR.mourned, key, taken), { name, floor, mourners: nameList(mourners) })
  if (grave && grave.daysServed < 1) return t(pickLine(ISEL_FOR.brief, key, taken), { name, floor })
  return t(pickLine(ISEL_FOR.alone, key, taken), { name, floor })
}

/** Isel's closing line under the band (none when nobody fell). */
export function iselClose(mood: ResultMood, fallen: readonly string[]): string | null {
  if (fallen.length === 0) return null
  const pool = mood === 'bittersweet' ? ISEL_CLOSE.bittersweet : ISEL_CLOSE.mourning
  return t(pickLine(pool, `close|${fallen.join('|')}`))
}

/** One band per hero who fell in this battle, in the order they fell. */
export function memorialBands(state: GameState, result: Pick<FloorResult, 'fallenHeroIds' | 'result' | 'floor'>): MemorialBand[] {
  const fallen = fallenInOrder(result.result.log, result.fallenHeroIds)
  if (fallen.length === 0) return []
  const words = lastWordsTogether(state, fallen)
  const init = new Map(result.result.log.unitsInit.map((u) => [u.id, u]))
  // Isel never says the same line twice over one battle's dead (while her lines last).
  const said = new Set<string>()
  return fallen.map((f) => {
    const grave = graveOf(state, f.heroId)
    const hero = state.heroes[f.heroId]
    const u = init.get(f.heroId)
    const mourners = (grave?.mourners ?? []).map((m) => shortName(state, m))
    const firstName = f.name.split(/\s+/)[0] ?? f.name
    const look: LookSource = {
      id: f.heroId,
      name: grave?.name ?? hero?.name ?? f.name,
      star: grave?.star ?? hero?.star ?? 1,
      heroClass: grave?.heroClass ?? hero?.heroClass ?? u?.unitClass ?? null,
      element: grave?.element ?? hero?.element ?? u?.element ?? 'physical',
      portraitToken: grave?.portraitToken ?? hero?.portraitToken,
    }
    return {
      heroId: f.heroId,
      name: look.name,
      look,
      star: look.star,
      level: grave?.level ?? hero?.xp.level ?? u?.level ?? 1,
      floorsClimbed: grave ? Math.max(grave.bestFloor, grave.floor) : result.floor,
      daysServed: grave?.daysServed ?? 0,
      lastWords: words.get(f.heroId) ?? t('…'),
      mourners,
      isel: iselFor(firstName, grave, mourners, said),
    }
  })
}
