/**
 * The promotion ceremony (lane J): when a promotion completes — the chamber's timer runs out
 * or the Master pays to skip it — the hero steps out changed, and the Master sees how. The
 * stars burst, the growth grades tick up, a new class is taken up, the new skill is shown,
 * the engraving evolves (or awakens) and a trait may awaken into its rare form.
 *
 * `PromotionCeremonyHost` watches the game for completed promotions (a living hero whose star
 * rose out of the chamber) and plays them one at a time — not after time away, when Isel's
 * letter tells the story. Presentation only: the engine has
 * already resolved everything. Click jumps to the end; reduced motion shows it all at once.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { GameState, OwnedHero, Star } from '../../engine/types'
import { ENGRAVINGS, SKILLS, TRAITS } from '../../engine/content'
import { levelCapForStar } from '../../engine/stats'
import { sfx } from '../audio/sound'
import { reducedMotion } from '../motion'
import { classLabel, ClassIcon, Stars, STAR_COLOR } from '../bits'
import { heroBustUrl, heroFrameUrl } from '../pixel/sprites'
import { t } from '../i18n/i18n'
import { skillBlurb } from '../skillText'
import { TraitChip } from '../people/TraitBadge'
import { beatHold, ceremonyBeats, ceremonyChanges, detectPromotions, tickingValue, type CompletedPromotion } from './ceremonyPlan'
import { gradeValueToLetter } from '../../engine/stats'
import { CATCH_UP_WORLD_MS } from '../qol/toastStore'
import './promotion.css'
import '../people/people.css'

interface Props {
  before: OwnedHero
  after: OwnedHero
  /** How many more ceremonies wait after this one. */
  more?: number
  onDone: () => void
  onSkipAll?: () => void
}

