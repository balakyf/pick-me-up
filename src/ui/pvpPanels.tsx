/**
 * PvP and the guild (Layer 4), with lane Q's stage: every fight now plays as a battle behind
 * the rival's banner (ui/pvp/*). The panels stay the place to choose: whom to raid (a
 * pre-battle sheet with the shared hero picker), who defends, the captive chain on one
 * board, the log (each invasion watchable), and the guild hall.
 */
import { useState } from 'react'
import type { Command, GameState, OwnedHero } from '../engine/types'
import type { Store } from '../engine/store'
import { TUNING } from '../engine/tuning'
import { toWorldTime } from '../engine/time'
import {
  GUILDS,
  defenseSlots,
  guildById,
  guildmates,
  joinRefusal,
  raidRefusal,
  raidTargets,
  sectorOf,
  sectorRank,
  serverRank,
  worldWeek,
  type RivalMaster,
} from '../engine/pvp'
import { cachedDataUrl } from './pixel/render'
import { crestShield } from './pixel/crests'
import { HeroPicker } from './hero/HeroPicker'
import { t } from './i18n/i18n'
import { RaidSheet } from './pvp/RaidSheet'
import { CaptiveBoard } from './pvp/CaptiveBoard'
import { CrestImg } from './pvp/RivalCardView'
import { GuildRaidScreen, ServerWarScreen } from './pvp/GuildScreens'
import { watchInvasion } from './pvp/InvasionAlarm'
import { guildLook, pvpRefusal } from './pvp/pvpModel'
import { logNote, timeLeftText } from './pvp/pvpText'
import './pvp/pvp.css'

const P = TUNING.pvp

function useRunner(store: Store) {
  const [err, setErr] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  return {
    err,
    note,
    setNote,
    run(cmd: Command): boolean {
      setErr(null)
      try {
        store.dispatch(cmd, Date.now())
        return true
      } catch (e) {
        setErr(t(e instanceof Error ? e.message.replace(/^\w+: /, '') : 'That failed'))
        return false
      }
    },
  }
}

/** A guild's little shield (rows and chips). */
export function CrestShield({ guildId }: { guildId: string | null }) {
  const url = cachedDataUrl(`crestS|${guildId ?? 'lone'}`, () => crestShield(guildLook(guildId)))
  return url ? <img className="px pvp-shield" src={url} width={24} height={26} alt="" /> : <span className="pvp-shield" aria-hidden="true" />
}

