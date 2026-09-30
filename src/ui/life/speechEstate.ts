/**
 * More voices (spec 2026-09-30-estate-and-life §3): the dialogue topics the estate adds
 * to the generator in speech.ts — the weather and the season, statues, decorations,
 * bounties, duels, withdrawal, burnout, jealousy, bond groups and what a gift has come
 * to mean. Same rules as speech.ts: templates by voice, a salience weight per topic,
 * deterministic choice from a seed. Presentation only.
 */
import type { GameState, HeroId, LifePlace, OwnedHero } from '../../engine/types'
import { dayOfSlot, lifeOf, salientMemories, type Personality, type Voice } from '../../engine/life'
import {
  BOUNTIES,
  favouriteOf,
  giftMeanings,
  isBurntOut,
  onBounty,
  seasonOfDay,
  traumaOf,
  weatherAt,
  worldDay,
  type Season,
  type Weather,
} from '../../engine/estate'
import { hashString } from '../pixel/rand'
import { t } from '../i18n/i18n'

type Vars = Record<string, string | number>
type ByVoice = Partial<Record<Voice, string[]>> & { any?: string[] }

export interface EstateTopic {
  weight: number
  say: (seed: string) => string
}

function choose<T>(arr: readonly T[], seed: string): T {
  return arr[hashString(seed) % arr.length]!
}

function render(bank: ByVoice, voice: Voice, seed: string, vars: Vars): string {
  const pool = [...(bank[voice] ?? []), ...(bank.any ?? [])]
  return t(choose(pool, seed), vars)
}

// ─────────────────────────────────────────────────────────────────────────────
// Banks
// ─────────────────────────────────────────────────────────────────────────────

export const WEATHER_LINES: Record<Weather, ByVoice> = {
  clear: {
    any: ['Not a cloud over the campus. Almost feels like home.', 'Good light today. Even the tower looks less grim.'],
    cheerful: ['Sun! Everybody outside! That is an order — sorry, Master, your order.'],
    grim: ['Clear skies. The tower can see us just as well.'],
    quiet: ['…Warm stones. Nice.'],
    formal: ['A fine day, Master. One could almost forget where we are.'],
    rough: ['Good day for sparring. Too good to waste indoors.'],
  },
  cloudy: {
    any: ['Grey all morning. It cannot decide what it wants.', 'The clouds sit low over the tower today.'],
    grim: ['Grey sky, grey stone, grey mood.'],
    cheerful: ['Clouds are just the sky having a think.'],
  },
  rain: {
    any: ['Rain on the roofs. Everyone crowds indoors.', 'Listen to it drum on the tiles. I could sleep for a week.', 'The yard is mud. Training is cancelled, apparently.'],
    rough: ['Wet boots, wet cloak, wet everything. Great.'],
    cheerful: ['Puddles! Nobody tell the drill-master I jumped in one.'],
    quiet: ['…I like the sound of it.'],
    grim: ['Rain washes the stones. Not the names on them.'],
    formal: ['Best keep to the halls, Master. The paths are treacherous in this.'],
  },
  storm: {
    any: ['Did you see that flash? The whole tower lit up.', 'Thunder like that makes the old hands jumpy.', 'Nobody is going outside in this. Not even the guards.'],
    rough: ['Let it howl. The walls have held worse.'],
    cheerful: ['Count with me — one, two — BOOM! Two miles away!'],
    quiet: ['…Is it always this loud here?'],
    grim: ['Storms remind me of floor fights. Noise, then quiet, then counting heads.'],
  },
  fog: {
    any: ['I can barely see the fountain from here.', 'Fog this thick, you hear people before you see them.'],
    grim: ['In fog every shape looks like someone we lost.'],
    cheerful: ['Boo! — Sorry. The fog makes it too easy.'],
  },
  snow: {
    any: ['Snow on the roofs. Someone should build a snow-goblin.', 'My breath is steaming. The fires are lit early tonight.', 'Everything is quieter under snow.'],
    cheerful: ['First snow! I am claiming the courtyard for a snowball war!'],
    rough: ['Cold bites. Still better than floor thirty.'],
    quiet: ['…It is beautiful. Do not tell anyone I said that.'],
    formal: ['Winter has come to the estate, Master. The hearths will want wood.'],
    grim: ['Snow covers the graves. It does not make them any smaller.'],
  },
}