export function PromotionReveal({ before, after, more = 0, onDone, onSkipAll }: Props) {
  const reduced = useMemo(reducedMotion, [])
  const changes = useMemo(() => ceremonyChanges(before, after), [before, after])
  const beats = useMemo(() => ceremonyBeats(changes), [changes])
  const [beat, setBeat] = useState(reduced ? beats.length - 1 : 0)
  const [ms, setMs] = useState(0)
  const current = beats[beat]!
  const reached = (b: (typeof beats)[number]) => beats.indexOf(b) !== -1 && beats.indexOf(b) <= beat

  // Each beat holds, then the next one lands.
  useEffect(() => {
    if (current === 'done') return
    const id = setTimeout(() => setBeat((b) => Math.min(beats.length - 1, b + 1)), beatHold(current, reduced))
    return () => clearTimeout(id)
  }, [current, beats.length, reduced])

  // The beat's own sound.
  useEffect(() => {
    if (reduced && beat === beats.length - 1) {
      sfx('levelup')
      return
    }
    if (current === 'stars') sfx('levelup')
    else if (current === 'skill' || current === 'class') sfx('rare')
    else if (current === 'engraving' || current === 'trait') sfx('legend')
    else if (current === 'open') sfx('charge')
  }, [current, beat, beats.length, reduced])

  // The grades tick up through their beat.
  useEffect(() => {
    if (current !== 'grades') return
    setMs(0)
    const id = setInterval(() => setMs((m) => m + 80), 80)
    return () => clearInterval(id)
  }, [current])

  const gradeMs = current === 'grades' ? ms : reached('grades') ? 1e6 : 0
  const finished = current === 'done'
  const bust = heroBustUrl(after)
  const body = heroFrameUrl(after, 'down', 0)
  const skip = () => setBeat(beats.length - 1)

  return (
    <div className={`overlay pr ${reduced ? 'pr-calm' : ''}`} role="dialog" aria-label={t('Promotion')} onClick={finished ? undefined : skip}>
      <div className={`pr-card pr-s${Math.min(7, after.star)}`} style={{ ['--rar' as string]: STAR_COLOR[after.star as Star] }}>
        <div className="pr-title">{t('The Promotion Chamber opens')}</div>
        <div className="pr-hero">
          <div className="pr-bust">{bust && <img className="px" src={bust} alt="" />}</div>
          {body && reached('stars') && <img className="px pr-body" src={body} alt="" />}
        </div>
        <div className="pr-name">{after.name}</div>

        <div className={`pr-stars ${reached('stars') ? 'on' : ''}`}>
          <span className="pr-old">
            <Stars star={before.star} />
          </span>
          {reached('stars') && (
            <>
              <span className="pr-arrow">→</span>
              <span className="pr-new">
                <Stars star={after.star} />
              </span>
              <span className="pr-burst" aria-hidden />
            </>
          )}
        </div>
        {reached('stars') && (
          <div className="pr-cap muted">{t('Level cap {from} → {to}', { from: levelCapForStar(before.star), to: levelCapForStar(after.star) })}</div>
        )}

        {reached('grades') && (
          <div className="pr-grades" aria-label={t('Growth grades')}>
            {changes.grades.map((g) => {
              const v = tickingValue(g.from, g.to, gradeMs)
              return (
                <div key={g.key} className={`pr-grade ${g.delta >= 2 ? 'big' : ''} ${v > g.from ? 'up' : ''}`}>
                  <span className="pr-grade-k">{t(g.label)}</span>
                  <span className="pr-grade-v">{gradeValueToLetter(v)}</span>
                  <span className="pr-grade-d">{g.delta > 0 ? `+${Math.min(g.delta, v - g.from)}` : '·'}</span>
                </div>
              )
            })}
          </div>
        )}

        {reached('class') && changes.newClass && (
          <div className="pr-line pr-classline">
            <ClassIcon heroClass={changes.newClass} size={18} /> {t('{name} takes up a calling: {cls}', { name: after.name.split(' ')[0]!, cls: classLabel(changes.newClass) })}
          </div>
        )}

        {reached('skill') &&
          changes.newSkills.map((id) => {
            const def = SKILLS[id]
            if (!def) return null
            return (
              <div key={id} className={`pr-skill grade-${def.grade}`}>
                <div className="pr-skill-head">
                  <span className="pr-skill-grade">{def.grade}</span> {t('New skill: {skill}', { skill: t(def.name) })}
                </div>
                <div className="pr-skill-blurb">{skillBlurb(def, 1)}</div>
              </div>
            )
          })}

        {reached('engraving') && changes.engraving && (
          <div className="pr-line pr-engr">
            {changes.engraving.kind === 'evolved'
              ? t('The engraving evolves: {name} {from} → {to}', {
                  name: t(ENGRAVINGS[changes.engraving.to.id]?.name ?? changes.engraving.to.id),
                  from: changes.engraving.from.grade,
                  to: changes.engraving.to.grade,
                })
              : t('An engraving awakens: {name} ({grade})', {
                  name: t(ENGRAVINGS[changes.engraving.to.id]?.name ?? changes.engraving.to.id),
                  grade: changes.engraving.to.grade,
                })}
          </div>
        )}

        {reached('trait') && changes.trait && (
          <div className="pr-line pr-trait">
            <span>{t('A trait awakens:')}</span> <TraitChip def={TRAITS[changes.trait.from]} compact /> → <TraitChip def={TRAITS[changes.trait.to]} />
          </div>
        )}

        <div className="pr-actions">
          {finished ? (
            <>
              <button className="btn primary" onClick={onDone} autoFocus>
                {more > 0 ? t('Next ({n} more)', { n: more }) : t('Continue')}
              </button>
              {more > 0 && onSkipAll && (
                <button className="btn ghost" onClick={onSkipAll}>
                  {t('Skip the rest')}
                </button>
              )}
            </>
          ) : (
            <span className="pr-hint muted">{t('Click to see it all')}</span>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Watches the game for promotions that just completed and plays their ceremonies, one at a
 * time. `hold` keeps them waiting (e.g. while a battle plays); they play when it lifts.
 */
export function PromotionCeremonyHost({ state, hold = false }: { state: GameState | null; hold?: boolean }) {
  const prev = useRef<GameState | null>(state)
  const [queue, setQueue] = useState<CompletedPromotion[]>([])
  useEffect(() => {
    const was = prev.current
    prev.current = state
    // After time away, Isel's letter tells what happened (as the toasts do): no ceremony on a catch-up.
    if (was && state && state.meta.lastSeenAtWorld - was.meta.lastSeenAtWorld > CATCH_UP_WORLD_MS) return
    const done = detectPromotions(was, state)
    if (done.length > 0) setQueue((q) => [...q, ...done])
  }, [state])
  if (hold || queue.length === 0) return null
  const head = queue[0]!
  return (
    <PromotionReveal
      key={`${head.heroId}|${head.after.star}`}
      before={head.before}
      after={head.after}
      more={queue.length - 1}
      onDone={() => setQueue((q) => q.slice(1))}
      onSkipAll={() => setQueue([])}
    />
  )
}
