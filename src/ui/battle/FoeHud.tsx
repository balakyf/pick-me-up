import type { CombatUnitInit } from '../../engine/types'
import { hpColor } from '../bits'
import { t } from '../i18n/i18n'
import type { Snap } from './battleFrames'

/** The foes window under the stage: each living enemy's name, level and HP. */
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
  const counts = new Map<string, number>()
  for (const u of live) counts.set(u.name, (counts.get(u.name) ?? 0) + 1)
  return (
    <div className="pframe battle-foes">
      {live.length <= 6
        ? live.map((u) => {
            const pct = (Math.max(0, snap.hp[u.id] ?? u.maxHP) / u.maxHP) * 100
            return (
              <div key={u.id} className={`foe-row ${snap.target === u.id ? 'hit' : ''} ${aiming ? 'aimable' : ''}`} onClick={() => onAim(u)}>
                <span className="foe-name">
                  {t(u.name)} <span className="muted small">Lv{u.level}</span>
                </span>
                <span className="gauge foe-hp">
                  <span style={{ width: `${pct}%`, background: hpColor(pct) }} />
                </span>
              </div>
            )
          })
        : [...counts.entries()].map(([name, n]) => (
            <div key={name} className="foe-row">
              <span>{t(name)}</span>
              {n > 1 && <span className="muted">×{n}</span>}
            </div>
          ))}
      {counts.size === 0 && <div className="muted">—</div>}
    </div>
  )
}
