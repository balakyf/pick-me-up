/**
 * Isel's eulogy (lane M): what she says over one of the fallen on the memorial band,
 * generated from who they were. Three short sentences, each from the hero's identity:
 *
 * 1. who they were: their voice (formal, rough, cheerful, quiet, grim) and the trade they
 *    had before the crystal called them (personalityOf, derived from identity);
 * 2. what they were like: their innate trait's family (traitOf);
 * 3. what is left: the friends who mourn them by name, or the floor they reached when no
 *    one does yet, or a day's welcome for a newcomer; an anchor floor is named by its story.
 *
 * Deterministic: every pick hashes the hero's id. With `taken`, one battle's dead never get
 * the same sentence twice while a pool lasts. Pure; reads nothing but its input.
 */
import type { HeroClass, HeroId, Star } from '../../engine/types'
import { personalityOf, type Voice } from '../../engine/life'
import { traitOf, type TraitFamily } from '../../engine/content/traits'
import { ANCHOR_STORY } from '../../engine/content/story'
import { hashString } from '../pixel/rand'
import { tradeName } from '../life/speech'
import { t } from '../i18n/i18n'
import { ta } from '../text'

/** Who they were, by voice ({name}, {trade}). */
export const EULOGY_WHO: Record<Voice, readonly string[]> = {
  formal: ['{name} came to us a {trade} and kept a {trade}’s manners to the end.', '{name} bowed to me every morning. A {trade}, and the most courteous soul in the waiting room.'],
  rough: ['{name} was a {trade} with a temper you could hear from the Forge, and a laugh to match.', '{name} cursed the crystal the day it called. A {trade}, and still the first to pick up a sword.'],
  cheerful: ['{name} was a {trade} who whistled on the stairs of a tower that kills people.', '{name} made the waiting room laugh. A {trade}, and the brightest of us.'],
  quiet: ['{name} was a {trade} who said little and noticed everything.', '{name} hardly spoke, Master. A {trade} who listened better than any of us.'],
  grim: ['{name} was a {trade} who always expected the tower to win. Not this soon.', '{name} never believed in happy endings. A {trade}, braver than that belief.'],
}

/** What they were like, by their trait's family. */
export const EULOGY_TRAIT: Record<TraitFamily, string> = {
  courage: 'The tower never once made them step back.',
  temper: 'Quick to anger, and quicker to forgive.',
  steadfast: 'They held the line when the line was all there was.',
  study: 'They learned something new every week, and taught it to anyone who asked.',
  luck: 'Lucky, everyone said. Luck runs out in a tower.',
  healer: 'Their hands closed more wounds than I can count.',
  leader: 'Others followed them without being asked.',
  loner: 'They walked alone, and still the others watched out for them.',
  night: 'They loved the night watch. I will keep it for them now.',
  stomach: 'They ate like three and fought like five.',
}

/** What is left ({floor}, {mourners}; {place} on an anchor floor). */
export const EULOGY_CLOSE = {
  mourned: [
    '{mourners} will keep a lamp lit by the obelisk tonight.',
    '{mourners} asked to write the last line in the ledger.',
    '{mourners} will not eat tonight. There was always a seat kept for them.',
    '{mourners} have already brought flowers.',
    '{mourners} keep asking me when they come home. I have not found the words yet.',
  ],
  alone: [
    'They reached floor {floor}. If no one else lights a lamp, I will.',
    'No one knew them well yet. That is not the same as no one caring.',
    'Floor {floor}, further than most will ever climb. I will cut the name deep.',
  ],
  anchor: ['They fell at {place}, floor {floor}. The tower will not forget it, and neither will I.'],
  brief: ['They were with us less than a day. Long enough to be counted among us.'],
} as const

/** Who the eulogy is for. */
export interface EulogyInput {
  /** The name Isel uses (a first name). */
  name: string
  /** Their identity, for voice, trade and trait (absent: a name-only eulogy). */
  who?: { id: HeroId; name: string; star: Star; heroClass: HeroClass | null; portraitToken: string }
  /** The highest floor they reached, and the floor they fell on. */
  floor: number
  fellOn?: number
  daysServed?: number
  /** Friends left behind (short names, already listed). */
  mourners: string
}

function pick(pool: readonly string[], key: string, taken?: Set<string>): string {
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

/** Isel's words for one of the fallen (translated). The same hero always gets the same words. */
export function eulogy(input: EulogyInput, taken?: Set<string>): string {
  const key = input.who?.id ?? input.name
  const parts: string[] = []
  if (input.who) {
    const p = personalityOf(input.who)
    parts.push(ta(pick(EULOGY_WHO[p.voice], `who|${key}`, taken), { name: input.name, trade: tradeName(p.background) }))
    parts.push(t(EULOGY_TRAIT[traitOf(input.who).family]))
  }
  const place = input.fellOn !== undefined ? ANCHOR_STORY[input.fellOn] : undefined
  const vars = { floor: input.floor, mourners: input.mourners, place: place ? t(place.title) : '', name: input.name }
  let close: string
  if (input.mourners !== '') close = t(pick(EULOGY_CLOSE.mourned, `close|${key}`, taken), vars)
  else if ((input.daysServed ?? 1) < 1) close = t(pick(EULOGY_CLOSE.brief, `close|${key}`, taken), vars)
  else if (place) close = t(pick(EULOGY_CLOSE.anchor, `close|${key}`), vars)
  else close = t(pick(EULOGY_CLOSE.alone, `close|${key}`, taken), vars)
  // Without an identity, the name opens the closing line's sentence.
  if (!input.who) return t('{name}. {line}', { name: input.name, line: close })
  parts.push(close)
  return parts.join(' ')
}
