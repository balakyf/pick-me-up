import { t } from '../i18n/i18n'
import { hpColor } from '../bits'

/**
 * An HP bar with a ghost: after a blow the bar drops at once, and a pale segment lingers
 * where the HP was, then drains after it (battleRead.css times it to the replay speed).
 * Used on the stage, in the party rows, the foe window and the escort's pane.
 */
export function HpBar({ pct, kind = 'gauge', className = '' }: { pct: number; kind?: 'gauge' | 'bhp'; className?: string }) {
  const w = `${Math.max(0, Math.min(100, pct))}%`
  return (
    <span className={`${kind} hpbar ${className}`}>
      <span className="hp-ghost" style={{ width: w }} />
      <span className="hp-fill" style={{ width: w, background: hpColor(pct) }} />
    </span>
  )
}

/** A thin SP bar under a hero's HP: the skills they can still afford. */
export function SpBar({ sp, max }: { sp: number; max: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (sp / max) * 100)) : 0
  return (
    <span className="spbar" title={t('SP {sp}/{max}', { sp, max })}>
      <span style={{ width: `${pct}%` }} />
    </span>
  )
}
