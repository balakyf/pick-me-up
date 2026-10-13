import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { OwnedHero, Star } from '../../engine/types'
import { playMusic, sfx, stopMusic } from '../audio/sound'
import { drawSummonCircle } from '../pixel/summonFx'
import { cachedDataUrl } from '../pixel/render'
import { scale } from '../pixel/bitmap'
import { heroBustUrl, heroFrameUrl } from '../pixel/sprites'
import { ClassBadge, ElementBadge, EngravingBadge, SkillList, Stars, STAR_COLOR } from '../bits'
import { t } from '../i18n/i18n'
import {
  RAINBOW,
  TELL_COLOR,
  backTell,
  circleTellAt,
  isSurpriseCard,
  revealPlan,
  ritualStepAt,
  type RevealCard,
  type TellTier,
} from './reveal'
import { personaOf } from './intro'
import { usePrefs } from '../prefs'
import './summon.css'

/**
 * The Summon Theatre (spec 2026-10-12 S2). A pull is staged, not dumped:
 *
 * 1. **The circle wakes white** and climbs through the tell ladder (blue, gold, rainbow)
 *    up to the pull's best shown rarity. It only ever climbs.
 * 2. **Cards are dealt face down** and turn one at a time in ascending rarity, best last.
 *    Each back glows in its own tell for a hold that grows with rarity; a "surprise" pull
 *    upgrades the first top-tier card's glow (and the circle) right before it turns.
 * 3. **Each card is a person**: their trade before the summon, what they love, the trait
 *    that stands out and one line in their own voice. 3★+ also show what they arrive
 *    knowing.
 * 4. Click, Space or Enter advances (a face-down card turns at once); "Skip ▸▸" appears
 *    after the first card and jumps to the summary grid, as does Escape.
 *
 * Presentation only: nothing here touches the engine. Randomness is hash-based.
 */
export interface RevealSequenceProps {
  heroes: OwnedHero[]
  masterLevel: number
  /** Called once, when the last card is dismissed or the player skips. */
  onDone: () => void
}

type Phase = { kind: 'ritual'; step: number } | { kind: 'card'; index: number; face: boolean; upgraded: boolean }

function circleUrl(tier: TellTier): string {
  return cachedDataUrl(`theatre-circle|${tier}`, () => scale(drawSummonCircle(tier === 3 ? RAINBOW : TELL_COLOR[tier]), 3))
}

