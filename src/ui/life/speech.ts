/**
 * The dialogue generator — "almost an agent" (Living Lobby spec §4).
 *
 * No language model: a hero's words are assembled from templates, chosen by what is
 * most on their mind right now. `speak()` gathers candidate topics from the life engine
 * (what they are doing, their most pressing need, their strongest recent memory, their
 * best friend or worst rival, their job, their grief, the tower, their home) with a
 * salience score, picks one with a seeded jitter (the same moment reads the same; the
 * next hour reads differently), and renders it in the hero's voice.
 *
 * Presentation only: it reads GameState and never changes it.
 */
import { SKILLS } from '../../engine/content'
import type { GameState, HeroId, Memory, OwnedHero, JobId, ActivityKind, LifePlace, FallenRecord, ChronicleEntry } from '../../engine/types'
import {
  bondOf,
  dayOfSlot,
  jobFeeling,
  jobTier,
  lifeOf,
  personalityOf,
  relationsOf,
  salientMemories,
  TIER_NAMES,
  type Personality,
  type Voice,
} from '../../engine/life'
import { hashString } from '../pixel/rand'
import { TUNING } from '../../engine/tuning'
import { toWorldTime } from '../../engine/time'
import { slotOf } from '../../engine/life'
import { t } from '../i18n/i18n'
import { ta } from '../text'
import { bountyStatus, estatePair, estateTopics } from './speechEstate'
import { BOUNTIES, traumaOf } from '../../engine/estate'
import { TRAITS, traitOf, type TraitFamily, type TraitId } from '../../engine/content/traits'
import { hourOfSlot, isSleepHour, moraleOf } from '../../engine/life'

type Vars = Record<string, string | number>
type ByVoice = Partial<Record<Voice, string[]>> & { any?: string[] }

function first(name: string): string {
  return name.split(/\s+/)[0] ?? name
}

/** A hero's first name — or their full name when another living hero shares it. */
export function shortName(state: GameState, id: string): string {
  const h = state.heroes[id as HeroId]
  if (!h) return fallenName(state, id)
  const f = first(h.name)
  const clash = Object.values(state.heroes).some((o) => o.alive && o.id !== h.id && first(o.name) === f)
  return clash ? h.name : f
}

function nameOf(state: GameState, id: string | undefined): string {
  if (!id) return t('someone')
  return state.heroes[id as HeroId] ? shortName(state, id) : t('someone')
}

/** The account's own day count (day 1 = the day the Master arrived). */
export function accountDay(state: GameState, absoluteDay: number): number {
  return absoluteDay - dayOfSlot(slotOf(toWorldTime(state.createdAt))) + 1
}

/** Pick deterministically from a list (seeded by the hero and the moment). */
function choose<T>(arr: readonly T[], seed: string): T {
  return arr[hashString(seed) % arr.length]!
}

function render(bank: ByVoice, voice: Voice, seed: string, vars: Vars): string {
  const pool = [...(bank[voice] ?? []), ...(bank.any ?? [])]
  // Lines put trades and titles after "a" ("I was a {trade}"): fix the article in English.
  return ta(choose(pool, seed), vars)
}

// ─────────────────────────────────────────────────────────────────────────────
// Template banks
// ─────────────────────────────────────────────────────────────────────────────

const ACTIVITY: Partial<Record<ActivityKind, ByVoice>> = {
  eat: {
    any: ['This {food} is the best thing that has happened to me all week.', 'Sit, Master. There is enough for two.', 'Food tastes different when you know tomorrow is a floor.'],
    rough: ['Mmf. Busy. Eating.', 'Whoever cooked this — I owe them.'],
    formal: ['Forgive me, Master — I was just finishing my meal.'],
    cheerful: ['Try the {food}! No? More for me!', 'Seconds! Thirds! Who is counting?'],
    grim: ['Eat while you can. That is the whole philosophy.'],
    quiet: ['…Good bread.'],
  },
  work: {
    any: ['Busy, Master. The work does not do itself.', 'If you need me, I am here until the bell.'],
    rough: ['Less talk, more work.'],
    formal: ['Duty first, Master. Always.'],
    cheerful: ['Work is just play with a schedule!'],
    quiet: ['…Almost done.'],
    grim: ['Work keeps the mind off the stairs.'],
  },
  train: {
    any: ['One more set. Then another.', 'The dummy never hits back. That is the problem.', 'I felt slow on the last floor. Never again.', 'Again. Slower. Then faster.'],
    rough: ['Out of the way unless you want a bruise.', 'Sweat now or bleed later.'],
    formal: ['Discipline is a kind of armour, Master.'],
    cheerful: ['Watch this — no, wait, watch THIS!'],
    quiet: ['…Again.'],
    grim: ['The tower will not go easy on me. Neither will I.'],
  },
  socialize: {
    any: ['Pull up a chair, Master. {friend} is telling the story about the goblin again.', 'Nobody talks about the tower in here. House rule.'],
    rough: ['Drink or go, Master. Those are the options.'],
    cheerful: ['Master! You came! Somebody get the Master a mug!'],
    quiet: ['I like the noise. It means we are still here.'],
    formal: ['A little company keeps the mind steady, I find.'],
    grim: ['Drink with the living while you can.'],
  },
  read: {
    any: ['There is a book in here about floor {floor}. Someone climbed it before us.', 'Words are quieter than people. I needed quiet.'],
    formal: ['Knowledge is the one thing the tower cannot take from us.'],
    grim: ['I read about worlds that ended. It helps, strangely.'],
    quiet: ['…Page two hundred.'],
    cheerful: ['This book has pictures!'],
    rough: ['Reading. Don’t tell anyone.'],
  },
  pray: {
    any: ['I do not know who I am praying to. It helps anyway.', 'Just a moment more, Master.'],
    grim: ['If anyone is listening, they are taking their time.'],
    formal: ['Grant us one more floor. Just one more.'],
  },
  mourn: {
    any: ['I come here to tell {fallen} how we are doing.', 'Sit with me a while. You do not have to say anything.', 'I still set a place for {fallen} sometimes.'],
    rough: ['Leave it, Master. I will be fine. Just… not today.'],
    quiet: ['…'],
  },
  heal: {
    any: ['The healers say I need rest. I keep seeing the stairs.', 'It is quiet here. I am trying to remember how to sleep.'],
    grim: ['They patch the body. The rest takes longer.'],
    cheerful: ['The healer says I am a terrible patient. I say I am a delightful one.'],
  },
  wander: {
    any: ['Just stretching my legs. This place is bigger than it looks.', 'Have you seen the sky over the courtyard? It is not a real sky, is it.'],
    cheerful: ['I found a new shortcut behind the kitchen!'],
    grim: ['Walking. Counting the doors. Old habit.'],
    quiet: ['…Just walking.'],
    formal: ['A constitutional, Master. Good for the nerves.'],
    rough: ['Stretching my legs before they rust.'],
  },
  drilling: {
    any: ['The drill-master says three more days. My arms say otherwise.', 'I am almost there. The technique is almost mine.'],
  },
  promoting: {
    any: ['They sealed me in the chamber for a while. I feel… different.'],
  },
}

