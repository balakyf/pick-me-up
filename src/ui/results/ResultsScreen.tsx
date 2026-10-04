/**
 * The results ceremony (lane K). A fight ends and the screen celebrates or mourns:
 *
 * 1. the banner (an anchor's is bigger and names the boss brought down);
 * 2. when heroes fell, the memorial band — the world behind goes grey, each of the fallen
 *    gets a band (their bust, name, floors climbed, last words, who mourns them) and Isel
 *    speaks for them; a victory with losses mourns before it counts;
 * 3. the rewards counting up with the sounds lane H made for them (coins as the gold
 *    climbs, a stamp for a first clear, a flip or a chime per drop, a level-up per skill);
 * 4. the report: who stayed home, the world's news, the camp a heavy loss opens, and the
 *    battle report (per-hero stats from the log, and the MVP).
 *
 * A click on the card, Space or Esc skips to the end; the button always leaves. The
 * battle-speed setting shortens the ceremony; reduced motion shows it all at once.
 * Timing lives in ceremony.ts, the stats in battleStats.ts, the band in memorialBand.ts —
 * this component only lays them out.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { FloorResult, GameState, OwnedHero } from '../../engine/types'
import { TUNING } from '../../engine/tuning'
import { HIDDEN_OBJECTIVES } from '../../engine/content'
import { t } from '../i18n/i18n'
import { skillProgressLine } from './skillProgress'
import { fmtInt } from '../text'
import { deployReasonFix, deployReasonText } from '../deployReason'
import { pickerName } from '../hero/heroLabel'
import { getSettings } from '../qol/settings'
import { useReducedMotion } from '../motion'
import { heroBustUrl, iselBustUrl } from '../pixel/sprites'
import { cachedDataUrl } from '../pixel/render'
import { matLabel } from '../facilities/shared'
import { floorName } from '../tower/floorNames'
import { battleStats, mvpReason, type BattleStats, type HeroBattleStat } from './battleStats'
import { ceremonyPlan, countUp, stepAt, type CeremonyStep } from './ceremony'
import { iselClose, memorialBands, resultMood, type MemorialBand } from './memorialBand'
import { anchorHeadline, rareDropIndices, rewardDrops } from './rewards'
import { bannerNote, bannerWord, campView, continueLabel } from './resultsText'
import { useCeremony } from './useCeremony'
import { StoryAftermath } from '../story/StoryNotes'
import { drawCampfire, FIRE_H, FIRE_W } from '../title/diorama'
import './results.css'

export function ResultsScreen({ result, state, onContinue }: { result: FloorResult; state: GameState; onContinue: () => void }) {
  const win = result.cleared
  const anchor = useMemo(() => anchorHeadline(result.floor, result.result.log), [result])
  const mood = resultMood(result, anchor !== null)
  const bands = useMemo(() => memorialBands(state, result), [state, result])
  const stats = useMemo(() => battleStats(result.result.log), [result])
  const drops = useMemo(() => rewardDrops(result), [result])
  const reduced = useReducedMotion()
  // The ceremony's pace: the Master's default battle speed (read once; it is a setting).
  const [speed] = useState(() => getSettings().battleSpeed)
  const plan = useMemo(
    () =>
      ceremonyPlan(
        {
          won: win,
          anchor: anchor !== null,
          firstClear: result.firstClear,
          gold: result.goldAwarded,
          xp: result.xpAwarded,
          drops: drops.length,
          rareDrops: rareDropIndices(drops),
          hidden: result.hiddenFound.length,
          skills: result.skillProgress.map((p) => p.kind),
          fallen: bands.length,
        },
        { speed, reduced },
      ),
    // The plan is fixed for this result (a motion change mid-ceremony does not restart it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result],
  )
  const { elapsed, done, skip } = useCeremony(plan)
  const step = (id: string): CeremonyStep | undefined => plan.steps.find((s) => s.id === id)
  const at = (id: string) => {
    const s = step(id)
    return s ? stepAt(s, elapsed) : { phase: 'done' as const, progress: 1 }
  }
  const cls = (id: string) => `rc-step ${at(id).phase}`

  // Keys: Space / Esc skip the ceremony; Enter (once it is over) leaves. Held keys are ignored.
  const live = useRef({ done, skip, onContinue })
  live.current = { done, skip, onContinue }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      const L = live.current
      if (e.key === ' ' || e.key === 'Escape') {
        if (!L.done) {
          e.preventDefault()
          L.skip()
        }
      } else if (e.key === 'Enter' && L.done) {
        const focused = document.activeElement
        if (focused instanceof HTMLElement && focused.tagName === 'BUTTON') return
        e.preventDefault()
        L.onContinue()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Older results (saved before the deploy rails) only carry the rebels.
  const refusals = result.refusals ?? result.refusedHeroIds.map((heroId) => ({ heroId, reason: 'rebellion' as const }))
  const queue = state.tower.event && result.event && state.tower.event.kind === result.event.kind && state.tower.event.floor === result.event.floor ? state.tower.eventQueue : undefined
  const camp = campView(result.event, queue)
  const close = iselClose(mood, bands.map((b) => b.heroId))
  const gold = at('gold')
  const xp = at('xp')
  const note = bannerNote(result, mood)
  const fillerName = anchor ? null : floorName(state.seed, result.floor)
  const grey = bands.length > 0

  return (
    <div
      className={`overlay results mood-${mood} ${grey ? 'grey' : ''} ${anchor ? 'anchor' : ''} ${done ? 'settled' : ''}`}
      onClick={() => {
        if (!done) skip()
      }}
    >
      <div className="result-card rc" role="dialog" aria-label={bannerWord(result)}>
        {/* 1 · the banner */}
        <div className={`${cls('banner')} rc-banner`}>
          {anchor && win && <div className="rc-kicker">{t('Anchor floor · {mission}', { mission: t(anchor.mission) })}</div>}
          <div className={`big-outcome ${win ? 'win' : 'lose'}`}>{bannerWord(result)}</div>
          {anchor?.boss && win && (
            <div className="rc-boss" style={{ ['--boss' as string]: anchor.boss.color } as CSSProperties}>
              {t('{name} · {epithet}', { name: t(anchor.boss.name), epithet: t(anchor.boss.epithet) })} <span className="rc-boss-fell">{t('has fallen')}</span>
            </div>
          )}
          {/* Lane M: the anchor's aftermath, in a line. */}
          {anchor && win && <StoryAftermath result={result} />}
          <div className="muted">
            {t('Floor {floor}', { floor: result.floor })}
            {fillerName ? ` · ${fillerName}` : ''}
            {note ? ` · ${note}` : ''}
          </div>
          {result.firstClear && win && (
            <div className={`${cls('first-clear')} rc-stamp`} aria-label={t('First clear')}>
              {t('FIRST CLEAR')}
            </div>
          )}
        </div>

        {/* 2 · the memorial band */}
        {bands.length > 0 && (
          <div className="rc-memorial" aria-label={t('The fallen')}>
            <div className="rc-mem-head">{t('☠ Permanently lost')}</div>
            {bands.map((b, i) => (
              <Band key={b.heroId} band={b} className={cls(`memorial:${i}`)} />
            ))}
            {close && (
              <div className={`${cls(`memorial:${bands.length - 1}`)} rc-isel-close`}>
                <img className="px" src={iselBustUrl()} width={32} height={32} alt="" />
                <span>
                  <b>{t('Isel')}</b> “{close}”
                </span>
              </div>
            )}
          </div>
        )}

        {/* 3 · the rewards */}
        {(result.goldAwarded > 0 || result.xpAwarded > 0) && (
          <div className="reward-row rc-rewards">
            {result.goldAwarded > 0 && (
              <div className={`r ${cls('gold')}`}>
                <div className="n rc-gold">
                  +{fmtInt(countUp(result.goldAwarded, gold.progress))}
                  {gold.phase === 'done' && !plan.instant && <span className="rc-pop">+{fmtInt(result.goldAwarded)}</span>}
                </div>
                <div className="l">{t('Gold')}</div>
              </div>
            )}
            {result.xpAwarded > 0 && (
              <div className={`r ${cls('xp')}`}>
                <div className="n rc-xp">+{fmtInt(countUp(result.xpAwarded, xp.progress))}</div>
                <div className="l">{t('XP each')}</div>
              </div>
            )}
          </div>
        )}

        {drops.length > 0 && (
          <div className="rc-drops">
            {drops.map((d, i) => (
              <span key={d.id} className={`${cls(`drop:${i}`)} rc-drop rarity-${d.rarity}`}>
                {matLabel(d.id)} <b>×{d.n}</b>
              </span>
            ))}
          </div>
        )}

        {result.hiddenFound.length > 0 && (
          <div className="skill-progress">
            {result.hiddenFound.map((id, i) => {
              const h = HIDDEN_OBJECTIVES.find((x) => x.id === id)
              return (
                <div key={id} className={`sp-row achievement ${cls(`hidden:${i}`)}`}>
                  ✧ {t('Hidden objective:')} {t(h?.name ?? id)}
                  {h?.reward.gems ? ` · ${t('+{n} gems', { n: h.reward.gems })}` : ''}
                </div>
              )
            })}
          </div>
        )}

        {result.skillProgress.length > 0 && (
          <div className="skill-progress">
            {result.skillProgress.map((p, i) => (
              <div key={i} className={`sp-row ${p.kind} ${cls(`skill:${i}`)}`}>
                {skillProgressLine(p, state)}
              </div>
            ))}
          </div>
        )}

        {/* 4 · the report */}
        <div className={`${cls('report')} rc-report`}>
          {/* B13: every slotted hero who stayed home, with the true reason and its fix. */}
          {refusals.length > 0 && (
            <div className="fallen stayed-home">
              <div className="ft">{t('✋ Stayed behind')}</div>
              {refusals.map((r) => {
                const hero = state.heroes[r.heroId]
                return (
                  <div key={r.heroId}>
                    {hero ? pickerName(state, hero) : r.heroId} <span className="muted">{deployReasonText(r.reason)}</span>{' '}
                    <span className="muted small">— {deployReasonFix(r.reason)}</span>
                  </div>
                )
              })}
            </div>
          )}

          {result.worldSaved && (
            <div className="world-ended pframe" style={{ borderColor: 'var(--good)', color: '#c8f0d0' }}>
              {t('You refused the win condition. The Herald falls, and the world beneath the tower is still there.')}
            </div>
          )}
          {result.worldEnded && (
            <div className="world-ended pframe">{t('The ninetieth floor falls — and with it, the world beneath the tower. No one on its surface survives.')}</div>
          )}
          {result.loopRollback && (
            <div className="fallen">
              <div className="ft">{t('↺ The loop resets')}</div>
              <div>{t('The gate held. The waiting room drops back to floor {fallbackTo}.', { fallbackTo: TUNING.tower.loop.fallbackTo })}</div>
            </div>
          )}

          {camp && <Camp camp={camp} />}

          <Report stats={stats} state={state} />
        </div>

        <div className="rc-actions">
          {!done && (
            <button
              className="pbtn ghost rc-skip"
              onClick={(e) => {
                e.stopPropagation()
                skip()
              }}
            >
              {t('Skip')} <kbd>Space</kbd>
            </button>
          )}
          <button
            className="btn primary big"
            onClick={(e) => {
              e.stopPropagation()
              onContinue()
            }}
          >
            {continueLabel(result)}
          </button>
        </div>
      </div>
    </div>
  )
}

