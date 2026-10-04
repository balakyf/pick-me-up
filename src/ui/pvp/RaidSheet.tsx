/**
 * Lane Q: the pre-battle sheet for a raid on a rival's lobby (or a counter-raid to free a
 * held hero). Who they are (banner, guild, floor, rating), what their defense is worth
 * against the team, what a win takes and what it costs; then the team, picked in the shared
 * HeroPicker (lane N). Go plays the battle on stage behind the rival's title card.
 */
import { useMemo, useState } from 'react'
import type { GameState, HeroId, OwnedHero } from '../../engine/types'
import type { Store } from '../../engine/store'
import { counterRaidWithResult, raidWithResult } from '../../engine/store'
import { TUNING } from '../../engine/tuning'
import { counterRaidRefusal, guildById, raidRefusal, type RivalMaster } from '../../engine/pvp'
import { PVP_STAGE } from '../../engine/pvp/tuning'
import { toWorldTime } from '../../engine/time'
import { PixelWindow } from '../kit'
import { cpOf, Portrait } from '../bits'
import { HeroPicker } from '../hero/HeroPicker'
import { HeroTag, pickerName } from '../hero/heroLabel'
import { t } from '../i18n/i18n'
import { CrestImg } from './RivalCardView'
import { autoTeam, pvpRefusal, raidCard, toggleTeam } from './pvpModel'
import { playOnStage } from './stageBus'
import './pvp.css'

const P = TUNING.pvp

export interface RaidSheetProps {
  state: GameState
  store: Store
  rival: RivalMaster
  /** A counter-raid frees this held hero (the captor's defense is stronger). */
  freeing?: OwnedHero
  onClose: () => void
  /** What came of it, for the panel's note (already translated). */
  onResult?: (note: string) => void
}