const HOBBY: Record<Personality['hobby'], string[]> = {
  gardening: ['Look — the seedlings came up. Something grows in this place after all.', 'Dirt under the nails. I missed that.'],
  reading: ['Chapter nine. The hero dies. I skipped ahead, forgive me.', 'Do you have any books from your world, Master?'],
  sparring: ['Care for a round, Master? No? Coward. Respectfully.', 'I learn more from one real bout than from a week of drills.'],
  music: ['I only know three songs. I play them very well.', 'Hum along, Master. Everyone does eventually.'],
  cards: ['Deal you in? We play for chores, not gold.', 'I am up six dishes and a night watch.'],
  carving: ['A little wooden bird. For whoever needs one.', 'My hands need something to do that is not a sword.'],
  stargazing: ['None of these stars are mine. I am learning their names anyway.', 'You can see the tower’s tip from here at night. It glows.'],
  cooking: ['I made {food}. Well — I attempted {food}.', 'Cooking is just alchemy you can eat.'],
}

const JOB_WORK: Record<JobId, string[]> = {
  blacksmith: ['The steel is singing today. Listen.', 'Mind the sparks, Master.', 'Another {item} on the rack soon.'],
  cook: ['Stew for everyone tonight. Nobody climbs hungry on my watch.', 'Taste. Too much salt? Be honest.'],
  instructor: ['Feet! Watch your feet! — Sorry, Master, not you.', 'They are getting better. Slowly. Painfully.'],
  scholar: ['Floor {floor} has a pattern. I almost have it.', 'Every enemy leaves notes, if you know how to read them.'],
  healer: ['Hold still — this will sting.', 'Most wounds here are not on the skin.'],
  gardener: ['The soil here is strange, but it wants to grow.', 'Fresh greens for the kitchen by evening.'],
  merchant: ['Buy low, sell to the guild. Simple.', 'I got a fine price for the old scrap today.'],
  guard: ['All quiet on the wall, Master.', 'Nobody comes through the crack without me seeing them.'],
}

const JOB_FEEL = {
  likes: ['This is what I was good at, back home. It feels like me again.', 'Thank you for the {job} post, Master. I mean it.'],
  dislikes: ['With respect, Master — I was not made for {job} work.', 'Another day at the {place}. Wonderful.', 'I will do it. I will not pretend to like it.'],
}

const NEED: Record<'hunger' | 'energy' | 'social' | 'fun', ByVoice> = {
  hunger: {
    any: ['I could eat a whole goblin. Cooked, preferably.', 'When is supper? Asking for my stomach.'],
    rough: ['Food. Now.'],
    cheerful: ['Is it supper yet? Is it supper now?'],
    grim: ['Hunger is a quiet enemy.'],
  },
  energy: {
    any: ['I can barely keep my eyes open.', 'Is it night yet? It feels like night.'],
    grim: ['Tired in the bones, Master.'],
    rough: ['Need sleep. Now.'],
    cheerful: ['I am… not… tired…'],
  },
  social: { any: ['It has been a while since anyone talked to me. Thank you for stopping.', 'Do you have a moment? Just… a moment.'], quiet: ['…Stay a moment?'] },
  fun: {
    any: ['Same walls, same stairs, same everything.', 'I need something that is not the tower. Anything.'],
    rough: ['Bored enough to spar with the dummy. Again.'],
    cheerful: ['I would give anything for a game of cards.'],
  },
}

const MEMORY: Partial<Record<Memory['kind'], ByVoice>> = {
  firstDay: {
    any: ['I was a {trade} before the crystal called me. Now I am… this.', 'The first thing I saw here was that circle, glowing. I thought I had died.'],
    cheerful: ['New place, new me! Mostly new me.'],
    grim: ['Summoned. Like a tool from a shed.'],
  },
  floorCleared: {
    any: ['Floor {floor}. We did it, Master. We actually did it.', 'I keep thinking about floor {floor}. We were good up there.'],
    rough: ['Floor {floor} bled for it. Not us. Good.'],
    formal: ['Floor {floor} was well fought. The party deserves the credit.'],
  },
  floorLost: {
    any: ['Floor {floor} beat us. Next time it will not.', 'I replay floor {floor} every night. Where I stood. What I missed.'],
    grim: ['Floor {floor}. We walked out. Not everyone would have.'],
  },
  nearDeath: {
    any: ['On floor {floor} I saw the ceiling from the floor. I do not want to see it again.', 'I almost did not come back from {floor}. Did you know that?'],
    rough: ['Almost bought it on {floor}. Almost.'],
    quiet: ['Floor {floor}… I still hear it.'],
  },
  friendDied: {
    any: ['{fallen} should be here. {fallen} should be sitting right there.', 'I keep turning to tell {fallen} something.', 'Do you remember {fallen}, Master? Someone has to.'],
    rough: ['Don’t. Don’t say {fallen}’s name like that.'],
    grim: ['{fallen} is gone and the tower is still standing. That is the whole joke.'],
  },
  comradeDied: {
    any: ['I did not know {fallen} well. I should have. We fought side by side.', 'Floor {floor} took {fallen}. It could have been any of us.'],
  },
  befriended: {
    any: ['{friend} and I — we look out for each other now.', 'Have you met {friend}? Of course you have. Good person.'],
    cheerful: ['{friend} is my favourite. Don’t tell the others.'],
    formal: ['{friend} has earned my trust. That is not a small thing.'],
  },
  rivalry: {
    any: ['{rival} thinks they are better with a blade. We will see.', 'Keep {rival} away from me and we will all be happier.'],
    rough: ['{rival}. Tch.'],
    formal: ['I have… professional disagreements with {rival}.'],
  },
  argued: {
    any: ['{rival} and I had words. It is fine. It is mostly fine.', 'Did {rival} say something about me? Of course they did.'],
  },
  gift: {
    any: ['I still have the {gift}, Master. I keep it by my bed.', 'Nobody ever gave me anything, before. Thank you for the {gift}.'],
  },
  promoted: {
    any: ['{n} stars. I do not feel like a different person. I feel stronger, though.', 'Something changed in the chamber. I can feel the next level waiting.'],
  },
  forged: {
    any: ['Did you see the {item}? I made that. Me.', 'The {item} came out well. Give it to someone who will use it.'],
  },
  jobTier: {
    any: ['They are calling me a {tier} {job} now. Imagine that.', 'I am getting good at this. {tier}, apparently.'],
  },
  mourned: {
    any: ['I visited {fallen} yesterday. Told them about the new floors.'],
  },
  selfTaught: {
    any: ['Nobody taught me {skill}. I just kept at it in the yard until it worked.', 'I picked up {skill} on my own. Want to see?'],
  },
}