export const SEASON_LINES: Record<Season, string[]> = {
  spring: ['Blossom on the trees by the gate. Something grows, even here.', 'Spring. Back home we would be sowing now.'],
  summer: ['Long evenings. The fireflies come out by the garden.', 'Hot enough to fry an egg on the anvil. Do not ask how I know.'],
  autumn: ['Leaves everywhere. The gardeners are losing a war.', 'Autumn smells like woodsmoke and apples here.'],
  winter: ['Short days. The lamps are lit before supper.', 'Winter in a tower world. The cold feels older than it should.'],
}

export const WITHDRAWN: ByVoice = {
  any: ['…Not now.', 'I am fine. Leave it.', 'Mm.', 'I would rather be alone.', 'Go talk to someone else, Master.'],
  formal: ['Forgive me. I am not good company today.'],
  rough: ['Leave me be.'],
  cheerful: ['…Sorry. I can’t do the smiling today.'],
  quiet: ['…'],
  grim: ['Talking will not bring anyone back.'],
}

export const WITHDRAWN_LOSS: ByVoice = {
  any: ['{fallen} would know what to say. I don’t.', 'Everything here reminds me of {fallen}.', 'I keep walking past {fallen}’s bunk.'],
  grim: ['{fallen} is gone. That is all there is to say.'],
  quiet: ['…{fallen}.'],
}

export const COMFORTED: ByVoice = {
  any: ['Thank you for coming by every day, Master. It helped more than I said.', 'I think I am ready to sit with the others again.'],
  rough: ['Fine. You were right. Don’t make it a thing.'],
  cheerful: ['I’m back! Mostly! Thank you for not giving up on me.'],
  formal: ['I owe you a debt, Master. You did not let me disappear.'],
}

export const BURNOUT: ByVoice = {
  any: ['I can’t go up there again. Not yet.', 'My hands shake when I think of the stairs. Give me a day.', 'Floor after floor after floor… I need to stop, Master.'],
  rough: ['I am done for now. Send someone else.'],
  formal: ['I must ask to be excused from the next deployment, Master.'],
  grim: ['One more floor and I would have stopped caring whether I came back.'],
  cheerful: ['Even I need a nap sometimes. A long one.'],
}

export const VETERAN: string[] = [
  'I burnt out once. Now I teach the young ones when to stop.',
  'Burning out taught me more than any floor. I pass it on.',
]

export const JEALOUS: ByVoice = {
  any: ['{fav} again? Of course. Always {fav}.', 'Some of us are still here too, Master.', 'Must be nice to be {fav}.'],
  rough: ['Go on. {fav} is waiting for you.'],
  formal: ['I would welcome the chance to prove myself, Master. When {fav} can spare you.'],
  cheerful: ['Hi! Remember me? From the crystal? Ha… ha.'],
  quiet: ['…You never talk to me.'],
  grim: ['Favourites die first on the stairs. Just so you know.'],
}

export const FAVOURED: ByVoice = {
  any: ['You keep picking me, Master. The others notice.', 'I will not waste the trust. Promise.'],
  cheerful: ['Your favourite, reporting for duty!'],
  grim: ['Being chosen every time means being in front every time.'],
}

export const STATUE_OF: ByVoice = {
  any: ['The statue of {fallen} — they got the stubborn chin exactly right.', 'I sit by {fallen}’s statue in the evenings. It helps.', 'Thank you for the statue, Master. {fallen} would have pretended to hate it.'],
  rough: ['Good likeness. {fallen} was uglier, though.'],
  quiet: ['…I talk to the statue. Is that strange?'],
  grim: ['Stone lasts longer than we do. Good that someone remembers {fallen}.'],
}

export const STATUES_HERE: string[] = [
  'So many statues now. Every one of them was somebody’s friend.',
  'The statues watch the Memorial. It feels less empty.',
]