export function RaidSheet({ state, store, rival, freeing, onClose, onResult }: RaidSheetProps) {
  const [team, setTeam] = useState<HeroId[]>(() => autoTeam(state, PVP_STAGE.teamMax, (h) => cpOf(h, state)))
  const [err, setErr] = useState<string | null>(null)
  const nowWorld = toWorldTime(Date.now())
  const counter = freeing !== undefined
  const g = guildById(rival.guildId || null)
  const teamCp = useMemo(() => team.reduce((n, id) => n + (state.heroes[id] ? cpOf(state.heroes[id]!, state) : 0), 0), [team, state])
  const mult = (counter ? P.counterCpMult : rival.cpRatio) * (rival.whale ? P.whaleCpMult : 1)
  const why = counter ? counterRaidRefusal(state, freeing.id, team) : raidRefusal(state, rival.id, nowWorld, team)
  const odds = mult <= 0.9 ? 'good' : mult <= 1.15 ? 'even' : 'hard'

  function go() {
    setErr(null)
    try {
      const pre = store.getState()!
      if (counter) {
        const out = counterRaidWithResult(pre, freeing.id, Date.now(), team)
        store.dispatch({ type: 'COUNTER_RAID', heroId: freeing.id, heroIds: team }, Date.now())
        onClose()
        onResult?.(out.won ? t('You stormed {rival}’s lobby and freed {name}.', { rival: rival.name, name: freeing.name }) : t('{rival}’s defense held: {name} is still theirs.', { rival: rival.name, name: freeing.name }))
        playOnStage({
          card: raidCard(rival, 'counter', freeing.name),
          logs: [out.log],
          banner: { win: t('FREED'), lose: t('DRIVEN BACK'), sub: t('Nobody dies in PvP.') },
        })
      } else {
        const out = raidWithResult(pre, rival.id, Date.now(), team)
        store.dispatch({ type: 'RAID_RIVAL', rivalId: rival.id, heroIds: team }, Date.now())
        onClose()
        const o = out.outcome
        onResult?.(
          o.won
            ? t('You raided {rival}: +{gold} gold, +{stones} stones', { rival: rival.name, gold: o.gold.toLocaleString(), stones: o.stones }) +
                (o.captive ? t(', and took {name} captive.', { name: o.captive.name }) : '.')
            : t("{rival}'s defense drove you back.", { rival: rival.name }),
        )
        playOnStage({
          card: raidCard(rival, 'raid'),
          logs: [o.log],
          banner: { win: t('RAID WON'), lose: t('DRIVEN BACK'), sub: t('Nobody dies in PvP.') },
        })
      }
    } catch (e) {
      setErr(t(e instanceof Error ? e.message.replace(/^\w+: /, '') : 'That failed'))
    }
  }

  return (
    <PixelWindow title={counter ? t('Counter-raid {rival}', { rival: rival.name }) : t('Raid {rival}', { rival: rival.name })} icon="⚔" onClose={onClose} wide>
      <div className="raid-sheet">
        <div className="rs-head">
          <CrestImg guildId={rival.guildId || null} scale={2} />
          <div className="rs-who">
            <div className="rs-name">
              {rival.name} {rival.whale && <b className="pvp-whale">{t('WHALE')}</b>}
            </div>
            <div className="muted">
              {g ? t('of {guild}', { guild: t(g.name) }) : t('no guild')} · {t('F{n}', { n: rival.floor })} · {t('rating {n}', { n: rival.rating.toLocaleString() })}
            </div>
            {g && <div className="muted small">{t(g.blurb)}</div>}
          </div>
        </div>

        <div className="rs-grid">
          <div className="rs-box">
            <h4 className="panel-sub">{t('Their defense')}</h4>
            <div className={`rs-odds ${odds}`}>
              {t('about ×{m} your team’s strength', { m: mult.toFixed(2) })} · {odds === 'good' ? t('in your favour') : odds === 'even' ? t('an even fight') : t('a hard fight')}
            </div>
            <div className="muted small">
              {t('Your team: {cp} CP · theirs: about {theirs} CP', { cp: teamCp.toLocaleString(), theirs: Math.round(teamCp * mult).toLocaleString() })}
            </div>
            {rival.whale && <div className="muted small">{t('Whales: strong, and brittle. They panic when it turns.')}</div>}
          </div>
          <div className="rs-box">
            <h4 className="panel-sub">{t('The stakes')}</h4>
            {counter ? (
              <ul className="rs-list">
                <li>{t('Win: {name} comes home, free.', { name: freeing.name })}</li>
                <li>{t('Lose: they keep {name} until the deadline.', { name: freeing.name })}</li>
              </ul>
            ) : (
              <ul className="rs-list">
                <li>{t('Win: +{gold} gold and +{stones} stones from their storeroom.', { gold: (P.lootGoldPerFloor * rival.floor).toLocaleString(), stones: P.lootStones })}</li>
                <li>{t('A fallen defender at Lv{n}+ may be carried off ({p}%).', { n: P.protectionLevel, p: Math.round(P.kidnapChance * 100) })}</li>
                <li>{t('Rating: +{w} for a win, −{l} for a loss.', { w: P.ratingWin, l: P.ratingLoss })}</li>
              </ul>
            )}
            <div className="muted small">{t('Each raider loses {n} Sanity. Nobody dies in PvP.', { n: P.raidSanity })}</div>
          </div>
        </div>

        <h4 className="panel-sub">
          {t('The team')} · {team.length}/{PVP_STAGE.teamMax}
        </h4>
        <div className="rs-team">
          {team.length === 0 && <span className="muted small">{t('Pick up to five heroes below.')}</span>}
          {team.map((id) => {
            const h = state.heroes[id]
            if (!h) return null
            return (
              <button key={id} type="button" className="rs-member" onClick={() => setTeam((cur) => toggleTeam(cur, id, PVP_STAGE.teamMax))} title={t('Take off the team')}>
                <Portrait hero={h} size="sm" />
                <span>
                  {pickerName(state, h)} <HeroTag hero={h} />
                </span>
                <span className="rs-x" aria-hidden="true">✕</span>
              </button>
            )
          })}
        </div>
        <HeroPicker
          state={state}
          selected={team}
          onPick={(id) => setTeam((cur) => toggleTeam(cur, id, PVP_STAGE.teamMax))}
          refusal={(h) => pvpRefusal(state, h) ?? (team.length >= PVP_STAGE.teamMax && !team.includes(h.id) ? 'The team is full.' : null)}
          note={(h) => (team.includes(h.id) ? t('#{n} on the team', { n: team.indexOf(h.id) + 1 }) : null)}
          label={t('Heroes who can go')}
          filter={{ availableOnly: true }}
        />
        <div className="rs-actions">
          <button className="pbtn ghost" onClick={() => setTeam(autoTeam(state, PVP_STAGE.teamMax, (h) => cpOf(h, state)))}>
            ✦ {t('The party')}
          </button>
          <button className="pbtn ghost" onClick={() => setTeam([])}>
            {t('Clear')}
          </button>
          <span className="spacer" />
          <button className="pbtn danger" disabled={why !== null} onClick={go}>
            ⚔ {counter ? t('Counter-raid') : t('Raid')} ▸
          </button>
        </div>
        {why && <div className="muted small rs-why">{t(why)}</div>}
        {err && <div className="lr-action-note" style={{ color: 'var(--bad)' }}>{err}</div>}
      </div>
    </PixelWindow>
  )
}