const FRIEND_LINE: ByVoice = {
  any: ['If you are looking for {friend}, try the {place}.', '{friend} saved my skin more than once. I will return the favour.'],
  cheerful: ['{friend} and I are going to the tavern later — come!'],
  grim: ['If I fall, look after {friend}. Promise me.'],
  rough: ['{friend} is all right. Don’t tell them I said so.'],
  quiet: ['…{friend} is kind to me.'],
  formal: ['{friend} and I have an understanding.'],
}

const HOME: Record<string, string[]> = {
  farmer: ['This time of year I would be bringing in the harvest.', 'I can tell rain is coming. Even here.'],
  carpenter: ['Whoever built these doors cut corners. I can fix that.', 'I had a workshop. Sawdust everywhere. My wife hated it.'],
  baker: ['I used to be up before dawn for the bread. Some habits stay.', 'The oven here is… adequate.'],
  smith: ['My father’s forge was smaller. Hotter, though.', 'I can tell good steel by the sound.'],
  fisher: ['I miss the sea. The tower has no tides.', 'Salt, wind, a net. That was my life.'],
  weaver: ['I used to make cloth. Now I make excuses to the healers.', 'Look at this hem. Whoever stitched our banners should be ashamed.'],
  shepherd: ['Sheep are easier than goblins. Smarter, too.', 'I count heads every morning. Old habit. Some mornings the count is short.'],
  miller: ['Grind, sift, sell. It was an honest living.', 'I miss the sound of the wheel. Here it is only boots on stairs.'],
  herbalist: ['There is feverfew growing by the well. Nobody noticed but me.'],
  shopkeeper: ['I sold pots. Good pots. Nobody here needs pots.'],
  scribe: ['I copied other people’s stories. Now I am in one.'],
  housekeeper: ['I kept a whole manor clean. This lobby is nothing.'],
  innkeeper: ['Every tavern needs someone behind the bar. Just saying.'],
  mercenary: ['Coin is coin. Though I would not mind a thank-you now and then.', 'I fought for worse employers than you, Master.'],
  hunter: ['I tracked wolves for a living. The tower’s wolves are not so different.'],
  soldier: ['Orders I understand. It is the waiting I hate.', 'A barracks is a barracks, in any world. This one has better food.'],
  informant: ['I hear everything in this lobby. Everything.'],
  sailor: ['Rope, sail, storm. I miss all of it.'],
  fieldMedic: ['I stitched men up on battlefields. The tower is a battlefield that never ends.'],
  knight: ['I swore an oath in another world. I have not decided if it still binds me.', 'A knight without a lord is just a man in heavy clothes.'],
  courtMage: ['The mana here is wrong. Artificial. Someone made this place.'],
  priest: ['My god does not reach this far. I pray anyway.'],
  swordMaster: ['Forty years of the blade, and the tower still teaches me.'],
  armorer: ['Your gear is decent, Master. Decent is not good.'],
  captain: ['I commanded a company once. Now I command a bunk.'],
  sage: ['Every world has a tower, in its stories. I wonder why.'],
}

const TOWER: ByVoice = {
  any: [
    'Floor {floor} next. I heard it is worse than the last.',
    'How high do you think we will get, Master?',
    'They say the air gets thinner up there. Or maybe that is fear.',
    'I dreamt of floor {floor} last night. We won.',
  ],
  grim: ['Every floor is someone’s last. I would rather it not be mine.'],
  cheerful: ['Floor {floor}! I have a good feeling about this one.'],
  rough: ['Point me at floor {floor}. I will do the rest.'],
  quiet: ['Floor {floor}… I will be ready.'],
  formal: ['Floor {floor} awaits your orders, Master.'],
}

/** Traits speak (lane J's seam, lane L): what a born trait sounds like — before a floor
 *  (in the party), awake at night, or any time. */
const TRAIT_TALK: Record<TraitFamily, { floor?: string[]; night?: string[]; any: string[] }> = {
  courage: {
    floor: ['Floor {floor}? Good. I was getting restless.', 'Put me at the front on {floor}. Someone has to go first.'],
    any: ['Scared? Always. It has never stopped me yet.'],
  },
  temper: { floor: ['Floor {floor} had better hit back. I am in a mood.'], any: ['Do not look at me like that. I am calm. This is calm.'] },
  steadfast: { floor: ['Floor {floor}. I will still be standing at the end of it.'], any: ['Storms pass. I stay.'] },
  study: { any: ['I picked up a new stance yesterday. Watch.', 'Show me once. That is usually enough.'] },
  luck: { any: ['Found a coin in my boot again. Third this week.', 'Things just go my way. Do not ask me why.'] },
  healer: { any: ['Let me see that cut. No, really — let me see it.', 'Everyone here is hurt somewhere. I can at least mend the part you can see.'] },
  leader: { floor: ['I have a plan for floor {floor}, Master. The others will follow it.'], any: ['Someone has to keep this lot together. Might as well be me.'] },
  loner: { any: ['I fight better with nobody to watch out for.', 'Crowds. Ugh.'] },
  night: {
    night: ['The night is when I come alive, Master. Go to sleep — I have the watch.', 'Everyone sleeps. I do not mind. The dark is honest.'],
    any: ['Daylight is too loud.'],
  },
  stomach: { any: ['Is that the supper bell? That is the supper bell.', 'I could eat a horse. I have, once.'] },
}

