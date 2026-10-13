import type { GameState, HeroId, Nemesis, OwnedHero } from '../../engine/types'
import type { Store } from '../../engine/store'
import { TUNING } from '../../engine/tuning'
import { echoesOf, killerOf, legacyPct } from '../../engine/legacy'
import { t } from '../i18n/i18n'
import { UpgradeControl } from '../facilityPanels'
import { HereNow } from '../life/lifePanels'
import { accountDay, eulogy, lastWords, shortName } from '../life/speech'
import { BequestCard, heirOf } from './BequestCard'
import { EchoList } from './EchoList'
import { RecruitBell } from './RecruitBell'
import { baneName, baneWhere, firstName, lessonLine, pctNum } from './legacyText'
import './legacy.css'

/**
 * The Memorial (spec 2026-10-12 S21-S23): what the fallen leave behind. The obelisk's
 * bonus, the Echoes waiting for an heir, the new faces at the bell, the Banes still in the
 * tower, who carries whom, and a plaque for every grave (how they died, what it taught,
 * what a friend says of them, their last words).
 *
 * Note: facilityPanels imports this module and this module imports UpgradeControl from
 * facilityPanels. The cycle is safe because each side only uses the other at render time.
 */
export function MemorialPanel({ state, store, onProfile }: { state: GameState; store: Store; onProfile?: (id: string) => void }) {
  const legacy = state.life.legacy
  const carriers = Object.values(state.heroes).filter((h) => h.alive && echoesOf(h).length > 0)
  return (
    <>
      <UpgradeControl state={state} store={store} facility="memorial" />
      <ObeliskLine state={state} />
      {legacy.pending.length > 0 && (
        <>
          <h4 className="panel-sub">{t('Echoes waiting for an heir')}</h4>
          {legacy.pending.map((p) => (
            <BequestCard key={p.fallenId} state={state} store={store} fallenId={p.fallenId} inMemorial />
          ))}
        </>
      )}
      {legacy.recruitTokens > 0 && <h4 className="panel-sub">{t('New faces at the bell')}</h4>}
      <RecruitBell state={state} store={store} />
      {legacy.nemeses.length > 0 && (
        <>
          <h4 className="panel-sub">{t('Banes')}</h4>
          <BaneList state={state} />
        </>
      )}
      {carriers.length > 0 && (
        <>
          <h4 className="panel-sub">{t('Echoes carried')}</h4>
          <CarrierList state={state} carriers={carriers} onProfile={onProfile} />
        </>
      )}
      <h4 className="panel-sub">{t('Visiting now')}</h4>
      <HereNow state={state} place="memorial" onProfile={onProfile} empty="No one is visiting." />
      <GraveList state={state} />
    </>
  )
}

/** "The tower remembers: +2% to every stat." Silent until a fallen climber earns a plaque. */
function ObeliskLine({ state }: { state: GameState }) {
  const pct = legacyPct(state)
  if (pct <= 0) return null
  const capped = pct >= TUNING.legacy.memorial.capPct
  return (
    <div className="obelisk-line">
      <span className="ob-flame">🕯</span>
      <div>
        <div>{t('The tower remembers: +{pct}% to every stat.', { pct: pctNum(pct) })}</div>
        <div className="muted small">
          {capped
            ? t('The obelisk is full of names. Its strength can grow no further.')
            : t('Each hero who fell in the climb lends the living +{each}%, up to +{cap}%.', {
                each: pctNum(TUNING.legacy.memorial.pctPerPlaque),
                cap: pctNum(TUNING.legacy.memorial.capPct),
              })}
        </div>
      </div>
    </div>
  )
}

/** The Banes: waiting first (soonest floor first), then the avenged. */
export function BaneList({ state }: { state: GameState }) {
  const rank = (n: Nemesis) => (n.status === 'waiting' ? 0 : 1)
  const banes = [...state.life.legacy.nemeses].sort((a, b) => rank(a) - rank(b) || a.revengeFloor - b.revengeFloor)
  return (
    <div className="bane-list">
      {banes.map((n) => (
        <div key={n.id} className={`bane-row ${n.status}`}>
          <span className="bane-skull">{n.status === 'avenged' ? '✓' : '☠'}</span>
          <div>
            <div>
              <b>{baneName(n)}</b> <span className="muted small">{t('{enemy} · Lv{level}', { enemy: t(n.name), level: n.level })}</span>
            </div>
            <div className="muted small">
              {t('Struck {name} down on floor {floor}.', { name: firstName(n.heroName), floor: n.diedFloor })} · {baneWhere(state, n)}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function CarrierList({ state, carriers, onProfile }: { state: GameState; carriers: OwnedHero[]; onProfile?: (id: string) => void }) {
  return (
    <div className="carrier-list">
      {carriers.map((h) => (
        <div key={h.id} className="carrier-row">
          <button className="linkish" onClick={() => onProfile?.(h.id)}>
            {shortName(state, h.id)}
          </button>
          <EchoList hero={h} />
        </div>
      ))}
    </div>
  )
}

/** The Memorial: every grave, with how they died, what it taught, and the words left behind. */
export function GraveList({ state }: { state: GameState }) {
  const graves = [...state.life.memorial].reverse()
  if (graves.length === 0) return <div className="lr-empty">{t('The lawn is empty. Keep it that way, Master.')}</div>
  const cause = (c: string, floor: number) =>
    c === 'synthesis' ? t('lost to the Synthesis Chamber') : c === 'captor' ? t('never ransomed') : t('fell on floor {n}', { n: floor })
  return (
    <div className="memorial">
      <p className="muted">{t('{n} names on the obelisk.', { n: graves.length })}</p>
      {graves.map((g) => {
        const killer = killerOf(g)
        const words = eulogy(state, g)
        const heir = heirOf(state, g.heroId as HeroId)
        const waiting = state.life.legacy.pending.some((p) => p.fallenId === g.heroId)
        return (
          <div key={g.heroId} className="grave-row">
            <div className="grave-name">
              <b>{g.name}</b> <span className="muted small">{t('{star}★ Lv{level}', { star: g.star, level: g.level })}</span>
            </div>
            <div className="muted small">
              {cause(g.cause, g.floor)} · {t('day {n}', { n: accountDay(state, g.day) })} · {t('served {n} days', { n: g.daysServed })}
              {g.mourners.length > 0 && ` · ${t('mourned by {names}', { names: g.mourners.map((m) => shortName(state, m)).join(', ') })}`}
            </div>
            {killer && (
              <div className="plaque-line">
                <span className="pl-k">{t('How they died')}</span> {t('struck down by the {enemy} (Lv{level})', { enemy: t(killer.name), level: killer.level })}
              </div>
            )}
            {killer && lessonLine(killer) && (
              <div className="plaque-line">
                <span className="pl-k">{t('What it taught')}</span> {lessonLine(killer)}
              </div>
            )}
            {(heir || waiting) && (
              <div className="plaque-line">
                <span className="pl-k">{t('Their echo')}</span>{' '}
                {heir ? t('carried by {name}', { name: shortName(state, heir.id) }) : t('waiting for an heir')}
              </div>
            )}
            {words && (
              <div className="eulogy">
                — {shortName(state, words.by)}: “{words.line}”
              </div>
            )}
            <div className="last-words">“{lastWords(state, g)}”</div>
          </div>
        )
      })}
    </div>
  )
}
