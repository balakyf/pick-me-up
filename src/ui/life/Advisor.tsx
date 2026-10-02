/**
 * Isel's advice: the advisor's tips in plain words, each with a one-click action (or a
 * pointer to the right place). The engine decides what is worth saying; this only
 * phrases it. Dismissed tips stay hidden for the session.
 */
import { useMemo, useState } from 'react'
import type { GameState, JobId } from '../../engine/types'
import type { Store } from '../../engine/store'
import { advise, type Advice, type AdvicePlace } from '../../engine/advisor'
import { JOB_FACILITY, personalityOf } from '../../engine/life'
import { GIFTS } from '../../engine/favor'
import { SKILLS } from '../../engine/content'
import { TUNING } from '../../engine/tuning'
import { PixelWindow } from '../kit'
import { heroBustUrl } from '../pixel/sprites'
import { t } from '../i18n/i18n'
import { JOB_NAME, shortName, tradeName } from './speech'
import { JOB_ICON } from './lifeWindows'
import { ta } from '../text'

const BUILDING: Record<string, string> = {
  forge: 'Forge',
  kitchen: 'Kitchen',
  trainingCenter: 'Training Center',
  library: 'Library',
  infirmary: 'Infirmary',
  garden: 'Garden',
  market: 'Market',
  watchtower: 'Watchtower',
}
const SLOT_NAME = { weapon: 'weapon', armor: 'armor', accessory: 'accessory' } as const

const jobName = (j: JobId) => t(JOB_NAME[j]).toLowerCase()
const building = (j: JobId) => t(BUILDING[JOB_FACILITY[j]] ?? JOB_FACILITY[j])

/** Why a hero suits a job, in a few words: their old trade first, else their temperament. */
function whyFits(state: GameState, heroId: string, job: JobId, aptitude: number, likes: boolean): string {
  const h = state.heroes[heroId as keyof GameState['heroes']]
  const bits: string[] = []
  if (h) {
    const bg = personalityOf(h).background
    const trade = tradeName(bg)
    // "an armorer back home": the article follows the trade.
    if (trade) bits.push(ta('a {trade} back home', { trade }))
  }
  bits.push(t('aptitude {a}', { a: aptitude.toFixed(2) }))
  if (likes) bits.push(t('would enjoy it'))
  void job
  return bits.join(' · ')
}

export interface Tip {
  advice: Advice
  icon: string
  heroId?: string
  text: string
  detail?: string
  cta: string
}

/** Phrase one tip. */
export function phrase(state: GameState, a: Advice): Tip {
  const n = (id: string) => shortName(state, id)
  switch (a.kind) {
    case 'fillParty':
      return { advice: a, icon: '⚔', text: t('{n} party slots are empty, and rested heroes are waiting.', { n: a.open }), cta: t('Open the party board') }
    case 'promote':
      return { advice: a, icon: '⬆', heroId: a.heroId, text: t('{name} has hit their level cap, and you have the materials to promote them.', { name: n(a.heroId) }), cta: t('Promote') }
    case 'banquet':
      return {
        advice: a,
        icon: '🍲',
        text: t('The party is running on fumes. A banquet would restore everyone’s Sanity.'),
        cta: t('Hold a banquet ({gold} ◆)', { gold: TUNING.lobby.banquet.gold.toLocaleString() }),
      }
    case 'tired': {
      const s = state.heroes[a.heroId]?.sanity ?? 0
      return {
        advice: a,
        icon: '😮‍💨',
        heroId: a.heroId,
        text: t('{name} is exhausted (Sanity {s}). {other} is rested and nearly as strong.', { name: n(a.heroId), s: Math.round(s), other: n(a.swapId) }),
        cta: t('Swap them'),
      }
    }
    case 'job':
      return {
        advice: a,
        icon: JOB_ICON[a.job],
        heroId: a.heroId,
        text: t('{name} would make a good {job} in the {building}.', { name: n(a.heroId), job: jobName(a.job), building: building(a.job) }),
        detail: whyFits(state, a.heroId, a.job, a.aptitude, a.likes),
        cta: t('Assign'),
      }
    case 'reassign':
      return {
        advice: a,
        icon: JOB_ICON[a.job],
        heroId: a.heroId,
        text: t('{name} would be a far better {job} than {other}.', { name: n(a.heroId), job: jobName(a.job), other: n(a.replaceId) }),
        detail: t('aptitude {a} vs {b}', { a: a.aptitude.toFixed(2), b: a.replaceAptitude.toFixed(2) }),
        cta: t('Swap them'),
      }
    case 'equip': {
      const item = state.inventory.find((i) => i.id === a.itemId)
      return {
        advice: a,
        icon: '🛡',
        heroId: a.heroId,
        text: t('{name} has no {slot}, and a {grade} one is sitting unused.', { name: n(a.heroId), slot: t(SLOT_NAME[a.slot]), grade: item?.grade ?? '' }),
        cta: t('Equip'),
      }
    }
    case 'daily':
      return { advice: a, icon: '🌀', text: t('Today’s dungeon still has {n} free runs.', { n: a.left }), cta: t('Go') }
    case 'friends':
      return {
        advice: a,
        icon: '🤝',
        heroId: a.friendId,
        text: t('{name} and {friend} are close friends. They fight better side by side.', { name: n(a.heroId), friend: n(a.friendId) }),
        cta: t('Open the party board'),
      }
    case 'train':
      return {
        advice: a,
        icon: '🎯',
        heroId: a.heroId,
        text:
          a.mode === 'learn'
            ? t('{name} is idle on the bench and could learn {skill}.', { name: n(a.heroId), skill: t(SKILLS[a.skillId]?.name ?? a.skillId) })
            : t('{name} is idle on the bench; a drill would sharpen {skill}.', { name: n(a.heroId), skill: t(SKILLS[a.skillId]?.name ?? a.skillId) }),
        cta: t('Start the drill'),
      }
    case 'gift':
      return {
        advice: a,
        icon: '🎁',
        heroId: a.heroId,
        text: t('{name} would love a {gift}.', { name: n(a.heroId), gift: t(GIFTS[a.giftId]?.name ?? a.giftId) }),
        detail: t('+{d} favor', { d: a.delta }),
        cta: t('Give it'),
      }
    case 'talent':
      return {
        advice: a,
        icon: '✨',
        heroId: a.heroId,
        text: t('{name} is a born {job}. Build the {building} to put that to work.', { name: n(a.heroId), job: jobName(a.job), building: building(a.job) }),
        detail: whyFits(state, a.heroId, a.job, a.aptitude, false),
        cta: t('Open construction'),
      }
  }
}

