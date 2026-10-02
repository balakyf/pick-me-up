/**
 * How a hero is named in pickers and lists: never just a first name when two living
 * heroes share it (speech.ts shortName), and always with their star and level so the
 * Master can tell two Marens apart before sacrificing one in Synthesis.
 */
import type { GameState, OwnedHero } from '../../engine/types'
import { personalityOf } from '../../engine/life'
import { shortName, tradeName } from '../life/speech'
import { t } from '../i18n/i18n'
import './hero.css'

/** The disambiguated name (first name, or the full name when another living hero shares it). */
export function pickerName(state: GameState, hero: Pick<OwnedHero, 'id'>): string {
  return shortName(state, hero.id)
}

/** "3★ Lv12" — what tells two heroes with one name apart. */
export function starLevel(hero: Pick<OwnedHero, 'star' | 'xp'>): string {
  return t('{star}★ Lv{level}', { star: hero.star, level: hero.xp.level })
}

/** The small muted star/level tag after a name in a picker. */
export function HeroTag({ hero }: { hero: Pick<OwnedHero, 'star' | 'xp'> }) {
  return <span className="hero-tag">{starLevel(hero)}</span>
}

/** A hero's name as pickers show it: disambiguated, with the star/level tag. */
export function PickerName({ state, hero }: { state: GameState; hero: OwnedHero }) {
  return (
    <>
      {pickerName(state, hero)} <HeroTag hero={hero} />
    </>
  )
}

/** The trade a hero was born to ("baker"), from their past life before the summon. */
export function bornTrade(hero: Pick<OwnedHero, 'id' | 'name' | 'star' | 'heroClass' | 'portraitToken'>): string {
  return tradeName(personalityOf(hero).background)
}
