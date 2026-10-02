import { useMemo, useState } from 'react'
import type { GameState, HeroId, OwnedHero } from '../../engine/types'
import type { Store } from '../../engine/store'
import { towerRaidWithResult } from '../../engine/store'
import {
  CHALLENGE,
  RAID_FLOORS,
  ballistaBreak,
  buildRaidBoss,
  fitToFight,
  raidChestReady,
  raidRecord,
  raidRefusal,
  raidsOpen,
  type RaidOutcome,
} from '../../engine/challenge'
import { toWorldTime } from '../../engine/time'
import { PixelWindow } from '../kit'
import { BattleScene } from '../battle/BattleScene'
import { TimingGame } from '../metaPanels'
import { cpOf } from '../bits'
import { t } from '../i18n/i18n'
import { HeroChip, lootLine } from './common'

const RD = CHALLENGE.raids
const SIZE = 5
const ROMAN = ['I', 'II', 'III']

/** Strongest fit heroes into the three parties; the best spotters (archers, light, mages) on the ballista. */
function autoFill(state: GameState): HeroId[][] {
  const fit = (Object.values(state.heroes) as OwnedHero[]).filter((h) => fitToFight(h)).sort((a, b) => cpOf(b) - cpOf(a))
  const spotter = (h: OwnedHero) => (h.heroClass === 'archer' ? 2 : 0) + (h.element === 'light' || h.heroClass === 'mage' ? 1 : 0)
  const crew: HeroId[] = []
  // Keep the crew from the bench below the top fifteen when the roster allows.
  const bench = fit.slice(RD.maxParties * SIZE).sort((a, b) => spotter(b) - spotter(a) || cpOf(b) - cpOf(a))
  for (const h of bench) if (crew.length < RD.maxCrew) crew.push(h.id)
  const fighters = fit.filter((h) => !crew.includes(h.id)).slice(0, RD.maxParties * SIZE)
  // Bond siblings travel together so their set bonus lands (strongest cluster first).
  const clusters: OwnedHero[][] = []
  const seen = new Set<HeroId>()
  for (const h of fighters) {
    if (seen.has(h.id)) continue
    const mates = h.bondGroup ? fighters.filter((o) => o.bondGroup === h.bondGroup) : [h]
    for (const m of mates) seen.add(m.id)
    clusters.push(mates)
  }
  const parties: HeroId[][] = [[], [], []]
  for (const c of clusters) {
    const rest = [...c]
    const whole = parties.find((p) => SIZE - p.length >= rest.length)
    for (const p of whole ? [whole] : parties) while (rest.length > 0 && p.length < SIZE) p.push(rest.shift()!.id)
  }
  return [...parties, crew]
}

/**
 * The raid window: pick a cleared raid anchor, field up to three parties of five and up to
 * three ballista crew, aim (or let the crew fire), then watch every party's battle in turn.
 */
