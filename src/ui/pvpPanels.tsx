import { useState } from 'react'
import type { CombatLog, Command, GameState, HeroId, OwnedHero } from '../engine/types'
import type { Store } from '../engine/store'
import { raidWithResult, guildRaidWithResult, serverWarWithResult } from '../engine/store'
import { TUNING } from '../engine/tuning'
import { toWorldTime } from '../engine/time'
import {
  GUILDS,
  defenseSlots,
  guildById,
  joinRefusal,
  raidRefusal,
  raidTargets,
  sectorOf,
  sectorRank,
  serverRank,
  worldWeek,
} from '../engine/pvp'
import { BattleScene } from './battle/BattleScene'
import { Portrait } from './bits'

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
        setErr(e instanceof Error ? e.message.replace(/^\w+: /, '') : 'That failed')
        return false
      }
    },
    fail(e: unknown) {
      setErr(e instanceof Error ? e.message.replace(/^\w+: /, '') : 'That failed')
    },
  }
}

function worldTimeLeft(ms: number): string {
  if (ms <= 0) return 'any moment'
  const h = Math.ceil(ms / 3_600_000)
  if (h < 24) return `${h} world-h`
  const d = Math.floor(h / 24)
  return `${d} world-day${d === 1 ? '' : 's'}`
}