export const DECOR_LINES: Partial<Record<LifePlace, string[]>> = {
  dormitory: ['The new rugs. My feet had forgotten what warm felt like.', 'A lamp by my bunk. I can read before sleep now.'],
  tavern: ['The hearth makes this place. And the music. Mostly the hearth.', 'Somebody finally tuned the lute.'],
  garden: ['The flower beds are coming along. I planted the blue ones.', 'Sit on the bench a while, Master. The garden is quiet.'],
  hall: ['Those tapestries — is that us? On floor twenty?', 'The hall feels like ours now, with the tapestries up.'],
  courtyard: ['The fountain sings now. Listen.', 'The lanterns along the road make the nights less lonely.'],
  yard: ['Proper pennants in the yard! We look like a real company.', 'The scoreboard says I am third. Not for long.'],
}

export const BOUNTY_OUT: string[] = ['I am back from the bounty. My feet are not.', 'The bounty paid in blisters. And stones.']

export const BOUNTY_MEMORY: Record<string, string[]> = {
  forage: ['A whole day foraging by the rift. I smell like moss.', 'Found three stones and a mushroom that looked at me.'],
  patrol: ['We walked the outer ring. The tower hums at night, did you know?', 'Patrol was quiet. Quiet is good.'],
  salvage: ['We picked through the old floors. Found things nobody should have left.', 'Salvage work. Rusty blades and somebody’s diary.'],
  hunt: ['We tracked the beast for a day and a half. It was worth it.', 'The hunt… I will tell you about it when my hands stop shaking.'],
}

export const DUEL_LINES: Record<'won' | 'lost' | 'draw', Record<'respect' | 'bitter' | 'friendly', string[]>> = {
  won: {
    respect: ['I beat {other} in the yard. They fought well — better than I thought.', '{other} took the loss like a knight. I respect that.'],
    bitter: ['I beat {other}. They are still sulking.', 'Won the tryout against {other}. Now they won’t look at me.'],
    friendly: ['Took the tryout from {other}! They want a rematch.', 'Good bout with {other}. I won, but only just.'],
  },
  lost: {
    respect: ['{other} beat me fair. I will learn from it.', 'Lost to {other}. Next time. And I will thank them for the lesson.'],
    bitter: ['{other} got lucky. That is all.', 'I do not want to talk about the duel. Or about {other}.'],
    friendly: ['{other} knocked me flat! I laughed so hard it hurt more.', 'Lost to {other}. They owe me a drink for the bruise.'],
  },
  draw: {
    respect: ['{other} and I fought to a standstill. Neither of us will forget it.'],
    bitter: ['A draw with {other}. It settles nothing.'],
    friendly: ['{other} and I fought to a draw. Then we both fell over.'],
  },
}

export const BOND_LINES: ByVoice = {
  any: ['{group} — we came through the crystal together. We stay together.', 'Ask anyone in {group}: we look after our own.', 'I would not be here without {group}.'],
  cheerful: ['{group} forever! We should have a song. We should have a song!'],
  grim: ['{group} came in together. I would like us to go out together, too. Just not soon.'],
  formal: ['I am honoured to stand with {group}, Master.'],
}

export const MEANING_LINES: string[] = [
  '{fallen} loved {what}. I understand it now.',
  'I keep {what} by my bed. For {fallen}.',
]

const CATEGORY_NAME: Record<string, string> = {
  sweets: 'sweets',
  flowers: 'flowers',
  books: 'old books',
  wine: 'good wine',
  arms: 'fine steel',
  trinkets: 'little trinkets',
}

export const PAIR_WEATHER: Record<'wet' | 'snow' | 'fine', [string, string][]> = {
  wet: [
    ['Wet out there.', 'Wetter in here, if you ask the roof.'],
    ['Cards till it stops?', 'Cards till it stops.'],
    ['Did you hear that thunder?', 'I felt it in my teeth.'],
  ],
  snow: [
    ['Snowball fight after supper?', 'You are on. Loser does the dishes.'],
    ['My hands are ice.', 'Sit by the fire, then. Budge up.'],
  ],
  fine: [
    ['Lovely evening.', 'Don’t say that. The tower hears.'],
    ['Walk with me to the fountain?', 'Only if you stop humming.'],
  ],
}

