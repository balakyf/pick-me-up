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
import { t } from './i18n/i18n'

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
    fail(e: unknown) {
      setErr(t(e instanceof Error ? e.message.replace(/^\w+: /, '') : 'That failed'))
    },
  }
}

function worldTimeLeft(ms: number): string {
  if (ms <= 0) return t('any moment')
  const h = Math.ceil(ms / 3_600_000)
  if (h < 24) return t('{n} world-h', { n: h })
  const d = Math.floor(h / 24)
  return d === 1 ? t('1 world-day') : t('{n} world-days', { n: d })
}

/** The engine writes invasion-log notes in English; render them through the dictionary. */
const NOTE_PATTERNS: [RegExp, string][] = [
  [/^raided them and took (.+) captive$/, 'raided them and took {name} captive'],
  [/^raided you and carried off (.+)$/, 'raided you and carried off {name}'],
  [/^synthesized (.+)$/, 'synthesized {name}'],
  [/^stormed their lobby and freed (.+)$/, 'stormed their lobby and freed {name}'],
  [/^failed to free (.+)$/, 'failed to free {name}'],
]
function logNote(note: string): string {
  for (const [re, key] of NOTE_PATTERNS) {
    const m = re.exec(note)
    if (m) return t(key, { name: m[1]! })
  }
  return t(note)
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
          ? t('You raided {rival}: +{gold} gold, +{stones} stones', {
              rival: out.outcome.rival.name,
              gold: out.outcome.gold.toLocaleString(),
              stones: out.outcome.stones,
            }) + (out.outcome.captive ? t(', and took {name} captive.', { name: out.outcome.captive.name }) : '.')
          : t("{rival}'s defense drove you back.", { rival: out.outcome.rival.name }),
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
        <span>{t('Sector {n} · rating {rating}', { n: sectorOf(state), rating: state.pvp.rating })}</span>
        <span className="ta-val">
          {t('#{n} of {sectorSize} · server #{n2}', { n: sectorRank(state), sectorSize: P.sectorSize, n2: serverRank(state).toLocaleString() })}
        </span>
      </div>
      <div className="ta-row">
        <span>{t('Protection shield')}</span>
        <span className="ta-val">{shielded ? worldTimeLeft(state.pvp.shieldUntil - nowWorld) : 'down — raiders can come'}</span>
      </div>
      <div className="syn-modes">
        {(['raid', 'defense', 'captives', 'log'] as const).map((tb) => (
          <button key={tb} className={`btn sm ${tab === tb ? 'primary' : ''}`} onClick={() => setTab(tb)}>
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
            return (
              <div key={rv.id} className={`drill-row ${why ? 'off' : ''}`} title={why ? t(why) : undefined}>
                <span className="skill-grade">{rv.whale ? '🐋' : 'F'}</span>
                <span className="drill-name">
                  {rv.name} · F{rv.floor} · {g ? t(g.name) : '—'} · {t('defense')} ×{rv.cpRatio.toFixed(2)}
                  {rv.whale && <b className="today-tag"> {t('WHALE')}</b>}
                </span>
                <span className="muted">{rv.rating}</span>
                <button className="btn sm" disabled={why !== null} onClick={() => raid(rv.id)}>
                  {t('Raid')}
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
                      {h.name.split(/\s+/)[0]} <span className="muted">{t('Lv{level}', { level: h.xp.level })}</span>
                    </span>
                  </button>
                )
              })}
          </div>
          {state.pvp.defense.every((d) => d === null) && <div className="muted" style={{ fontSize: 13 }}>{t('No preset — your party defends.')}</div>}
        </div>
      )}

      {tab === 'captives' && (
        <div className="drill-list">
          <h4 className="panel-sub">{t('Your heroes, held by raiders')}</h4>
          {heldOurs.length === 0 && <div className="lr-empty">{t('No one has been taken.')}</div>}
          {heldOurs.map((h) => {
            const hold = h.captiveOf!
            return (
              <div key={h.id} className="drill-row">
                <span className="skill-grade">⛓</span>
                <span className="drill-name">
                  {t('{name} · held by {master} · synthesized in {n}', { name: h.name, master: hold.master, n: worldTimeLeft(hold.deadlineWorld - nowWorld) })}
                </span>
                <button
                  className="btn sm"
                  disabled={state.gold < hold.ransomGold || state.gems < hold.ransomGems}
                  onClick={() => r.run({ type: 'RANSOM_HERO', heroId: h.id })}
                >
                  {t('Ransom {ransomGold} ◆ {ransomGems} ♦', { ransomGold: hold.ransomGold.toLocaleString(), ransomGems: hold.ransomGems })}
                </button>
                <button className="btn sm" onClick={() => r.run({ type: 'COUNTER_RAID', heroId: h.id })}>
                  {t('Counter-raid')}
                </button>
              </div>
            )
          })}
          <h4 className="panel-sub">{t('Heroes you took')}</h4>
          {state.pvp.captives.length === 0 && <div className="lr-empty">{t('Your cells are empty.')}</div>}
          {state.pvp.captives.map((c) => (
            <CaptiveRow key={c.id} captive={c} state={state} run={r.run} />
          ))}
        </div>
      )}

      {tab === 'log' && (
        <div className="drill-list">
          {state.pvp.log.length === 0 && <div className="lr-empty">{t('Quiet so far.')}</div>}
          {state.pvp.log.map((l, i) => (
            <div key={i} className={`drill-row ${l.won ? '' : 'off'}`}>
              <span className="skill-grade">{l.direction === 'in' ? '⇠' : '⇢'}</span>
              <span className="drill-name">
                {l.direction === 'in'
                  ? t('Day {d}: {rival} {note}', { d: l.worldDay, rival: l.rival, note: logNote(l.note) })
                  : t('Day {d}: you {note} ({rival})', { d: l.worldDay, rival: l.rival, note: logNote(l.note) })}
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
        {t('{name} · Lv{level}', { name: captive.name, level: captive.level })}
      </span>
      <button className="btn sm" onClick={() => run({ type: 'RELEASE_CAPTIVE', captiveId: captive.id })}>
        {t('Ransom back +{ransomGold} ◆', { ransomGold: captive.ransomGold.toLocaleString() })}
      </button>
      <select className="captive-select" value={into ?? ''} onChange={(e) => setInto((e.target.value || null) as HeroId | null)}>
        <option value="">{t('synthesize into…')}</option>
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
        title={t('Your heroes will know what you did.')}
      >
        {t('Synthesize')}
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
            ? t('The Guild Colossus falls! +{gold} gold, +{gems} gems', { gold: o.gold.toLocaleString(), gems: o.gems }) +
                (o.book ? t(' — and a Book of Reverse Heaven!') : '.')
            : t('You dealt {dealt} and your guildmates {mates} of {hp} — it survives. +{gold} gold.', {
                dealt: o.dealt.toLocaleString(),
                mates: o.mates.toLocaleString(),
                hp: o.bossHp.toLocaleString(),
                gold: o.gold,
              }),
        )
      } else {
        const out = serverWarWithResult(store.getState(), Date.now())
        store.dispatch({ type: 'SERVER_WAR' }, Date.now())
        r.setNote(t('Server war against {guild}: {wins}/3 battles won.', { guild: t(out.enemyGuild), wins: out.wins }))
      }
    } catch (e) {
      r.fail(e)
    }
  }
  return (
    <div className="lr-action guild-panel">
      <div className="ta-row">
        <span>{t('Guild')}</span>
        <span className="ta-val">{g ? t(g.name) : t('none')}</span>
      </div>
      <div className="ta-row">
        <span>{t('Server wars')}</span>
        <span className="ta-val">
          {state.pvp.war.wins}W · {state.pvp.war.losses}L
        </span>
      </div>
      {g ? (
        <>
          <div className="muted" style={{ fontSize: 13 }}>{t(g.blurb)}</div>
          <div className="syn-modes">
            <button className="btn sm" onClick={() => r.run({ type: 'CLAIM_GUILD_AID' })}>
              {t('Claim aid (+{aidStones} stones)', { aidStones: TUNING.guild.aidStones })}
            </button>
            <button className="btn sm" onClick={() => weekly('raid')}>
              {t('Guild raid')}
            </button>
            <button className="btn sm" onClick={() => weekly('war')}>
              {t('Server war')}
            </button>
            <button className="btn sm ghost" onClick={() => r.run({ type: 'LEAVE_GUILD' })}>
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
                <span className="skill-grade">{x.whale ? '🐋' : '⚑'}</span>
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
    </div>
  )
}