/** Morale at the ends speaks for itself (lane L). */
const MORALE_TALK = {
  inspired: ['Give me the next floor, Master. Today I could climb the whole tower.', 'I feel good. Really good. Let us not waste it.'],
  shaken: ['I keep seeing the last floor when I close my eyes.', 'I am not sure I can go up there again, Master.', 'Give me a little time. Just a little.'],
  broken: ['I cannot. Not today. Please do not ask me.', 'Send someone else. I have nothing left.'],
}

const GRIEF_HEAVY = ['I do not want to talk. Please.', 'Not today, Master.', 'Everyone keeps saying it gets easier.', 'I keep counting the empty bunks.', 'Give me a little time.']

// ─────────────────────────────────────────────────────────────────────────────
// Topics
// ─────────────────────────────────────────────────────────────────────────────

interface Topic {
  weight: number
  say: (seed: string) => string
}

const PLACE_NAME: Record<LifePlace, string> = {
  dormitory: 'Dormitory',
  hall: 'Great Hall',
  kitchen: 'Kitchen',
  forge: 'Forge',
  yard: 'Training Yard',
  tavern: 'Tavern',
  library: 'Library',
  promotion: 'Promotion Chamber',
  memorial: 'Memorial',
  infirmary: 'Infirmary',
  garden: 'Garden',
  market: 'Market',
  watchtower: 'Watchtower',
  courtyard: 'Courtyard',
  rift: 'Crack of Time',
  offsite: 'the Ruins',
}

export function placeName(p: LifePlace): string {
  return t(PLACE_NAME[p])
}

export const JOB_NAME: Record<JobId, string> = {
  blacksmith: 'Blacksmith',
  cook: 'Cook',
  instructor: 'Instructor',
  scholar: 'Scholar',
  healer: 'Healer',
  gardener: 'Gardener',
  merchant: 'Merchant',
  guard: 'Guard',
}

const TRADE: Record<string, string> = {
  farmer: 'farmer',
  carpenter: 'carpenter',
  baker: 'baker',
  smith: 'smith',
  fisher: 'fisher',
  weaver: 'weaver',
  shepherd: 'shepherd',
  miller: 'miller',
  herbalist: 'herbalist',
  shopkeeper: 'shopkeeper',
  scribe: 'scribe',
  housekeeper: 'housekeeper',
  innkeeper: 'innkeeper',
  mercenary: 'mercenary',
  hunter: 'hunter',
  soldier: 'soldier',
  informant: 'informant',
  sailor: 'sailor',
  fieldMedic: 'field medic',
  knight: 'knight',
  courtMage: 'court mage',
  priest: 'priest',
  swordMaster: 'sword master',
  armorer: 'armorer',
  captain: 'captain',
  sage: 'sage',
}

export function tradeName(bg: string): string {
  return t(TRADE[bg] ?? bg)
}

function giftName(id: string | undefined): string {
  if (!id) return t('gift')
  return t(id.replace(/_/g, ' '))
}

/** Best friend and worst rival among the living. */
export function bondsOf(state: GameState, heroId: string): { friend: HeroId | null; rival: HeroId | null } {
  let friend: HeroId | null = null
  let rival: HeroId | null = null
  let fa = 0
  let ra = 0
  for (const [o, r] of relationsOf(state, heroId)) {
    if (!state.heroes[o]?.alive) continue
    if (r.affinity > fa && bondOf(r.affinity)) {
      fa = r.affinity
      friend = o
    }
    if (r.affinity < ra && bondOf(r.affinity)) {
      ra = r.affinity
      rival = o
    }
  }
  return { friend, rival }
}

function fallenName(state: GameState, id: string | undefined): string {
  if (!id) return t('them')
  const rec = state.life.memorial.find((r) => r.heroId === id)
  return first(rec?.name ?? state.heroes[id as HeroId]?.name ?? t('them'))
}

function memoryVars(state: GameState, hero: OwnedHero, m: Memory, p: Personality): Vars {
  const job = m.kind === 'jobTier' && m.detail ? (m.detail.split(':')[0] as JobId) : null
  const tier = m.kind === 'jobTier' && m.detail ? Number(m.detail.split(':')[1]) : 0
  return {
    floor: m.floor ?? state.tower.currentFloor,
    fallen: fallenName(state, m.other),
    friend: nameOf(state, m.other),
    rival: nameOf(state, m.other),
    gift: giftName(m.detail),
    item: m.detail ?? t('blade'),
    n: m.detail ?? hero.star,
    trade: tradeName(p.background),
    job: job ? t(JOB_NAME[job]) : '',
    tier: t(TIER_NAMES[tier] ?? 'Novice'),
    food: t(p.food),
    skill: m.kind === 'selfTaught' ? t(SKILLS[m.detail ?? '']?.name ?? m.detail ?? '') : '',
  }
}