/** The PvP side of the open crack: raid, defend, captives, the invasion log (Layer 4). */
export function PvpPanel({ state, store }: { state: GameState; store: Store }) {
  const [tab, setTab] = useState<'raid' | 'defense' | 'captives' | 'log'>('raid')
  const [replay, setReplay] = useState<CombatLog | null>(null)
  const r = useRunner(store)
  const nowWorld = toWorldTime(Date.now())
  const week = worldWeek(nowWorld)
  const living = (Object.values(state.heroes) as OwnedHero[]).filter((h) => h.alive)
  const heldOurs = living.filter((h) => h.captiveOf)

  function raid(id: string) {
    r.setNote(null)
    try {
      const out = raidWithResult(store.getState(), id, Date.now())
      store.dispatch({ type: 'RAID_RIVAL', rivalId: id }, Date.now())
      r.setNote(
        out.outcome.won
          ? `You raided ${out.outcome.rival.name}: +${out.outcome.gold.toLocaleString()} gold, +${out.outcome.stones} stones${out.outcome.captive ? `, and took ${out.outcome.captive.name} captive.` : '.'}`
          : `${out.outcome.rival.name}'s defense drove you back.`,
      )
      setReplay(out.outcome.log)
    } catch (e) {
      r.fail(e)
    }
  }

  const defense = defenseSlots(state)
  const shielded = state.pvp.shieldUntil > nowWorld

  return (
    <div className="lr-action pvp-panel">
      <div className="ta-row">
        <span>Sector {sectorOf(state)} · rating {state.pvp.rating}</span>
        <span className="ta-val">
          #{sectorRank(state)} of {P.sectorSize} · server #{serverRank(state).toLocaleString()}
        </span>
      </div>
      <div className="ta-row">
        <span>Protection shield</span>
        <span className="ta-val">{shielded ? worldTimeLeft(state.pvp.shieldUntil - nowWorld) : 'down — raiders can come'}</span>
      </div>
      <div className="syn-modes">
        {(['raid', 'defense', 'captives', 'log'] as const).map((t) => (
          <button key={t} className={`btn sm ${tab === t ? 'primary' : ''}`} onClick={() => setTab(t)}>
            {t === 'raid' ? '⚔ Raid' : t === 'defense' ? '🛡 Defense' : t === 'captives' ? `⛓ Captives${heldOurs.length > 0 ? ` (${heldOurs.length}!)` : ''}` : '📜 Log'}
          </button>
        ))}
      </div>

      {tab === 'raid' && (
        <div className="drill-list">
          <div className="muted" style={{ fontSize: 13 }}>
            Raids are non-lethal. A win loots their storeroom; a fallen defender at Lv{P.protectionLevel}+ may be carried off.
          </div>
          {raidTargets(state, week).map((t) => {
            const why = raidRefusal(state, t.id, nowWorld)
            const g = guildById(t.guildId)
            return (
              <div key={t.id} className={`drill-row ${why ? 'off' : ''}`} title={why ?? undefined}>
                <span className="skill-grade">{t.whale ? '🐋' : 'F'}</span>
                <span className="drill-name">
                  {t.name} · F{t.floor} · {g?.name ?? '—'} · defense ×{t.cpRatio.toFixed(2)}
                  {t.whale && <b className="today-tag"> WHALE</b>}
                </span>
                <span className="muted">{t.rating}</span>
                <button className="btn sm" disabled={why !== null} onClick={() => raid(t.id)}>
                  Raid
                </button>
              </div>
            )
          })}
        </div>
      )}

      {tab === 'defense' && (
        <div>
          <div className="muted" style={{ fontSize: 13 }}>
            While you are away, this roster defends the lobby. Below Lv{P.protectionLevel} a fallen defender is scarred; at Lv
            {P.protectionLevel}+ they can be carried off.
          </div>
          <div className="syn-row">
            {living
              .filter((h) => !h.captiveOf)
              .map((h) => {
                const on = defense.includes(h.id)
                return (
                  <button
                    key={h.id}
                    type="button"
                    className={`syn-chip ${on ? 'sel' : ''}`}
                    onClick={() => {
                      const cur = [...state.pvp.defense]
                      const i = cur.indexOf(h.id)
                      if (i >= 0) cur[i] = null
                      else {
                        const free = cur.indexOf(null)
                        if (free < 0) return
                        cur[free] = h.id
                      }
                      r.run({ type: 'SET_DEFENSE', slots: cur })
                    }}
                  >
                    <Portrait hero={h} size="sm" />
                    <span className="syn-chip-name">
                      {h.name.split(/\s+/)[0]} <span className="muted">Lv{h.xp.level}</span>
                    </span>
                  </button>
                )
              })}
          </div>
          {state.pvp.defense.every((d) => d === null) && <div className="muted" style={{ fontSize: 13 }}>No preset — your party defends.</div>}
        </div>
      )}

      {tab === 'captives' && (
        <div className="drill-list">
          <h4 className="panel-sub">Your heroes, held by raiders</h4>
          {heldOurs.length === 0 && <div className="lr-empty">No one has been taken.</div>}
          {heldOurs.map((h) => {
            const hold = h.captiveOf!
            return (
              <div key={h.id} className="drill-row">
                <span className="skill-grade">⛓</span>
                <span className="drill-name">
                  {h.name} · held by {hold.master} · synthesized in {worldTimeLeft(hold.deadlineWorld - nowWorld)}
                </span>
                <button
                  className="btn sm"
                  disabled={state.gold < hold.ransomGold || state.gems < hold.ransomGems}
                  onClick={() => r.run({ type: 'RANSOM_HERO', heroId: h.id })}
                >
                  Ransom {hold.ransomGold.toLocaleString()} ◆ {hold.ransomGems} ♦
                </button>
                <button className="btn sm" onClick={() => r.run({ type: 'COUNTER_RAID', heroId: h.id })}>
                  Counter-raid
                </button>
              </div>
            )
          })}
          <h4 className="panel-sub">Heroes you took</h4>
          {state.pvp.captives.length === 0 && <div className="lr-empty">Your cells are empty.</div>}
          {state.pvp.captives.map((c) => (
            <CaptiveRow key={c.id} captive={c} state={state} run={r.run} />
          ))}
        </div>
      )}

      {tab === 'log' && (
        <div className="drill-list">
          {state.pvp.log.length === 0 && <div className="lr-empty">Quiet so far.</div>}
          {state.pvp.log.map((l, i) => (
            <div key={i} className={`drill-row ${l.won ? '' : 'off'}`}>
              <span className="skill-grade">{l.direction === 'in' ? '⇠' : '⇢'}</span>
              <span className="drill-name">
                Day {l.worldDay}: {l.direction === 'in' ? `${l.rival} ${l.note}` : `you ${l.note} (${l.rival})`}
              </span>
              <span className="muted">{l.goldDelta !== 0 ? `${l.goldDelta > 0 ? '+' : ''}${l.goldDelta.toLocaleString()} ◆` : ''}</span>
            </div>
          ))}
        </div>
      )}

      {r.note && <div className="lr-action-note">{r.note}</div>}
      {r.err && <div className="lr-action-note" style={{ color: 'var(--bad)' }}>{r.err}</div>}
      {replay && <BattleScene log={replay} state={state} onDone={() => setReplay(null)} />}
    </div>
  )
}

