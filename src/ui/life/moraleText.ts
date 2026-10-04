/**
 * The words for morale (engine/life/morale.ts): band names, what each factor means, and
 * what the Master can do about it. Pure; every string goes through t().
 */
import type { GameState, HeroId } from '../../engine/types'
import type { Morale, MoraleBand, MoraleFactor } from '../../engine/life'
import { MORALE } from '../../engine/life'
import { TRAITS, type TraitId } from '../../engine/content/traits'
import { t } from '../i18n/i18n'
import { shortName } from './speech'

const BAND: Record<MoraleBand, string> = {
  inspired: 'Inspired',
  high: 'In good spirits',
  steady: 'Steady',
  low: 'Low',
  shaken: 'Shaken',
  broken: 'Broken',
}

/** "Inspired", "Shaken"… */
export function bandName(band: MoraleBand): string {
  return t(BAND[band])
}

/** What the band does, in a line (the pips' tooltip). */
export function bandEffect(band: MoraleBand): string {
  const pct = (k: number) => Math.round(Math.abs(k - 1) * 100)
  switch (band) {
    case 'inspired':
      return t('Fights {n}% harder.', { n: pct(MORALE.inspiredStat) })
    case 'shaken':
      return t('Fights {n}% worse.', { n: pct(MORALE.shakenStat) })
    case 'broken':
      return t('Will not deploy until their spirits lift.')
    default:
      return t('No effect in battle.')
  }
}

/** A CSS colour token for the band. */
export function bandColor(band: MoraleBand): string {
  switch (band) {
    case 'inspired':
      return 'var(--mo-inspired)'
    case 'high':
      return 'var(--mo-high)'
    case 'steady':
      return 'var(--mo-steady)'
    case 'low':
      return 'var(--mo-low)'
    case 'shaken':
      return 'var(--mo-shaken)'
    case 'broken':
      return 'var(--mo-broken)'
  }
}

const name = (state: GameState, id: HeroId | undefined) => (id ? shortName(state, id) : t('someone'))

/** One factor as a phrase ("Grieving for Mira", "Two friends close by"). */
export function factorText(state: GameState, f: MoraleFactor): string {
  switch (f.key) {
    case 'sanity':
      return f.value >= 0 ? t('Clear-headed') : t('Frayed nerves (low Sanity)')
    case 'tired':
      return t('Exhausted')
    case 'hungry':
      return t('Hungry')
    case 'lonely':
      return t('Lonely')
    case 'bored':
      return t('Bored stiff')
    case 'cared':
      return t('Well fed, rested and in company')
    case 'fatigue':
      return t('Too many floors in a row')
    case 'grief':
      return f.other ? t('Grieving for {name}', { name: name(state, f.other) }) : t('Grieving')
    case 'withdrawn':
      return t('Withdrawn from the others')
    case 'jealous':
      return t('Feels overlooked next to {name}', { name: name(state, f.other) })
    case 'friends':
      return f.other ? t('Friends close by ({name} and others)', { name: name(state, f.other) }) : t('Friends close by')
    case 'feud':
      return t('Bad blood with {name}', { name: name(state, f.other) })
    case 'floorCleared':
      return t('A floor won')
    case 'floorLost':
      return t('A floor lost')
    case 'retreated':
      return t('A retreat')
    case 'nearDeath':
      return t('Nearly died')
    case 'comradeDied':
      return t('Saw {name} fall', { name: name(state, f.other) })
    case 'guilt':
      return t('Guilt over {name}', { name: name(state, f.other) })
    case 'gift':
      return t('A gift from the Master')
    case 'consoled':
      return t('{name} sat with them', { name: name(state, f.other) })
    case 'promoted':
      return t('Freshly promoted')
    case 'incident':
      return f.value > 0 ? t('A good day in the camp') : t('A bad day in the camp')
    case 'banquet':
      return t('A banquet')
    case 'job':
      return f.value > 0 ? t('Loves their job') : t('Resents their job')
    case 'trait':
      return t('{trait}: steady by nature', { trait: t(TRAITS[f.detail as TraitId]?.name ?? '') })
  }
}

/** What would lift this hero, at most three suggestions, most useful first. */
export function moraleHelp(m: Morale): string[] {
  const out: string[] = []
  const has = (k: MoraleFactor['key']) => m.factors.some((f) => f.key === k && f.value < 0)
  if (has('grief') || has('guilt')) out.push(t('Let them mourn at the Memorial; friends at the Tavern ease grief.'))
  if (has('withdrawn')) out.push(t('Talk to them — a word from the Master brings the withdrawn back.'))
  if (has('tired') || has('fatigue')) out.push(t('Rest them a day: bench them from the party.'))
  if (has('hungry')) out.push(t('A cook in the Kitchen keeps everyone fed.'))
  if (has('lonely') || has('bored')) out.push(t('Free time at the Tavern lifts the lonely and the bored.'))
  if (has('sanity')) out.push(t('The Infirmary and a banquet mend Sanity.'))
  if (has('jealous')) out.push(t('Spend a little time on them: a talk or a gift.'))
  if (has('job')) out.push(t('Find them a job they like.'))
  return out.slice(0, 3)
}

/** "62 · Steady" and the top reasons, for a tooltip. */
export function moraleTitle(state: GameState, m: Morale): string {
  const top = m.factors
    .slice(0, 4)
    .map((f) => `${f.value > 0 ? '+' : ''}${Math.round(f.value)} ${factorText(state, f)}`)
    .join(' · ')
  return `${t('Morale')} ${m.score} · ${bandName(m.band)} — ${bandEffect(m.band)}${top ? `\n${top}` : ''}`
}