export const PAIR_DUEL: Record<'respect' | 'bitter' | 'friendly', [string, string][]> = {
  respect: [
    ['That was a good bout.', 'You too. Your left side is open, by the way.'],
    ['Rematch next week?', 'I would like that.'],
  ],
  bitter: [
    ['Still sore?', 'Still smug?'],
    ['Enjoying your win?', 'Every minute.'],
  ],
  friendly: [
    ['Your footwork has improved.', 'I had a good teacher. Me.'],
    ['Ow. My ribs remember you.', 'They should. I was very memorable.'],
  ],
}

export const PAIR_JEALOUS: [string, string][] = [
  ['The Master asked for you again.', 'It is not a contest.'],
  ['Must be nice, being the favourite.', 'Must be nice, being bitter all day.'],
]

export const PAIR_BOND: [string, string][] = [
  ['Remember the day the crystal took us both?', 'I remember you screaming.'],
  ['Whatever happens up there—', '—we come back together. I know.'],
]

// ─────────────────────────────────────────────────────────────────────────────
// Topics
// ─────────────────────────────────────────────────────────────────────────────

/** A world-time for the current life slot (the dialogue stays stable within a slot). */
function nowOf(state: GameState): number {
  return state.life.slot * 30 * 60_000
}

/** The estate's topics for this hero right now. */
export function estateTopics(state: GameState, hero: OwnedHero, p: Personality, name: (id: string | undefined) => string, fallen: (id: string | undefined) => string): EstateTopic[] {
  const out: EstateTopic[] = []
  const v = p.voice
  const now = nowOf(state)
  const life = lifeOf(hero)
  const today = dayOfSlot(state.life.slot)
  const tr = traumaOf(state, hero.id)

  // Withdrawn: terse, and it drowns out nearly everything.
  if (tr.withdrawn) {
    const cause = tr.withdrawn.cause
    out.push({ weight: 95, say: (s) => (cause && hashString(s) % 2 ? render(WITHDRAWN_LOSS, v, s, { fallen: fallen(cause) }) : render(WITHDRAWN, v, s, {})) })
    return out
  }
  if (isBurntOut(state, hero.id, now)) out.push({ weight: 70, say: (s) => render(BURNOUT, v, s, {}) })
  else if (tr.veteran) out.push({ weight: 14, say: (s) => t(choose(VETERAN, s)) })

  // The sky.
  const w = weatherAt(state.seed, now)
  const wWeight = w === 'storm' ? 38 : w === 'rain' || w === 'snow' ? 30 : w === 'fog' ? 20 : 10
  out.push({ weight: wWeight, say: (s) => render(WEATHER_LINES[w], v, s, {}) })
  out.push({ weight: 9, say: (s) => t(choose(SEASON_LINES[seasonOfDay(worldDay(now))], s)) })

  // The Master's attention.
  const envy = state.estate?.jealous?.[hero.id]
  if (envy && state.heroes[envy]?.alive) out.push({ weight: 55, say: (s) => render(JEALOUS, v, s, { fav: name(envy) }) })
  else if (favouriteOf(state, worldDay(now)) === hero.id) out.push({ weight: 20, say: (s) => render(FAVOURED, v, s, {}) })

  // Statues and the Memorial.
  const statues = new Set(state.estate?.statues ?? [])
  const lostFriend = salientMemories(life, today).find((m) => (m.kind === 'friendDied' || m.kind === 'statue') && m.other && statues.has(m.other))
  if (lostFriend) out.push({ weight: 40, say: (s) => render(STATUE_OF, v, s, { fallen: fallen(lostFriend.other) }) })
  else if (life.doing.place === 'memorial' && statues.size > 1) out.push({ weight: 30, say: (s) => t(choose(STATUES_HERE, s)) })

  // Decorations where they are.
  const decorHere = DECOR_AT[life.doing.place]
  if (decorHere && decorHere.some((d) => (state.estate?.decor?.[d] ?? 0) > 0)) {
    const bank = DECOR_LINES[life.doing.place]
    if (bank) out.push({ weight: 18, say: (s) => t(choose(bank, s)) })
  }

  // Memories the estate made: bounties, duels, comfort.
  for (const m of salientMemories(life, today).slice(0, 4)) {
    const age = today - m.day
    const weight = Math.max(5, m.weight - age * 2)
    if (m.kind === 'bounty') {
      const bank = BOUNTY_MEMORY[m.detail ?? ''] ?? BOUNTY_OUT
      out.push({ weight, say: (s) => t(choose(bank, s)) })
    } else if (m.kind === 'duel' && m.other) {
      const [res, mood] = (m.detail ?? 'draw:friendly').split(':') as ['won' | 'lost' | 'draw', 'respect' | 'bitter' | 'friendly']
      const bank = DUEL_LINES[res]?.[mood] ?? DUEL_LINES.draw.friendly
      out.push({ weight, say: (s) => t(choose(bank, s), { other: name(m.other) }) })
    } else if (m.kind === 'comforted') {
      out.push({ weight, say: (s) => render(COMFORTED, v, s, {}) })
    } else if (m.kind === 'burnout' && !isBurntOut(state, hero.id, now)) {
      out.push({ weight: Math.min(weight, 20), say: (s) => t(choose(VETERAN, s)) })
    }
  }

  // Bond group.
  const group = hero.bondGroup ? state.challenge?.bondGroups?.[hero.bondGroup] : undefined
  if (group) out.push({ weight: 20, say: (s) => render(BOND_LINES, v, s, { group: group.name }) })

  // What a gift has come to mean.
  const meaning = giftMeanings(state, hero.id).find((x) => x.weight === 2)
  if (meaning) out.push({ weight: 15, say: (s) => t(choose(MEANING_LINES, s), { fallen: fallen(meaning.because), what: t(CATEGORY_NAME[meaning.category] ?? meaning.category) }) })
  return out
}