/** One of the fallen. */
function Band({ band, className }: { band: MemorialBand; className: string }) {
  return (
    <div className={`${className} rc-band`}>
      <img className="px rc-band-bust" src={heroBustUrl(band.look)} width={48} height={48} alt="" />
      <div className="rc-band-body">
        <div className="rc-band-name">
          <b>{band.name}</b> <span className="muted small">{t('({star}★ Lv{level})', { star: band.star, level: band.level })}</span>
        </div>
        <div className="muted small">
          {t('climbed to floor {n}', { n: band.floorsClimbed })} · {t('served {n} days', { n: band.daysServed })}
          {band.mourners.length > 0 && ` · ${t('mourned by {names}', { names: band.mourners.join(', ') })}`}
        </div>
        <div className="rc-last-words">“{band.lastWords}”</div>
        <div className="rc-isel">
          <img className="px" src={iselBustUrl()} width={20} height={20} alt="" />
          <span>{band.isel}</span>
        </div>
      </div>
    </div>
  )
}

/** The camp (or the event) the attempt opened, and what waits behind it. */
function Camp({ camp }: { camp: NonNullable<ReturnType<typeof campView>> }) {
  const fire0 = cachedDataUrl('campfire|0', () => drawCampfire(0))
  const fire1 = cachedDataUrl('campfire|1', () => drawCampfire(1))
  return (
    <div className={`rc-camp kind-${camp.kind}`}>
      {camp.kind === 'recovery' ? (
        <span className="rc-fire" aria-hidden="true">
          {fire0 && <img className="px f0" src={fire0} width={FIRE_W * 2} height={FIRE_H * 2} alt="" />}
          {fire1 && <img className="px f1" src={fire1} width={FIRE_W * 2} height={FIRE_H * 2} alt="" />}
        </span>
      ) : (
        <span className="rc-camp-icon" aria-hidden="true">
          {camp.icon}
        </span>
      )}
      <div>
        <div className="rc-camp-title">{camp.title}</div>
        {camp.body && <div className="muted small">{camp.body}</div>}
        {camp.then.map((line) => (
          <div key={line} className="muted small rc-camp-then">
            ⏭ {line}
          </div>
        ))}
      </div>
    </div>
  )
}