function topicsFor(state: GameState, hero: OwnedHero, inParty: boolean): Topic[] {
  const p = personalityOf(hero)
  const life = lifeOf(hero)
  const v = p.voice
  const today = dayOfSlot(state.life.slot)
  const out: Topic[] = []
  const baseVars: Vars = { food: t(p.food), floor: state.tower.currentFloor, trade: tradeName(p.background) }
  const { friend, rival } = bondsOf(state, hero.id)
  // The estate: weather, statues, duels, jealousy… A withdrawn hero says only terse things.
  const estate = estateTopics(state, hero, p, (id) => nameOf(state, id), (id) => fallenName(state, id))
  if (traumaOf(state, hero.id).withdrawn) return estate

  // Heavy grief drowns out everything else.
  if (life.grief > 70) {
    const lost = salientMemories(life, today).find((m) => m.kind === 'friendDied')
    out.push({ weight: 90, say: (s) => (lost ? render(MEMORY.friendDied!, v, s, memoryVars(state, hero, lost, p)) : t(choose(GRIEF_HEAVY, s))) })
  }

  // What they are doing right now.
  const act = life.doing
  if (act.kind === 'work' && life.job) {
    out.push({ weight: 45, say: (s) => t(choose(JOB_WORK[life.job!], s), { ...baseVars, item: t('blade') }) })
    const feel = jobFeeling(hero, life.job)
    if (feel !== 'neutral') out.push({ weight: feel === 'dislikes' ? 50 : 30, say: (s) => t(choose(JOB_FEEL[feel], s), { job: t(JOB_NAME[life.job!]).toLowerCase(), place: placeName(act.place) }) })
  } else if (act.kind === 'hobby') {
    out.push({ weight: 40, say: (s) => t(choose(HOBBY[p.hobby], s), baseVars) })
  } else if (act.kind === 'mourn') {
    const lost = salientMemories(life, today).find((m) => m.kind === 'friendDied' || m.kind === 'comradeDied')
    out.push({ weight: 70, say: (s) => render(ACTIVITY.mourn!, v, s, { fallen: fallenName(state, lost?.other) }) })
  } else if (ACTIVITY[act.kind]) {
    out.push({ weight: 35, say: (s) => render(ACTIVITY[act.kind]!, v, s, { ...baseVars, friend: friend ? nameOf(state, friend) : t('someone') }) })
  }

  // The most pressing need.
  const needs = life.needs
  const worst = (['hunger', 'energy', 'social', 'fun'] as const).reduce((a, b) => (needs[a] <= needs[b] ? a : b))
  if (needs[worst] < 30) out.push({ weight: 60 - needs[worst], say: (s) => render(NEED[worst], v, s, baseVars) })

  // Memories, strongest first.
  for (const m of salientMemories(life, today).slice(0, 3)) {
    const bank = MEMORY[m.kind]
    if (!bank) continue
    const age = today - m.day
    out.push({ weight: Math.max(5, m.weight - age * 2), say: (s) => render(bank, v, s, memoryVars(state, hero, m, p)) })
  }

  // People.
  if (friend) {
    const fh = state.heroes[friend]!
    out.push({ weight: 25, say: (s) => render(FRIEND_LINE, v, s, { friend: first(fh.name), place: placeName(lifeOf(fh).doing.place) }) })
  }
  if (rival) out.push({ weight: 22, say: (s) => render(MEMORY.rivalry!, v, s, { rival: nameOf(state, rival) }) })

  // Home, the tower, the job title.
  const home = HOME[p.background]
  if (home) out.push({ weight: 18, say: (s) => t(choose(home, s)) })
  out.push({ weight: inParty ? 30 : 12, say: (s) => render(TOWER, v, s, baseVars) })
  if (life.job) {
    const tier = jobTier(life.jobXp[life.job] ?? 0)
    if (tier >= 2) out.push({ weight: 15, say: () => t('{tier} {job}, at your service.', { tier: t(TIER_NAMES[tier]!), job: t(JOB_NAME[life.job!]) }) })
  }
  // Traits speak (lane J's seam): a Brave hero before a floor, a Night-Fighter awake at night.
  const fam = traitOf(hero).family
  const talk = TRAIT_TALK[fam]
  const night = isSleepHour(hourOfSlot(state.life.slot), p) && act.kind !== 'sleep'
  if (inParty && talk.floor) out.push({ weight: 36, say: (s) => t(choose(talk.floor!, s), baseVars) })
  if (night && talk.night) out.push({ weight: 48, say: (s) => t(choose(talk.night!, s), baseVars) })
  out.push({ weight: 16, say: (s) => t(choose(talk.any, s), baseVars) })
  // Morale at the ends (lane L).
  const band = moraleOf(state, hero.id).band
  if (band === 'inspired' || band === 'shaken' || band === 'broken') out.push({ weight: band === 'inspired' ? 30 : 55, say: (s) => t(choose(MORALE_TALK[band], s)) })
  out.push(...estate)
  return out
}

/** What a hero says when the Master talks to them. Stable within a life slot. */
export function speak(state: GameState, hero: OwnedHero, inParty: boolean, salt = ''): string {
  const topics = topicsFor(state, hero, inParty)
  const seed = `${hero.id}|${state.life.slot}|${salt}`
  let best = topics[0]!
  let bestScore = -Infinity
  topics.forEach((tp, i) => {
    const score = tp.weight + (hashString(`${seed}|${i}`) % 30)
    if (score > bestScore) {
      bestScore = score
      best = tp
    }
  })
  return best.say(seed)
}

/** Two or three lines in a row — a little conversation with the Master. */
export function conversation(state: GameState, hero: OwnedHero, inParty: boolean): string[] {
  const a = speak(state, hero, inParty, 'a')
  const b = speak(state, hero, inParty, 'b')
  return a === b ? [a] : [a, b]
}

// ─────────────────────────────────────────────────────────────────────────────
// Two heroes talking to each other
// ─────────────────────────────────────────────────────────────────────────────

const PAIR_FRIEND: [string, string][] = [
  ['Save me a seat at supper?', 'Always.'],
  ['You were good out there on {floor}.', 'Only because you had my back.'],
  ['If I fall, you take my boots.', 'You are not falling. I am not taking your boots.'],
  ['Remember when we first met?', 'You tripped over the summoning circle.'],
  ['Watch my back up there?', 'Always have.'],
  ['You look tired.', 'You look worse. Sit.'],
]
const PAIR_RIVAL: [string, string][] = [
  ['Still holding your sword like a broom?', 'Still talking instead of fighting?'],
  ['The Master will pick me for the next floor.', 'Keep dreaming.'],
  ['Stay out of my way on {floor}.', 'Then keep up.'],
  ['Nice swing. For a farmer.', 'Nice mouth. For someone who hides at the back.'],
  ['Out of my chair.', 'It has my name on it now.'],
]
const PAIR_GRIEF: [string, string][] = [
  ['I miss {fallen}.', 'Me too. Every day.'],
  ['{fallen} would have laughed at this.', 'Loudest laugh in the lobby.'],
]
const PAIR_WORK: [string, string][] = [
  ['Pass me the tongs.', 'Which ones? — these ones. Right.'],
  ['Long shift.', 'They are all long shifts.'],
  ['Did the Master say anything about the order?', 'Only that it is urgent. It is always urgent.'],
]
const PAIR_TAVERN: [string, string][] = [
  ['Another round?', 'You are buying.'],
  ['To floor {floor}!', 'To coming back from it!'],
  ['Deal me in.', 'You still owe me two dishes.'],
  ['One more song!', 'That was the last one three songs ago.'],
  ['Who spilled the ale?', 'The floor did. It moved.'],
]
const PAIR_ANY: [string, string][] = [
  ['Heard the tower goes all the way to a hundred.', 'Then we climb a hundred.'],
  ['Do you ever dream about home?', 'Every night. Then I wake up here.'],
  ['The Master looked tired today.', 'Aren’t we all.'],
  ['Who cooks tonight?', 'Not you. Never again.'],
  ['Isel smiles too much.', 'Fairies always do. Keep your purse close.'],
  ['Did you see the new one from the crystal?', 'Another stranger with a sad story.'],
  ['What do you miss most?', 'Bread I did not have to fight for.'],
  ['The new ones look nervous.', 'We all did, once.'],
  ['Heard the Master talking to the crystal again.', 'Everyone talks to the crystal. It never answers.'],
]