/** Decorations that stand in each place (for the "new rugs" kind of remark). */
const DECOR_AT: Partial<Record<LifePlace, string[]>> = {
  dormitory: ['rugs'],
  tavern: ['hearth'],
  garden: ['flowerbeds'],
  hall: ['tapestries'],
  courtyard: ['fountain', 'lanterns'],
  yard: ['banners'],
}

/** An estate-flavoured exchange between two heroes, or null when nothing applies. */
export function estatePair(state: GameState, a: OwnedHero, b: OwnedHero, seed: string): [string, string] | null {
  const today = dayOfSlot(state.life.slot)
  const la = lifeOf(a)
  const h = hashString(seed)
  const duel = la.memories.find((m) => m.kind === 'duel' && m.other === b.id && today - m.day <= 3)
  if (duel) {
    const mood = (duel.detail ?? 'draw:friendly').split(':')[1] as 'respect' | 'bitter' | 'friendly'
    const [x, y] = choose(PAIR_DUEL[mood] ?? PAIR_DUEL.friendly, seed)
    return [t(x), t(y)]
  }
  const j = state.estate?.jealous ?? {}
  if (j[a.id] === b.id || j[b.id] === a.id) {
    const [x, y] = choose(PAIR_JEALOUS, seed)
    return [t(x), t(y)]
  }
  if (a.bondGroup && a.bondGroup === b.bondGroup && h % 2 === 0) {
    const [x, y] = choose(PAIR_BOND, seed)
    return [t(x), t(y)]
  }
  if (h % 3 === 0) {
    const w = weatherAt(state.seed, nowOf(state))
    const kind = w === 'rain' || w === 'storm' ? 'wet' : w === 'snow' ? 'snow' : w === 'clear' ? 'fine' : null
    if (kind) {
      const [x, y] = choose(PAIR_WEATHER[kind], seed)
      return [t(x), t(y)]
    }
  }
  return null
}

/** "Out on a bounty: Patrol the outer ring", or null. */
export function bountyStatus(state: GameState, heroId: HeroId): string | null {
  const b = onBounty(state, heroId)
  if (!b) return null
  return t('Out on a bounty: {name}', { name: t(BOUNTIES[b.kind]?.name ?? b.kind) })
}

