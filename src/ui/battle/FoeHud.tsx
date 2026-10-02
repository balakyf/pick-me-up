import type { CombatUnitInit } from '../../engine/types'
import { hpColor } from '../bits'
import { t } from '../i18n/i18n'
import { shownLevel, type Snap } from './battleFrames'

/** Above this many foes the window switches to compact two-column rows (and scrolls). */
export const FOE_ROWS_FULL = 6

/**
 * The foes window under the stage: every living enemy's name, level and HP, each row a
 * Focus target. A big wave (late floors field 8+) packs into compact rows instead of
 * dropping the bars, so the Master can still read and aim at every foe.
 */
export function FoeHud({
  live,
  snap,
  aiming,
  onAim,
}: {
  /** Enemies on the field and standing, in roster order. */
  live: CombatUnitInit[]
  snap: Snap
  /** A Focus order is waiting for its target. */
  aiming: boolean
  onAim: (u: CombatUnitInit) => void
}) {
  const many = live.length > FOE_ROWS_FULL
  return (
    <div className={`pframe battle-foes ${many ? 'many' : ''}`}>
      {live.map((u) => {
        const hp = Math.max(0, snap.hp[u.id] ?? u.maxHP)
        const pct = (hp / u.maxHP) * 100
        const lv = shownLevel(u)
        return (
          <div
            key={u.id}
            className={`foe-row ${snap.target === u.id ? 'hit' : ''} ${aiming ? 'aimable' : ''}`}
            onClick={() => onAim(u)}
            title={`${t(u.name)} · Lv${lv} · ${hp}/${u.maxHP}`}
          >
            <span className="foe-name">
              {t(u.name)} {!many && <span className="muted small">Lv{lv}</span>}
            </span>
            <span className="gauge foe-hp">
              <span style={{ width: `${pct}%`, background: hpColor(pct) }} />
            </span>
          </div>
        )
      })}
      {live.length === 0 && <div className="muted">—</div>}
    </div>
  )
}
