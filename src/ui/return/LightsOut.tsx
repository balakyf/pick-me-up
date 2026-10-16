import type { GameState, HeroId } from '../../engine/types'
import { TUNING } from '../../engine/tuning'
import { toWorldTime } from '../../engine/time'
import { PixelWindow, Gauge } from '../kit'
import { iselBustUrl } from '../pixel/sprites'
import { PLACE_LABEL, type PlaceId } from '../world/lobbyMap'
import { shortName } from '../life/speech'
import { t, fmt } from '../i18n/i18n'
import { baneName, enemyName } from '../legacy/legacyText'
import { brewingTimers, edgeRelation, goalBars, iselSignoff, nextFloorTeaser, restedOutlook, skillName, type Brewing, type GoalBar } from './lightsOut'
import { clockAt, countdown } from './format'
import './return.css'

const FACTOR = TUNING.time.worldTimeFactor

const THREAT_PHRASE: Record<string, string> = {
  safe: 'looks safe',
  fair: 'looks like a fair fight',
  risky: 'looks risky',
  deadly: 'looks deadly',
}

function brewingText(state: GameState, b: Brewing): string {
  const who = b.heroId ? shortName(state, b.heroId as HeroId) : ''
  switch (b.kind) {
    case 'promotion':
      return t('{a}’s promotion', { a: who })
    case 'training':
      return t('{a} drilling {skill}', { a: who, skill: t(skillName(b.skillId)) })
    case 'expedition':
      return t('{a} in the Ruins', { a: who })
    case 'build':
      return t('{place} upgrade', { place: t(PLACE_LABEL[b.place]) })
  }
}

function goalText(g: GoalBar): string {
  switch (g.key) {
    case 'summon':
      return t('Next summon: {n} gold to go', { n: fmt(g.vars.n!) })
    case 'boss':
      return g.vars.n === 1 ? t('F{floor} boss: the very next floor', { floor: g.vars.floor! }) : t('F{floor} boss: {n} floors to go', { floor: g.vars.floor!, n: g.vars.n! })
    case 'master':
      return t('Master Lv {level}', { level: g.vars.level! })
    case 'stamps':
      return t('Stamp card {n}/{of}', { n: g.vars.n!, of: g.vars.of! })
  }
}

/**
 * Lights Out — "a good place to stop" (spec 2026-10-12 S27). An open loop for next time
 * (the next floor's real scouting teaser, what is brewing, a friendship one evening away,
 * the goals within reach) and a warm goodbye from Isel. Read-only: it never dispatches.
 */
