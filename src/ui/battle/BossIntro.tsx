import type { CombatUnitInit } from '../../engine/types'
import { t } from '../i18n/i18n'
import { introOf, introTitle, phasesOf, type IntroTier } from './bossIntro'
import { shownLevel } from './battleFrames'
import './bossShow.css'

/**
 * A boss's title card (lane I): the stage dims around it, the camera eases in (BattleScene),
 * and the card slams down — 'EL CID · THE FALLEN RANKER', its level and how many phases it
 * has in it, and whoever came with it. Screen-space, keyed per beat so it plays once. A
 * click (or Esc) skips it; at 2×/4× it is short; under reduced motion it only fades.
 * `wakes`: the Lv999 Creature opening its eyes gets the same card, in red.
 */
export function BossIntroCard({
  units,
  tier,
  calm,
  durMs,
  onSkip,
  wakes = false,
  wave = null,
}: {
  /** The arrivals, main first. */
  units: CombatUnitInit[]
  tier: IntroTier
  calm: boolean
  /** How long the card holds (real ms, already speed-scaled). */
  durMs: number
  onSkip: () => void
  wakes?: boolean
  /** The wave it opens, when the fight has several. */
  wave?: { n: number; total: number } | null
}) {
  const main = units[0]
  if (!main) return null
  const intro = introOf(main.templateId)
  const { name, epithet } = introTitle(main)
  const phases = phasesOf(main.templateId).length
  const kicker = wakes ? t('It wakes') : tier === 'boss' ? t('Boss') : tier === 'lieutenant' ? t('Lieutenant') : t('Echo')
  return (
    <div
      className={`boss-intro ${tier} ${calm ? 'calm' : ''} ${wakes ? 'wakes' : ''}`}
      style={{ ['--boss-color' as string]: wakes ? '#ff3a2e' : intro?.color ?? '#f2c75c', ['--intro-dur' as string]: `${Math.max(200, durMs)}ms` }}
      role="status"
      aria-live="polite"
      onClick={onSkip}
    >
      <div className="bi-card">
        <div className="bi-kicker">
          {kicker}
          {wave && wave.total > 1 && <span className="bi-wave"> · {t('Wave {n}/{total}', { n: wave.n, total: wave.total })}</span>}
        </div>
        <div className="bi-title">
          <span className="bi-name">{name}</span>
          <span className="bi-dot"> · </span>
          <span className="bi-epithet">{wakes ? t('It wakes') : epithet}</span>
        </div>
        <div className="bi-sub">
          {t('Lv {n}', { n: shownLevel(main) })}
          {phases > 0 && !wakes && <span className="bi-phases"> · {t('Phase {n} of {m}', { n: 1, m: phases + 1 })}</span>}
        </div>
        {units.slice(1, 3).map((u) => {
          const o = introTitle(u)
          return (
            <div key={u.id} className="bi-with">
              {t('with {name} · {epithet}', { name: o.name, epithet: o.epithet })}
            </div>
          )
        })}
        {/* (The click reaches the card's own handler: one skip.) */}
        <button type="button" className="bi-skip">
          {t('Skip')} ›
        </button>
      </div>
    </div>
  )
}

/** The stage dims around the arrival (stage coordinates, inside the scaled stage). */
export function BossSpotlight({ x, y, r, durMs, wakes = false }: { x: number; y: number; r: number; durMs: number; wakes?: boolean }) {
  return (
    <div
      className={`bi-dim ${wakes ? 'wakes' : ''}`}
      style={{
        ['--sx' as string]: `${Math.round(x)}px`,
        ['--sy' as string]: `${Math.round(y)}px`,
        ['--sr' as string]: `${Math.round(r)}px`,
        ['--intro-dur' as string]: `${Math.max(200, durMs)}ms`,
      }}
      aria-hidden="true"
    />
  )
}
