/**
 * The summon reveal: one hero at a time. The circle wakes, a pillar of light rises in
 * the rarity's colour (4★+ start as a lower colour and surge — the tease), a burst, and
 * the card turns over. Click / Space / Enter advances; Skip (or Esc) jumps to the
 * lineup; "Skip to best" stops on the next 4★+. It ends on a lineup of everyone new,
 * best first, with the ways onward (Party Board, Registry, summon again).
 *
 * Cosmetic only: the SUMMON command has already resolved and saved before this mounts.
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import type { OwnedHero, Star } from '../../engine/types'
import { shownStar } from '../../engine/shop'
import { sfx } from '../audio/sound'
import { ClassBadge, ElementBadge, ELEMENT_VIS, Stars, STAR_COLOR, classGlyph } from '../bits'
import { heroBustUrl, heroFrameUrl } from '../pixel/sprites'
import { cachedDataUrl } from '../pixel/render'
import { drawSummonCircle } from '../pixel/summonFx'
import { drawProp } from '../pixel/props'
import { scale } from '../pixel/bitmap'
import { t } from '../i18n/i18n'
import { bornTrade } from '../hero/heroLabel'
import { TIER_TINT, beamSteps, flipAt, lineupOrder, moteCount, motePlacement, nextBestIndex, surgeTimes, tierOf, type Tier } from './revealPlan'

export interface RevealAgain {
  label: string
  disabled: boolean
  onClick: () => void
}

interface Props {
  heroes: OwnedHero[]
  masterLevel: number
  /** Back to the summon screen. */
  onClose: () => void
  /** Leave for another scene (the lineup's Party Board / Registry buttons). */
  onNavigate?: (view: 'party' | 'roster') => void
  /** Summon again with the same pool and count. */
  again?: RevealAgain
}

type Phase = 'beam' | 'card' | 'lineup'

/** The OS "reduce motion" preference (false where matchMedia is missing, e.g. jsdom). */
function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function circleUrl(tint: string): string {
  return cachedDataUrl(`circle|${tint}`, () => scale(drawSummonCircle(tint), 4))
}

function vars(v: Record<string, string>): CSSProperties {
  return v as CSSProperties
}