/** A two-line exchange between two heroes, chosen from what they share. */
export function pairLines(state: GameState, a: OwnedHero, b: OwnedHero, bucket: number): [string, string] {
  const seed = `${a.id}|${b.id}|${bucket}`
  const rel = relationsOf(state, a.id).find(([o]) => o === b.id)?.[1]
  const bond = rel ? bondOf(rel.affinity) : null
  const la = lifeOf(a)
  const lb = lifeOf(b)
  const today = dayOfSlot(state.life.slot)
  const aLost = salientMemories(la, today).find((m) => m.kind === 'friendDied')
  const shared = aLost && lb.memories.some((m) => m.kind === 'friendDied' && m.other === aLost.other)
  let pool = PAIR_ANY
  let vars: Vars = { floor: state.tower.currentFloor }
  const est = shared ? null : estatePair(state, a, b, seed)
  if (est) return est
  if (shared) {
    pool = PAIR_GRIEF
    vars = { fallen: fallenName(state, aLost!.other) }
  } else if (bond === 'rival' || bond === 'grudge') pool = PAIR_RIVAL
  else if (bond === 'friend' || bond === 'closeFriend') pool = hashString(seed) % 2 ? PAIR_FRIEND : la.doing.place === 'tavern' ? PAIR_TAVERN : PAIR_FRIEND
  else if (la.doing.kind === 'work' && lb.doing.kind === 'work') pool = PAIR_WORK
  else if (la.doing.place === 'tavern') pool = PAIR_TAVERN
  const [x, y] = choose(pool, seed)
  return [t(x, vars), t(y, vars)]
}

// ─────────────────────────────────────────────────────────────────────────────
// Status, last words, the letter
// ─────────────────────────────────────────────────────────────────────────────

const DOING: Record<ActivityKind, string> = {
  sleep: 'Sleeping',
  eat: 'Eating',
  work: 'Working',
  train: 'Training',
  socialize: 'Socializing',
  hobby: 'Relaxing',
  read: 'Reading',
  pray: 'Praying',
  mourn: 'Mourning',
  heal: 'Recovering',
  wander: 'Strolling',
  promoting: 'Being promoted',
  drilling: 'Drilling a skill',
  away: 'Away on an expedition',
  captive: 'Held captive',
}

const HOBBY_DOING: Record<Personality['hobby'], string> = {
  gardening: 'Gardening',
  reading: 'Reading',
  sparring: 'Sparring',
  music: 'Playing music',
  cards: 'Playing cards',
  carving: 'Whittling',
  stargazing: 'Stargazing',
  cooking: 'Cooking for fun',
}

const JOB_DOING: Record<JobId, string> = {
  blacksmith: 'Forging',
  cook: 'Cooking',
  instructor: 'Teaching drills',
  scholar: 'Studying the floors',
  healer: 'Tending the sick',
  gardener: 'Tending the garden',
  merchant: 'Trading',
  guard: 'On watch',
}

/** "Forging at the Forge", "Playing cards at the Tavern with Mira". */
export function statusLine(state: GameState, hero: OwnedHero): string {
  const life = lifeOf(hero)
  const d = life.doing
  let verb = t(DOING[d.kind])
  if (d.kind === 'work' && life.job) verb = t(d.stalled ? 'Waiting for materials' : JOB_DOING[life.job])
  if (d.kind === 'hobby') verb = t(HOBBY_DOING[personalityOf(hero).hobby])
  const bounty = bountyStatus(state, hero.id)
  if (bounty) return bounty
  if (hero.captiveOf || hero.expedition) return verb
  const where = t('at the {place}', { place: placeName(d.place) })
  return d.with && state.heroes[d.with] ? t('{verb} {where} with {name}', { verb, where, name: nameOf(state, d.with) }) : `${verb} ${where}`
}

const LAST_WORDS: ByVoice = {
  any: ['Tell {friend}… I kept my promise.', 'Master… keep climbing.', 'I can see home from here.', 'It is all right. It is all right.', 'Keep… the fire lit.'],
  rough: ['Heh. Worth it.', 'Don’t you dare cry over me, {friend}.'],
  formal: ['It has been an honour, Master.', 'See the others home. That is my last request.'],
  cheerful: ['Save me a seat at supper, {friend}…', 'Hey… we did good, right?'],
  quiet: ['…Thank you.', '{friend}…'],
  grim: ['So this is the floor. Figures.', 'Do not waste this, Master.'],
}

/** The first thing a hero says to the Master, out of the crystal (the summon reveal, lane J). */
const GREETING: ByVoice = {
  any: ['Pick me up, and I will not let you down.', 'Where am I? …Oh. The tower.', 'You called? I came.'],
  cheerful: ['Pick me up! …You already did? Ha!', 'Hello, Master! I promise I am worth it!', 'Pick me up! I knew you would!'],
  formal: ['At your service, Master. I will not disappoint.', 'Summoned and sworn. Command me.', 'An honour, Master. Where do we begin?'],
  rough: ['Right. Who do I hit?', 'You picked me. Hope you know what you are doing.', 'Bit bright in here. Where is the fight?'],
  quiet: ['…Hello. I am here.', '…You chose me? Thank you.', '…I will do my best.'],
  grim: ['Another tower. Another master. Let us see how long this one lasts.', 'I will climb. I make no promises past that.', 'So it begins again.'],
}

/** Canon cameos greet the Master in their own words. */
const CAMEO_GREETING: Record<string, string> = {
  'Islat Han': 'Not the first floor. Not this time. I am ready, Master.',
  'Jenna Cirai': 'Field medic, reporting! Who needs patching up?',
  'Aaron Delcut': 'Aaron Delcut. I will hold the line, whatever it costs.',
  Dika: '…Fascinating. A summoning circle this size? Show me everything.',
  Ridigeon: 'Ha! Finally, someone with taste. Point me at something big.',
  'Muden Nighdelk': 'The stars said you would call. They are rarely wrong.',
  'Nihaku Gastfeel': 'Nihaku Gastfeel. My spear is yours, Master.',
  Anasis: 'Hello, hello! Is this the tower? It is so tall!',
  Kishasha: '…Do not stand so close. I bite.',
}

