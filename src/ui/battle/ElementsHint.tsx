import { t } from '../i18n/i18n'
import { elementChains, elementMultipliers } from './elementsHint'

/** The one-time card that explains WEAK! the first time a blow lands on a weakness. */
export function ElementsHint({ onClose, docked = false }: { onClose: () => void; docked?: boolean }) {
  const m = elementMultipliers()
  return (
    <div className={`elements-hint pframe ${docked ? 'docked' : ''}`} role="note">
      <div className="eh-title">
        <span className="eh-weak">{t('WEAK!')}</span> {t('That blow struck a weakness: {mult} damage.', { mult: m.weak })}
      </div>
      <ul className="eh-chains">
        {elementChains().map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="eh-foot">
        {t('Each beats the next. The other way round, a blow is resisted ({mult}).', { mult: m.resist })}{' '}
        <span className="eh-resist">{t('RESIST')}</span>
      </div>
      <button className="pbtn sm eh-close" onClick={onClose}>
        {t('Got it')}
      </button>
    </div>
  )
}
