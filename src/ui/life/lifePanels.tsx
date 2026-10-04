/**
 * Living Lobby building panels: who is here right now, who works here (and who else
 * could), and the Memorial's graves (and, lane Q, the legends of earlier worlds). Each building's rules
 * live in the engine; these only read state and dispatch Commands.
 */
import { useState } from 'react'
import type { GameState, JobId, LifePlace, OwnedHero } from '../../engine/types'
import type { Store } from '../../engine/store'
import { TUNING } from '../../engine/tuning'
import {
  TIER_NAMES,
  aptitude,
  bedCount,
  jobFeeling,
  jobHolders,
  jobOpen,
  jobSeats,
  jobTier,
  lifeOf,
  personalityOf,
} from '../../engine/life'
import { heirlooms } from '../../engine/equipment'
import { endgameOf } from '../../engine/endgame'
import { heroBustUrl } from '../pixel/sprites'
import { JOB_NAME, accountDay, lastWords, shortName, statusLine, tradeName } from './speech'
import { JOB_BLURB, JOB_ICON } from './lifeWindows'
import { HeroPicker } from '../hero/HeroPicker'
import { t } from '../i18n/i18n'
import '../late/late.css'

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
  const [picking, setPicking] = useState(false)
  const open = jobOpen(state, job)
  const seats = jobSeats(state, job)
  const holders = jobHolders(state, job)
  const dispatch = (heroId: OwnedHero['id'], j: JobId | null) => {
    setErr(null)
    try {
      store.dispatch({ type: 'ASSIGN_JOB', heroId, job: j }, Date.now())
      setPicking(false)
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
        // Lane Q: the shared hero picker (lane N) instead of a native dropdown.
        <details className="staff-assign" open={picking} onToggle={(e) => setPicking((e.target as HTMLDetailsElement).open)}>
          <summary className="pbtn sm">{t('Choose a hero…')}</summary>
          {picking && (
            <HeroPicker
              state={state}
              heroes={candidates}
              onPick={(id) => dispatch(id, job)}
              refusal={(h) => (h.captiveOf ? 'Held by a rival Master.' : null)}
              note={(h) => {
                const feel = jobFeeling(h, job)
                const cur = lifeOf(h).job
                return `${t('aptitude {a}', { a: aptitude(h, job).toFixed(2) })}${feel === 'likes' ? ' ♥' : feel === 'dislikes' ? ' ✗' : ''}${cur ? ` · ${t(JOB_NAME[cur])}` : ''}`
              }}
              label={t('Who takes a seat')}
            />
          )}
        </details>
      )}
      {err && <div className="err">{err}</div>}
    </div>
  )
}

/** The Memorial: every grave, with the words each hero left behind. */
export function MemorialPanel({ state }: { state: GameState }) {
  const graves = [...state.life.memorial].reverse()
  const legends = <LegendsShelf state={state} />
  if (graves.length === 0)
    return (
      <>
        <div className="lr-empty">{t('The lawn is empty. Keep it that way, Master.')}</div>
        {legends}
      </>
    )
  const cause = (c: string, floor: number) =>
    c === 'synthesis' ? t('lost to the Synthesis Chamber') : c === 'captor' ? t('never ransomed') : t('fell on floor {n}', { n: floor })
  const level = state.facilities.memorial?.level ?? 1
  return (
    <div className="memorial">
      <p className="muted">{t('{n} names on the obelisk.', { n: graves.length })}</p>
      {level > 1 && <p className="muted small">{t('A well-kept Memorial (Lv {n}): each visit eases a mourner’s grief faster.', { n: level })}</p>}
      {graves.map((g) => (
        <div key={g.heroId} className="grave-row">
          <div className="grave-name">
            <b>{g.name}</b> <span className="muted small">{g.star}★ Lv{g.level}</span>
          </div>
          <div className="muted small">
            {cause(g.cause, g.floor)} · {t('day {n}', { n: accountDay(state, g.day) })} · {t('served {n} days', { n: g.daysServed })}
            {g.mourners.length > 0 && ` · ${t('mourned by {names}', { names: g.mourners.map((m) => shortName(state, m)).join(', ') })}`}
          </div>
          <div className="last-words">“{lastWords(state, g)}”</div>
          {heirlooms(state, g).map((h) => (
            <div key={h.itemId} className="muted small heirloom">
              {h.wielder
                ? t('Carried {item} — now in {name}’s hands.', { item: gearLabel(h.name), name: shortName(state, h.wielder.id) })
                : t('Carried {item} — it waits in the armory.', { item: gearLabel(h.name) })}
            </div>
          ))}
        </div>
      ))}
      {legends}
    </div>
  )
}

/**
 * Lane Q: the legends — the fallen of earlier worlds, carried into this one by a New Cycle
 * (lane O). Their names stand on a shelf of their own, newest world first, a statue marked.
 */
export function LegendsShelf({ state }: { state: GameState }) {
  const legends = endgameOf(state).legends
  if (legends.length === 0) return null
  const worlds = [...new Set(legends.map((l) => l.cycle))].sort((a, b) => b - a)
  return (
    <section className="legends-shelf" aria-label={t('Legends of earlier worlds')}>
      <h4 className="panel-sub">✦ {t('Legends of earlier worlds')}</h4>
      <p className="muted small">{t('They fell in a world that is gone. Their names came with you.')}</p>
      {worlds.map((w) => (
        <div key={w} className="legend-world">
          <div className="legend-world-name">{t('World {n}', { n: w + 1 })}</div>
          <div className="legend-row">
            {legends
              .filter((l) => l.cycle === w)
              .map((l) => (
                <div key={`${l.cycle}|${l.heroId}`} className={`legend ${l.statue ? 'statue' : ''}`} title={l.statue ? t('A statue stood for them') : undefined}>
                  <img className="px" src={heroBustUrl({ id: l.heroId, name: l.name, star: l.star, heroClass: l.heroClass, element: l.element, portraitToken: l.portraitToken })} width={32} height={32} alt="" />
                  <span>
                    <b>{l.name}</b> {l.statue && <span className="legend-statue">🗿</span>}
                    <span className="muted small">
                      {' '}
                      {l.star}★ Lv{l.level} · {l.cause === 'synthesis' ? t('lost to the Synthesis Chamber') : l.cause === 'captor' ? t('never ransomed') : t('fell on floor {n}', { n: l.floor })}{l.bestFloor > 0 && ` · ${t('best floor {n}', { n: l.bestFloor })}`}
                    </span>
                  </span>
                </div>
              ))}
          </div>
        </div>
      ))}
    </section>
  )
}

/** Gear names come from the engine in English ("S Blade", "Aria's Oath-Blade"). */
function gearLabel(name: string): string {
  const oath = /^(.+)'s Oath-(\w+)$/.exec(name)
  if (oath) return t("{who}'s Oath-{noun}", { who: oath[1]!, noun: t(oath[2]!) })
  const plain = /^(\S+) (Blade|Plate|Charm)$/.exec(name)
  if (plain) return t('{grade} {noun}', { grade: plain[1]!, noun: t(plain[2]!) })
  return t(name)
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