/** What a hero says as they step out of the crystal: in their voice, the same every time. */
export function greeting(hero: Pick<OwnedHero, 'id' | 'name' | 'star' | 'heroClass' | 'portraitToken'>): string {
  const authored = CAMEO_GREETING[hero.name]
  if (authored) return t(authored)
  const p = personalityOf(hero)
  return render(GREETING, p.voice, `greet|${hero.id}`, {})
}

/**
 * A fallen hero's last words — the same every time they are remembered. With `taken`
 * (the words already spoken by others who fell beside them), the pick moves on through
 * the hero's own lines, deterministically, so two heroes never share their last words.
 * Without it, a hero whose grave stands in a row (same floor, day and cause) gets the
 * words the row assigns them, so the Memorial never repeats a line within a row and
 * agrees with the battle they fell in.
 */
export function lastWords(state: GameState, rec: Pick<FallenRecord, 'heroId' | 'name'>, taken?: Set<string>): string {
  const hero = state.heroes[rec.heroId]
  if (!hero) return t('…')
  if (!taken) {
    const row = graveRow(state, rec.heroId)
    if (row.length > 1) return lastWordsTogether(state, row).get(rec.heroId) ?? t('…')
  }
  const p = personalityOf(hero)
  const { friend } = bondsOf(state, rec.heroId)
  const pool = [...(LAST_WORDS[p.voice] ?? []), ...(LAST_WORDS.any ?? [])].filter((s) => friend || !s.includes('{friend}'))
  const vars = { friend: friend ? nameOf(state, friend) : '' }
  const start = hashString(`last|${rec.heroId}`) % pool.length
  for (let k = 0; k < pool.length; k++) {
    const line = t(pool[(start + k) % pool.length]!, vars)
    if (!taken || !taken.has(line)) {
      taken?.add(line)
      return line
    }
  }
  return t(pool[start]!, vars)
}

/** The graves that fell with this hero (same floor, world-day and cause), theirs included. */
function graveRow(state: GameState, heroId: HeroId): FallenRecord[] {
  const grave = state.life.memorial.find((g) => g.heroId === heroId)
  if (!grave) return []
  return state.life.memorial.filter((g) => g.floor === grave.floor && g.day === grave.day && g.cause === grave.cause)
}

/**
 * Last words for heroes who fell together (one battle, one grave row): never the same
 * line twice. Assigned in hero-id order, so the battle and the Memorial agree.
 */
export function lastWordsTogether(state: GameState, recs: readonly Pick<FallenRecord, 'heroId' | 'name'>[]): Map<string, string> {
  const taken = new Set<string>()
  const out = new Map<string, string>()
  for (const r of [...recs].sort((a, b) => (a.heroId < b.heroId ? -1 : a.heroId > b.heroId ? 1 : 0))) out.set(r.heroId, lastWords(state, r, taken))
  return out
}

/** One line of Isel's letter for a chronicle entry. */
export function chronicleLine(state: GameState, e: ChronicleEntry): string {
  const [a, b] = e.heroIds
  const A = a ? shortName(state, a) : ''
  const B = b ? shortName(state, b) : ''
  switch (e.kind) {
    case 'friends':
      return t('{a} and {b} have become friends.', { a: A, b: B })
    case 'closeFriends':
      return t('{a} and {b} are inseparable now.', { a: A, b: B })
    case 'rivals':
      return t('{a} and {b} are not getting along.', { a: A, b: B })
    case 'grudge':
      return t('{a} and {b} can no longer stand to share a room.', { a: A, b: B })
    case 'argument':
      return t('{a} and {b} had a shouting match in the {place}.', { a: A, b: B, place: t('Great Hall') })
    case 'forged':
      return ta('{a} finished a {item} at the Forge.', { a: A, item: e.detail ?? t('blade') })
    case 'masterwork':
      return t('{a} forged a masterwork: {item}!', { a: A, item: e.detail ?? t('blade') })
    case 'jobTier': {
      const [job, tier] = (e.detail ?? 'cook:1').split(':')
      // A job tier-up teaches the Master too (lane B's seam): the chronicle says so.
      return `${ta('{a} is now a {tier} {job}.', { a: A, tier: t(TIER_NAMES[Number(tier)] ?? 'Novice'), job: t(JOB_NAME[job as JobId] ?? job ?? '') })} ${t('The Master learned from it (+{xp} XP).', { xp: TUNING.lobby.master.xpPerJobTier })}`
    }
    case 'death':
      return e.detail === 'synthesis'
        ? t('{a} was lost to the Synthesis Chamber.', { a: A })
        : e.detail === 'captor'
          ? t('{a} was never ransomed.', { a: A })
          : t('{a} fell on floor {floor}.', { a: A, floor: e.floor ?? '?' })
    case 'mourning':
      return t('{a} visited {b}’s grave.', { a: A, b: B })
    case 'research':
      return t('{a} worked out the weakness of floor {floor}.', { a: A, floor: e.floor ?? '?' })
    case 'stalled':
      return t('The Forge went cold — {a} ran out of gold or stones.', { a: A })
    case 'arrival':
      return b ? t('{a} arrived through the crystal; {b} showed them around.', { a: A, b: B }) : t('{a} arrived through the crystal.', { a: A })
    case 'statue':
      return t('A statue of {a} now stands in the Memorial.', { a: A })
    case 'withdrawn':
      return b ? t('{a} has withdrawn from the others since losing {b}.', { a: A, b: B }) : t('{a} has withdrawn into themselves.', { a: A })
    case 'recovered':
      return t('{a} is back among the others.', { a: A })
    case 'burnout':
      return t('{a} burnt out after too many floors and refuses the tower for now.', { a: A })
    case 'duel': {
      const [res, mood] = (e.detail ?? 'draw:friendly').split(':')
      if (res === 'draw') return t('{a} and {b} fought a tryout duel to a draw.', { a: A, b: B })
      if (mood === 'respect') return t('{a} beat {b} in a tryout duel — and they shook hands after.', { a: A, b: B })
      if (mood === 'bitter') return t('{a} beat {b} in a tryout duel; {b} has not forgiven it.', { a: A, b: B })
      return t('{a} beat {b} in a friendly tryout.', { a: A, b: B })
    }
    case 'bounty':
      return t('{list} came back from a bounty: {name}.', {
        list: e.heroIds.map((id) => shortName(state, id)).join(', '),
        name: t(BOUNTIES[e.detail ?? '']?.name ?? e.detail ?? ''),
      })
    case 'selfTaught':
      return t('{a} taught themselves {skill} in the yard.', { a: A, skill: t(SKILLS[e.detail ?? '']?.name ?? e.detail ?? '') })
    case 'jealous':
      return t('{a} feels overlooked — the Master only has eyes for {b}.', { a: A, b: B })
    case 'guilt':
      return t('{a} can’t stop thinking about the last words with {b}. They were not kind ones.', { a: A, b: B })
    case 'consoled':
      return t('{b} sat with {a} through the worst of it.', { a: A, b: B })
    case 'anniversary': {
      const weeks = Number(e.detail ?? '1')
      const list = e.heroIds.slice(1).map((id) => shortName(state, id)).join(', ')
      return weeks === 1
        ? t('A week since {a} fell. {list} went back to the grave.', { a: A, list })
        : t('{n} weeks since {a} fell. {list} went back to the grave.', { n: weeks, a: A, list })
    }
    case 'incident':
      return incidentLine(state, e)
  }
}