const REASON: Record<NonNullable<ReturnType<typeof mvpReason>>, string> = {
  dealt: 'led the attack',
  healed: 'kept the party standing',
  shielded: 'the shields that held',
  taken: 'took the blows meant for others',
  broke: 'broke the big moves',
}

/** The battle report: one row per hero, the MVP crowned. */
function Report({ stats, state }: { stats: BattleStats; state: GameState }) {
  const [open, setOpen] = useState(true)
  if (stats.heroes.length === 0) return null
  const reason = mvpReason(stats)
  const team = stats.team
  return (
    <div className="rc-stats">
      <button
        className="rc-stats-head"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          setOpen(!open)
        }}
      >
        {open ? '▾' : '▸'} {t('Battle report')}
        <span className="muted small">
          {team.bigMoves > 0 && ` · ${t('big moves answered {a}/{n}', { a: team.answered, n: team.bigMoves })}`}
          {team.ordersUsed > 0 && ` · ${t('orders {n}', { n: team.ordersUsed })}`}
        </span>
      </button>
      {open &&
        stats.heroes.map((h) => (
          <StatRow key={h.id} h={h} hero={state.heroes[h.id as keyof typeof state.heroes]} mvp={h.id === stats.mvpId} reason={h.id === stats.mvpId && reason ? t(REASON[reason]) : null} />
        ))}
    </div>
  )
}

