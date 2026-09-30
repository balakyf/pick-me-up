/** Floor modifiers in the tower: the scouting report's line and the floor list's badge. */
import type { FloorModifierId, GameState } from '../../engine/types'
import { floorModifiersFor } from '../../engine/depth'
import { t } from '../i18n/i18n'
import { MODIFIER_ICON, modifierName, modifierRule } from '../depth/floorModText'
import '../codex/combatDepth.css'

/** The scouting report's conditions block (nothing when the floor is plain). */
export function FloorModsLine({ mods }: { mods: readonly FloorModifierId[] }) {
  if (mods.length === 0) return null
  return (
    <div className="floor-mods">
      {mods.map((m) => (
        <div key={m} className="floor-mod">
          <b>{modifierName(m)}</b> — <span className="muted small">{modifierRule(m)}</span>
        </div>
      ))}
    </div>
  )
}

/** A floor's conditions as a small badge, once the floor is scouted (current) or behind you. */
export function FloorModBadge({ state, floor }: { state: GameState; floor: number }) {
  if (floor > state.tower.currentFloor) return null
  const mods = floorModifiersFor(state, floor)
  if (mods.length === 0) return null
  return (
    <span className="floor-mod-badge" title={mods.map((m) => `${modifierName(m)}: ${modifierRule(m)}`).join('\n')} aria-label={t('Floor conditions')}>
      {mods.map((m) => MODIFIER_ICON[m]).join('')}
    </span>
  )
}
