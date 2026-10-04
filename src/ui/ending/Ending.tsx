import { useEffect, useMemo, useRef, useState } from 'react'
import type { GameState, WorldFate } from '../../engine/types'
import { t } from '../i18n/i18n'
import { actBackdropUrl } from '../story/ActCard'
import { iselBustUrl } from '../pixel/sprites'
import { useRegisterWindow } from '../qol/windowRegistry'
import { creditRoll, cycleNumeral, epilogueOf, newCycleCarries } from './endingText'
import { cycleOf } from '../../engine/endgame'
import './ending.css'

/** How long a still holds before the next (ms). The Master can always go on sooner. */
export const STILL_MS = 6000
/** The credits roll's pace: px per second (reduced motion: no roll, a list to read). */
export const ROLL_PX_PER_S = 38

type Phase = 'stills' | 'isel' | 'credits' | 'finale' | 'confirm'

/**
 * The ending (lane O): after the F90 decision, the epilogue — stills over the acts'
 * backdrops, a line each, and Isel's last word — then the credits, which list every one of
 * the fallen (name, the floor they fell on, their last words, Isel's eulogy), the
 * survivors, the legends of earlier worlds and the numbers. Skippable at every step;
 * reduced motion holds the stills still and turns the roll into a list. At the end: begin
 * a New Cycle, or go back to the tower. Replayable from the Menu.
 */
