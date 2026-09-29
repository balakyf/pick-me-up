/**
 * What heroes and the fairy Isel say when the Master talks to them. Pure:
 * lines are chosen from the hero's current state (Quanton AI flavour — the
 * heroes are people, and they sound like it).
 */
import type { GameState, OwnedHero } from '../../engine/types'
import { hashString } from '../pixel/rand'
import { t } from '../i18n/i18n'

const COMMONER_JOBS = ['farmer', 'carpenter', 'baker', 'fisher', 'weaver', 'shepherd', 'miller', 'tanner']

const CLASS_LINES: Record<string, string[]> = {
  warrior: ['My blade is yours, Master. Point me at the next floor.', 'A shield wall of one is still a wall.'],
  spearman: ['Keep them at a spear’s length and nobody I guard will fall.', 'Formation first. Glory later.'],
  thief: ['Locks, pockets, weak points — all the same to me.', 'You didn’t see me come in. Good.'],
  archer: ['Give me a clear line and a quiet breath.', 'I counted the windows on the way in. Habit.'],
  mage: ['The mana here tastes… wrong. Artificial.', 'Every spell costs something. Remember that.'],
}

function pick<T>(arr: T[], seed: string): T {
  return arr[hashString(seed) % arr.length]!
}

export function heroLines(hero: OwnedHero, inParty: boolean): string[] {
  const first = hero.name.split(/\s+/)[0]
  let mood: string
  if (hero.training)
    mood = hero.training.mode === 'learn' ? t('Again. And again. This new form is almost mine.') : t('Again. And again. This technique is almost mine.')
  else if (hero.sanity < 30) mood = t('I… I can’t stop shaking. The tower— please. Just a little rest.')
  else if (hero.sanity < 60) mood = t('I’m fine. Really. I just need a moment by the fire.')
  else if (hero.promotion) mood = t('They sealed me in the chamber for a while. I feel… different.')
  else if (hero.xp.atCap) mood = t('I’ve hit a wall, Master. Something in the Promotion Chamber could break it.')
  else if (inParty) mood = t('Party’s ready. Say the word and we climb.')
  else if (hero.heroClass === null && hero.star <= 1)
    mood = t('I was a {job} back home. Why was I the one summoned?', { job: t(pick(COMMONER_JOBS, hero.id)) })
  else if (hero.heroClass === null) mood = t('Coin is coin. Point me at something and I’ll hit it.')
  else mood = t(pick(CLASS_LINES[hero.heroClass]!, hero.id))

  const cls = t(hero.heroClass ? hero.heroClass[0]!.toUpperCase() + hero.heroClass.slice(1) : 'Classless')
  const status = `${first} · ${hero.star}★ ${cls} · Lv ${hero.xp.level} · ${t('Sanity')} ${hero.sanity}/100`
  return [mood, status]
}

/** Isel, the lobby's fairy administrator: a greeting plus one contextual tip. */
export function iselLines(state: GameState): string[] {
  const living = Object.values(state.heroes).filter((h) => h.alive)
  const deployed = state.party.slots.some((id) => id && state.heroes[id]?.alive)
  let tip: string
  if (living.length === 0) tip = 'You have no heroes left… The Mobius crystal in the hall can call new ones.'
  else if (!deployed) tip = 'No one climbs without orders. The party board hangs in the Tactical Center.'
  else if (living.some((h) => h.sanity < 60)) tip = 'Some of your heroes look pale. A banquet in the Kitchen would do them good.'
  else if (state.tower.highestCleared === 0) tip = 'The Tower Gate is at the east end of the hall. Floor 1 is waiting.'
  else if (living.some((h) => h.xp.atCap)) tip = 'A hero has reached their star cap. The Promotion Chamber is north-east.'
  else if (state.gold >= 3000) tip = 'The Mobius crystal hums. You could afford another summon.'
  else tip = t('Floor {n} is next. Every hero who falls there is gone for good — remember that.', { n: state.tower.currentFloor })
  return [t('Welcome back, Master. I am Isel — I keep this waiting room in order.'), t(tip)]
}

const BANTER: string[][] = [
  ['Heard the tower goes all the way to a hundred.', 'Then we climb a hundred.'],
  ['Do you ever dream about home?', 'Every night. Then I wake up here.'],
  ['The Master looked tired today.', 'Aren’t we all.'],
  ['That goblin on floor three nearly had me.', 'Nearly is a good word.'],
  ['Who cooks tonight?', 'Not you. Never again.'],
  ['Isel smiles too much.', 'Fairies always do. Keep your purse close.'],
  ['Did you see the new one from the crystal?', 'Another stranger with a sad story.'],
  ['My sword arm aches.', 'Then use the other one.'],
]

/** A two-line exchange for two idle heroes chatting (stable for a while, then rotates). */
export function banterLines(aId: string, bId: string, bucket: number): [string, string] {
  const pair = BANTER[hashString(`${aId}|${bId}|${bucket}`) % BANTER.length]!
  return [t(pair[0]!), t(pair[1]!)]
}
