import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type { BattleOrder, FloorResult, GameState, OwnedHero, SkillProgress, Sortie } from '../engine/types'
import type { Store } from '../engine/store'
import { TUNING } from '../engine/tuning'
import { HIDDEN_OBJECTIVES, SKILLS } from '../engine/content'
import { t } from './i18n/i18n'
import { LegacySlot } from './legacy/LegacySlot'
import type { PlaceId } from './world/lobbyMap'
import { sfx } from './audio/sound'
import { getPrefs } from './prefs'
import { heroBustUrl } from './pixel/sprites'
import { useCountUp } from './tower/useCountUp'
import { CoinBurst } from './tower/CoinBurst'
import { explainFloor, mvpOf } from './tower/explain'
import { avengedNames, keptOnRout, levelUps, materialRows, nextTeaser, summonProgress } from './tower/rewards'
import { DoorPicker } from './tower/DoorPicker'
import { KindBadge } from './tower/ScoutCard'
import { KIND_ICON, worldMultOf } from './tower/kinds'
import './results.css'

// ── Results ──────────────────────────────────────────────────────────────────
/** One line of skill news for the results screen. */
export function skillProgressLine(p: SkillProgress, state: GameState): string {
  const who = state.heroes[p.heroId]?.name.split(/\s+/)[0] ?? t('A hero')
  const name = (id: string) => t(SKILLS[id]?.name ?? id)
  switch (p.kind) {
    case 'level-up':
      return t("▲ {who}'s {skill} reached Lv {n}", { who, skill: name(p.skillId), n: p.level })
    case 'merge':
      return t('✦ {who} fused {a} + {b} into {skill}!', { who, a: name(p.from[0]), b: name(p.from[1]), skill: name(p.skillId) })
    case 'unlock':
      return t('✧ {who} awakened a new skill: {skill}', { who, skill: name(p.skillId) })
    case 'achievement':
      return t('🏆 {who} earned {skill}!', { who, skill: name(p.skillId) })
  }
}

/** Stagger slot for the cascade: each row enters a beat after the one before. */
function row(i: number): CSSProperties {
  return { '--i': i } as CSSProperties
}

const firstName = (h: OwnedHero) => h.name.split(/\s+/)[0] ?? h.name

export interface ResultsScreenProps {
  result: FloorResult
  state: GameState
  /** Optional (WP0): lets slot components (Legacy) act on the result. */
  store?: Store
  onContinue: () => void
  /** Every hero's level just before the fight (for the "▲ Lv a→b" rows). */
  preLevels?: Readonly<Record<string, number>>
  /** Gold just before the fight; the count-up then shows everything the attempt paid. */
  goldBefore?: number
  /** The orders the Master gave in this battle (for the "Because…" lines). */
  orders?: readonly BattleOrder[]
  /** The Sortie as it stood before the attempt (to report a rout's banked share). */
  preSortie?: Sortie | null
  /** The fight played as a Sweep highlight. */
  swept?: boolean
  /** Show everything at once (no count-up or stagger), e.g. when the card is shown again. */
  instant?: boolean
  /** Travel elsewhere (the "Summon now ▸" call to action). */
  onGo?: (place: PlaceId) => void
  /** Watch the full replay of a swept fight. */
  onReplay?: () => void
  /** Take a Door for the next floor straight from the card. */
  onChooseDoor?: (index: number) => void
  /** Isel's Skull-door explanation was acknowledged. */
  onSeenDoorGuide?: () => void
  /** End the Sortie and bank the purse. */
  onReturnToCampus?: () => void
}