export function RaidPlanner({ state, store, onClose }: { state: GameState; store: Store; onClose: () => void }) {
  const open = raidsOpen(state)
  const [floor, setFloor] = useState<number>(open.at(-1) ?? RAID_FLOORS[0]!)
  const [rows, setRows] = useState<HeroId[][]>(() => autoFill(state))
  const [active, setActive] = useState(0)
  const [aiming, setAiming] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [play, setPlay] = useState<{ outcome: RaidOutcome; index: number; pre: GameState } | null>(null)
  const nowWorld = toWorldTime(Date.now())

  const boss = useMemo(() => (open.includes(floor) ? buildRaidBoss(state, floor, 0).boss : null), [floor, state.tower.highestCleared, state.worldGrade])
  const placed = new Map<HeroId, number>()
  rows.forEach((r, i) => r.forEach((id) => placed.set(id, i)))
  const crew = rows[3]!.map((id) => state.heroes[id]!).filter(Boolean)
  const brk = ballistaBreak(crew, state.meta.skill.ballista)
  const parties = rows.slice(0, 3).filter((r) => r.length > 0)
  const why = raidRefusal(state, floor, parties, rows[3]!)
  const fit = (Object.values(state.heroes) as OwnedHero[]).filter((h) => fitToFight(h)).sort((a, b) => cpOf(b) - cpOf(a))

  function toggle(id: HeroId) {
    setRows((cur) => {
      const next = cur.map((r) => r.filter((x) => x !== id))
      if (placed.get(id) === active) return next
      const cap = active === 3 ? RD.maxCrew : SIZE
      if (next[active]!.length >= cap) return cur
      next[active] = [...next[active]!, id]
      return next
    })
  }

  function launch(perf: number | undefined) {
    setAiming(false)
    setErr(null)
    try {
      const pre = store.getState()!
      const cmd = { floor, parties, crew: rows[3]!, ballista: perf }
      const { outcome } = towerRaidWithResult(pre, cmd, Date.now())
      store.dispatch({ type: 'TOWER_RAID', ...cmd }, Date.now())
      setPlay({ outcome, index: 0, pre })
    } catch (e) {
      setErr(t(e instanceof Error ? e.message.replace(/^\w+: /, '') : 'That failed'))
    }
  }

  if (play && play.index < play.outcome.parties.length) {
    const p = play.outcome.parties[play.index]!
    return <BattleScene key={play.index} log={p.log} state={play.pre} onDone={() => setPlay({ ...play, index: play.index + 1 })} />
  }

  return (
    <PixelWindow title={t('Raids')} icon="⚔" onClose={onClose} wide>
      {play ? (
        <RaidResult outcome={play.outcome} state={play.pre} onReplay={(i) => setPlay({ ...play, index: i })}
          onDone={() => {
            setPlay(null)
            setRows(autoFill(state))
          }}
        />
      ) : (
        <div className="raid-planner">
          <div className="raid-tabs">
            {RAID_FLOORS.map((f) => {
              const unlocked = open.includes(f)
              const rec = raidRecord(state, f)
              return (
                <button key={f} className={`raid-tab ${f === floor ? 'on' : ''}`} disabled={!unlocked} onClick={() => setFloor(f)}>
                  <b>F{f}</b>{' '}
                  {unlocked ? (raidChestReady(state, f, nowWorld) ? '🎁' : '✓') : '🔒'}
                  {rec.clears > 0 && <span className="muted small"> ×{rec.clears}</span>}
                </button>
              )
            })}
          </div>
          {boss ? (
            <>
              <div className="raid-boss">
                <div>
                  <b>{t(boss.name)}</b> <span className="muted">Lv{boss.level}</span>
                </div>
                <div className="muted small">
                  {t('HP pool {hp} — shared by every party. Its scales shrug off {p}% of every blow until the ballista breaks them.', {
                    hp: boss.stats.maxHP.toLocaleString(),
                    p: Math.round(RD.scaleReduction * 100),
                  })}
                </div>
                <div className="muted small">
                  {raidChestReady(state, floor, nowWorld)
                    ? t("This week's chest waits: gems, stones, rank material — and maybe a page of the Book of Reverse Heaven.")
                    : t("This week's chest is already taken. The raid still teaches (XP), but pays nothing more until next week.")}
                </div>
              </div>
              <div className="raid-stakes">
                ⚠ {t('Permadeath. Parties fight one after another; a party falls back after {n} ticks, but whoever falls in the raid is gone for good.', { n: RD.partyTicks })}
              </div>
              <div className="raid-rows">
                {rows.map((r, i) => (
                  <div key={i} className={`raid-row ${active === i ? 'on' : ''}`} onClick={() => setActive(i)}>
                    <span className="raid-row-label">
                      {i < 3 ? t('Party {n}', { n: ROMAN[i]! }) : `🎯 ${t('Ballista crew')}`}
                      <span className="muted small"> {r.length}/{i < 3 ? SIZE : RD.maxCrew}</span>
                    </span>
                    <span className="raid-row-heroes">
                      {r.length === 0 && <span className="muted small">{active === i ? t('pick heroes below') : t('empty')}</span>}
                      {r.map((id) => state.heroes[id] && <HeroChip key={id} state={state} hero={state.heroes[id]!} onClick={() => toggle(id)} selected />)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="raid-break">
                🎯 {t('The scales stay broken for {n} ticks at the start of each party’s fight', { n: brk.ticks })}
                {brk.altar && <> · ✨ {t("the Goddess' altar is held")}</>}
                <span className="muted small"> · {t('ballista skill {p}%', { p: Math.round(state.meta.skill.ballista * 100) })}</span>
              </div>
              <div className="raid-roster">
                {fit.map((h) => (
                  <HeroChip
                    state={state}
                    key={h.id}
                    hero={h}
                    selected={placed.has(h.id)}
                    tag={placed.has(h.id) ? (placed.get(h.id)! < 3 ? ROMAN[placed.get(h.id)!] : '🎯') : undefined}
                    onClick={() => toggle(h.id)}
                  />
                ))}
              </div>
              <div className="raid-actions">
                <button className="pbtn" onClick={() => setRows(autoFill(state))}>
                  ✦ {t('Auto-fill')}
                </button>
                <button className="pbtn ghost" onClick={() => setRows([[], [], [], []])}>
                  {t('Clear')}
                </button>
                <span className="spacer" />
                <button className="pbtn" disabled={why !== null} onClick={() => launch(undefined)} title={t('The crew fires at the Master’s tracked skill.')}>
                  {t('Raid (auto-aim)')}
                </button>
                <button className="pbtn danger" disabled={why !== null} onClick={() => setAiming(true)}>
                  🎯 {t('Aim the ballista & raid')}
                </button>
              </div>
              {why && <div className="muted small" style={{ color: 'var(--warn)' }}>{t(why)}</div>}
              {err && <div className="muted small" style={{ color: 'var(--bad)' }}>{err}</div>}
            </>
          ) : (
            <div className="muted">{t('Clear F{n} to open its raid.', { n: floor })}</div>
          )}
        </div>
      )}
      {aiming && (
        <TimingGame
          title={t('The Ballista')}
          verb={t('Shoot')}
          skill={state.meta.skill.ballista}
          hint={t('Loose the bolt as the sight crosses the heart. A true shot breaks the scales for longer.')}
          onDone={launch}
          onCancel={() => setAiming(false)}
        />
      )}
    </PixelWindow>
  )
}

function RaidResult({ outcome, state, onReplay, onDone }: { outcome: RaidOutcome; state: GameState; onReplay: (i: number) => void; onDone: () => void }) {
  const loot = lootLine({ gems: outcome.gems, materials: outcome.materials })
  return (
    <div className="raid-result">
      <div className={`big-outcome ${outcome.cleared ? 'win' : 'lose'}`}>{outcome.cleared ? t('RAID CLEARED') : t('THE BOSS STANDS')}</div>
      <div className="muted">
        {t(outcome.bossName)} · {t('HP pool {hp}', { hp: outcome.bossMaxHp.toLocaleString() })} · {t('scales broken {n} ticks a party', { n: outcome.breakTicks })}
      </div>
      <div className="raid-hp">
        {outcome.parties.map((p, i) => (
          <div key={i} className="raid-hp-row">
            <button className="tr-round" onClick={() => onReplay(i)} title={t('Watch this battle')}>
              {t('Party {n}', { n: ROMAN[i]! })} ▸
            </button>
            <span className="raid-hp-bar">
              <span className="left" style={{ width: `${(p.bossHpAfter / outcome.bossMaxHp) * 100}%` }} />
              <span className="dealt" style={{ left: `${(p.bossHpAfter / outcome.bossMaxHp) * 100}%`, width: `${((p.bossHpBefore - p.bossHpAfter) / outcome.bossMaxHp) * 100}%` }} />
            </span>
            <span className="small">−{(p.bossHpBefore - p.bossHpAfter).toLocaleString()}</span>
            {p.fallen.length > 0 ? (
              <span className="small" style={{ color: 'var(--bad)' }}>
                ☠ {p.fallen.map((id) => state.heroes[id]?.name.split(' ')[0] ?? id).join(', ')}
              </span>
            ) : (
              <span className="small" style={{ color: 'var(--good)' }}>{t('all came home')}</span>
            )}
          </div>
        ))}
      </div>
      {outcome.cleared && (
        <div className="room-loot">
          {outcome.rewarded ? <div>🎁 {loot}</div> : <div className="muted">{t("This week's chest was already taken.")}</div>}
          {outcome.xp > 0 && <div style={{ color: 'var(--good)' }}>{t('+{n} XP to every survivor', { n: outcome.xp.toLocaleString() })}</div>}
          {outcome.bookBound && <div style={{ color: 'var(--gold)' }}>📕 {t('Five pages bind themselves into a Book of Reverse Heaven!')}</div>}
        </div>
      )}
      {outcome.fallen.length > 0 && (
        <div className="muted">{t('{n} heroes did not come back from the raid.', { n: outcome.fallen.length })}</div>
      )}
      <button className="btn primary" onClick={onDone} style={{ marginTop: 12 }}>
        {t('Back to the raid table')}
      </button>
    </div>
  )
}
