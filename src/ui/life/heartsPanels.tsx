/**
 * Hearts (Living Lobby, lore §4) in a hero's profile: the trauma banner and the Master's
 * talk, the shelf of gifts that turned into a collection, and the tryout — a hero outside
 * the party challenging a party member for their seat.
 */
import { useState } from 'react'
import type { GameState, HeroId, OwnedHero } from '../../engine/types'
import type { Store } from '../../engine/store'
import { tryoutWithResult } from '../../engine/store'
import { TUNING } from '../../engine/tuning'
import { toWorldTime } from '../../engine/time'
import { GIFTS, collectionsOf } from '../../engine/favor'
import { consoleChance, consoleRefusal, favoriteOf, lifeOf, tryoutRefusal } from '../../engine/life'
import { shortName } from './speech'
import { t } from '../i18n/i18n'

const errText = (e: unknown) => t(e instanceof Error ? e.message.replace(/^\w+: /, '') : 'That failed')

/** A withdrawn or burnt-out hero: what is wrong, and what the Master can do about it. */
export function TraumaBanner({ state, store, hero }: { state: GameState; store: Store; hero: OwnedHero }) {
  const [err, setErr] = useState<string | null>(null)
  const trauma = lifeOf(hero).trauma
  if (!trauma) return null
  const nowWorld = toWorldTime(Date.now())
  const talkWhy = consoleRefusal(state, hero.id, nowWorld)
  const staffWhy = trauma.kind === 'burnout' ? consoleRefusal(state, hero.id, nowWorld, 'instructor') : null
  const run = (offer?: 'instructor') => {
    setErr(null)
    try {
      store.dispatch({ type: 'CONSOLE_HERO', heroId: hero.id, offer }, Date.now())
      if (lifeOf(store.getState()!.heroes[hero.id]!).trauma) setErr(t('They listened, but they are not ready. Try again tomorrow.'))
    } catch (e) {
      setErr(errText(e))
    }
  }
  return (
    <div className={`trauma-banner ${trauma.kind}`}>
      <b>{t(trauma.kind === 'withdrawn' ? 'Withdrawn' : 'Burnt out')}</b>
      <span className="muted small">
        {t(
          trauma.kind === 'withdrawn'
            ? 'Shut away from everyone. Will not fight until a friend — or you — brings them back.'
            : 'Too many brushes with death. Will not fight until rested — or offered a post off the front line.',
        )}
      </span>
      <div className="trauma-actions">
        <button className="pbtn sm" disabled={talkWhy !== null} title={talkWhy ? t(talkWhy) : undefined} onClick={() => run()}>
          {t('Talk them round ({n}%)', { n: Math.round(consoleChance(hero) * 100) })}
        </button>
        {trauma.kind === 'burnout' && (
          <button className="pbtn sm" disabled={staffWhy !== null} title={staffWhy ? t(staffWhy) : undefined} onClick={() => run('instructor')}>
            ⚔ {t('Offer an instructor’s post')}
          </button>
        )}
      </div>
      {err && <div className="err small">{err}</div>}
    </div>
  )
}

/** Gifts that became a collection: a shelf in their room. */
export function GiftShelf({ hero }: { hero: OwnedHero }) {
  const shelf = collectionsOf(hero)
  if (shelf.length === 0) return null
  return (
    <div className="gift-shelf">
      <h4 className="panel-sub">{t('On their shelf')}</h4>
      {shelf.map(([id, n]) => (
        <span key={id} className="chip shelf-item">
          ★ {t(GIFTS[id]?.name ?? id)} ×{n}
        </span>
      ))}
    </div>
  )
}

/** The lobby has a favourite (the favoritism tracker) — shown where gifts are given. */
export function FavoriteNotice({ state, hero }: { state: GameState; hero: OwnedHero }) {
  const fav = favoriteOf(state)
  if (!fav) return null
  return (
    <div className="fav-notice small">
      {fav === hero.id
        ? t('The others have noticed: the Master only looks at {name}. Those below Devoted grow resentful each day.', { name: shortName(state, fav) })
        : t('The lobby thinks {name} is your favourite.', { name: shortName(state, fav) })}
    </div>
  )
}

/** A hero outside the party challenges a party member for their seat. */
export function TryoutPanel({ state, store, hero }: { state: GameState; store: Store; hero: OwnedHero }) {
  const [target, setTarget] = useState<HeroId | ''>('')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  if (!hero.alive) return null
  if (state.party.slots.includes(hero.id)) return msg ? <div className="small tryout-msg">{msg}</div> : null
  const seated = state.party.slots.filter((id): id is HeroId => !!id && !!state.heroes[id]?.alive)
  if (seated.length === 0) return null
  const nowWorld = toWorldTime(Date.now())
  const pick = target || seated[0]!
  const why = tryoutRefusal(state, hero.id, pick, nowWorld)
  const duel = () => {
    setErr(null)
    setMsg(null)
    try {
      const now = Date.now() // one timestamp for preview + dispatch (they must match)
      const { result } = tryoutWithResult(state, hero.id, pick, now)
      store.dispatch({ type: 'TRYOUT', challengerId: hero.id, holderId: pick }, now)
      const after = store.getState() ?? state
      setMsg(
        result.seatTaken
          ? t('{a} beat {b} and took the seat!', { a: shortName(after, result.winnerId), b: shortName(after, result.loserId) })
          : t('{a} held the seat against {b}.', { a: shortName(after, result.winnerId), b: shortName(after, result.loserId) }),
      )
    } catch (e) {
      setErr(errText(e))
    }
  }
  return (
    <div className="tryout">
      <h4 className="panel-sub">{t('Tryout')}</h4>
      <div className="muted small">
        {t('Real weapons in the Yard, nobody dies. The winner holds the seat; the loser loses {n} Sanity and gains a rival.', {
          n: TUNING.life.tryout.loserSanity,
        })}
      </div>
      <div className="staff-assign">
        <select className="pinput" value={pick} onChange={(e) => setTarget(e.target.value as HeroId)}>
          {seated.map((id) => (
            <option key={id} value={id}>
              {t('Challenge {name}', { name: shortName(state, id) })} · {state.heroes[id]!.star}★ Lv{state.heroes[id]!.xp.level}
            </option>
          ))}
        </select>
        <button className="pbtn sm" disabled={why !== null} title={why ? t(why) : undefined} onClick={duel}>
          ⚔ {t('Duel')}
        </button>
      </div>
      {msg && <div className="small tryout-msg">{msg}</div>}
      {err && <div className="err small">{err}</div>}
    </div>
  )
}
