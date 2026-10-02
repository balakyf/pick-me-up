/**
 * The party as the next attempt would field it, slot by slot: who, on which line, how
 * steady (Sanity pips) and whether they will answer the call (the deploy rails).
 */
import type { DeployReason, GameState, OwnedHero } from '../../engine/types'
import { deployReport } from '../../engine/tower'
import { TUNING } from '../../engine/tuning'
import { heroBustUrl } from '../pixel/sprites'
import { sanityColor } from '../facilities/shared'
import { t } from '../i18n/i18n'
import { deployReasonText } from '../deployReason'
import { pickerName } from '../hero/heroLabel'

const PIPS = 5
/** A glyph for why a hero stays home (the tooltip says it in words). */
const REASON_GLYPH: Record<DeployReason, string> = {
  dead: '☠',
  captive: '⛓',
  expedition: '🧭',
  promotion: '⬆',
  training: '🏋',
  bounty: '📜',
  burnout: '💤',
  exhausted: '💤',
  rebellion: '✋',
}
/** A word for it, short enough for the strip. */
const REASON_SHORT: Record<DeployReason, string> = {
  dead: 'fallen',
  captive: 'captive',
  expedition: 'away',
  promotion: 'promoting',
  training: 'drilling',
  bounty: 'on a bounty',
  burnout: 'burnt out',
  exhausted: 'broken',
  rebellion: 'refuses',
}
const LINE_LABEL = { front: 'front', mid: 'mid', back: 'back' } as const

/** How many of the five Sanity pips are lit (any Sanity lights at least one). */
export function sanityPips(sanity: number, max: number = TUNING.lobby.sanityMax): number {
  if (sanity <= 0) return 0
  return Math.max(1, Math.min(PIPS, Math.ceil((sanity / max) * PIPS)))
}

export function PartyStrip({ state }: { state: GameState }) {
  const rows = deployReport(state)
  return (
    <div className="party-strip" aria-label={t('The party')}>
      {rows.map((r) => {
        const hero: OwnedHero | undefined = r.heroId ? state.heroes[r.heroId] : undefined
        if (!hero) {
          return (
            <div key={r.slot} className="ps-slot empty">
              <span className="muted small">{t('empty slot')}</span>
            </div>
          )
        }
        const lit = sanityPips(r.sanity, r.sanityMax)
        const why = r.fit ? null : r.reason && r.reason !== 'empty' ? deployReasonText(r.reason) : null
        return (
          <div
            key={r.slot}
            className={`ps-slot ${r.fit ? '' : 'out'} ${r.reason === 'dead' ? 'dead' : ''}`}
            title={`${hero.name} · ${t(LINE_LABEL[r.line])} · ${t('Sanity')} ${Math.round(r.sanity)}/${r.sanityMax}${why ? ` · ${why}` : ''}`}
          >
            <img className="px ps-bust" src={heroBustUrl(hero)} width={24} height={24} alt="" />
            <span className="ps-name">{pickerName(state, hero)}</span>
            <span className="ps-pips" aria-label={t('Sanity {n}', { n: Math.round(r.sanity) })}>
              {Array.from({ length: PIPS }, (_, i) => (
                <span key={i} className="ps-pip" style={i < lit ? { background: sanityColor(r.sanity) } : undefined} />
              ))}
            </span>
            <span className="ps-line muted small">{r.fit ? t(LINE_LABEL[r.line]) : r.reason && r.reason !== 'empty' ? (
                  <>
                    {REASON_GLYPH[r.reason]} <span className="ps-why">{t(REASON_SHORT[r.reason])}</span>
                  </>
                ) : null}</span>
          </div>
        )
      })}
    </div>
  )
}
