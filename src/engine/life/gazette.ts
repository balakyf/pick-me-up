/**
 * The Camp Gazette (lane L): the waiting room's own newspaper — "while you were away",
 * gathered into one read. It sits beside Isel's letter (the letter is her voice and the
 * diaries; the Gazette is the camp's record): the fallen, grief and how it is easing,
 * camp incidents and the ones still waiting on the Master, friendships and feuds, the
 * work done (a job tier-up teaches the Master — lane B's seam), and the morale outlook.
 *
 * PURE assembly from the chronicle, the pending incidents and morale; nothing is stored.
 */
import { TUNING } from '../tuning'
import type { CampIncident, ChronicleEntry, ChronicleKind, GameState } from '../types'
import { campOutlook, type CampOutlook } from './morale'
import { incidentsOf } from './incidents'

const DAY_MS = TUNING.life.slotMs * TUNING.life.slotsPerDay

export type GazetteSection = 'fallen' | 'grief' | 'incidents' | 'hearts' | 'feuds' | 'work'

export const GAZETTE_SECTIONS: readonly GazetteSection[] = ['fallen', 'grief', 'incidents', 'hearts', 'feuds', 'work']

/** At most this many items per section (the latest). */
export const GAZETTE_PER_SECTION = 12
/** The Gazette always covers at least this many world-days. */
export const GAZETTE_MIN_DAYS = 3

export interface Gazette {
  since: number
  until: number
  /** World-days covered (at least one). */
  days: number
  /** The front page: the biggest news. */
  headline: ChronicleEntry | null
  /** Non-empty sections, in GAZETTE_SECTIONS order, each oldest → newest. */
  sections: { key: GazetteSection; entries: ChronicleEntry[] }[]
  /** Incidents still waiting on the Master. */
  pending: CampIncident[]
  outlook: CampOutlook
  /** Master XP the heroes' job tier-ups taught in this span. */
  masterXp: number
  /** Everything it covers (for counting). */
  total: number
}

/** Which page an item belongs on. */
export function sectionOf(e: ChronicleEntry): GazetteSection {
  switch (e.kind) {
    case 'death':
      return 'fallen'
    case 'mourning':
    case 'guilt':
    case 'consoled':
    case 'anniversary':
    case 'withdrawn':
    case 'recovered':
    case 'burnout':
      return 'grief'
    case 'friends':
    case 'closeFriends':
    case 'arrival':
      return 'hearts'
    case 'rivals':
    case 'grudge':
    case 'jealous':
      return 'feuds'
    case 'incident':
      return e.detail?.startsWith('sworn') ? 'hearts' : 'incidents'
    case 'argument':
    case 'duel':
      return 'incidents'
    default:
      return 'work'
  }
}

const HEADLINE: Partial<Record<ChronicleKind, number>> = {
  death: 100,
  masterwork: 60,
  guilt: 55,
  anniversary: 50,
  closeFriends: 45,
  withdrawn: 44,
  incident: 40,
  jobTier: 35,
  recovered: 34,
  burnout: 33,
  grudge: 30,
  research: 25,
  friends: 20,
  forged: 10,
}

function headlineWeight(e: ChronicleEntry): number {
  if (e.kind === 'incident') {
    if (e.detail?.startsWith('sworn')) return 48
    if (e.detail?.startsWith('brawl')) return 42
    if (e.detail?.startsWith('fire')) return 41
  }
  return HEADLINE[e.kind] ?? 5
}

/** Where the Gazette starts: the last letter, or a few days back if that was recent. */
export function gazetteSince(state: GameState): number {
  return Math.min(state.life.letterReadAt, state.meta.lastSeenAtWorld - GAZETTE_MIN_DAYS * DAY_MS)
}

export function gazette(state: GameState, since: number = gazetteSince(state)): Gazette {
  const until = state.meta.lastSeenAtWorld
  const entries = state.life.chronicle.filter((e) => e.at > since)
  const by = new Map<GazetteSection, ChronicleEntry[]>()
  let headline: ChronicleEntry | null = null
  let best = -1
  let tierUps = 0
  for (const e of entries) {
    const k = sectionOf(e)
    if (!by.has(k)) by.set(k, [])
    by.get(k)!.push(e)
    if (e.kind === 'jobTier') tierUps++
    const w = headlineWeight(e)
    if (w >= best) {
      best = w
      headline = e
    }
  }
  const sections = GAZETTE_SECTIONS.filter((k) => by.has(k)).map((key) => ({ key, entries: by.get(key)!.slice(-GAZETTE_PER_SECTION) }))
  return {
    since,
    until,
    days: Math.max(1, Math.ceil((until - since) / DAY_MS)),
    headline,
    sections,
    pending: incidentsOf(state),
    outlook: campOutlook(state),
    masterXp: tierUps * TUNING.lobby.master.xpPerJobTier,
    total: entries.length,
  }
}