export function RevealSequence({ heroes, masterLevel, onDone }: RevealSequenceProps) {
  const plan = useMemo(() => revealPlan(heroes, masterLevel), [heroes, masterLevel])
  const n = plan.cards.length
  const [phase, setPhase] = useState<Phase>({ kind: 'ritual', step: 0 })
  const [prefs] = usePrefs()
  const rootRef = useRef<HTMLDivElement>(null)
  const doneRef = useRef(false)
  const hushed = useRef(false)
  const phaseRef = useRef(phase)
  phaseRef.current = phase

  const finish = useCallback(() => {
    if (doneRef.current) return
    doneRef.current = true
    onDone()
  }, [onDone])

  /** One press: skip the ritual, turn a face-down card, or move to the next card. */
  const advance = useCallback(() => {
    setPhase((p) => {
      if (p.kind === 'ritual') return n > 0 ? { kind: 'card', index: 0, face: false, upgraded: false } : p
      if (!p.face) return { ...p, face: true, upgraded: true }
      if (p.index < n - 1) return { kind: 'card', index: p.index + 1, face: false, upgraded: false }
      return p
    })
    // Leaving the last face-up card ends the theatre (outside the state updater, so the
    // parent's setState never runs during our render).
    if (phase.kind === 'card' && phase.face && phase.index >= n - 1) finish()
    if (n === 0) finish()
  }, [n, phase, finish])

  const skipAvailable = n > 1 && phase.kind === 'card' && (phase.index > 0 || phase.face)

  // The ritual: open white, then climb one tell per step, then deal.
  useEffect(() => {
    sfx('summon')
    const timers: ReturnType<typeof setTimeout>[] = []
    const peak = plan.ritualTells.length - 1
    for (let k = 1; k <= peak; k++) {
      timers.push(
        setTimeout(
          () => {
            if (phaseRef.current.kind !== 'ritual') return
            setPhase((p) => (p.kind === 'ritual' ? { kind: 'ritual', step: k } : p))
            sfx('reveal', { star: k + 1 })
          },
          ritualStepAt(plan, k),
        ),
      )
    }
    timers.push(
      setTimeout(
        () => setPhase((p) => (p.kind === 'ritual' && n > 0 ? { kind: 'card', index: 0, face: false, upgraded: false } : p)),
        plan.ritualMs,
      ),
    )
    return () => timers.forEach(clearTimeout)
  }, [plan, n])

  // A face-down card: glow, (maybe) upgrade, then turn.
  const cardKey = phase.kind === 'card' ? `${phase.index}|${phase.face}` : 'ritual'
  useEffect(() => {
    if (phase.kind !== 'card') return
    const card = plan.cards[phase.index]
    if (!card) return
    if (phase.face) {
      sfx('reveal', { star: card.star })
      return
    }
    if (card.tier >= 3 && !hushed.current) {
      // 4★+: the music drops out for the hold — the room holds its breath.
      hushed.current = true
      stopMusic()
    }
    const timers: ReturnType<typeof setTimeout>[] = []
    if (isSurpriseCard(plan, phase.index)) {
      timers.push(
        setTimeout(
          () => {
            setPhase((p) => (p.kind === 'card' && !p.face ? { ...p, upgraded: true } : p))
            sfx(card.tier >= 3 ? 'legend' : 'rare')
          },
          Math.round(card.holdMs / 2),
        ),
      )
    }
    timers.push(
      setTimeout(
        () => setPhase((p) => (p.kind === 'card' && p.index === phase.index && !p.face ? { ...p, face: true, upgraded: true } : p)),
        card.holdMs,
      ),
    )
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardKey])

  // Keys: Space / Enter advance, Escape skips. Captured and swallowed so a focused button
  // underneath (the ×10 that started this) can never fire again.
  const advanceRef = useRef(advance)
  advanceRef.current = advance
  const skipRef = useRef({ skipAvailable, finish, advance })
  skipRef.current = { skipAvailable, finish, advance }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        if (!e.repeat) advanceRef.current()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        const s = skipRef.current
        if (s.skipAvailable) s.finish()
        else s.advance()
      }
    }
    window.addEventListener('keydown', onKey, true)
    const active = document.activeElement
    if (active instanceof HTMLElement) active.blur()
    rootRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  // Bring the music back if we hushed it.
  useEffect(
    () => () => {
      if (hushed.current) playMusic('lobby')
    },
    [],
  )

  // The circle holds the ritual's peak; a surprise pull upgrades it with its surprise card.
  const circleTier: TellTier =
    phase.kind === 'ritual' ? (plan.ritualTells[phase.step] ?? 0) : circleTellAt(plan, phase.index, phase.upgraded)
  const circle = circleUrl(circleTier)

  return (
    <div
      ref={rootRef}
      className={`theatre tell-${circleTier} ${phase.kind === 'ritual' ? 'is-ritual' : 'is-cards'}${prefs.reducedMotion ? ' reduced' : ''}`}
      style={{ ['--tell' as string]: TELL_COLOR[circleTier] }}
      onClick={advance}
      role="dialog"
      aria-modal="true"
      aria-label={t('Mobius Summon')}
      tabIndex={-1}
    >
      <div className="theatre-glow" />
      {circle && <img key={`c${circleTier}`} className="px theatre-circle" src={circle} width={288} height={168} alt="" />}

      {phase.kind === 'ritual' && (
        <div className="theatre-beams">
          {plan.cards.map((c, i) => (
            <span key={c.hero.id} className="theatre-beam" style={{ animationDelay: `${0.2 + i * 0.05}s` }} />
          ))}
        </div>
      )}

      <div className="theatre-main">
        {phase.kind === 'card' && plan.cards[phase.index] && (
          <div className="theatre-stage" aria-live="polite">
            {phase.face ? (
              <PersonCard key={`f${phase.index}`} card={plan.cards[phase.index]!} />
            ) : (
              <CardBack
                key={`b${phase.index}`}
                tier={backTell(plan, phase.index, phase.upgraded)}
                upgraded={phase.upgraded && isSurpriseCard(plan, phase.index)}
              />
            )}
          </div>
        )}

        {phase.kind === 'card' && n > 1 && (
          <div className="theatre-deck">
            {plan.cards.map((c, i) => (
              <DeckSlot
                key={c.hero.id}
                card={c}
                state={i < phase.index || (i === phase.index && phase.face) ? 'shown' : i === phase.index ? 'current' : 'waiting'}
              />
            ))}
          </div>
        )}
      </div>

      <div className="theatre-foot">
        {phase.kind === 'card' && n > 1 && (
          <span className="theatre-count">
            {phase.index + 1} / {n}
          </span>
        )}
        <span className="theatre-hint">{t('Click, Space or Enter to continue')}</span>
        {skipAvailable && (
          <button
            className="btn sm theatre-skip"
            onClick={(e) => {
              e.stopPropagation()
              finish()
            }}
          >
            {t('Skip ▸▸')}
          </button>
        )}
      </div>
    </div>
  )
}