function StatRow({ h, hero, mvp, reason }: { h: HeroBattleStat; hero: OwnedHero | undefined; mvp: boolean; reason: string | null }) {
  const chips: [string, string, number][] = [
    ['dealt', t('dmg'), h.dealt],
    ['taken', t('taken'), h.taken],
    ['healed', t('healed'), h.healed],
    ['shielded', t('shielded'), h.shielded],
    ['kills', t('KOs'), h.kills],
    ['crits', t('crits'), h.crits],
    ['casts', t('skills'), h.casts],
    ['broke', t('broke'), h.broke],
  ]
  const shown = chips.filter(([k, , n]) => n > 0 || k === 'dealt' || k === 'taken')
  return (
    <div className={`rc-stat ${mvp ? 'mvp' : ''} ${h.fell ? 'fell' : ''}`}>
      <div className="rc-stat-who">
        {hero && <img className="px" src={heroBustUrl(hero)} width={28} height={28} alt="" />}
        <span className="rc-stat-name">
          {h.fell && '☠ '}
          {h.name.split(/\s+/)[0]}
        </span>
        {mvp && (
          <span className="rc-mvp" title={reason ?? undefined}>
            {t('MVP')}
          </span>
        )}
      </div>
      <div className="rc-stat-chips">
        {shown.map(([k, label, n]) => (
          <span key={k} className={`rc-chip k-${k}`}>
            <b>{fmtInt(n)}</b> {label}
          </span>
        ))}
        {mvp && reason && <span className="rc-chip k-why">{reason}</span>}
      </div>
    </div>
  )
}
