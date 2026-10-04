/**
 * Quanton Life windows: the hero tracker ("where is everyone?"), a hero's profile (who
 * they are, what they want, who they love and hate, what they remember, their job), and
 * Isel's letter — the canon login report of what the heroes did while the Master was away.
 */
import { TraitBadge } from '../people/TraitBadge'
import { SKILLS } from '../../engine/content'
import { useState } from 'react'
import type { GameState, HeroId, JobId, Memory, OwnedHero } from '../../engine/types'
import type { Store } from '../../engine/store'
import { TUNING } from '../../engine/tuning'
import {
  JOBS,
  JOB_FACILITY,
  TIER_NAMES,
  aptitude,
  bondOf,
  dayOfSlot,
  jobFeeling,
  jobHolders,
  jobOpen,
  jobSeats,
  jobTier,
  lifeOf,
  personalityOf,
  relationsOf,
  salientMemories,
  slotOf,
} from '../../engine/life'
import { PixelWindow, Gauge } from '../kit'
import { heroBustUrl } from '../pixel/sprites'
import { JOB_NAME, accountDay, chronicleLine, diaryLine, groupedChronicle, placeName, shortName, speak, statusLine, tradeName } from './speech'
import { t } from '../i18n/i18n'
import { ta } from '../text'
import { BondList } from '../bond/BondBadge'
import { BOUNTIES } from '../../engine/estate'
import { EstateNotes } from './EstatePanels'
import { MoralePips, MoraleBreakdown } from './MoralePips'
import { PriasisLetter } from '../story/StoryNotes'
import { priasisUnread } from '../story/storyText'

const first = (n: string) => n.split(/\s+/)[0] ?? n

const BOND_LABEL: Record<string, string> = {
  closeFriend: 'Close friend',
  friend: 'Friend',
  rival: 'Rival',
  grudge: 'Grudge',
}

const TRAITS: [keyof ReturnType<typeof personalityOf>, string][] = [
  ['diligence', 'Diligence'],
  ['sociability', 'Sociability'],
  ['warmth', 'Warmth'],
  ['courage', 'Courage'],
  ['curiosity', 'Curiosity'],
  ['temper', 'Temper'],
]

export const JOB_ICON: Record<JobId, string> = {
  blacksmith: '⚒',
  cook: '🍲',
  instructor: '⚔',
  scholar: '📚',
  healer: '✚',
  gardener: '🌱',
  merchant: '⚖',
  guard: '🔭',
}

export const JOB_BLURB: Record<JobId, string> = {
  blacksmith: 'Works the Forge’s standing order into new gear (gold + Promotion Stones).',
  cook: 'Fills the pantry: cooked meals feed more and steady the nerves.',
  instructor: 'Everyone training in the Yard learns faster.',
  scholar: 'Studies the next floor until its weakness is known; the world steadies (PI).',
  healer: 'Heroes resting in the Infirmary recover faster, grief included.',
  gardener: 'Grows produce: a little gold, and ingredients for the kitchen.',
  merchant: 'Trades at the Market for a steady trickle of gold.',
  guard: 'Watches the Crack: invaders face a stiffer defense.',
}