export function LightsOut({
  state,
  nowReal,
  onGo,
  onClose,
  onBackup,
}: {
  state: GameState
  nowReal: number
  onGo: (p: PlaceId) => void
  onClose: () => void
  /** Open the backup window (a good moment to keep a copy of the save). */
  onBackup?: () => void
}) {
  const nowWorld = toWorldTime(nowReal)
  const teaser = nextFloorTeaser(state)
  const brewing = brewingTimers(state, nowWorld, 3)
  const edge = edgeRelation(state)
  const goals = goalBars(state)
  const rested = restedOutlook(state)
  const go = (p: PlaceId) => {
    onClose()
    onGo(p)
  }
  return (
    <PixelWindow title={t('A good place to stop')} icon="☾" onClose={onClose}>
      <div className="lights-out">
        {teaser && (
          <div className="lo-section">
            <h4 className="panel-sub">{t('Next time')}</h4>
            <button className="wb-line" onClick={() => go('tower')}>
              <span className="wb-icon">⛫</span>
              <span className="wb-text">
                <b>{t('Floor {n}', { n: teaser.floor })}</b> · {t(teaser.mission)}
                {teaser.threat && ` · ${t(THREAT_PHRASE[teaser.threat]!)}`}
                {/* Each hook is its own sentence after the headline (the reasons already end in a full stop). */}
                {teaser.nemesis ? (
                  <span className="lo-hook">. {t('{bane} waits there.', { bane: enemyName(teaser.nemesis) })}</span>
                ) : teaser.namedThreat ? (
                  <span className="lo-hook">. {enemyName(teaser.namedThreat.name)} — {t(teaser.namedThreat.why)}</span>
                ) : teaser.headline ? (
                  <span className="lo-hook">
                    {'. '}
                    {teaser.headline.count > 1
                      ? t('{enemy} ×{n} wait there.', { enemy: enemyName(teaser.headline.name), n: teaser.headline.count })
                      : t('{enemy} waits there.', { enemy: enemyName(teaser.headline.name) })}
                  </span>
                ) : null}
                {teaser.laterBane && (
                  <span className="lo-hook lo-bane">
                    {teaser.nemesis || teaser.namedThreat || teaser.headline ? ' ' : '. '}☠ {t('{bane} waits on floor {n}.', { bane: baneName(teaser.laterBane), n: teaser.laterBane.floor })}
                  </span>
                )}
              </span>
              <span className="wb-go" aria-hidden="true">›</span>
            </button>
          </div>
        )}

        {brewing.length > 0 && (
          <div className="lo-section">
            <h4 className="panel-sub">{t('Brewing')}</h4>
            {brewing.map((b) => {
              const doneReal = b.completesAtWorld / FACTOR
              return (
                <button key={b.key} className="wb-line" onClick={() => go(b.place)}>
                  <span className="wb-icon">⧗</span>
                  <span className="wb-text">
                    {brewingText(state, b)} · <span className="muted">{t('ready at {time} (in {left})', { time: clockAt(doneReal), left: countdown(doneReal - nowReal) })}</span>
                  </span>
                  <span className="wb-go" aria-hidden="true">›</span>
                </button>
              )
            })}
          </div>
        )}

        {edge && (
          <div className="lo-section">
            <h4 className="panel-sub">{t('On the edge')}</h4>
            <button className="wb-line" onClick={() => go('tavern')}>
              <span className="wb-icon">♥</span>
              <span className="wb-text">
                {edge.toward === 'friends'
                  ? edge.evenings === 1
                    ? t('{a} and {b}: one good evening from friends.', { a: shortName(state, edge.a), b: shortName(state, edge.b) })
                    : t('{a} and {b}: a few good evenings from friends.', { a: shortName(state, edge.a), b: shortName(state, edge.b) })
                  : edge.evenings === 1
                    ? t('{a} and {b}: one good evening from inseparable.', { a: shortName(state, edge.a), b: shortName(state, edge.b) })
                    : t('{a} and {b}: a few good evenings from inseparable.', { a: shortName(state, edge.a), b: shortName(state, edge.b) })}
              </span>
              <span className="wb-go" aria-hidden="true">›</span>
            </button>
          </div>
        )}

        <div className="lo-section">
          <h4 className="panel-sub">{t('Within reach')}</h4>
          {goals.map((g) => (
            <button key={g.key} className="lo-goal" onClick={() => go(g.place)}>
              <span className="lo-goal-label">{goalText(g)}</span>
              <Gauge pct={(g.value / Math.max(1, g.max)) * 100} color="var(--gold)" />
            </button>
          ))}
          <div className="muted lo-rested">
            ⟡{' '}
            {rested.nextInRealMs === null
              ? t('Interference is full: your next {n} floor clears pay double gold.', { n: rested.charges })
              : t('While you rest, Interference builds: {n}/{max} stored, the next in {left}. Each doubles one floor’s gold.', {
                  n: rested.charges,
                  max: rested.max,
                  left: countdown(rested.nextInRealMs),
                })}
          </div>
        </div>

        <div className="wb-isel lo-isel">
          <img className="px" src={iselBustUrl()} width={40} height={40} alt="" />
          <p className="wb-greeting">“{t(iselSignoff(state))}”</p>
        </div>
        <div className="wb-foot">
          {onBackup && (
            <button className="pbtn" onClick={onBackup}>
              💾 {t('Back up your save')}
            </button>
          )}
          <button className="btn primary" onClick={onClose}>
            {t('Good night, Isel')}
          </button>
        </div>
      </div>
    </PixelWindow>
  )
}