export function Ending({
  state,
  fate,
  start = 'epilogue',
  calm,
  onClose,
  onNewCycle,
}: {
  state: GameState
  fate: WorldFate
  start?: 'epilogue' | 'credits'
  calm: boolean
  onClose: () => void
  onNewCycle: () => void
}) {
  useRegisterWindow()
  const ep = useMemo(() => epilogueOf(fate), [fate])
  const roll = useMemo(() => creditRoll(state), [state])
  const [phase, setPhase] = useState<Phase>(start === 'credits' ? 'credits' : 'stills')
  const [still, setStill] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose

  // The stills go on by themselves (the Master can go on sooner, or skip to the credits).
  useEffect(() => {
    if (phase !== 'stills') return
    const tm = setTimeout(() => (still + 1 < ep.stills.length ? setStill(still + 1) : setPhase('isel')), STILL_MS)
    return () => clearTimeout(tm)
  }, [phase, still, ep.stills.length])

  // Esc closes it (it can be replayed from the Menu); focus stays inside.
  useEffect(() => {
    root.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close.current()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const next = () => {
    if (phase === 'stills') {
      if (still + 1 < ep.stills.length) setStill(still + 1)
      else setPhase('isel')
    } else if (phase === 'isel') setPhase('credits')
    else if (phase === 'credits') setPhase('finale')
  }
  const cur = ep.stills[Math.min(still, ep.stills.length - 1)]!
  const bg = phase === 'stills' ? actBackdropUrl(cur.act) : actBackdropUrl(ep.stills[ep.stills.length - 1]!.act)
  const cycle = cycleOf(state)

  return (
    <div
      ref={root}
      tabIndex={-1}
      className={`ending fate-${fate} ${calm ? 'calm' : ''} ph-${phase}`}
      role="dialog"
      aria-modal="true"
      aria-label={t(ep.title)}
    >
      <div key={phase === 'stills' ? `s${still}` : phase} className="ending-bg px" style={bg ? { backgroundImage: `url(${bg})` } : undefined} aria-hidden="true" />
      <div className="ending-veil" aria-hidden="true" />

      {phase === 'stills' && (
        <div className="ending-still" key={`still-${still}`} aria-live="polite">
          <div className="ending-kicker">
            {t(ep.title)} · {still + 1}/{ep.stills.length}
          </div>
          <p className="ending-line">{t(cur.line)}</p>
        </div>
      )}

      {phase === 'isel' && (
        <div className="ending-still ending-isel" aria-live="polite">
          <img className="px" src={iselBustUrl()} width={64} height={64} alt="" />
          <div className="ending-kicker">{t('Isel’s last word')}</div>
          <p className="ending-line">“{t(ep.isel)}”</p>
        </div>
      )}

      {phase === 'credits' && <CreditsRoll roll={roll} title={t(ep.title)} cycle={cycleNumeral(cycle)} calm={calm} onEnd={() => setPhase('finale')} />}

      {phase === 'finale' && (
        <div className="ending-still ending-finale">
          <div className="ending-kicker">{t('Cycle {n}', { n: cycleNumeral(cycle) })}</div>
          <h2 className="ending-title">{t(ep.title)}</h2>
          <p className="ending-line small">{t('Back to the first floor. I will write you a new world.')}</p>
          <div className="ending-actions">
            <button type="button" className="pbtn primary" onClick={() => setPhase('confirm')}>
              ✦ {t('Begin a New Cycle…')}
            </button>
            <button type="button" className="pbtn" onClick={onClose}>
              {t('Stay in this world')}
            </button>
          </div>
          <p className="muted small">{t('The epilogue and the credits can be replayed from the Menu.')}</p>
        </div>
      )}

      {phase === 'confirm' && <NewCycleConfirm state={state} onBack={() => setPhase('finale')} onBegin={onNewCycle} />}

      <div className="ending-controls">
        {(phase === 'stills' || phase === 'isel') && (
          <>
            <button type="button" className="pbtn sm" onClick={next}>
              {t('Next ▸')}
            </button>
            <button type="button" className="pbtn sm ghost" onClick={() => setPhase('credits')}>
              {t('Skip to the credits ▸▸')}
            </button>
          </>
        )}
        {phase === 'credits' && (
          <button type="button" className="pbtn sm ghost" onClick={() => setPhase('finale')}>
            {t('Skip the credits ▸▸')}
          </button>
        )}
        <button type="button" className="pbtn sm ghost" onClick={onClose} aria-label={t('Close')}>
          ✕
        </button>
      </div>
    </div>
  )
}

/** The roll: the fallen first (each with their last words and Isel's eulogy), then the rest. */
function CreditsRoll({
  roll,
  title,
  cycle,
  calm,
  onEnd,
}: {
  roll: ReturnType<typeof creditRoll>
  title: string
  cycle: string
  calm: boolean
  onEnd: () => void
}) {
  const inner = useRef<HTMLDivElement>(null)
  const [secs, setSecs] = useState(60)
  useEffect(() => {
    const h = inner.current?.scrollHeight ?? 0
    if (h > 0) setSecs(Math.max(20, Math.round((h + 600) / ROLL_PX_PER_S)))
  }, [roll])
  return (
    <div className={`ending-roll ${calm ? 'calm' : ''}`} aria-label={t('Credits')}>
      <div
        ref={inner}
        className="ending-roll-inner"
        style={calm ? undefined : { ['--roll-s' as string]: `${secs}s` }}
        onAnimationEnd={onEnd}
      >
        <div className="ending-kicker">{t('Cycle {n}', { n: cycle })}</div>
        <h2 className="ending-title">{title}</h2>

        <h3 className="ending-h">{t('In memory of the fallen')}</h3>
        {roll.fallen.length === 0 && <p className="ending-line small">{t('No one fell. Isel has never written that line before.')}</p>}
        <ol className="ending-fallen">
          {roll.fallen.map((f) => (
            <li key={f.id} className="ending-grave">
              <div className="ending-name">✝ {f.name}</div>
              <div className="ending-meta">{f.meta}</div>
              <div className="ending-words">“{f.lastWords}”</div>
              <div className="ending-eulogy">
                <b>{t('Isel')}</b> {f.eulogy}
              </div>
            </li>
          ))}
        </ol>

        {roll.legends.length > 0 && (
          <>
            <h3 className="ending-h">{t('Legends of earlier worlds')}</h3>
            <ol className="ending-fallen legends">
              {roll.legends.map((l) => (
                <li key={l.id} className="ending-grave">
                  <div className="ending-name">✦ {l.name}</div>
                  <div className="ending-meta">{l.meta}</div>
                  <div className="ending-eulogy">{l.eulogy}</div>
                </li>
              ))}
            </ol>
          </>
        )}

        <h3 className="ending-h">{t('Those who came home')}</h3>
        {roll.survivors.length === 0 && <p className="ending-line small">{t('No one. Only the ledger came home.')}</p>}
        <ul className="ending-survivors">
          {roll.survivors.map((s) => (
            <li key={s.id}>
              <span className="ending-sname">{s.name}</span> <span className="ending-meta">{s.meta}</span>
            </li>
          ))}
        </ul>

        <h3 className="ending-h">{t('The climb')}</h3>
        <ul className="ending-stats">
          {roll.stats.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <p className="ending-line small ending-last">{t('Isel kept the ledger.')}</p>
        {calm && (
          <button type="button" className="pbtn" onClick={onEnd}>
            {t('Next ▸')}
          </button>
        )}
      </div>
    </div>
  )
}

/** What a New Cycle keeps and what it leaves behind, before the Master commits. */
function NewCycleConfirm({ state, onBack, onBegin }: { state: GameState; onBack: () => void; onBegin: () => void }) {
  const c = newCycleCarries(state)
  const next = cycleNumeral(cycleOf(state) + 1)
  return (
    <div className="ending-still ending-confirm" role="group" aria-label={t('A New Cycle')}>
      <div className="ending-kicker">{t('A New Cycle')}</div>
      <h2 className="ending-title">{t('Cycle {n}: a harder world', { n: next })}</h2>
      <div className="ending-cols">
        <div>
          <h4>{t('You keep')}</h4>
          <ul>
            {c.keeps.map((k) => (
              <li key={k}>✓ {k}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4>{t('You leave behind')}</h4>
          <ul>
            {c.loses.map((k) => (
              <li key={k}>✕ {k}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="ending-actions">
        <button type="button" className="pbtn" onClick={onBack}>
          {t('Not yet')}
        </button>
        <button type="button" className="pbtn danger" onClick={onBegin}>
          ✦ {t('Begin Cycle {n}', { n: next })}
        </button>
      </div>
    </div>
  )
}
