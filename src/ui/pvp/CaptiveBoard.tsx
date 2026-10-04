/**
 * Lane Q: the captive/ransom chain on one clear screen. Your heroes held by raiders (who
 * holds them, the price, the deadline running out, ransom or counter-raid), the heroes you
 * took (ransom them back, or the dark path: synthesize them into one of yours), and the
 * chain itself in one line, so nobody is lost by surprise.
 */
import { useState } from 'react'
import type { Captive, GameState, HeroId, OwnedHero } from '../../engine/types'
import type { Store } from '../../engine/store'
import { TUNING } from '../../engine/tuning'
import { captorOf, guildById } from '../../engine/pvp'
import { toWorldTime } from '../../engine/time'
import { ELEMENT_VIS } from '../bits'
import { heroBustUrl } from '../pixel/sprites'
import { HeroPicker } from '../hero/HeroPicker'
import { awayReason } from '../hero/refusals'
import { t } from '../i18n/i18n'
import { CrestImg } from './RivalCardView'
import { RaidSheet } from './RaidSheet'
import { heldHeroes, type HeldRow } from './pvpModel'
import { timeLeftText } from './pvpText'
import './pvp.css'

const P = TUNING.pvp

export function CaptiveBoard({
  state,
  store,
  run,
  onNote,
}: {
  state: GameState
  store: Store
  run: (cmd: Parameters<Store['dispatch']>[0]) => boolean
  onNote?: (note: string) => void
}) {
  const nowWorld = toWorldTime(Date.now())
  const held = heldHeroes(state, nowWorld)
  const [counter, setCounter] = useState<HeldRow | null>(null)
  return (
    <div className="captive-board">
      <ol className="cb-chain" aria-label={t('How the kidnap chain works')}>
        <li>{t('A raid breaks your defense')}</li>
        <li>{t('Below Lv{n}: scarred, never taken', { n: P.protectionLevel })}</li>
        <li>{t('Lv{n}+: carried off for {d} world-days', { n: P.protectionLevel, d: Math.round(P.captiveMs / 86_400_000) })}</li>
        <li>{t('Ransom them, or storm the captor’s lobby')}</li>
        <li className="bad">{t('Too late: the captor synthesizes them. Gone.')}</li>
      </ol>

      <h4 className="panel-sub">{t('Your heroes, held by raiders')}</h4>
      {held.length === 0 && <div className="lr-empty">{t('No one has been taken.')}</div>}
      <div className="cb-cards">
        {held.map((row) => {
          const captor = captorOf(state, row.hero.captiveOf!)
          const g = guildById(captor.guildId || null)
          return (
            <div key={row.hero.id} className={`cb-card held ${row.deadline.urgent ? 'urgent' : ''}`}>
              <div className="cb-top">
                <img className="px cb-bust" src={heroBustUrl(row.hero)} width={48} height={48} alt="" />
                <div className="cb-who">
                  <b>{row.hero.name}</b> <span className="muted small">{row.hero.star}★ · {t('Lv{level}', { level: row.hero.xp.level })}</span>
                  <div className="cb-holder">
                    <CrestImg guildId={captor.guildId || null} scale={1} />
                    <span>
                      {t('held by {master}', { master: row.master })}
                      {g && <span className="muted small"> · {t(g.name)}</span>}
                    </span>
                  </div>
                </div>
              </div>
              <div className="cb-clock" title={t('Time until the captor synthesizes them')}>
                <span className="cb-bar">
                  <span style={{ width: `${Math.round(row.deadline.spent * 100)}%` }} />
                </span>
                <span className={row.deadline.urgent ? 'cb-left urgent' : 'cb-left'}>{t('synthesized in {n}', { n: timeLeftText(row.deadline.left) })}</span>
              </div>
              <div className="cb-price">
                {t('Ransom')}: <b className={state.gold >= row.ransomGold ? '' : 'short'}>{row.ransomGold.toLocaleString()} ◆</b> ·{' '}
                <b className={state.gems >= row.ransomGems ? '' : 'short'}>{row.ransomGems} ♦</b>
              </div>
              <div className="cb-actions">
                <button className="pbtn sm" disabled={!row.canPay} onClick={() => run({ type: 'RANSOM_HERO', heroId: row.hero.id })} title={row.canPay ? undefined : t('You cannot pay the ransom yet.')}>
                  {t('Pay the ransom')}
                </button>
                <button className="pbtn sm danger" disabled={!state.meta.crackOpen} onClick={() => setCounter(row)}>
                  ⚔ {t('Counter-raid…')}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <h4 className="panel-sub">{t('Heroes you took')}</h4>
      {state.pvp.captives.length === 0 && <div className="lr-empty">{t('Your cells are empty.')}</div>}
      <div className="cb-cards">
        {state.pvp.captives.map((c) => (
          <TakenCard key={c.id} captive={c} state={state} run={run} />
        ))}
      </div>

      {counter && (
        <RaidSheet
          state={state}
          store={store}
          rival={captorOf(state, counter.hero.captiveOf!)}
          freeing={counter.hero}
          onClose={() => setCounter(null)}
          onResult={onNote}
        />
      )}
    </div>
  )
}

function TakenCard({ captive, state, run }: { captive: Captive; state: GameState; run: (cmd: Parameters<Store['dispatch']>[0]) => boolean }) {
  const [choosing, setChoosing] = useState(false)
  const [into, setInto] = useState<HeroId | null>(null)
  const grades = captive.growthGrades
  return (
    <div className="cb-card taken">
      <div className="cb-top">
        <span className="cb-cell" aria-hidden="true">⛓</span>
        <div className="cb-who">
          <b>{captive.name}</b> <span className="muted small">{captive.star}★ · {t('Lv{level}', { level: captive.level })} · {t(ELEMENT_VIS[captive.element].label)}</span>
          <div className="muted small">
            {t('from {master}', { master: captive.fromMaster })} · {t('grades {g}', { g: `${grades.str}/${grades.agi}/${grades.vit}/${grades.int}/${grades.wil}` })}
          </div>
        </div>
      </div>
      <div className="cb-actions">
        <button className="pbtn sm" onClick={() => run({ type: 'RELEASE_CAPTIVE', captiveId: captive.id })}>
          {t('Ransom back +{ransomGold} ◆', { ransomGold: captive.ransomGold.toLocaleString() })}
        </button>
        <button className="pbtn sm ghost syn-destroy" onClick={() => setChoosing(!choosing)} aria-expanded={choosing}>
          {t('Synthesize into…')}
        </button>
      </div>
      {choosing && (
        <div className="cb-synth">
          <div className="muted small">
            {t('The dark path: {name} is fed into one of yours. Your heroes will know what you did (favor −{n} each).', { name: captive.name, n: P.captiveFavorLoss })}
          </div>
          <HeroPicker
            state={state}
            selected={into ? [into] : []}
            onPick={(id) => setInto(into === id ? null : id)}
            refusal={(h: OwnedHero) => awayReason(state, h)}
            label={t('Who receives it')}
            filter={{ availableOnly: true }}
          />
          <button
            className="pbtn sm danger syn-destroy"
            disabled={into === null}
            onClick={() => into && run({ type: 'SYNTHESIZE_CAPTIVE', captiveId: captive.id, survivorId: into }) && setChoosing(false)}
          >
            {t('Synthesize')}
          </button>
        </div>
      )}
    </div>
  )
}
