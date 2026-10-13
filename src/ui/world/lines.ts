/**
 * What heroes and the fairy Isel say when the Master talks to them. Pure:
 * lines are chosen from the hero's current state (Quanton AI flavour — the
 * heroes are people, and they sound like it).
 */
import type { GameState, OwnedHero } from '../../engine/types'
import { hashString } from '../pixel/rand'
import { t } from '../i18n/i18n'
import { nextUnlock } from '../shell/unlocks'
import { PLACE_LABEL } from './lobbyMap'

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
  else if (!deployed) tip = 'No one climbs without orders. The party board hangs in the Tactical Center, on the north road.'
  else if (living.some((h) => h.sanity < 60)) tip = 'Some of your heroes look pale. A banquet in the Kitchen would do them good.'
  else if (state.tower.highestCleared === 0) tip = 'The Tower Gate stands in the north wall, up the avenue from the hall. Floor 1 is waiting.'
  else if (living.some((h) => h.xp.atCap)) tip = 'A hero has reached their star cap. The Promotion Chamber is on the north road.'
  else if (!living.some((h) => h.life?.job)) tip = 'Idle hands, Master. Give someone a job — a cook in the Kitchen, a smith at the Forge. Open their Profile.'
  else if (state.life.memorial.length > 0 && living.some((h) => (h.life?.grief ?? 0) > 50))
    tip = 'Some of them still visit the Memorial every day. Grief passes faster with a healer in the Infirmary.'
  else if (unlockNextFloor(state)) tip = unlockNextFloor(state)!
  else if (state.gold >= 3000) tip = 'The Mobius crystal hums. You could afford another summon.'
  else tip = t('Floor {n} is next. Every hero who falls there is gone for good — remember that.', { n: state.tower.currentFloor })
  return [t('Welcome back, Master. I am Isel — I keep this waiting room in order.'), t(tip)]
}

/** Isel's promise when a place opens with the very next clear (null otherwise). */
function unlockNextFloor(state: GameState): string | null {
  const nu = nextUnlock(state)
  if (!nu || nu.unlockAt === null || nu.unlockAt - state.tower.highestCleared !== 1) return null
  return t('Clear Floor {n} and I will open the {place} for you.', { n: nu.unlockAt, place: t(PLACE_LABEL[nu.place]) })
}

/**
 * Isel's coaching lines for the first decisions (spec 2026-10-12 S5). WP7 owns the copy;
 * the screens that stage the moment (the Decisive Moment in battle, the first pair of
 * Doors) show it through `iselCoach()` so the words and their French live in one place.
 */
export const ISEL_COACH = {
  /** The first Decisive Moment: a hero is about to fall. */
  decisive: 'Your orders change fate. Try Protect.',
  /** The first time two Doors are offered. */
  doors: 'Two doors, Master. The plain one is the steady road. The skull door hides an elite: a harder fight, but double gold, stones and a boon.',
} as const

export type CoachMoment = keyof typeof ISEL_COACH

/** Isel's coaching line for a first-time moment, translated. */
export function iselCoach(moment: CoachMoment): string {
  return t(ISEL_COACH[moment])
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
