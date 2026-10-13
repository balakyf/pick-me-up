/**
 * The portrait dock (spec 2026-10-12, S16; WP2): the party under the stage as big
 * portraits instead of a text table. Each shows HP with a lagging damage trail, a ring
 * that says what the Master can do (gold = tap to Protect, red pulse = in danger) and
 * the order state (🛡 protected). Tapping a portrait gives the Protect order at once —
 * the replay re-resolves through `orders.give`, never a dispatch.
 */
import { hpColor } from '../bits'
import { t } from '../i18n/i18n'

export interface DockHero {
  id: string
  /** Display name (already shortened by the caller). */
  name: string
  bust: string
  hp: number
  maxHP: number
  level: number
  dead: boolean
  isNpc: boolean
  /** Acting this frame. */
  active: boolean
  /** Under a Protect order. */
  guarded: boolean
  /** A telegraphed blow is aimed at them. */
  targeted: boolean
  /** The Decisive Moment is about them. */
  doomed: boolean
}

/** HP share under which a portrait pulses red. */
export const DANGER_SHARE = 0.25

export function OrdersDock({
  heroes,
  canProtect,
  aiming,
  onProtect,
}: {
  heroes: readonly DockHero[]
  /** Orders exist and at least one is left. */
  canProtect: boolean
  /** The Master pressed Protect / P and is picking a hero. */
  aiming: boolean
  onProtect: (heroId: string) => void
}) {
  return (
    <div className="pframe orders-dock" role="group" aria-label={t('Party')}>
      {heroes.map((h) => {
        const pct = Math.max(0, Math.min(100, (Math.max(0, h.hp) / Math.max(1, h.maxHP)) * 100))
        const danger = !h.dead && pct < DANGER_SHARE * 100
        const tappable = canProtect && !h.dead && !h.isNpc && !h.guarded
        const cls = [
          'dock-hero',
          h.dead ? 'dead' : '',
          h.active ? 'active' : '',
          danger ? 'danger' : '',
          h.guarded ? 'guarded' : '',
          h.targeted ? 'targeted' : '',
          h.doomed ? 'doomed' : '',
          tappable ? 'ready' : '',
          tappable && aiming ? 'aimable' : '',
        ]
          .filter(Boolean)
          .join(' ')
        const body = (
          <>
            <span className="dock-ring">
              <img className="px dock-bust" src={h.bust} width={32} height={32} alt="" />
              {h.guarded && !h.dead && <span className="dock-badge guard">🛡</span>}
              {h.dead && <span className="dock-badge grave">✝</span>}
              {h.targeted && !h.dead && !h.guarded && <span className="dock-badge warn">!</span>}
            </span>
            <span className="dock-info">
              <span className="dock-name">{h.name}</span>
              <span className="dock-hp">
                <span className="dock-gauge">
                  <span className="trail" style={{ width: `${pct}%` }} />
                  <span className="fill" style={{ width: `${pct}%`, background: hpColor(pct) }} />
                </span>
                <span className="dock-hpnum">
                  {Math.max(0, h.hp)}/{h.maxHP}
                </span>
              </span>
              <span className="dock-lv">{h.isNpc ? t('escort') : `Lv${h.level}`}</span>
            </span>
          </>
        )
        return tappable ? (
          <button
            key={h.id}
            type="button"
            className={cls}
            onClick={() => onProtect(h.id)}
            aria-label={t('Protect {name}', { name: h.name })}
            title={t('Enemies avoid the hero you pick while anyone else stands')}
          >
            {body}
          </button>
        ) : (
          <div key={h.id} className={cls}>
            {body}
          </div>
        )
      })}
    </div>
  )
}
