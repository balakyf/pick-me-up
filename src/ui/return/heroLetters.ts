/**
 * One hero letter per return (spec 2026-10-12 S26): a short note in a hero's own voice,
 * written from what the life simulation REALLY did while the Master was away — a memory
 * made during the absence (a friendship, a forged blade, a near miss on floor 12), what
 * their job produced (meals cooked, gold earned), and a warm sign-off ("I kept your
 * seat"). Never accusing, never "where were you?".
 *
 * Presentation only: reads two GameStates, returns English templates already passed
 * through `t()`. Deterministic: choices are seeded by `hashString`, never Math.random.
 */
import type { GameState, HeroId, JobId, LifeTally, Memory, OwnedHero } from '../../engine/types'
import { dayOfSlot, lifeOf, personalityOf, slotOf, type Personality, type Voice } from '../../engine/life'
import { hashString } from '../pixel/rand'
import { JOB_NAME } from '../life/speech'
import { TIER_NAMES } from '../../engine/life'
import { GIFTS } from '../../engine/favor'
import { t, fmt } from '../i18n/i18n'

type Vars = Record<string, string | number>

export interface HeroLetter {
  heroId: HeroId
  /** The letter's lines (already translated). */
  lines: string[]
  /** "— Kael" */
  signoff: string
}

/** Openers written from a memory, first person. Placeholders: {friend} {rival} {fallen}
 *  {floor} {item} {gift} {n} {tier} {job} {food}. */
const OPENER: Partial<Record<Memory['kind'], string[]>> = {
  befriended: [
    '{friend} and I talked until the candles burned down. I think we are friends now.',
    '{friend} saved me the last of the {food}. That is friendship, here.',
  ],
  rivalry: ['{rival} and I had words again. I may have started it. I may not have.'],
  argued: ['{rival} and I argued over the last of the {food}. We will make up by supper. Probably.'],
  floorCleared: ['I keep thinking about floor {floor}. We were good up there, were we not?'],
  nearDeath: ['Floor {floor} nearly had me. I am fine now. I sleep with the lamp on, that is all.'],
  floorLost: ['Floor {floor} sent us home. I have been practising the part where I dodge.'],
  retreated: ['We all walked out of floor {floor} together. I will take that over pride.'],
  friendDied: ['I sat with {fallen} at the Memorial and told them you would be back. I was right.'],
  comradeDied: ['I lit a candle for {fallen}. Someone should remember the quiet ones.'],
  mourned: ['I visited {fallen} and told them about the new floors. I think they would have liked them.'],
  gift: ['I still have the {gift} you gave me. It lives by my bed now.'],
  promoted: ['{n} stars! I do not feel like a different person. Just a slightly shinier one.'],
  forged: ['I finished a {item} at the Forge. Give it to someone who will use it well.'],
  jobTier: ['They are calling me a {tier} {job} now. Me!'],
  firstDay: ['I am still learning where everything is. The kitchen first, obviously.'],
  inherited: ['I carry a little of {fallen} with me now. I try to fight the way they did.'],
  avenged: ['We got the one who took {fallen}. I hope they saw it, wherever they are.'],
}

/** Memories that still read true long after they were made (a keepsake, a grave, an
 *  echo). Every other opener is news, so it is only written from a memory made during the
 *  absence. */
const TIMELESS: ReadonlySet<Memory['kind']> = new Set<Memory['kind']>(['gift', 'friendDied', 'comradeDied', 'mourned', 'inherited'])

/** What their job produced while the Master was away (only used when it really did). */
const JOB_LINE: Partial<Record<JobId, { tally: keyof LifeTally; line: string }>> = {
  cook: { tally: 'meals', line: 'I cooked {n} meals while you were gone. I only burned one. Fine — two.' },
  blacksmith: { tally: 'forged', line: 'The Forge never went cold: {n} pieces, and not one cracked.' },
  gardener: { tally: 'jobGold', line: 'The garden and the stalls paid {n} gold into the purse. I counted twice.' },
  merchant: { tally: 'jobGold', line: 'The garden and the stalls paid {n} gold into the purse. I counted twice.' },
  instructor: { tally: 'trainXp', line: 'The Yard was busy — {n} XP of drills. Everyone is a little sharper.' },
  scholar: { tally: 'research', line: 'I have been reading about the next floor. I think I know its trick.' },
  healer: { tally: 'healed', line: 'I mended {n} points of frayed nerves. Nobody cried. Much.' },
}

/** A little news from their own time (their hobby). */
const HOBBY_LINE: Record<Personality['hobby'], string> = {
  gardening: 'The seedlings came up. Something grows in this place after all.',
  reading: 'I finished a whole book. The hero lives, this time.',
  sparring: 'I sparred until my arms gave out. Then a little more.',
  music: 'I learned a fourth song. You will hear it whether you like it or not.',
  cards: 'I am up six dishes and a night watch at cards.',
  carving: 'I carved a little wooden bird. It is waiting on your chair.',
  stargazing: 'I named a star after you. The stubborn one that never sets.',
  cooking: 'I made {food}. Well — I attempted {food}.',
}