export function SummonReveal({ heroes, masterLevel, onClose, onNavigate, again }: Props) {
  const reduced = useMemo(prefersReducedMotion, [])
  const stars = useMemo(() => heroes.map((h) => shownStar(h, masterLevel)), [heroes, masterLevel])
  const [idx, setIdx] = useState(0)
  const [phase, setPhase] = useState<Phase>('beam')
  const [step, setStep] = useState(0)

  const star = stars[idx] ?? 1
  const steps = beamSteps(star, reduced)
  const tier: Tier = steps[Math.min(step, steps.length - 1)]!

  const flip = useCallback(() => {
    setPhase('card')
    const top = tierOf(stars[idx] ?? 1)
    sfx(top >= 5 ? 'legend' : top === 4 ? 'rare' : top === 3 ? 'levelup' : 'flip')
  }, [idx, stars])

  // One hero's beat: charge → (surges) → burst → flip.
  useEffect(() => {
    if (phase !== 'beam') return
    setStep(0)
    sfx('charge')
    const s = stars[idx] ?? 1
    const timers = surgeTimes(s, reduced).map((at, i) =>
      setTimeout(() => {
        setStep(i + 1)
        sfx('surge')
      }, at),
    )
    timers.push(setTimeout(flip, flipAt(s, reduced)))
    return () => timers.forEach(clearTimeout)
  }, [idx, phase, stars, reduced, flip])

  const advance = useCallback(() => {
    if (phase === 'beam') flip()
    else if (phase === 'card') {
      if (idx + 1 < heroes.length) {
        setIdx(idx + 1)
        setStep(0)
        setPhase('beam')
      } else setPhase('lineup')
    }
  }, [phase, idx, heroes.length, flip])

  const skipAll = useCallback(() => setPhase('lineup'), [])

  const skipToBest = useCallback(() => {
    const best = nextBestIndex(stars, phase === 'card' ? idx + 1 : idx)
    if (best < 0) setPhase('lineup')
    else if (best !== idx || phase !== 'beam') {
      setIdx(best)
      setStep(0)
      setPhase('beam')
    }
  }, [stars, phase, idx])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase === 'lineup') {
        if (e.key === 'Escape') onClose()
        return
      }
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        advance()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        skipAll()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, advance, skipAll, onClose])

  const hasBestAhead = nextBestIndex(stars, phase === 'card' ? idx + 1 : idx) >= 0
  // Buttons must not keep focus, or Space would press them instead of advancing.
  const press = (fn: () => void) => (e: ReactMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    e.currentTarget.blur()
    fn()
  }

  if (phase === 'lineup') {
    return (
      <div className={`sr ${reduced ? 'sr-calm' : ''}`} role="dialog" aria-label={t('Your new heroes')}>
        <Lineup heroes={heroes} stars={stars} onClose={onClose} onNavigate={onNavigate} again={again} press={press} />
      </div>
    )
  }

  const hero = heroes[idx]!
  const tint = TIER_TINT[tier]
  return (
    <div
      className={`sr ${reduced ? 'sr-calm' : ''}`}
      role="dialog"
      aria-label={t('Mobius Summon')}
      style={vars({ '--tint': tint })}
      onClick={advance}
    >
      <div className={`sr-stage sr-t${tier}`}>
        <img className="px sr-circle" src={circleUrl(tint) || undefined} width={384} height={224} alt="" />
        {phase === 'beam' && (
          <>
            <div key={`beam${idx}`} className="sr-beam-wrap">
              <div key={`b${idx}-${step}`} className={`sr-beam ${step > 0 ? 'sr-surge' : ''}`} />
            </div>
            <img
              key={`crystal${idx}`}
              className="px sr-crystal"
              src={cachedDataUrl('summon-orb', () => scale(drawProp('summonCrystal', 0).bmp, 5)) || undefined}
              width={160}
              height={220}
              alt=""
            />
            <Motes key={`m${idx}-${tier}`} tier={tier} reduced={reduced} />
          </>
        )}
        {phase === 'card' && (
          <>
            <div key={`flash${idx}`} className="sr-flash" />
            <div key={`ring${idx}`} className="sr-ring" />
            <Motes key={`burst${idx}`} tier={tierOf(star)} reduced={reduced} burst />
            <RevealCard key={`card${idx}`} hero={hero} star={star as Star} />
          </>
        )}
      </div>

      <div className="sr-count">
        {idx + 1} / {heroes.length}
      </div>
      <div className="sr-hint">{phase === 'card' ? t('Click or press Space to continue') : t('Click to reveal')}</div>
      <div className="sr-controls">
        {heroes.length > 1 && (
          <button className="btn sm" onClick={press(skipToBest)} disabled={!hasBestAhead && phase === 'card' && idx + 1 >= heroes.length}>
            {t('Skip to best')}
          </button>
        )}
        <button className="btn sm" onClick={press(skipAll)}>
          {t('Skip')} ▸▸
        </button>
      </div>
    </div>
  )
}

function Motes({ tier, reduced, burst = false }: { tier: Tier; reduced: boolean; burst?: boolean }) {
  const n = moteCount(tier, reduced)
  return (
    <div className={`sr-motes ${burst ? 'sr-burst' : ''}`} aria-hidden>
      {Array.from({ length: n }, (_, i) => {
        const p = motePlacement(i)
        const color = tier === 5 ? ['#ff6b6b', '#f2c75c', '#6be29a', '#4aa3ff', '#b07adb', '#fff6e0'][i % 6]! : TIER_TINT[tier]
        return (
          <span
            key={i}
            className="sr-mote"
            style={vars({
              left: `${p.left}%`,
              animationDelay: `${burst ? p.delay / 4 : p.delay}s`,
              background: color,
              color,
              '--drift': `${burst ? p.drift * 6 : p.drift}px`,
            })}
          />
        )
      })}
    </div>
  )
}