export function ResultsScreen({
  result,
  state,
  store,
  onContinue,
  preLevels,
  goldBefore,
  orders = [],
  preSortie = null,
  swept = false,
  instant = false,
  onGo,
  onReplay,
  onChooseDoor,
  onSeenDoorGuide,
  onReturnToCampus,
}: ResultsScreenProps) {
  const win = result.cleared
  const failed = result.result.outcome === 'failed'
  const retreated = result.result.outcome === 'retreat'
  const fallen = result.fallenHeroIds.map((id) => state.heroes[id]).filter(Boolean) as OwnedHero[]

  // Fixed at first show: later dispatches (a Door, a Legacy action) must not move the numbers.
  const [snap] = useState(() => ({
    gained: goldBefore !== undefined ? Math.max(0, state.gold - goldBefore) : result.goldAwarded,
    gold: state.gold,
    ups: levelUps(preLevels, state),
    avenged: avengedNames(result, state),
    reasons: explainFloor(result, orders, state),
    mvp: win || retreated ? mvpOf(result.result.log) : null,
    sortie: state.tower.sortie,
    rested: state.meta.rested?.charges ?? 0,
  }))
  const reduced = getPrefs().reducedMotion
  const animate = !instant && !reduced
  const gold = useCountUp(snap.gained, {
    animate,
    durationMs: 900,
    delayMs: 250,
    onStep: (i) => sfx('coin', { semis: Math.min(12, i) }),
  })
  const xp = useCountUp(result.xpAwarded, { animate, durationMs: 700, delayMs: 350 })
  const mats = useMemo(() => materialRows(result), [result])
  // The heroes who fought get a row each; the bench (shared XP) gets one line.
  const deployed = new Set<string>([...result.result.survivorHeroIds, ...result.fallenHeroIds])
  const fighters = snap.ups.filter((u) => deployed.has(u.hero.id)).slice(0, 6)
  const bench = snap.ups.filter((u) => !fighters.includes(u))
  // Two fighters who share a first name (a big roster has a few) get their full names.
  const firstNames = fighters.map((u) => firstName(u.hero))
  const rowName = (h: OwnedHero) => (firstNames.filter((n) => n === firstName(h)).length > 1 ? h.name : firstName(h))
  const progress = summonProgress(snap.gold, snap.gained)
  const shownGold = snap.gold - snap.gained + gold
  const [fill, setFill] = useState(animate ? progress.fromPct : progress.toPct)

  // Stings for the moments the player caused: revenge, level-ups.
  useEffect(() => {
    if (!animate) {
      setFill(progress.toPct)
      return
    }
    const timers: ReturnType<typeof setTimeout>[] = []
    timers.push(setTimeout(() => setFill(progress.toPct), 300))
    if (snap.avenged.length > 0) timers.push(setTimeout(() => sfx('saved'), 200))
    if (snap.ups.length > 0) timers.push(setTimeout(() => sfx('levelup'), 900))
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Every row of the cascade takes the next stagger slot.
  let i = 0
  const lines: ReactNode[] = []
  if (win && result.kind === 'elite') {
    lines.push(
      <div key="elite" className="bonus-line cascade-row" style={row(i++)}>
        {KIND_ICON.elite} {t('Skull door: ×{m} gold', { m: TUNING.climb.reward.eliteGoldMult })}
      </div>,
    )
  }
  if ((result.restedBonus ?? 0) > 0) {
    lines.push(
      <div key="rested" className="bonus-line cascade-row" style={row(i++)}>
        ⚡ {t('Pent-up Interference: +{n} gold', { n: (result.restedBonus ?? 0).toLocaleString() })}
        <span className="muted small">
          {' · '}
          {snap.rested === 0 ? t('no charges left') : snap.rested === 1 ? t('1 charge left') : t('{n} charges left', { n: snap.rested })}
        </span>
      </div>,
    )
  }
  for (const a of snap.avenged) {
    lines.push(
      <div key={`rev|${a.bane}`} className="bonus-line cascade-row" style={row(i++)}>
        ⚔ {t('Revenge on {bane}: +{n} gold', { bane: a.bane, n: Math.round(TUNING.legacy.nemesis.rewardGoldPerFloor * result.floor * worldMultOf(state)).toLocaleString() })}
      </div>,
    )
  }
  if (win && (result.sortieBonus ?? 0) > 0) {
    lines.push(
      <div key="sortie" className="bonus-line purse cascade-row" style={row(i++)}>
        ⚑ {t('Streak bonus: +{n} into the purse', { n: (result.sortieBonus ?? 0).toLocaleString() })}
        {snap.sortie && <span className="muted small"> · {t('◆ {n} at risk', { n: snap.sortie.purse.toLocaleString() })}</span>}
      </div>,
    )
  }
  if (!win && preSortie && preSortie.purse > 0 && snap.sortie === null) {
    lines.push(
      <div key="sortie-end" className="bonus-line lost cascade-row" style={row(i++)}>
        ⚑ {t('Sortie over: {kept} of the ◆ {purse} purse was saved.', { kept: keptOnRout(preSortie.purse).toLocaleString(), purse: preSortie.purse.toLocaleString() })}
      </div>,
    )
  }

  const doorsHere = win && !!onChooseDoor && !!state.tower.doors?.length && state.tower.event === null
  const sortieNow = state.tower.sortie
  const bank = sortieNow && onReturnToCampus ? (
    <button className={doorsHere ? 'pbtn sm' : 'pbtn'} onClick={onReturnToCampus}>
      ⌂ {t('Return to campus (bank +{n})', { n: sortieNow.purse.toLocaleString() })}
    </button>
  ) : null
  const teaser = doorsHere ? null : nextTeaser(state)
  // Short of a summon, but the Sortie's purse would cover it: banking is the nudge.
  const bankBuys = !progress.ready && !!sortieNow && sortieNow.purse > 0 && snap.gold + sortieNow.purse >= progress.cost

  return (
    <div className={`overlay results-overlay ${reduced ? 'motion-off' : ''}`}>
      <div className={`result-card ${animate ? 'cascade' : ''}`}>
        {snap.avenged.length > 0 && (
          <div className="avenged-banner">
            <div className="avenged-title">{t('AVENGED!')}</div>
            {snap.avenged.map((a) => (
              <div key={a.bane} className="avenged-line">
                {a.hero ? t('{bane} has fallen. {hero} can rest now.', { bane: a.bane, hero: a.hero }) : t('{bane} has fallen.', { bane: a.bane })}
              </div>
            ))}
          </div>
        )}
        <div className={`big-outcome ${win ? 'win' : 'lose'}`}>{win ? t('FLOOR CLEARED') : failed ? t('MISSION FAILED') : retreated ? (result.routed ? t('ROUTED') : t('RETREATED')) : t('DEFEATED')}</div>
        <div className="muted">
          {t('Floor {floor}', { floor: result.floor })}
          {result.kind && result.kind !== 'path' && (
            <>
              {' '}
              <KindBadge kind={result.kind} />
            </>
          )}
          {result.firstClear && win ? ' · ' + t('first clear bonus!') : ''}
          {failed ? ' · ' + t('the escort fell — the floor must be retried') : ''}
          {retreated && !result.routed ? ' · ' + t('you pulled them out — everyone standing came home') : ''}
          {result.routed ? ' · ' + t('the line broke, and the survivors fled home') : ''}
        </div>
        {swept && (
          <div className="swept-chip">
            ⚡ {t('Swept: an easy floor, nobody lost.')}
            {onReplay && (
              <button className="linkish" onClick={onReplay}>
                {t('Watch full replay')}
              </button>
            )}
          </div>
        )}

        <div className="reward-row">
          <div className="r">
            <div className="n" style={{ color: 'var(--gold)' }}>
              +{gold.toLocaleString()}
              {win && <CoinBurst gold={snap.gained} seed={`${result.floor}|${result.result.log.seed}`} enabled={animate} />}
            </div>
            <div className="l">{t('Gold')}</div>
          </div>
          <div className="r">
            <div className="n" style={{ color: 'var(--accent-2)' }}>+{xp.toLocaleString()}</div>
            <div className="l">{t('XP each')}</div>
          </div>
        </div>

        {lines}

        {mats.length > 0 && (
          <div className="mat-row cascade-row" style={row(i++)}>
            <span className="muted small">{t('Materials won')}</span>
            {mats.map((m) => (
              <span key={m.id} className="chip mat-chip">
                +{m.n} {m.label}
              </span>
            ))}
          </div>
        )}

        {snap.ups.length > 0 && (
          <div className="level-ups">
            {fighters.map((u) => (
              <div key={u.hero.id} className="lvl-row cascade-row" style={row(i++)}>
                <img className="px" src={heroBustUrl(u.hero)} width={32} height={32} alt="" />
                <span className="lvl-up">▲</span> {t('{name} Lv {a}→{b}', { name: rowName(u.hero), a: u.from, b: u.to })}
              </div>
            ))}
            {bench.length > 0 && (
              <div className="lvl-bench cascade-row" style={row(i++)}>
                <span className="lvl-busts" aria-hidden="true">
                  {bench.slice(0, 8).map((u) => (
                    <img key={u.hero.id} className="px" src={heroBustUrl(u.hero)} width={20} height={20} alt="" />
                  ))}
                </span>
                <span>
                  <span className="lvl-up">▲</span>{' '}
                  {bench.length === 1
                    ? t('{name} grew stronger on the bench.', { name: firstName(bench[0]!.hero) })
                    : t('{n} heroes on the bench grew stronger.', { n: bench.length })}
                </span>
              </div>
            )}
          </div>
        )}

        {result.skillProgress.length > 0 && (
          <div className="skill-progress">
            {result.skillProgress.map((p, k) => (
              <div key={k} className={`sp-row ${p.kind} cascade-row`} style={row(i++)}>
                {skillProgressLine(p, state)}
              </div>
            ))}
          </div>
        )}

        {result.hiddenFound.length > 0 && (
          <div className="skill-progress">
            {result.hiddenFound.map((id) => {
              const h = HIDDEN_OBJECTIVES.find((x) => x.id === id)
              return (
                <div key={id} className="sp-row achievement">
                  ✧ {t('Hidden objective:')} {t(h?.name ?? id)}
                  {h?.reward.gems ? ` · ${t('+{n} gems', { n: h.reward.gems })}` : ''}
                </div>
              )
            })}
          </div>
        )}

        {(snap.mvp || snap.reasons.length > 0) && (
          <div className="because cascade-row" style={row(i++)}>
            <div className="because-title">{t('Because…')}</div>
            {snap.mvp && (
              <div className="because-line mvp">
                ★{' '}
                {snap.mvp.kills === 0
                  ? t('MVP: {name} · {dmg} damage', { name: snap.mvp.name, dmg: snap.mvp.damage.toLocaleString() })
                  : snap.mvp.kills === 1
                    ? t('MVP: {name} · {dmg} damage · 1 kill', { name: snap.mvp.name, dmg: snap.mvp.damage.toLocaleString() })
                    : t('MVP: {name} · {dmg} damage · {k} kills', { name: snap.mvp.name, dmg: snap.mvp.damage.toLocaleString(), k: snap.mvp.kills })}
              </div>
            )}
            {snap.reasons.map((r, k) => (
              <div key={k} className={`because-line ${r.kind}`}>
                {r.icon} {r.text}
              </div>
            ))}
          </div>
        )}

        {result.refusedHeroIds.length > 0 && (
          <div className="fallen">
            <div className="ft">{t('✋ Refused to fight')}</div>
            {result.refusedHeroIds.map((id) => (
              <div key={id}>
                {state.heroes[id]?.name ?? id} <span className="muted">{t('(Wary and broken — win back their trust)')}</span>
              </div>
            ))}
          </div>
        )}

        {result.worldSaved && (
          <div className="world-ended pframe" style={{ borderColor: 'var(--good)', color: '#c8f0d0' }}>
            {t('You refused the win condition. The Herald falls, and the world beneath the tower is still there.')}
          </div>
        )}

        {result.worldEnded && (
          <div className="world-ended pframe">
            {t('The ninetieth floor falls — and with it, the world beneath the tower. No one on its surface survives.')}
          </div>
        )}

        {result.loopRollback && (
          <div className="fallen">
            <div className="ft">{t('↺ The loop resets')}</div>
            <div>{t('The gate held. The waiting room drops back to floor {fallbackTo}.', { fallbackTo: TUNING.tower.loop.fallbackTo })}</div>
          </div>
        )}

        {/* A waiting Boon is already named by the "Next:" teaser below. */}
        {result.event && !(result.event.kind === 'boon' && teaser) && (
          <div className="muted" style={{ marginBottom: 10 }}>
            {result.event.kind === 'tournament'
              ? t('🏆 A tournament gathers between the floors.')
              : result.event.kind === 'recovery'
                ? t('✚ The tower offers a recovery floor.')
                : result.event.kind === 'boon'
                  ? t('✦ The tower offers a Boon before the next climb.')
                  : t('✦ An event floor opens before the next climb.')}
          </div>
        )}

        {fallen.length > 0 && (
          <div className="fallen">
            <div className="ft">{t('☠ Permanently lost')}</div>
            {fallen.map((h) => (
              <div key={h.id}>
                {h.name} <span className="muted">{t('({star}★ Lv{level})', { star: h.star, level: h.xp.level })}</span>
              </div>
            ))}
          </div>
        )}

        <LegacySlot state={state} store={store} result={result} />

        {(snap.gained > 0 || progress.ready) && (
          <div className={`summon-bar ${progress.ready ? 'ready' : ''}`}>
            <div className="sb-head">
              <span>{t('Toward the next summon')}</span>
              <span className="coin-target">
                ◆ {Math.min(shownGold, progress.cost).toLocaleString()} / {progress.cost.toLocaleString()}
              </span>
            </div>
            <span className="gauge sb-gauge">
              <span style={{ width: `${Math.round(fill * 100)}%` }} />
            </span>
            {progress.ready ? (
              onGo ? (
                <button className="btn gold sm summon-cta" onClick={() => onGo('summon')}>
                  ✦ {t('Summon now ▸')}
                  {sortieNow && <span className="small"> {t('(banks the purse)')}</span>}
                </button>
              ) : (
                <span className="chip summon-ready">✦ {t('A summon is ready')}</span>
              )
            ) : bankBuys && onGo ? (
              <button className="btn gold sm summon-cta" onClick={() => onGo('summon')}>
                ⌂ {t('Bank +{n} and summon ▸', { n: sortieNow!.purse.toLocaleString() })}
              </button>
            ) : (
              <span className="muted small">{t('{n} more gold', { n: progress.missing.toLocaleString() })}</span>
            )}
          </div>
        )}

        {teaser && <div className="teaser">{teaser}</div>}

        {doorsHere ? (
          <div className="results-next">
            <DoorPicker state={state} onChoose={onChooseDoor!} onSeenGuide={onSeenDoorGuide} compact />
            <div className="results-actions">
              {bank}
              <button className="pbtn sm ghost" onClick={onContinue}>
                {t('Look around first')}
              </button>
            </div>
          </div>
        ) : win && bank && state.tower.event === null ? (
          <div className="results-actions">
            <button className="btn primary big" onClick={onContinue}>
              {t('Press on ▸')}
            </button>
            {bank}
          </div>
        ) : (
          <button className="btn primary big" onClick={onContinue} style={{ marginTop: 8 }}>
            {win ? (state.tower.event?.kind === 'boon' ? t('Choose a Boon ▸') : t('Onward ▸')) : t('Regroup')}
          </button>
        )}
      </div>
    </div>
  )
}