function CaptiveRow({
  captive,
  state,
  run,
}: {
  captive: GameState['pvp']['captives'][number]
  state: GameState
  run: (cmd: Command) => boolean
}) {
  const [into, setInto] = useState<HeroId | null>(null)
  const living = (Object.values(state.heroes) as OwnedHero[]).filter((h) => h.alive && !h.captiveOf)
  return (
    <div className="drill-row captive-row">
      <span className="skill-grade">{captive.star}★</span>
      <span className="drill-name">
        {captive.name} · Lv{captive.level}
      </span>
      <button className="btn sm" onClick={() => run({ type: 'RELEASE_CAPTIVE', captiveId: captive.id })}>
        Ransom back +{captive.ransomGold.toLocaleString()} ◆
      </button>
      <select className="captive-select" value={into ?? ''} onChange={(e) => setInto((e.target.value || null) as HeroId | null)}>
        <option value="">synthesize into…</option>
        {living.map((h) => (
          <option key={h.id} value={h.id}>
            {h.name}
          </option>
        ))}
      </select>
      <button
        className="btn sm syn-destroy"
        disabled={into === null}
        onClick={() => into && run({ type: 'SYNTHESIZE_CAPTIVE', captiveId: captive.id, survivorId: into })}
        title="Your heroes will know what you did."
      >
        Synthesize
      </button>
    </div>
  )
}

/** The guild hall: membership, aid, the weekly raid and server war (Layer 4 §4). */
export function GuildPanel({ state, store }: { state: GameState; store: Store }) {
  const r = useRunner(store)
  const g = guildById(state.pvp.guild)
  function weekly(kind: 'raid' | 'war') {
    r.setNote(null)
    try {
      if (kind === 'raid') {
        const out = guildRaidWithResult(store.getState(), Date.now())
        store.dispatch({ type: 'GUILD_RAID' }, Date.now())
        const o = out.outcome
        r.setNote(
          o.felled
            ? `The Guild Colossus falls! +${o.gold.toLocaleString()} gold, +${o.gems} gems${o.book ? ' — and a Book of Reverse Heaven!' : '.'}`
            : `You dealt ${o.dealt.toLocaleString()} and your guildmates ${o.mates.toLocaleString()} of ${o.bossHp.toLocaleString()} — it survives. +${o.gold} gold.`,
        )
      } else {
        const out = serverWarWithResult(store.getState(), Date.now())
        store.dispatch({ type: 'SERVER_WAR' }, Date.now())
        r.setNote(`Server war against ${out.enemyGuild}: ${out.wins}/3 battles won.`)
      }
    } catch (e) {
      r.fail(e)
    }
  }
  return (
    <div className="lr-action guild-panel">
      <div className="ta-row">
        <span>Guild</span>
        <span className="ta-val">{g ? g.name : 'none'}</span>
      </div>
      <div className="ta-row">
        <span>Server wars</span>
        <span className="ta-val">
          {state.pvp.war.wins}W · {state.pvp.war.losses}L
        </span>
      </div>
      {g ? (
        <>
          <div className="muted" style={{ fontSize: 13 }}>{g.blurb}</div>
          <div className="syn-modes">
            <button className="btn sm" onClick={() => r.run({ type: 'CLAIM_GUILD_AID' })}>
              Claim aid (+{TUNING.guild.aidStones} stones)
            </button>
            <button className="btn sm" onClick={() => weekly('raid')}>
              Guild raid
            </button>
            <button className="btn sm" onClick={() => weekly('war')}>
              Server war
            </button>
            <button className="btn sm ghost" onClick={() => r.run({ type: 'LEAVE_GUILD' })}>
              Leave
            </button>
          </div>
        </>
      ) : (
        <div className="drill-list">
          {GUILDS.map((x) => {
            const why = joinRefusal(state, x.id)
            return (
              <div key={x.id} className={`drill-row ${why ? 'off' : ''}`} title={why ?? undefined}>
                <span className="skill-grade">{x.whale ? '🐋' : '⚑'}</span>
                <span className="drill-name">
                  {x.name} — <span className="muted">{x.blurb}</span>
                </span>
                <span />
                <button className="btn sm" disabled={why !== null} onClick={() => r.run({ type: 'JOIN_GUILD', guildId: x.id })}>
                  Join
                </button>
              </div>
            )
          })}
        </div>
      )}
      {r.note && <div className="lr-action-note">{r.note}</div>}
      {r.err && <div className="lr-action-note" style={{ color: 'var(--bad)' }}>{r.err}</div>}
    </div>
  )
}