/** A face-down card glowing in its tell. */
function CardBack({ tier, upgraded }: { tier: TellTier; upgraded: boolean }) {
  return (
    <div className={`card-back tell-${tier} ${upgraded ? 'upgraded' : ''}`} style={{ ['--tell' as string]: TELL_COLOR[tier] }}>
      <span className="card-back-sigil">∞</span>
    </div>
  )
}

/** A dealt card in the row along the bottom. */
function DeckSlot({ card, state }: { card: RevealCard; state: 'shown' | 'current' | 'waiting' }) {
  if (state !== 'shown') return <span className={`deck-slot ${state}`} />
  const src = heroBustUrl(card.hero)
  return (
    <span className="deck-slot shown" style={{ borderColor: STAR_COLOR[card.star] }} title={card.hero.name}>
      {src && <img className="px" src={src} alt="" />}
    </span>
  )
}

/** The face of a card: the person first, then what they can do. */
function PersonCard({ card }: { card: RevealCard }) {
  const { hero, star, tier } = card
  const persona = personaOf(hero, star)
  const sprite = heroFrameUrl(hero, 'down', 0)
  const trade = persona.trade.length > 0 ? persona.trade[0]!.toLocaleUpperCase() + persona.trade.slice(1) : persona.trade
  return (
    <div
      className={`person-card star-${star} tell-${tier} ${tier >= 3 ? 'foil' : ''}`}
      style={{ ['--rarity' as string]: STAR_COLOR[star as Star], ['--tell' as string]: TELL_COLOR[tier] }}
    >
      <div className="person-art">{sprite && <img className="px" src={sprite} width={96} height={128} alt="" />}</div>
      <div className="person-name">{hero.name}</div>
      <Stars star={star} />
      <div className="hmeta person-tags">
        {hero.heroClass !== null ? <ClassBadge heroClass={hero.heroClass} /> : <span className="tag">{trade}</span>}
        <ElementBadge element={hero.element} />
      </div>
      <div className="person-facts">
        <span>{t('Before the summon: {trade}', { trade: persona.trade })}</span>
        <span>{t('Loves {food}', { food: persona.food })}</span>
        <span>{t('Hobby: {h}', { h: persona.hobby })}</span>
      </div>
      {persona.traits.length > 0 && (
        <div className="person-traits">
          {persona.traits.map((tr) => (
            <span key={tr} className="person-trait">
              {tr}
            </span>
          ))}
        </div>
      )}
      <blockquote className="person-intro">“{persona.intro}”</blockquote>
      {hero.skills.length > 0 && (
        <div className="person-skills">
          <div className="person-skills-label">{t('Arrives knowing')}</div>
          <SkillList hero={hero} max={3} />
        </div>
      )}
      <EngravingBadge hero={hero} />
    </div>
  )
}