/** A line describing a memory ("Day 4 · Survived floor 12 by a hair"). */
export function memoryLine(state: GameState, m: Memory): string {
  const other = m.other ? shortName(state, m.other) : ''
  const day = t('Day {n}', { n: accountDay(state, m.day) })
  const text: Record<Memory['kind'], string> = {
    firstDay: t('Arrived in the waiting room'),
    floorCleared: t('Cleared floor {floor}', { floor: m.floor ?? '?' }),
    floorLost: t('Beaten back on floor {floor}', { floor: m.floor ?? '?' }),
    nearDeath: t('Nearly died on floor {floor}', { floor: m.floor ?? '?' }),
    friendDied: t('Lost {name}, a friend', { name: other }),
    comradeDied: t('Saw {name} fall', { name: other }),
    befriended: m.detail === 'closeFriends' ? t('Grew close to {name}', { name: other }) : t('Became friends with {name}', { name: other }),
    rivalry: m.detail === 'grudge' ? t('Came to hate {name}', { name: other }) : t('Fell out with {name}', { name: other }),
    argued: t('Argued with {name}', { name: other }),
    gift: t('Received a gift from the Master'),
    promoted: t('Promoted to {n}★', { n: m.detail ?? '?' }),
    forged: t('Forged {item}', { item: m.detail ?? '' }),
    jobTier: ta('Became a {tier} {job}', {
      tier: t(TIER_NAMES[Number((m.detail ?? ':0').split(':')[1])] ?? 'Novice'),
      job: t(JOB_NAME[(m.detail ?? 'cook').split(':')[0] as JobId] ?? ''),
    }),
    mourned: t('Visited {name}’s grave', { name: other }),
    retreated: t('Retreated from floor {floor}', { floor: m.floor ?? '?' }),
    duel: m.detail?.startsWith('won')
      ? t('Won a tryout duel against {name}', { name: other })
      : m.detail?.startsWith('lost')
        ? t('Lost a tryout duel to {name}', { name: other })
        : t('Fought {name} to a draw', { name: other }),
    statue: t('Saw a statue raised for {name}', { name: other }),
    bounty: t('Came back from a bounty: {name}', { name: t(BOUNTIES[m.detail ?? '']?.name ?? '') }),
    selfTaught: t('Taught themselves {skill}', { skill: t(SKILLS[m.detail ?? '']?.name ?? m.detail ?? '') }),
    comforted: t('Came back to the others, comforted'),
    burnout: t('Burnt out after too many floors'),
    guilt: t('Never made peace with {name}', { name: other }),
    consoled: t('{name} sat with them in their grief', { name: other }),
    anniversary: t('Remembered {name}, a week on', { name: other }),
    incident: incidentMemory(m.detail ?? '', other),
  }
  return `${day} · ${text[m.kind]}`
}

