/**
 * The coach's cards (lane P): Isel's tip in the war room before a floor that features the
 * next lesson, and the same tip in a battle the first time its moment happens. The logic is
 * `coach.ts`; these only lay it out. Both can be dismissed ("Got it", latched once per
 * save) or silenced for good ("Turn tips off": the Settings toggle).
 */
import { useEffect, useState } from 'react'
import type { CombatEvent, CombatUnitInit, Encounter, GameState } from '../../engine/types'
import type { Store } from '../../engine/store'
import type { LessonId } from '../../engine/content/missions'
import { t } from '../i18n/i18n'
import { iselBustUrl } from '../pixel/sprites'
import { coachStep, coachTip, happensIn, type Lesson } from './coach'
import { useSettings } from './useSettings'
import './coach.css'

function TipBody({ lesson, onGotIt, onOff }: { lesson: Lesson; onGotIt: () => void; onOff: () => void }) {
  return (
    <>
      <img className="px coach-face" src={iselBustUrl()} width={32} height={32} alt="" />
      <div className="coach-text">
        <div className="coach-kicker">
          {t('Isel’s tip')} · <b>{t(lesson.title)}</b>
        </div>
        <p className="coach-tip">{t(lesson.tip)}</p>
        <div className="coach-actions">
          <button className="pbtn sm" onClick={onGotIt}>
            {t('Got it')}
          </button>
          <button className="linkish coach-off" onClick={onOff} title={t('Isel’s tips can be turned back on in Settings.')}>
            {t('Turn tips off')}
          </button>
        </div>
      </div>
    </>
  )
}

/** The war room's tip: the pending lesson, when this floor is its moment. */
export function CoachCard({ state, store, floor, encounter }: { state: GameState; store: Store; floor: number; encounter: Encounter | null }) {
  const [settings, update] = useSettings()
  const lesson = coachTip({ state, floor, encounter }, settings.coachTips)
  if (lesson === null) return null
  return (
    <section className="pframe coach-card" aria-label={t('Isel’s tip')} data-lesson={lesson.id}>
      <TipBody lesson={lesson} onGotIt={() => store.dispatch({ type: 'GUIDE_STEP', step: coachStep(lesson.id) })} onOff={() => update({ coachTips: false })} />
    </section>
  )
}

/**
 * The battle's tip: shows the first time `lesson`'s moment plays (a foe winds up, a hero is
 * poisoned, a boss turns) and stays until dismissed. It cannot write the save mid-battle (a
 * mid-battle order revises the attempt just recorded), so `onSeen` hands the lesson to the
 * war room, which latches it when the fight is over.
 */
export function CoachBattleTip({
  lesson,
  beat,
  byId,
  onSeen,
  docked = false,
  hidden = false,
}: {
  lesson: Lesson | null
  beat: readonly CombatEvent[]
  byId: Readonly<Record<string, CombatUnitInit>>
  onSeen: (id: LessonId) => void
  docked?: boolean
  /** Step aside (a death moment, another card). */
  hidden?: boolean
}) {
  const [settings, update] = useSettings()
  const [phase, setPhase] = useState<'wait' | 'on' | 'done'>('wait')
  useEffect(() => {
    if (phase === 'wait' && settings.coachTips && happensIn(lesson, beat, byId)) {
      setPhase('on')
      if (lesson) onSeen(lesson.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beat, phase, lesson, settings.coachTips])
  if (phase !== 'on' || lesson === null || hidden || !settings.coachTips) return null
  return (
    <div className={`coach-battle pframe ${docked ? 'docked' : ''}`} role="note" data-lesson={lesson.id}>
      <TipBody
        lesson={lesson}
        onGotIt={() => setPhase('done')}
        onOff={() => {
          update({ coachTips: false })
          setPhase('done')
        }}
      />
    </div>
  )
}