/** Warm closers, by voice. */
const CLOSER: Record<Voice, string[]> = {
  cheerful: ['Save me a spot on the next climb?', 'Come say hello! I will be the loud one.'],
  formal: ['I kept your seat by the hearth, Master.', 'The party awaits your word, whenever you are ready.'],
  rough: ['Tower is still there. So are we.', 'Kept your chair warm. Do not make it weird.'],
  quiet: ['No hurry. We will be here.', 'I saved you a cup of tea. It went cold. I will make another.'],
  grim: ['Still standing. Still yours.', 'The tower waits. So do I.'],
}

function first(name: string): string {
  return name.split(/\s+/)[0] ?? name
}

function nameOf(state: GameState, id: string | undefined): string {
  if (!id) return t('someone')
  const h = state.heroes[id as HeroId]
  if (h) return first(h.name)
  const rec = state.life.memorial.find((r) => r.heroId === id)
  return rec ? first(rec.name) : t('someone')
}

function pick<T>(arr: readonly T[], seed: string): T {
  return arr[hashString(seed) % arr.length]!
}

function memoryVars(state: GameState, hero: OwnedHero, m: Memory, p: Personality): Vars {
  const [job, tier] = (m.detail ?? 'cook:0').split(':')
  return {
    friend: nameOf(state, m.other),
    rival: nameOf(state, m.other),
    fallen: nameOf(state, m.other),
    floor: m.floor ?? state.tower.currentFloor,
    // A forged item's name, and a gift's catalogue name (the memory keeps its id).
    item: m.detail ? t(m.detail) : t('blade'),
    gift: t((m.detail && GIFTS[m.detail]?.name) || 'gift'),
    n: m.detail ?? hero.star,
    tier: t(TIER_NAMES[Number(tier)] ?? 'Novice'),
    job: m.kind === 'jobTier' ? t(JOB_NAME[job as JobId] ?? '') : '',
    food: t(p.food),
  }
}

/** Gains of the life tally over the absence. */
function gained(before: GameState, after: GameState, k: keyof LifeTally): number {
  return Math.max(0, Math.round(after.life.tally[k] - before.life.tally[k]))
}

/**
 * The hero letter for this return, or null when no hero is free to write (none living,
 * or all held captive). The writer is the hero with the strongest memory made while the
 * Master was away (ties: a seeded jitter); without fresh memories, the hero whose job did
 * the most. PURE.
 */
export function heroLetter(before: GameState, after: GameState): HeroLetter | null {
  const since = before.meta.lastSeenAtWorld
  const seed = `${after.accountId}|${after.seed}|${since}`
  const awayDay = dayOfSlot(slotOf(since))
  const writers = (Object.values(after.heroes) as OwnedHero[]).filter((h) => h.alive && !h.captiveOf)
  if (writers.length === 0) return null

  let best: { hero: OwnedHero; memory: Memory | null; score: number } | null = null
  for (const h of writers) {
    const life = lifeOf(h)
    for (const m of life.memories) {
      if (!OPENER[m.kind]) continue
      const fresh = m.day >= awayDay
      // An old memory written as news ("I think we are friends now", "I am still learning
      // where everything is") would be untrue: only the timeless ones may be revisited.
      if (!fresh && !TIMELESS.has(m.kind)) continue
      const score = m.weight + (fresh ? 40 : 0) + (hashString(`${seed}|${h.id}|${m.kind}|${m.day}`) % 15)
      if (!best || score > best.score) best = { hero: h, memory: m, score }
    }
    const job = life.job
    const jl = job ? JOB_LINE[job] : undefined
    if (jl && gained(before, after, jl.tally) > 0) {
      const score = 30 + (hashString(`${seed}|${h.id}|job`) % 15)
      if (!best || score > best.score) best = { hero: h, memory: null, score }
    }
  }
  if (!best) {
    const hero = pick([...writers].sort((a, b) => a.id.localeCompare(b.id)), `${seed}|anyone`)
    best = { hero, memory: null, score: 0 }
  }

  const hero = best.hero
  const p = personalityOf(hero)
  const life = lifeOf(hero)
  const lines: string[] = []
  if (best.memory) {
    lines.push(t(pick(OPENER[best.memory.kind]!, `${seed}|${hero.id}|open`), memoryVars(after, hero, best.memory, p)))
  }
  const jl = life.job ? JOB_LINE[life.job] : undefined
  const made = jl ? gained(before, after, jl.tally) : 0
  if (jl && made > 0) lines.push(t(jl.line, { n: fmt(made) }))
  else lines.push(t(HOBBY_LINE[p.hobby], { food: t(p.food) }))
  lines.push(t(pick(CLOSER[p.voice], `${seed}|${hero.id}|close`)))
  return { heroId: hero.id, lines, signoff: `— ${first(hero.name)}` }
}