/** A camp incident as a hero remembers it (lane L). */
function incidentMemory(detail: string, other: string): string {
  const [kind, sign] = detail.split(':')
  switch (kind) {
    case 'brawl':
      return sign === '+' ? t('Fought {name} — and cleared the air', { name: other }) : t('Came to blows with {name}', { name: other })
    case 'sworn':
      return t('Swore to watch {name}’s back', { name: other })
    case 'night':
      return t('Trained alone by moonlight')
    case 'fire':
      return t('Let a pot burn in the kitchen')
    case 'homesick':
      return sign === '+' ? t('The Master sat with them when they missed home') : t('Missed home')
    default:
      return t('Was very much themselves')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tracker
// ─────────────────────────────────────────────────────────────────────────────

export function HeroTracker({
  state,
  onClose,
  onFind,
  onProfile,
}: {
  state: GameState
  onClose: () => void
  onFind: (id: string) => void
  onProfile: (id: string) => void
}) {
  const [q, setQ] = useState('')
  const living = Object.values(state.heroes).filter((h) => h.alive)
  const shown = living.filter((h) => h.name.toLowerCase().includes(q.toLowerCase()))
  const byPlace = new Map<string, OwnedHero[]>()
  for (const h of shown) {
    const place = placeName(lifeOf(h).doing.place)
    byPlace.set(place, [...(byPlace.get(place) ?? []), h])
  }
  return (
    <PixelWindow title={t('Heroes')} icon="👥" onClose={onClose} wide>
      <div className="tracker-head">
        <input className="pinput" placeholder={t('Search…')} value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="muted">{t('{n} living', { n: living.length })}</span>
      </div>
      {[...byPlace.entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .map(([place, heroes]) => (
          <div key={place} className="tracker-group">
            <h4 className="panel-sub">
              {place} · {heroes.length}
            </h4>
            {heroes.map((h) => (
              <div key={h.id} className="tracker-row">
                <img className="px" src={heroBustUrl(h)} width={28} height={28} alt="" />
                <div className="tracker-main">
                  <b>{h.name}</b> <span className="muted">{h.star}★ Lv{h.xp.level}</span> <MoralePips state={state} heroId={h.id} />
                  {lifeOf(h).job && <span className="chip">{JOB_ICON[lifeOf(h).job!]} {t(JOB_NAME[lifeOf(h).job!])}</span>}
                  <div className="muted small">{statusLine(state, h)}</div>
                </div>
                <button className="pbtn sm" onClick={() => onFind(h.id)} title={t('Follow with the camera')}>
                  👁
                </button>
                <button className="pbtn sm" onClick={() => onProfile(h.id)}>
                  {t('Profile')}
                </button>
              </div>
            ))}
          </div>
        ))}
    </PixelWindow>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile
// ─────────────────────────────────────────────────────────────────────────────

export function JobPicker({ state, store, hero }: { state: GameState; store: Store; hero: OwnedHero }) {
  const [err, setErr] = useState<string | null>(null)
  const life = lifeOf(hero)
  const assign = (job: JobId | null) => {
    setErr(null)
    try {
      store.dispatch({ type: 'ASSIGN_JOB', heroId: hero.id, job }, Date.now())
    } catch (e) {
      setErr(t(e instanceof Error ? e.message.replace(/^\w+: /, '') : 'That failed'))
    }
  }
  return (
    <div className="job-picker">
      <div className="job-grid">
        {JOBS.map((job) => {
          const open = jobOpen(state, job)
          const seats = jobSeats(state, job)
          const taken = jobHolders(state, job).filter((h) => h.id !== hero.id).length
          const apt = aptitude(hero, job)
          const feel = jobFeeling(hero, job)
          const mine = life.job === job
          return (
            <button
              key={job}
              className={`job-cell ${mine ? 'on' : ''} ${feel}`}
              disabled={!mine && (!open || taken >= seats)}
              onClick={() => assign(mine ? null : job)}
              title={t(JOB_BLURB[job])}
            >
              <span className="job-ic">{JOB_ICON[job]}</span>
              <span className="job-nm">{t(JOB_NAME[job])}</span>
              <span className="job-apt">
                {feel === 'likes' ? '♥' : feel === 'dislikes' ? '✗' : '·'} {apt.toFixed(2)}
              </span>
              <span className="job-seat muted small">
                {!open ? t('{b} not built', { b: t(placeName(JOB_PLACE_OF[job])) }) : t('{n}/{m} seats', { n: taken + (mine ? 1 : 0), m: seats })}
              </span>
            </button>
          )
        })}
      </div>
      {err && <div className="err">{err}</div>}
    </div>
  )
}

const JOB_PLACE_OF: Record<JobId, Parameters<typeof placeName>[0]> = {
  blacksmith: 'forge',
  cook: 'kitchen',
  instructor: 'yard',
  scholar: 'library',
  healer: 'infirmary',
  gardener: 'garden',
  merchant: 'market',
  guard: 'watchtower',
}
void JOB_FACILITY

export function HeroProfile({
  state,
  store,
  heroId,
  onClose,
  onFind,
}: {
  state: GameState
  store: Store
  heroId: string
  onClose: () => void
  onFind: (id: string) => void
}) {
  const hero = state.heroes[heroId as HeroId]!
  const p = personalityOf(hero)
  const life = lifeOf(hero)
  const today = dayOfSlot(state.life.slot)
  const rels = relationsOf(state, hero.id).filter(([o, r]) => bondOf(r.affinity) && (state.heroes[o]?.alive ?? false)).slice(0, 8)
  const job = life.job
  const tier = job ? jobTier(life.jobXp[job] ?? 0) : 0
  const inParty = state.party.slots.includes(hero.id)
  return (
    <PixelWindow title={hero.name} icon="✦" onClose={onClose} wide>
      <div className="profile">
        <div className="profile-top">
          <img className="px profile-bust" src={heroBustUrl(hero)} width={72} height={72} alt="" />
          <div>
            <div>
              {hero.star}★ · {t(hero.heroClass ? hero.heroClass[0]!.toUpperCase() + hero.heroClass.slice(1) : 'Untrained')} · Lv{hero.xp.level} ·{' '}
              {t('Sanity')} {Math.round(hero.sanity)}
            </div>
            <div className="muted">
              {t('Before the summon: {trade}', { trade: tradeName(p.background) })} · {t('Voice: {v}', { v: t(p.voice) })} ·{' '}
              {t(p.chronotype === 'owl' ? 'Night owl' : p.chronotype === 'early' ? 'Early riser' : 'Keeps normal hours')}
            </div>
            <div className="muted">
              {t('Loves {food}', { food: t(p.food) })} · {t('Hobby: {h}', { h: t(p.hobby) })} · {t('Here since day {n}', { n: accountDay(state, life.arrivedDay) })}
            </div>
            <TraitBadge hero={hero} full />
            <MoraleBreakdown state={state} heroId={hero.id} />
            <div className="profile-now">“{speak(state, hero, inParty, 'profile')}”</div>
            <div className="muted small">{statusLine(state, hero)}</div>
            <EstateNotes state={state} hero={hero} />
          </div>
        </div>

        <div className="profile-cols">
          <div>
            <h4 className="panel-sub">{t('Temperament')}</h4>
            {TRAITS.map(([k, label]) => (
              <div key={k} className="trait-row">
                <span>{t(label)}</span>
                <Gauge pct={(p[k] as number) * 100} color="var(--accent-2)" />
              </div>
            ))}
            <h4 className="panel-sub">{t('Needs')}</h4>
            {(['energy', 'hunger', 'social', 'fun'] as const).map((k) => (
              <div key={k} className="trait-row">
                <span>{t(k === 'hunger' ? 'Fed' : k[0]!.toUpperCase() + k.slice(1))}</span>
                <Gauge pct={life.needs[k]} color={life.needs[k] < 25 ? 'var(--bad)' : life.needs[k] < 55 ? 'var(--warn)' : 'var(--good)'} />
              </div>
            ))}
            {life.grief > 0 && (
              <div className="trait-row">
                <span>{t('Grief')}</span>
                <Gauge pct={life.grief} color="#8a7ad8" />
              </div>
            )}
          </div>
          <div>
            <h4 className="panel-sub">{t('People')}</h4>
            {rels.length === 0 && <div className="muted">{t('Keeps to themselves, so far.')}</div>}
            {rels.map(([o, r]) => (
              <div key={o} className="rel-row">
                <button className="linkish" onClick={() => onFind(o)}>
                  {shortName(state, o)}
                </button>
                <span className={`chip bond-${bondOf(r.affinity)}`}>{t(BOND_LABEL[bondOf(r.affinity)!]!)}</span>
                {r.shared > 0 && <span className="muted small">{t('{n} floors together', { n: r.shared })}</span>}
              </div>
            ))}
            <BondList state={state} hero={hero} onFind={onFind} />
            <h4 className="panel-sub">{t('Memories')}</h4>
            {salientMemories(life, today)
              .slice(0, 8)
              .map((m, i) => (
                <div key={i} className="mem-row small">
                  {memoryLine(state, m)}
                </div>
              ))}
          </div>
        </div>

        <h4 className="panel-sub">
          {t('Job')}
          {job && ` · ${t(TIER_NAMES[tier]!)} ${t(JOB_NAME[job])}`}
        </h4>
        <JobPicker state={state} store={store} hero={hero} />
        <div className="profile-foot">
          <button className="pbtn" onClick={() => onFind(hero.id)}>
            👁 {t('Find on the map')}
          </button>
        </div>
      </div>
    </PixelWindow>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Isel's letter
// ─────────────────────────────────────────────────────────────────────────────

/** A letter is waiting when something happened since the last one and the Master has been
 *  away at least `minGapWorld` (default: two real hours). */
export function letterReady(state: GameState, nowWorld: number, minGapWorld = 2 * 3_600_000 * TUNING.time.worldTimeFactor): boolean {
  const since = state.life.letterReadAt
  if (nowWorld - since < minGapWorld) return false
  const tl = state.life.tally
  const newsy =
    state.life.chronicle.some((e) => e.at > since) || tl.forged + tl.meals + tl.research > 0 || tl.jobGold > 0 || tl.trainXp > 0 || (tl.selfTaught ?? 0) > 0 || priasisUnread(state) !== null
  return newsy
}

export function LetterWindow({ state, onClose, onGazette }: { state: GameState; onClose: () => void; onGazette?: () => void }) {
  const since = state.life.letterReadAt
  const entries = state.life.chronicle.filter((e) => e.at > since)
  const tl = state.life.tally
  const deaths = entries.filter((e) => e.kind === 'death')
  const rest = groupedChronicle(state, entries).slice(-14)
  const invasions = state.pvp.log.filter((r) => r.direction === 'in' && r.worldDay * 24 * 3_600_000 >= since)
  const living = Object.values(state.heroes).filter((h) => h.alive)
  // Three diarists: the ones with the most on their minds.
  const diarists = [...living]
    .sort((a, b) => (salientMemories(lifeOf(b), dayOfSlot(slotOf(since)))[0]?.weight ?? 0) - (salientMemories(lifeOf(a), dayOfSlot(slotOf(since)))[0]?.weight ?? 0))
    .slice(0, 3)
  return (
    <PixelWindow title={t('A letter from Isel')} icon="✉" onClose={onClose} wide>
      <div className="letter">
        <p className="letter-open">{t('Master — while you were away, the waiting room kept living. Here is what I wrote down.')}</p>
        {deaths.length > 0 && (
          <div className="fallen">
            <div className="ft">{t('☠ We lost')}</div>
            {deaths.map((e, i) => (
              <div key={i}>{chronicleLine(state, e)}</div>
            ))}
          </div>
        )}
        {/* Lane M: the newest letter of the Priasis arc, folded into Isel's. */}
        <PriasisLetter state={state} />
        <div className="letter-tally">
          {tl.forged > 0 && <span className="chip">⚒ {t('{n} items forged', { n: tl.forged })}</span>}
          {tl.meals > 0 && <span className="chip">🍲 {t('{n} meals served', { n: tl.meals })}</span>}
          {tl.jobGold > 0 && <span className="chip">◆ {t('+{n} gold from work', { n: tl.jobGold.toLocaleString() })}</span>}
          {tl.trainXp > 0 && <span className="chip">⚔ {t('{n} XP trained', { n: tl.trainXp.toLocaleString() })}</span>}
          {(tl.selfTaught ?? 0) > 0 && <span className="chip">🎯 {t('{n} skills improved in the yard', { n: tl.selfTaught! })}</span>}
          {tl.research > 0 && <span className="chip">📚 {t('{n} floors studied', { n: tl.research })}</span>}
          {tl.healed > 0 && <span className="chip">✚ {t('{n} sanity mended', { n: tl.healed })}</span>}
          {invasions.length > 0 && <span className="chip">⟡ {t('{n} invasions', { n: invasions.length })}</span>}
        </div>
        {rest.length > 0 && (
          <ul className="letter-list">
            {rest.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        )}
        {entries.some((e) => e.kind === 'stalled') && <p className="muted">{t('The Forge went cold for want of gold or Promotion Stones.')}</p>}
        <h4 className="panel-sub">{t('From their diaries')}</h4>
        {(() => {
          // A diary never repeats a line already in the letter, or another diarist's.
          const taken = new Set<string>([...rest, ...deaths.map((e) => chronicleLine(state, e))])
          return diarists.map((h) => ({ h, line: diaryLine(state, h, taken) }))
        })().map(({ h, line }) => (
          <div key={h.id} className="diary">
            <img className="px" src={heroBustUrl(h)} width={28} height={28} alt="" />
            <span>
              <b>{shortName(state, h.id)}:</b> “{line}”
            </span>
          </div>
        ))}
        <p className="letter-sign">— {t('Isel, keeper of the waiting room')}</p>
        <div className="letter-actions">
          <button className="btn primary" onClick={onClose}>
            {t('Fold the letter')}
          </button>
          {onGazette && (
            <button
              className="btn"
              onClick={() => {
                onGazette()
                onClose()
              }}
            >
              📰 {t('Read the Gazette')}
            </button>
          )}
        </div>
      </div>
    </PixelWindow>
  )
}

export { JOB_NAME }
