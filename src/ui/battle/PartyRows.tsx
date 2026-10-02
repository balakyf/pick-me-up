import type { CombatUnitInit } from '../../engine/types'
import { t } from '../i18n/i18n'
import type { Snap } from './battleFrames'
import { HpBar, SpBar } from './HpBar'
import { StatusIcons } from './StatusIcons'
import { unitStatus } from './statusCaptions'

/** The party window under the stage: bust, name, level, HP (with its ghost) and SP of every ally. */
export function PartyRows({
  heroes,
  snap,
  aiming,
  bustOf,
  onAim,
  aimableFor,
  picked = null,
}: {
  heroes: CombatUnitInit[]
  snap: Snap
  /** A Protect order is waiting for its hero (or escort). */
  aiming: boolean
  bustOf: (u: CombatUnitInit) => string
  onAim: (u: CombatUnitInit) => void
  /** Which rows an order is waiting for (lane G: Unleash and Swap skip the escort). */
  aimableFor?: (u: CombatUnitInit) => boolean
  /** The hero already picked (the first of a swap). */
  picked?: string | null
}) {
  return (
    <div className="pframe battle-party">
      {heroes.map((u) => {
        const hp = Math.max(0, snap.hp[u.id] ?? u.maxHP)
        const pct = (hp / u.maxHP) * 100
        const dead = !!snap.dead[u.id]
        return (
          <div
            key={u.id}
            className={`party-row ${snap.actor === u.id ? 'active' : ''} ${dead ? 'dead' : ''} ${(aimableFor ? aimableFor(u) : aiming) && !dead ? 'aimable' : ''} ${picked === u.id ? 'picked' : ''}`}
            onClick={() => onAim(u)}
          >
            <img className="px party-bust" src={bustOf(u)} width={24} height={24} alt="" />
            <span className="party-name">
              {u.isNpc
                ? t(u.name).replace(/^(Princess|Princesse) /, '')
                : heroes.filter((o) => o.name.split(/\s+/)[0] === u.name.split(/\s+/)[0]).length > 1
                  ? u.name
                  : u.name.split(/\s+/)[0]}
              <StatusIcons view={unitStatus(snap.status, u.id)} compact dead={dead} />
            </span>
            <span className="party-lv">{u.isNpc ? t('escort') : `Lv${u.level}`}</span>
            <span className="party-hp">
              <span className="party-bars">
                <HpBar pct={pct} />
                {!u.isNpc && u.maxSP > 0 && <SpBar sp={snap.sp[u.id] ?? u.maxSP} max={u.maxSP} />}
              </span>
              <span className="party-hpnum">
                {hp}/{u.maxHP}
              </span>
            </span>
          </div>
        )
      })}
    </div>
  )
}
