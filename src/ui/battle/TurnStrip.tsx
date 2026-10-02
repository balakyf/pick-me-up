import type { CombatUnitInit } from '../../engine/types'
import { t } from '../i18n/i18n'

/**
 * Who acts now and who acts next: the current actor, then the next few as small busts
 * (heroes) and sprites (foes), from the replayed action gauges (turnOrder.ts).
 */
export function TurnStrip({
  now,
  next,
  byId,
  iconOf,
  nameOf,
  docked = false,
}: {
  now: string | null
  next: readonly string[]
  byId: Record<string, CombatUnitInit>
  iconOf: (u: CombatUnitInit) => string
  nameOf: (id: string) => string
  docked?: boolean
}) {
  const cell = (id: string, i: number, current: boolean) => {
    const u = byId[id]
    if (!u) return null
    return (
      <li key={`${i}-${id}`} className={`turn-cell ${u.side === 'hero' ? 'ally' : 'foe'} ${current ? 'now' : ''}`} title={nameOf(id)}>
        <img className="px" src={iconOf(u)} alt={nameOf(id)} />
      </li>
    )
  }
  if (next.length === 0 && !now) return null
  return (
    <div className={`turn-strip ${docked ? 'docked' : ''}`} aria-label={t('Turn order')}>
      <span className="turn-label">{t('Next')}</span>
      <ol>
        {now && cell(now, -1, true)}
        {next.map((id, i) => cell(id, i, false))}
      </ol>
    </div>
  )
}