/** The tips still worth showing (the session's dismissals removed). */
export function useAdvice(state: GameState): { tips: Advice[]; dismiss: (id: string) => void } {
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set())
  const all = useMemo(() => advise(state), [state])
  return {
    tips: all.filter((a) => !dismissed.has(a.id)),
    dismiss: (id) => setDismissed((d) => new Set(d).add(id)),
  }
}

export function AdviceWindow({
  state,
  store,
  tips,
  onDismiss,
  onPlace,
  onProfile,
  onClose,
}: {
  state: GameState
  store: Store
  tips: Advice[]
  onDismiss: (id: string) => void
  onPlace: (p: AdvicePlace) => void
  onProfile: (id: string) => void
  onClose: () => void
}) {
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  function act(a: Advice) {
    setErr(null)
    if (a.actions.length === 0) {
      if (a.place) onPlace(a.place)
      return
    }
    try {
      for (const cmd of a.actions) store.dispatch(cmd, Date.now())
      setDone(phrase(state, a).cta)
    } catch (e) {
      setErr(t(e instanceof Error ? e.message.replace(/^\w+: /, '') : 'That failed'))
    }
  }
  return (
    <PixelWindow title={t('Isel’s advice')} icon="💡" onClose={onClose}>
      <p className="muted small">{t('What I would do next, Master. Every suggestion is yours to take or leave.')}</p>
      {tips.length === 0 && <div className="lr-empty">{t('Nothing pressing. The waiting room is in good order.')}</div>}
      <ul className="advice-list">
        {tips.map((a) => {
          const tip = phrase(state, a)
          const hero = tip.heroId ? state.heroes[tip.heroId as keyof GameState['heroes']] : undefined
          return (
            <li key={a.id} className={`advice advice-${a.kind}`}>
              <span className="advice-icon" aria-hidden="true">
                {hero ? <img className="px" src={heroBustUrl(hero)} width={28} height={28} alt="" /> : tip.icon}
              </span>
              <span className="advice-body">
                <span>{tip.text}</span>
                {tip.detail && <span className="muted small">{tip.detail}</span>}
              </span>
              <span className="advice-actions">
                <button className="pbtn sm" onClick={() => act(a)}>
                  {tip.cta}
                </button>
                {hero && (
                  <button className="pbtn sm ghost" onClick={() => onProfile(hero.id)} title={t('Profile')}>
                    👤
                  </button>
                )}
                <button className="pbtn sm ghost" onClick={() => onDismiss(a.id)} title={t('Not now')}>
                  ✕
                </button>
              </span>
            </li>
          )
        })}
      </ul>
      {done && !err && <div className="lr-action-note">✓ {done}</div>}
      {err && <div className="err">{err}</div>}
    </PixelWindow>
  )
}