/** A camp incident, as the chronicle tells it (lane L). */
export function incidentLine(state: GameState, e: ChronicleEntry): string {
  const [a, b] = e.heroIds
  const A = a ? shortName(state, a) : ''
  const B = b ? shortName(state, b) : ''
  const [kind, how, where] = (e.detail ?? '').split(':')
  const place = where ? placeName(where as LifePlace) : t('Great Hall')
  switch (kind) {
    case 'brawl':
      return how === 'separated'
        ? t('{a} and {b} came to blows at the {place}. You stepped in and made them talk.', { a: A, b: B, place })
        : how === 'cleared'
          ? t('{a} and {b} fought it out at the {place} — and shook hands after. It cleared the air.', { a: A, b: B, place })
          : t('{b} and {a} fought at the {place}; {a} came off worse, and it settled nothing.', { a: A, b: B, place })
    case 'sworn':
      return t('{a} and {b} swore to watch each other’s backs on every floor.', { a: A, b: B })
    case 'night':
      return how === 'bed' ? t('{a} snuck out to train at night; you sent them to bed.', { a: A }) : t('{a} trained alone in the yard by moonlight.', { a: A })
    case 'fire':
      return t('A pot left on in the kitchen: {a} watched half the pantry burn.', { a: A })
    case 'homesick':
      return how === 'comforted' ? t('{a} was homesick. You sat with them a while.', { a: A }) : t('{a} was homesick, and spent the evening alone.', { a: A })
    case 'trait':
      return traitMomentLine(state, e, A, B, how ?? '')
    default:
      return t('Something happened in the camp.')
  }
}

function traitMomentLine(state: GameState, e: ChronicleEntry, A: string, B: string, traitId: string): string {
  const fam = TRAITS[traitId as TraitId]?.family
  switch (fam) {
    case 'courage':
      return t('{a} gave the party a rousing word before the next floor.', { a: A })
    case 'leader':
      return e.heroIds.length > 1 ? t('{a} drilled everyone in the yard until they dropped.', { a: A }) : t('{a} ran a drill in the yard.', { a: A })
    case 'luck':
      return t('{a} found a forgotten purse behind the stables. Lucky, as ever.', { a: A })
    case 'healer':
      return B ? t('{a} sat up with {b} and tended to them.', { a: A, b: B }) : t('{a} tended to the sick.', { a: A })
    case 'stomach':
      return t('{a} raided the pantry. Nobody is surprised.', { a: A })
    case 'night':
      return B ? t('{a} kept the night watch with {b}.', { a: A, b: B }) : t('{a} kept the night watch alone.', { a: A })
    default:
      return t('{a} was very much themselves today.', { a: A })
  }
}

/** A diary line in a hero's own voice (the letter's "from the heroes" section). Lines
 *  already used by other diarists are avoided. */
export function diaryLine(state: GameState, hero: OwnedHero, taken: Set<string> = new Set()): string {
  const inParty = state.party.slots.includes(hero.id)
  for (let k = 0; k < 12; k++) {
    const line = speak(state, hero, inParty, `diary${k}`)
    if (!taken.has(line)) {
      taken.add(line)
      return line
    }
  }
  return speak(state, hero, inParty, 'diary')
}

/** Group a letter's chronicle entries: friendships and arrivals read as one line each. */
export function groupedChronicle(state: GameState, entries: ChronicleEntry[]): string[] {
  const out: string[] = []
  const pairs = (kind: ChronicleEntry['kind']) =>
    entries.filter((e) => e.kind === kind).map((e) => `${shortName(state, e.heroIds[0]!)} & ${shortName(state, e.heroIds[1]!)}`)
  const friends = pairs('friends')
  const close = pairs('closeFriends')
  const rivals = [...pairs('rivals'), ...pairs('grudge')]
  const arrivals = entries.filter((e) => e.kind === 'arrival').map((e) => shortName(state, e.heroIds[0]!))
  if (friends.length) out.push(friends.length === 1 ? chronicleLine(state, entries.find((e) => e.kind === 'friends')!) : t('New friendships: {list}.', { list: friends.join(', ') }))
  if (close.length) out.push(t('Now inseparable: {list}.', { list: close.join(', ') }))
  if (rivals.length) out.push(t('Bad blood between {list}.', { list: rivals.join(', ') }))
  if (arrivals.length > 1) out.push(t('{n} newcomers came through the crystal: {list}.', { n: arrivals.length, list: arrivals.join(', ') }))
  const grouped = new Set(['friends', 'closeFriends', 'rivals', 'grudge', 'death', 'stalled', ...(arrivals.length > 1 ? ['arrival'] : [])])
  // The same news twice (three shouting matches between the same pair) reads once, counted.
  const lines: string[] = []
  const count = new Map<string, number>()
  for (const e of entries) {
    if (grouped.has(e.kind)) continue
    const line = chronicleLine(state, e)
    if (!count.has(line)) lines.push(line)
    count.set(line, (count.get(line) ?? 0) + 1)
  }
  for (const line of lines) out.push(count.get(line)! > 1 ? t('{line} (×{n})', { line, n: count.get(line)! }) : line)
  return out
}
