/**
 * Lane Q: the guild's weekly fights, readable and on stage.
 *
 * - **Guild raid:** a sheet with the boss (its own big sprite, lane I's bar look), its HP
 *   and who fights beside you this week; the battle plays behind the guild's banner; then a
 *   results ceremony (lane K's timeline helpers): the banner, the boss's HP falling in two
 *   colours (your party, then your guildmates), the contribution board — each of your heroes
 *   and each simulated guildmate — and the haul counting up.
 * - **Server war:** the enemy guild's banner, its three squads, then the three battles in
 *   turn and a scoreboard you can rewatch.
 */
import { useMemo, useState } from 'react'
import type { GameState, OwnedHero } from '../../engine/types'
import type { Store } from '../../engine/store'
import { guildRaidWithResult, serverWarWithResult } from '../../engine/store'
import { TUNING } from '../../engine/tuning'
import { guildById, guildmates, pvpReady, worldWeek, type GuildRaidOutcome, type WarBattle } from '../../engine/pvp'
import { toWorldTime } from '../../engine/time'
import { PixelWindow } from '../kit'
import { cpOf } from '../bits'
import { enemyUrl } from '../pixel/sprites'
import { useReducedMotion } from '../motion'
import { getSettings } from '../qol/settings'
import { ceremonyPlan, countUp, stepAt } from '../results/ceremony'
import { useCeremony } from '../results/useCeremony'
import { t } from '../i18n/i18n'
import { CrestImg } from './RivalCardView'
import { contributionRows, raidTotals, type RivalCard } from './pvpModel'
import { playOnStage } from './stageBus'
import './pvp.css'

const G = TUNING.guild

/** The party members who would fight (the guild's fights take the party as it stands). */
function fighters(state: GameState): OwnedHero[] {
  return state.party.slots.map((id) => (id ? state.heroes[id] : undefined)).filter((h): h is OwnedHero => pvpReady(state, h))
}

// ─────────────────────────────────────────────────────────────────────────────
// The guild raid
// ─────────────────────────────────────────────────────────────────────────────

export function GuildRaidScreen({ state, store, onClose }: { state: GameState; store: Store; onClose: () => void }) {
  const [result, setResult] = useState<GuildRaidOutcome | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const g = guildById(state.pvp.guild)
  const week = worldWeek(toWorldTime(Date.now()))
  const done = state.pvp.guildRaidWeek === week
  const party = fighters(state)
  const hpGuess = Math.round(party.reduce((n, h) => n + cpOf(h, state), 0) * G.raidBossHpPerCp)
  const mates = guildmates(state)
  const card: RivalCard = {
    kind: 'guild',
    name: t('Guild Colossus'),
    guildId: state.pvp.guild,
    guildName: g?.name ?? null,
    whale: false,
    floor: null,
    rating: null,
    line: 'The whole guild strikes it this week. Every blow counts.',
  }

  function go() {
    setErr(null)
    try {
      const out = guildRaidWithResult(store.getState(), Date.now())
      store.dispatch({ type: 'GUILD_RAID' }, Date.now())
      playOnStage({
        card,
        logs: [out.outcome.log],
        banner: { win: t('THE COLOSSUS FALLS'), lose: t('TIME!'), sub: t('Your guildmates strike next.') },
        onDone: () => setResult(out.outcome),
      })
    } catch (e) {
      setErr(t(e instanceof Error ? e.message.replace(/^\w+: /, '') : 'That failed'))
    }
  }

  return (
    <PixelWindow title={t('Guild raid')} icon="⚑" onClose={onClose} wide>
      {result ? (
        <GuildRaidResults outcome={result} onReplay={() => playOnStage({ card: null, logs: [result.log], banner: { win: t('THE COLOSSUS FALLS'), lose: t('TIME!') } })} onDone={onClose} />
      ) : (
        <div className="guild-raid">
          <div className="gr-boss">
            <img className="px gr-sprite" src={enemyUrl('Fragment Colossus', 'dark')} alt="" />
            <div className="gr-boss-info">
              <div className="boss-bar pframe gr-bar">
                <div className="bb-head">
                  <span className="bb-name">{t('Guild Colossus')}</span>
                  <span className="bb-epithet">{t('the guild’s weekly quarry')}</span>
                </div>
                <div className="bb-track hpbar">
                  <span className="hp-fill" style={{ width: '100%' }} />
                </div>
              </div>
              <div className="muted small">
                {t('HP about {hp} (grows with your party). The party fights it for {n} ticks; then your guildmates strike.', { hp: hpGuess.toLocaleString(), n: G.raidTicks })}
              </div>
              <div className="muted small">
                {t('Fell it: +{gold} gold, +{gems} gems, and a chance at a Book of Reverse Heaven ({p}%). Short of that, gold for the damage done.', {
                  gold: G.raidGold.toLocaleString(),
                  gems: G.raidGems,
                  p: Math.round(G.raidBookChance * 100),
                })}
              </div>
            </div>
          </div>
          <h4 className="panel-sub">{t('Fighting beside you this week')}</h4>
          <div className="gr-mates">
            {mates.map((m) => (
              <span key={m.id} className="gr-mate">
                <CrestImg guildId={state.pvp.guild} scale={1} /> {m.name} <span className="muted small">{m.rating}</span>
              </span>
            ))}
          </div>
          <h4 className="panel-sub">{t('Your party')}</h4>
          <div className="gr-mates">
            {party.length === 0 && <span className="muted small">{t('No one in the party can go.')}</span>}
            {party.map((h) => (
              <span key={h.id} className="gr-mate hero">
                {h.name.split(' ')[0]} <span className="muted small">{cpOf(h, state).toLocaleString()}</span>
              </span>
            ))}
          </div>
          <div className="rs-actions">
            <span className="spacer" />
            <button className="pbtn danger" disabled={done || party.length === 0} onClick={go}>
              ⚔ {t('Raid the Colossus')} ▸
            </button>
          </div>
          {done && <div className="muted small rs-why">{t('The guild has already raided this week.')}</div>}
          {err && <div className="lr-action-note" style={{ color: 'var(--bad)' }}>{err}</div>}
        </div>
      )}
    </PixelWindow>
  )
}