/** The PvP side of the open crack: raid, defend, captives, the invasion log (Layer 4). */
export function PvpPanel({ state, store }: { state: GameState; store: Store }) {
  const [tab, setTab] = useState<'raid' | 'defense' | 'captives' | 'log'>(() =>
    (Object.values(state.heroes) as OwnedHero[]).some((h) => h.alive && h.captiveOf) ? 'captives' : 'raid',
  )
  const [sheet, setSheet] = useState<RivalMaster | null>(null)
  const r = useRunner(store)
  const nowWorld = toWorldTime(Date.now())
  const week = worldWeek(nowWorld)
  const heldOurs = (Object.values(state.heroes) as OwnedHero[]).filter((h) => h.alive && h.captiveOf)
  const defense = defenseSlots(state)
  const shielded = state.pvp.shieldUntil > nowWorld

  const toggleDefense = (id: OwnedHero['id']) => {
    const cur = [...state.pvp.defense]
    const i = cur.indexOf(id)
    if (i >= 0) cur[i] = null
    else {
      // The first pick starts from the party (the roster it falls back to), so nobody vanishes.
      const base = cur.every((x) => x === null) ? [...state.party.slots] : cur
      if (base.includes(id)) return
      const free = base.indexOf(null)
      if (free < 0) return
      base[free] = id
      r.run({ type: 'SET_DEFENSE', slots: base })
      return
    }
    r.run({ type: 'SET_DEFENSE', slots: cur })
  }

  return (
    <div className="lr-action pvp-panel">
      <div className="ta-row">
        <span>{t('Sector {n} · rating {rating}', { n: sectorOf(state), rating: state.pvp.rating })}</span>
        <span className="ta-val">
          {t('#{n} of {sectorSize} · server #{n2}', { n: sectorRank(state), sectorSize: P.sectorSize, n2: serverRank(state).toLocaleString() })}
        </span>
      </div>
      <div className="ta-row">
        <span>{t('Protection shield')}</span>
        <span className="ta-val">{shielded ? timeLeftText(state.pvp.shieldUntil - nowWorld) : t('down — raiders can come')}</span>
      </div>
      <div className="syn-modes" role="tablist">
        {(['raid', 'defense', 'captives', 'log'] as const).map((tb) => (
          <button key={tb} role="tab" aria-selected={tab === tb} className={`btn sm ${tab === tb ? 'primary' : ''}`} onClick={() => setTab(tb)}>
            {tb === 'raid'
              ? `⚔ ${t('Raid')}`
              : tb === 'defense'
                ? `🛡 ${t('Defense')}`
                : tb === 'captives'
                  ? `⛓ ${t('Captives')}${heldOurs.length > 0 ? ` (${heldOurs.length}!)` : ''}`
                  : `📜 ${t('Log')}`}
          </button>
        ))}
      </div>

      {tab === 'raid' && (
        <div className="drill-list">
          <div className="muted" style={{ fontSize: 13 }}>
            {t('Raids are non-lethal. A win loots their storeroom; a fallen defender at Lv{n}+ may be carried off.', { n: P.protectionLevel })}
          </div>
          {raidTargets(state, week).map((rv) => {
            const why = raidRefusal(state, rv.id, nowWorld)
            const g = guildById(rv.guildId)
            const done = state.pvp.raidWeek === week && state.pvp.raided.includes(rv.id)
            return (
              <div key={rv.id} className={`drill-row pvp-rival ${done ? 'off' : ''}`}>
                <CrestShield guildId={rv.guildId} />
                <span className="drill-name">
                  <b>{rv.name}</b> · F{rv.floor} · {g ? t(g.name) : '—'}
                  {rv.whale && <b className="today-tag"> {t('WHALE')}</b>}
                  <span className="muted small"> · {t('defense')} ×{rv.cpRatio.toFixed(2)}</span>
                </span>
                <span className="muted">{rv.rating}</span>
                <button
                  className="btn sm"
                  disabled={done || !state.meta.crackOpen}
                  title={why ? t(why) : undefined}
                  onClick={() => {
                    r.setNote(null)
                    setSheet(rv)
                  }}
                >
                  {done ? t('Raided') : `${t('Raid')}…`}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {tab === 'defense' && (
        <div>
          <div className="muted" style={{ fontSize: 13 }}>
            {t('While you are away, this roster defends the lobby. Below Lv{n} a fallen defender is scarred; at Lv{n}+ they can be carried off.', { n: P.protectionLevel })}
          </div>
          {state.pvp.defense.every((d) => d === null) && <div className="muted" style={{ fontSize: 13 }}>{t('No preset — your party defends.')}</div>}
          <HeroPicker
            state={state}
            selected={defense.filter((x): x is OwnedHero['id'] => x !== null)}
            onPick={toggleDefense}
            refusal={(h) => (h.captiveOf ? 'Held by a rival Master.' : defense.includes(h.id) ? null : defense.filter(Boolean).length >= 5 ? 'The defense is full.' : null)}
            note={(h) => (defense.includes(h.id) ? (pvpRefusal(state, h) ? t('defends, but cannot fight now') : t('defends')) : null)}
            label={t('The defense roster')}
          />
        </div>
      )}

      {tab === 'captives' && <CaptiveBoard state={state} store={store} run={r.run} onNote={r.setNote} />}

      {tab === 'log' && (
        <div className="drill-list">
          {state.pvp.log.length === 0 && <div className="lr-empty">{t('Quiet so far.')}</div>}
          {state.pvp.log.map((l, i) => (
            <div key={i} className={`drill-row pvp-log ${l.won ? '' : 'off'}`}>
              <CrestShield guildId={l.guildId ?? null} />
              <span className="drill-name">
                {l.direction === 'in'
                  ? t('Day {d}: {rival} {note}', { d: l.worldDay, rival: l.rival, note: logNote(l.note) })
                  : t('Day {d}: you {note} ({rival})', { d: l.worldDay, rival: l.rival, note: logNote(l.note) })}
              </span>
              <span className="muted">{l.goldDelta !== 0 ? `${l.goldDelta > 0 ? '+' : ''}${l.goldDelta.toLocaleString()} ◆` : ''}</span>
              {l.replay ? (
                <button className="btn sm" onClick={() => watchInvasion(state, l)}>
                  ▸ {t('Watch')}
                </button>
              ) : (
                <span />
              )}
            </div>
          ))}
        </div>
      )}

      {r.note && <div className="lr-action-note">{r.note}</div>}
      {r.err && <div className="lr-action-note" style={{ color: 'var(--bad)' }}>{r.err}</div>}
      {sheet && <RaidSheet state={state} store={store} rival={sheet} onClose={() => setSheet(null)} onResult={r.setNote} />}
    </div>
  )
}

/** The guild hall: membership, aid, the weekly raid and server war (Layer 4 §4). */
export function GuildPanel({ state, store }: { state: GameState; store: Store }) {
  const r = useRunner(store)
  const [open, setOpen] = useState<'raid' | 'war' | null>(null)
  const g = guildById(state.pvp.guild)
  const week = worldWeek(toWorldTime(Date.now()))
  return (
    <div className="lr-action guild-panel">
      {g ? (
        <>
          <div className="gh-head">
            <CrestImg guildId={g.id} scale={2} />
            <div>
              <div className="gh-name">{t(g.name)}</div>
              <div className="muted small">{t(g.blurb)}</div>
              <div className="muted small">
                {t('Server wars')}: {state.pvp.war.wins}W · {state.pvp.war.losses}L
              </div>
            </div>
          </div>
          <h4 className="panel-sub">{t('Guildmates in your sector')}</h4>
          <div className="gr-mates">
            {guildmates(state).map((m) => (
              <span key={m.id} className="gr-mate">
                {m.name} <span className="muted small">{m.rating}</span>
              </span>
            ))}
          </div>
          <div className="gh-actions">
            <button className="pbtn" onClick={() => r.run({ type: 'CLAIM_GUILD_AID' })}>
              {t('Claim aid (+{aidStones} stones)', { aidStones: TUNING.guild.aidStones })}
            </button>
            <button className="pbtn danger" onClick={() => setOpen('raid')}>
              ⚔ {t('Guild raid')}
              {state.pvp.guildRaidWeek === week && <span className="muted small"> ✓</span>}
            </button>
            <button className="pbtn danger" onClick={() => setOpen('war')}>
              ⚑ {t('Server war')}
              {state.pvp.warWeek === week && <span className="muted small"> ✓</span>}
            </button>
            <span className="spacer" />
            <button className="pbtn sm ghost" onClick={() => r.run({ type: 'LEAVE_GUILD' })}>
              {t('Leave')}
            </button>
          </div>
        </>
      ) : (
        <div className="drill-list">
          {GUILDS.map((x) => {
            const why = joinRefusal(state, x.id)
            return (
              <div key={x.id} className={`drill-row ${why ? 'off' : ''}`} title={why ? t(why) : undefined}>
                <CrestShield guildId={x.id} />
                <span className="drill-name">
                  {t(x.name)} — <span className="muted">{t(x.blurb)}</span>
                </span>
                <span />
                <button className="btn sm" disabled={why !== null} onClick={() => r.run({ type: 'JOIN_GUILD', guildId: x.id })}>
                  {t('Join')}
                </button>
              </div>
            )
          })}
        </div>
      )}
      {r.note && <div className="lr-action-note">{r.note}</div>}
      {r.err && <div className="lr-action-note" style={{ color: 'var(--bad)' }}>{r.err}</div>}
      {open === 'raid' && <GuildRaidScreen state={state} store={store} onClose={() => setOpen(null)} />}
      {open === 'war' && <ServerWarScreen state={state} store={store} onClose={() => setOpen(null)} />}
    </div>
  )
}