function rarityWord(star: number): string | null {
  if (star >= 5) return t('Legendary!')
  if (star === 4) return t('Rare!')
  return null
}

function RevealCard({ hero, star }: { hero: OwnedHero; star: Star }) {
  const bust = heroBustUrl(hero)
  const walk = heroFrameUrl(hero, 'down', 0)
  const word = rarityWord(star)
  const el = ELEMENT_VIS[hero.element].color
  return (
    <div className={`sr-card sr-c${tierOf(star)}`} onClick={(e) => e.stopPropagation()}>
      <div className="sr-card-face" style={vars({ '--rar': STAR_COLOR[star] })}>
        {word && <div className="sr-word">{word}</div>}
        <div className="sr-portrait" style={{ background: `linear-gradient(180deg, ${el}66 0%, #120e2c 90%)` }}>
          {bust && <img className="px" src={bust} width={160} height={160} alt={hero.name} />}
          {walk && <img className="px sr-walk" src={walk} width={48} height={64} alt="" />}
        </div>
        <div className="sr-name">{hero.name}</div>
        <div className="sr-stars">
          <Stars star={star} />
        </div>
        <div className="hmeta sr-meta">
          <ClassBadge heroClass={hero.heroClass} trade={bornTrade(hero)} />
          <ElementBadge element={hero.element} />
        </div>
      </div>
    </div>
  )
}

function Lineup({
  heroes,
  stars,
  onClose,
  onNavigate,
  again,
  press,
}: {
  heroes: OwnedHero[]
  stars: number[]
  onClose: () => void
  onNavigate?: (view: 'party' | 'roster') => void
  again?: RevealAgain
  press: (fn: () => void) => (e: ReactMouseEvent<HTMLButtonElement>) => void
}) {
  const order = lineupOrder(stars)
  const best = order[0]!
  return (
    <div className="sr-lineup">
      <h3>{heroes.length === 1 ? t('A new hero answers the call') : t('{n} new heroes answer the call', { n: heroes.length })}</h3>
      <div className={`sr-grid ${heroes.length === 1 ? 'one' : ''}`}>
        {order.map((i, k) => {
          const h = heroes[i]!
          const s = stars[i]! as Star
          const bust = heroBustUrl(h)
          const isBest = i === best && (heroes.length > 1 || s >= 4)
          return (
            <div
              key={h.id}
              className={`sr-mini sr-c${tierOf(s)} ${isBest ? 'best' : ''}`}
              style={vars({ '--rar': STAR_COLOR[s], animationDelay: `${k * 0.06}s` })}
            >
              {isBest && <span className="sr-best-tag">{t('Best pull')}</span>}
              <div className="sr-mini-portrait" style={{ background: `linear-gradient(180deg, ${ELEMENT_VIS[h.element].color}55 0%, #120e2c 90%)` }}>
                {bust && <img className="px" src={bust} width={96} height={96} alt="" />}
              </div>
              <div className="sr-mini-name">{h.name}</div>
              <Stars star={s} />
              <div className="muted sr-mini-meta">
                {classGlyph(h.heroClass)} {ELEMENT_VIS[h.element].glyph}
              </div>
            </div>
          )
        })}
      </div>
      <div className="sr-actions">
        {onNavigate && (
          <button className="btn primary" onClick={press(() => onNavigate('party'))}>
            {t('Party Board')}
          </button>
        )}
        {onNavigate && (
          <button className="btn" onClick={press(() => onNavigate('roster'))}>
            {t('Hero Registry')}
          </button>
        )}
        {again && (
          <button className="btn gold" onClick={press(again.onClick)} disabled={again.disabled}>
            {again.label}
          </button>
        )}
        <button className="btn ghost" onClick={press(onClose)}>
          {t('Done')}
        </button>
      </div>
    </div>
  )
}
