import { t } from '../i18n/i18n'

/**
 * A grade B+ skill's cut-in: an element-coloured band sweeps across the stage with the
 * hero's bust sliding through it and the skill's name. Keyed by its act, it plays once;
 * the scene skips it at 4× and under reduced motion.
 */
export function SkillCutIn({ bust, name, color, side }: { bust: string; name: string; color: string; side: 'left' | 'right' }) {
  return (
    <div className={`cutin from-${side}`} style={{ ['--cut' as string]: color }} aria-hidden="true">
      <div className="cutin-band">
        <img className="px cutin-bust" src={bust} alt="" />
        <span className="cutin-name">{name}</span>
      </div>
    </div>
  )
}

/** 'WAVE 2/3' as a wave charges on (and the first of several at the start). */
export function WaveBanner({ n, total }: { n: number; total: number }) {
  return (
    <div className="wave-banner" role="status">
      <span className="wave-word">{t('WAVE')}</span>
      <span className="wave-num">
        {n}/{total}
      </span>
    </div>
  )
}

/** A wave falls: a flash over the stage and its stamp. */
export function WaveCleared({ n, total, calm }: { n: number; total: number; calm: boolean }) {
  return (
    <>
      {!calm && <div className="wave-flash" aria-hidden="true" />}
      <div className="wave-banner cleared" role="status">
        <span className="wave-word">{t('WAVE {n}/{total} CLEARED', { n, total })}</span>
      </div>
    </>
  )
}