/** The guild raid's results ceremony. */
export function GuildRaidResults({ outcome, onReplay, onDone }: { outcome: GuildRaidOutcome; onReplay: () => void; onDone: () => void }) {
  const reduced = useReducedMotion()
  const [speed] = useState(() => getSettings().battleSpeed)
  const drops = (outcome.gems > 0 ? 1 : 0) + (outcome.book ? 1 : 0)
  const plan = useMemo(
    () =>
      ceremonyPlan(
        { won: outcome.felled, anchor: outcome.felled, firstClear: false, gold: outcome.gold, xp: 0, drops, rareDrops: outcome.book ? [drops - 1] : [], hidden: 0, skills: [], fallen: 0 },
        { speed, reduced },
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [outcome],
  )
  const { elapsed, done, skip } = useCeremony(plan)
  const at = (id: string) => {
    const s = plan.steps.find((x) => x.id === id)
    return s ? stepAt(s, elapsed) : { phase: 'done' as const, progress: 1 }
  }
  const rows = useMemo(() => contributionRows(outcome.log, outcome.roster, outcome.bossHp), [outcome])
  const totals = raidTotals(outcome.dealt, outcome.mates, outcome.bossHp)
  const fill = at('gold').progress
  const top = rows[0]?.dealt ?? 1
  return (
    <div className={`guild-results ${done ? 'done' : ''}`} onClick={() => !done && skip()}>
      <div className={`gres-banner ${outcome.felled ? 'win' : 'lose'} ${at('banner').phase}`}>
        {outcome.felled ? t('THE COLOSSUS FALLS!') : t('IT STILL STANDS')}
        <span className="banner-sub">{outcome.felled ? t('The guild brought it down together.') : t('Next week, then.')}</span>
      </div>
      <div className="gres-hp" aria-label={t('The boss’s HP')}>
        <span className="gres-seg party" style={{ width: `${totals.party * 100 * Math.min(1, fill * 2)}%` }} />
        <span className="gres-seg mates" style={{ width: `${totals.mates * 100 * Math.max(0, fill * 2 - 1)}%` }} />
        <span className="gres-hp-text">
          {t('Your party {a} · your guildmates {b} · of {hp}', { a: outcome.dealt.toLocaleString(), b: outcome.mates.toLocaleString(), hp: outcome.bossHp.toLocaleString() })}
        </span>
      </div>
      <div className="gres-loot">
        <span className={`gres-gold ${at('gold').phase}`}>+{countUp(outcome.gold, at('gold').progress).toLocaleString()} ◆</span>
        {outcome.gems > 0 && <span className={`gres-drop ${at('drop:0').phase}`}>+{outcome.gems} ♦</span>}
        {outcome.book && <span className={`gres-drop legendary ${at(`drop:${drops - 1}`).phase}`}>📕 {t('Book of Reverse Heaven')}</span>}
      </div>
      <div className={`gres-board ${at('report').phase}`}>
        <h4 className="panel-sub">{t('Who struck the Colossus')}</h4>
        <ol className="gres-rows">
          {rows.map((r) => (
            <li key={`${r.kind}|${r.id}`} className={`gres-row ${r.kind}`}>
              <span className="gres-name">
                {r.kind === 'mate' ? <span className="gres-tag">{t('guildmate')}</span> : <span className="gres-tag you">{t('yours')}</span>} {r.name}
              </span>
              <span className="gres-bar">
                <span style={{ width: `${Math.max(1, (r.dealt / top) * 100)}%` }} />
              </span>
              <span className="gres-num">
                {r.dealt.toLocaleString()} <span className="muted small">{Math.round(r.share * 100)}%</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
      <div className="rs-actions">
        <button className="pbtn ghost" onClick={(e) => (e.stopPropagation(), onReplay())}>
          ▸ {t('Watch again')}
        </button>
        <span className="spacer" />
        <button className="pbtn primary" onClick={(e) => (e.stopPropagation(), onDone())}>
          {t('Back to the guild hall')}
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The server war
// ─────────────────────────────────────────────────────────────────────────────

const ROMAN = ['I', 'II', 'III']

export function ServerWarScreen({ state, store, onClose }: { state: GameState; store: Store; onClose: () => void }) {
  const [war, setWar] = useState<{ wins: number; enemyGuild: string; enemyGuildId: string; battles: WarBattle[] } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const week = worldWeek(toWorldTime(Date.now()))
  const done = state.pvp.warWeek === week
  const party = fighters(state)
  const banner = { win: t('BATTLE WON'), lose: t('BATTLE LOST'), sub: t('Nobody dies in PvP.') }

  function go() {
    setErr(null)
    try {
      const out = serverWarWithResult(store.getState(), Date.now())
      store.dispatch({ type: 'SERVER_WAR' }, Date.now())
      const g = guildById(out.enemyGuildId)
      playOnStage({
        card: { kind: 'war', name: t(out.enemyGuild), guildId: out.enemyGuildId, guildName: null, whale: g?.whale ?? false, floor: null, rating: null, line: 'Three squads. Win two and the war is yours.' },
        logs: out.battles.map((b) => b.log),
        banner,
        onDone: () => setWar(out),
      })
    } catch (e) {
      setErr(t(e instanceof Error ? e.message.replace(/^\w+: /, '') : 'That failed'))
    }
  }

  return (
    <PixelWindow title={t('Server war')} icon="⚔" onClose={onClose} wide>
      <div className="server-war">
        <div className="ta-row">
          <span>{t('Your guild’s record')}</span>
          <span className="ta-val">
            {state.pvp.war.wins}W · {state.pvp.war.losses}L
          </span>
        </div>
        {war ? (
          <>
            <div className="sw-head">
              <CrestImg guildId={war.enemyGuildId} scale={2} />
              <div>
                <div className={`gres-banner ${war.wins >= 2 ? 'win' : 'lose'} done`}>{war.wins >= 2 ? t('THE WAR IS WON') : t('THE WAR IS LOST')}</div>
                <div className="muted">{t('Against {guild}: {wins}/3 battles won · +{gems} gems', { guild: t(war.enemyGuild), wins: war.wins, gems: G.warGems[war.wins] ?? 0 })}</div>
              </div>
            </div>
            <ol className="sw-rows">
              {war.battles.map((b, i) => (
                <li key={i} className={`sw-row ${b.won ? 'win' : 'lose'}`}>
                  <b>{t('Squad {n}', { n: ROMAN[i]! })}</b>
                  <span className="muted small">{t('×{m} your strength', { m: b.ratio.toFixed(2) })}</span>
                  <span className="sw-res">{b.won ? t('won') : t('lost')}</span>
                  <button className="pbtn sm ghost" onClick={() => playOnStage({ card: null, logs: [b.log], banner })}>
                    ▸ {t('Watch')}
                  </button>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <>
            <p className="muted">{t('Your party fights three squads from a rival guild, one after another. Win two and the war is yours.')}</p>
            <ol className="sw-rows">
              {G.warRatios.map((r, i) => (
                <li key={i} className="sw-row">
                  <b>{t('Squad {n}', { n: ROMAN[i]! })}</b>
                  <span className="muted small">{t('×{m} your strength', { m: r.toFixed(2) })}</span>
                </li>
              ))}
            </ol>
            <div className="muted small">{t('Rewards by battles won: {list} gems.', { list: G.warGems.join(' / ') })}</div>
            <div className="rs-actions">
              <span className="spacer" />
              <button className="pbtn danger" disabled={done || party.length === 0} onClick={go}>
                ⚔ {t('Go to war')} ▸
              </button>
            </div>
            {done && <div className="muted small rs-why">{t('This week’s war is over.')}</div>}
          </>
        )}
        {err && <div className="lr-action-note" style={{ color: 'var(--bad)' }}>{err}</div>}
      </div>
    </PixelWindow>
  )
}
