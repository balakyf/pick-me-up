/**
 * Living Lobby building panels: who is here right now, who works here (and who else
 * could), the Forge's standing order, and the Memorial's graves. Each building's rules
 * live in the engine; these only read state and dispatch Commands.
 */
import { useState } from 'react'
import type { ForgeOrder, GameState, JobId, LifePlace, OwnedHero } from '../../engine/types'
import type { Store } from '../../engine/store'
import { TUNING } from '../../engine/tuning'
import {
  TIER_NAMES,
  aptitude,
  autoForgeSlot,
  bedCount,
  jobFeeling,
  jobHolders,
  jobOpen,
  jobSeats,
  jobTier,
  lifeOf,
  personalityOf,
} from '../../engine/life'
import { forgeCost, forgeGrade, smithyUnlocked } from '../../engine/equipment'
import { heroBustUrl } from '../pixel/sprites'
import { JOB_NAME, accountDay, lastWords, lastWordsTogether, shortName, statusLine, tradeName } from './speech'
import { JOB_BLURB, JOB_ICON } from './lifeWindows'
import { t } from '../i18n/i18n'

const first = (n: string) => n.split(/\s+/)[0] ?? n

/** Heroes whose life puts them at `place` right now. */
export function HereNow({ state, place, onProfile, empty }: { state: GameState; place: LifePlace; onProfile?: (id: string) => void; empty?: string }) {
  const here = Object.values(state.heroes).filter((h) => h.alive && lifeOf(h).doing.place === place)
  if (here.length === 0) return <div className="lr-empty">{t(empty ?? 'Nobody is here right now.')}</div>
  return (
    <div className="here-list">
      {here.map((h) => (
        <button key={h.id} className="here-row" onClick={() => onProfile?.(h.id)} title={t('Profile')}>
          <img className="px" src={heroBustUrl(h)} width={24} height={24} alt="" />
          <span>
            <b>{shortName(state, h.id)}</b> <span className="muted small">{statusLine(state, h)}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

/** The seats at one job: holders, their skill, and who else could take a seat. */
export function StaffSection({ state, store, job, onProfile }: { state: GameState; store: Store; job: JobId; onProfile?: (id: string) => void }) {
  const [err, setErr] = useState<string | null>(null)
  const [pick, setPick] = useState('')
  const open = jobOpen(state, job)
  const seats = jobSeats(state, job)
  const holders = jobHolders(state, job)
  const dispatch = (heroId: OwnedHero['id'], j: JobId | null) => {
    setErr(null)
    try {
      store.dispatch({ type: 'ASSIGN_JOB', heroId, job: j }, Date.now())
      setPick('')
    } catch (e) {
      setErr(t(e instanceof Error ? e.message.replace(/^\w+: /, '') : 'That failed'))
    }
  }
  const candidates = Object.values(state.heroes)
    .filter((h) => h.alive && lifeOf(h).job !== job)
    .sort((a, b) => aptitude(b, job) - aptitude(a, job))
  // The best-suited hero who has no job yet (taking someone off another job is the Master's call).
  const best = candidates.find((h) => lifeOf(h).job === null && !h.captiveOf)
  return (
    <div className="staff">
      <h4 className="panel-sub">
        {JOB_ICON[job]} {t('{job}s', { job: t(JOB_NAME[job]) })} · {holders.length}/{seats}
      </h4>
      <p className="muted small">{t(JOB_BLURB[job])}</p>
      {!open && <div className="lr-empty">{t('Build this place to open its seats.')}</div>}
      {holders.map((h) => {
        const xp = lifeOf(h).jobXp[job] ?? 0
        const tier = jobTier(xp)
        const next = TUNING.life.jobs.tiers[tier + 1]
        const feel = jobFeeling(h, job)
        return (
          <div key={h.id} className="staff-row">
            <img className="px" src={heroBustUrl(h)} width={24} height={24} alt="" />
            <button className="linkish" onClick={() => onProfile?.(h.id)}>
              {shortName(state, h.id)}
            </button>
            <span className="chip">{t(TIER_NAMES[tier]!)}</span>
            <span className="muted small">
              {t('aptitude {a}', { a: aptitude(h, job).toFixed(2) })}
              {next !== undefined && ` · ${xp}/${next}`}
            </span>
            {feel !== 'neutral' && <span className={`chip ${feel}`}>{feel === 'likes' ? t('♥ enjoys it') : t('✗ resents it')}</span>}
            <button className="pbtn sm ghost" onClick={() => dispatch(h.id, null)}>
              {t('Relieve')}
            </button>
          </div>
        )
      })}
      {open && holders.length < seats && best && aptitude(best, job) >= 1 && (
        <div className="staff-best">
          <span>
            💡 {t('Best fit:')} <b>{shortName(state, best.id)}</b>
          </span>
          <span className="muted">
            {[tradeName(personalityOf(best).background), t('aptitude {a}', { a: aptitude(best, job).toFixed(2) })].filter(Boolean).join(' · ')}
            {jobFeeling(best, job) === 'likes' && ` · ${t('would enjoy it')}`}
          </span>
          <button className="pbtn sm" onClick={() => dispatch(best.id, job)}>
            {t('Assign')}
          </button>
        </div>
      )}
      {open && holders.length < seats && (
        <div className="staff-assign">
          <select className="pinput" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">{t('Choose a hero…')}</option>
            {candidates.map((h) => {
              const feel = jobFeeling(h, job)
              const cur = lifeOf(h).job
              return (
                <option key={h.id} value={h.id}>
                  {`${h.name} · ${aptitude(h, job).toFixed(2)}${feel === 'likes' ? ' ♥' : feel === 'dislikes' ? ' ✗' : ''}${cur ? ` (${t(JOB_NAME[cur])})` : ''}`}
                </option>
              )
            })}
          </select>
          <button className="pbtn sm" disabled={!pick} onClick={() => dispatch(pick as OwnedHero['id'], job)}>
            {t('Assign')}
          </button>
        </div>
      )}
      {err && <div className="err">{err}</div>}
    </div>
  )
}

const ORDERS: { id: ForgeOrder | null; label: string }[] = [
  { id: null, label: 'Stand down' },
  { id: 'auto', label: 'Whatever the party needs' },
  { id: 'weapon', label: 'Weapons' },
  { id: 'armor', label: 'Armor' },
  { id: 'accessory', label: 'Accessories' },
]

/** The Forge's standing work order for its smiths. */
export function ForgeOrderSection({ state, store }: { state: GameState; store: Store }) {
  if (!smithyUnlocked(state)) return null
  const order = state.life.forge.order
  const wip = state.life.forge.wip
  const grade = forgeGrade(state.meta.masterLevel)
  const cost = forgeCost(grade)
  const need = wip ? TUNING.life.jobs.forgeWork[wip.grade] ?? 20 : 0
  const auto = order === 'auto' ? autoForgeSlot(state) : null
  return (
    <div className="forge-order">
      <h4 className="panel-sub">{t('Work order')}</h4>
      <div className="order-row">
        {ORDERS.map((o) => (
          <button
            key={String(o.id)}
            className={`pbtn sm ${order === o.id ? 'on' : ''}`}
            onClick={() => store.dispatch({ type: 'SET_FORGE_ORDER', order: o.id }, Date.now())}
          >
            {t(o.label)}
          </button>
        ))}
      </div>
      <div className="muted small">
        {t('Each piece: {grade}-grade · {gold} ◆ + {stones} Promotion Stones.', { grade, gold: cost.gold.toLocaleString(), stones: cost.promotionStone })}
        {order === 'auto' && (auto ? ` ${t('Next: {slot}.', { slot: t(auto) })}` : ` ${t('The party is fully equipped — the smiths rest.')}`)}
      </div>
      {wip && (
        <div className="wip">
          ⚒ {t('On the anvil: {grade} {slot}', { grade: wip.grade, slot: t(wip.slot) })}
          <span className="wip-bar">
            <span style={{ width: `${Math.min(100, (wip.progress / need) * 100)}%` }} />
          </span>
        </div>
      )}
    </div>
  )
}

/** The Memorial: every grave, with the words each hero left behind. */
export function MemorialPanel({ state }: { state: GameState }) {
  const graves = [...state.life.memorial].reverse()
  if (graves.length === 0) return <div className="lr-empty">{t('The lawn is empty. Keep it that way, Master.')}</div>
  // Heroes who fell together (same floor, day and cause) never share their last words.
  const together = new Map<string, typeof graves>()
  for (const g of graves) {
    const k = `${g.floor}|${g.day}|${g.cause}`
    together.set(k, [...(together.get(k) ?? []), g])
  }
  const words = new Map<string, string>()
  for (const group of together.values()) for (const [id, w] of lastWordsTogether(state, group)) words.set(id, w)
  const cause = (c: string, floor: number) =>
    c === 'synthesis' ? t('lost to the Synthesis Chamber') : c === 'captor' ? t('never ransomed') : t('fell on floor {n}', { n: floor })
  return (
    <div className="memorial">
      <p className="muted">{t('{n} names on the obelisk.', { n: graves.length })}</p>
      {graves.map((g) => (
        <div key={g.heroId} className="grave-row">
          <div className="grave-name">
            <b>{g.name}</b> <span className="muted small">{g.star}★ Lv{g.level}</span>
          </div>
          <div className="muted small">
            {cause(g.cause, g.floor)} · {t('day {n}', { n: accountDay(state, g.day) })} · {t('served {n} days', { n: g.daysServed })}
            {g.mourners.length > 0 && ` · ${t('mourned by {names}', { names: g.mourners.map((m) => shortName(state, m)).join(', ') })}`}
          </div>
          <div className="last-words">“{words.get(g.heroId) ?? lastWords(state, g)}”</div>
        </div>
      ))}
    </div>
  )
}

export function DormitoryInfo({ state }: { state: GameState }) {
  const living = Object.values(state.heroes).filter((h) => h.alive).length
  const beds = bedCount(state)
  const owls = Object.values(state.heroes).filter((h) => h.alive && personalityOf(h).chronotype === 'owl').length
  return (
    <div className="muted">
      {t('{beds} beds for {n} heroes.', { beds, n: living })}{' '}
      {living > beds ? t('The rest sleep on the hall floor — badly.') : t('Everyone has a bed.')}{' '}
      {owls > 0 && t('{n} night owls keep the lamps lit late.', { n: owls })}
    </div>
  )
}

export function KitchenPantry({ state }: { state: GameState }) {
  return (
    <div className="muted">
      {t('Pantry: {n} cooked meals waiting.', { n: Math.floor(state.life.pantry) })}{' '}
      {state.life.pantry < 1 ? t('Without a cook the heroes eat bread and cheese.') : t('A hot meal steadies the nerves.')}
    </div>
  )
}

export function LibraryInfo({ state }: { state: GameState }) {
  const r = state.life.research
  const need = TUNING.life.jobs.researchToStudy
  const studied = state.meta.peekedFloors.includes(state.tower.currentFloor)
  return (
    <div className="muted">
      {studied
        ? t('Floor {n} has been studied — its weakness is known.', { n: state.tower.currentFloor })
        : t('Studying floor {n}: {p}/{need}.', { n: state.tower.currentFloor, p: r.floor === state.tower.currentFloor ? Math.floor(r.points) : 0, need })}
    </div>
  )
}

export function WatchtowerInfo({ state }: { state: GameState }) {
  const bonus = Math.round(state.life.guardPower * TUNING.life.jobs.guardDefensePerPower * 100)
  return <div className="muted">{t('Guards on the wall add +{n}% to the invasion defense right now.', { n: bonus })}</div>
}
